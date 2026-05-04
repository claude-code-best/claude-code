import { dirname, sep } from 'path'
import { logEvent } from 'src/services/analytics/index.js'
import { z } from 'zod/v4'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import { diagnosticTracker } from 'src/services/diagnosticTracking.js'
import { clearDeliveredDiagnosticsForFile } from 'src/services/lsp/LSPDiagnosticRegistry.js'
import { getLspServerManager } from 'src/services/lsp/manager.js'
import { notifyVscodeFileUpdated } from 'src/services/mcp/vscodeSdkMcp.js'
import { checkTeamMemSecrets } from 'src/services/teamMemorySync/teamMemSecretGuard.js'
import {
  activateConditionalSkillsForPaths,
  addSkillDirectories,
  discoverSkillDirsForPaths,
} from 'src/skills/loadSkillsDir.js'
import type { ToolUseContext } from 'src/Tool.js'
import { buildTool, type ToolDef } from 'src/Tool.js'
import { getCwd } from 'src/utils/cwd.js'
import { logForDebugging } from 'src/utils/debug.js'
import { countLinesChanged, getPatchForDisplay } from 'src/utils/diff.js'
import { isEnvTruthy } from 'src/utils/envUtils.js'
import { isENOENT } from 'src/utils/errors.js'
import { getFileModificationTime, writeTextContent } from 'src/utils/file.js'
import {
  fileHistoryEnabled,
  fileHistoryTrackEdit,
} from 'src/utils/fileHistory.js'
import { logFileOperation } from 'src/utils/fileOperationAnalytics.js'
import { readFileSyncWithMetadata } from 'src/utils/fileRead.js'
import { getFsImplementation } from 'src/utils/fsOperations.js'
import { fetchSingleFileGitDiff, type ToolUseDiff } from 'src/utils/gitDiff.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { logError } from 'src/utils/log.js'
import { expandPath } from 'src/utils/path.js'
import {
  checkWritePermissionForTool,
  matchingRuleForInput,
} from 'src/utils/permissions/filesystem.js'
import type { PermissionDecision } from 'src/utils/permissions/PermissionResult.js'
import { matchWildcardPattern } from 'src/utils/permissions/shellRuleMatching.js'
import { FILE_UNEXPECTEDLY_MODIFIED_ERROR } from '../FileEditTool/constants.js'
import { gitDiffSchema, hunkSchema } from '../FileEditTool/types.js'
import { FILE_WRITE_TOOL_NAME, getWriteToolDescription } from './prompt.js'
import {
  getToolUseSummary,
  isResultTruncated,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage,
  userFacingName,
} from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z
      .string()
      .describe(
        'The absolute path to the file to write (must be absolute, not relative)',
      ),
    content: z.string().describe('要写入文件的内容'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    type: z
      .enum(['create', 'update'])
      .describe('是否创建了新文件或更新了现有文件'),
    filePath: z.string().describe('已写入文件的路径'),
    content: z.string().describe('已写入文件的内容'),
    structuredPatch: z.array(hunkSchema()).describe('显示变更的差异补丁'),
    originalFile: z
      .string()
      .nullable()
      .describe(
        'The original file content before the write (null for new files)',
      ),
    gitDiff: gitDiffSchema().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>
export type FileWriteToolInput = InputSchema

export const FileWriteTool = buildTool({
  name: FILE_WRITE_TOOL_NAME,
  searchHint: '创建或覆盖文件',
  maxResultSizeChars: 100_000,
  strict: true,
  async description() {
    return '将文件写入本地文件系统。'
  },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `正在写入 ${summary}` : '正在写入文件'
  },
  async prompt() {
    return getWriteToolDescription()
  },
  renderToolUseMessage,
  isResultTruncated,
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  toAutoClassifierInput(input) {
    return `${input.file_path}: ${input.content}`
  },
  getPath(input): string {
    return input.file_path
  },
  backfillObservableInput(input) {
    // hooks.mdx 将 file_path 记录为绝对路径；进行扩展以便钩子允许列表
    // 无法通过 ~ 或相对路径绕过。
    if (typeof input.file_path === 'string') {
      input.file_path = expandPath(input.file_path)
    }
  },
  async preparePermissionMatcher({ file_path }) {
    return pattern => matchWildcardPattern(pattern, file_path)
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    return checkWritePermissionForTool(
      FileWriteTool,
      input,
      appState.toolPermissionContext,
    )
  },
  renderToolUseRejectedMessage,
  renderToolUseErrorMessage,
  renderToolResultMessage,
  extractSearchText() {
    // Transcript 渲染显示内容（创建，通过 HighlightedCode）
    // 或结构化差异（更新）。启发式方法的 'content' 允许列表键
    // 即使在未显示原始内容字符串的更新模式下也会索引它
    // ——这是幻影。计数不足：tool_use 已索引 file_path。
    return ''
  },
  async validateInput({ file_path, content }, toolUseContext: ToolUseContext) {
    const fullFilePath = expandPath(file_path)

    // 拒绝写入包含机密的团队记忆文件
    const secretError = checkTeamMemSecrets(fullFilePath, content)
    if (secretError) {
      return { result: false, message: secretError, errorCode: 0 }
    }

    // 根据权限设置检查路径是否应被忽略
    const appState = toolUseContext.getAppState()
    const denyRule = matchingRuleForInput(
      fullFilePath,
      appState.toolPermissionContext,
      'edit',
      'deny',
    )
    if (denyRule !== null) {
      return {
        result: false,
        message: '文件位于您的权限设置禁止的目录中。',
        errorCode: 1,
      }
    }

    // 安全：跳过 UNC 路径的文件系统操作，以防止 NTLM 凭据泄露。
    // 在 Windows 上，对 UNC 路径执行 fs.existsSync() 会触发 SMB 身份验证，这可能
    // 将凭据泄露给恶意服务器。让权限检查处理 UNC 路径。
    if (fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//')) {
      return { result: true }
    }

    const fs = getFsImplementation()
    let fileMtimeMs: number
    try {
      const fileStat = await fs.stat(fullFilePath)
      fileMtimeMs = fileStat.mtimeMs
    } catch (e) {
      if (isENOENT(e)) {
        return { result: true }
      }
      throw e
    }

    const readTimestamp = toolUseContext.readFileState.get(fullFilePath)

    // Reuse mtime from the stat above — avoids a redundant statSync via
    // getFileModificationTime.
    if (readTimestamp) {
      const lastWriteTime = Math.floor(fileMtimeMs)
      if (lastWriteTime > readTimestamp.timestamp) {
        return {
          result: false,
          message:
            'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
          errorCode: 3,
        }
      }
    }

    return { result: true }
  },
  async call(
    { file_path, content },
    { readFileState, updateFileHistoryState, dynamicSkillDirTriggers },
    _,
    parentMessage,
  ) {
    const fullFilePath = expandPath(file_path)
    const dir = dirname(fullFilePath)

    // 从此文件的路径发现技能（即发即弃，非阻塞）
    const cwd = getCwd()
    const newSkillDirs = await discoverSkillDirsForPaths([fullFilePath], cwd)
    if (newSkillDirs.length > 0) {
      // 存储发现的目录以供附件显示
      for (const dir of newSkillDirs) {
        dynamicSkillDirTriggers?.add(dir)
      }
      // 不要等待 - 让技能加载在后台进行
      addSkillDirectories(newSkillDirs).catch(() => {})
    }

    // 激活路径模式与此文件匹配的条件技能
    activateConditionalSkillsForPaths([fullFilePath], cwd)

    await diagnosticTracker.beforeFileEdited(fullFilePath)

    // 在原子性读写修改区段之前，确保父目录存在。
    // 必须保持在下方关键区段之外（在陈旧性检查与写入文本内容之间的一个 yield 操作允许并发编辑交错执行），并且在写入操作之前
    // （在 ENOENT 错误传播回来之前，writeFileSyncAndFlush_DEPRECATED 内部的惰性创建目录遇 ENOENT 会触发虚假的 tengu_atomic_write_error）。
    // 备份捕获编辑前的内容——在陈旧性检查之前调用是安全的
    // （基于内容哈希的幂等 v1 备份键；如果后续陈旧性检查失败，我们只是有一个未使用的备份，而不是损坏的状态）。
    await getFsImplementation().mkdir(dir)
    if (fileHistoryEnabled()) {
      // 加载当前状态并确认自上次读取后没有更改。
      // 请避免在此处和写入磁盘之间进行异步操作，以保持原子性。
      // 时间戳指示修改，但在 Windows 上，时间戳可能在内容未更改的情况下发生变化
      await fileHistoryTrackEdit(
        updateFileHistoryState,
        fullFilePath,
        parentMessage.uuid,
      )
    }

    // （云同步、杀毒软件等）。对于完整读取，比较内容作为后备方案以避免误报。
    // meta.content 是 CRLF 规范化的——与 readFileState 的规范化形式匹配。
    let meta: ReturnType<typeof readFileSyncWithMetadata> | null
    try {
      meta = readFileSyncWithMetadata(fullFilePath)
    } catch (e) {
      if (isENOENT(e)) {
        meta = null
      } else {
        throw e
      }
    }

    if (meta !== null) {
      const lastWriteTime = getFileModificationTime(fullFilePath)
      const lastRead = readFileState.get(fullFilePath)
      if (!lastRead || lastWriteTime > lastRead.timestamp) {
        // 写入是完整的内容替换——模型在 `content` 中发送了明确的换行符并希望保留它们。不要重写它们。以前我们保留
        // 旧文件的换行符（或通过 ripgrep 为新文件采样仓库），这会在覆盖 CRLF 文件时或在当前工作目录中的二进制文件污染仓库样本时，静默地损坏例如在 Linux 上带有 \r 的 bash 脚本。
        // 通知 LSP 服务器关于文件修改（didChange）和保存（didSave）
        const isFullRead =
          lastRead &&
          lastRead.offset === undefined &&
          lastRead.limit === undefined
        // 清除先前传递的诊断信息，以便显示新的诊断
        if (!isFullRead || meta.content !== lastRead.content) {
          throw new Error(FILE_UNEXPECTEDLY_MODIFIED_ERROR)
        }
      }
    }

    const enc = meta?.encoding ?? 'utf8'
    const oldContent = meta?.content ?? null

    // didChange: 内容已被修改
    // LSP: 未能通知服务器文件 {0} 的更改: {1}
    // didSave: 文件已保存到磁盘（在 TypeScript 服务器中触发诊断）
    // LSP: 未能通知服务器文件 {0} 的保存: {1}
    // 通知 VSCode 文件更改以用于差异视图
    writeTextContent(fullFilePath, content, enc, 'LF')

    // 更新读取时间戳，以使陈旧的写入失效
    const lspManager = getLspServerManager()
    if (lspManager) {
      // 写入 CLAUDE.md 时记录日志
      clearDeliveredDiagnosticsForFile(`file://${fullFilePath}`)
      // 在返回结果之前，跟踪文件更新的新增和删除行数
      lspManager.changeFile(fullFilePath, content).catch((err: Error) => {
        logForDebugging(`对于创建新文件，在返回结果之前，将所有行计为新增行`)
        logError(err)
      })
      // didSave: 文件已保存到磁盘（触发 TypeScript 服务器中的诊断）
      lspManager.saveFile(fullFilePath).catch((err: Error) => {
        logForDebugging(
          `LSP: 无法向服务器通知文件 ${fullFilePath} 的保存操作: ${err.message}`,
        )
        logError(err)
      })
    }

    // 通知 VSCode 文件变更以显示差异视图
    notifyVscodeFileUpdated(fullFilePath, oldContent, content)

    // 更新读取时间戳，以使过时的写入失效
    readFileState.set(fullFilePath, {
      content,
      timestamp: getFileModificationTime(fullFilePath),
      offset: undefined,
      limit: undefined,
    })

    // 写入 CLAUDE.md 时记录日志
    if (fullFilePath.endsWith(`${sep}CLAUDE.md`)) {
      logEvent('tengu_write_claudemd', {})
    }

    let gitDiff: ToolUseDiff | undefined
    if (
      isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_quartz_lantern', false)
    ) {
      const startTime = Date.now()
      const diff = await fetchSingleFileGitDiff(fullFilePath)
      if (diff) gitDiff = diff
      logEvent('tengu_tool_use_diff_computed', {
        isWriteTool: true,
        durationMs: Date.now() - startTime,
        hasDiff: !!diff,
      })
    }

    if (oldContent) {
      const patch = getPatchForDisplay({
        filePath: file_path,
        fileContents: oldContent,
        edits: [
          {
            old_string: oldContent,
            new_string: content,
            replace_all: false,
          },
        ],
      })

      const data = {
        type: 'update' as const,
        filePath: file_path,
        content,
        structuredPatch: patch,
        originalFile: oldContent,
        ...(gitDiff && { gitDiff }),
      }
      // 在生成结果之前，跟踪文件更新中添加和删除的行数
      countLinesChanged(patch)

      logFileOperation({
        operation: 'write',
        tool: 'FileWriteTool',
        filePath: fullFilePath,
        type: 'update',
      })

      return {
        data,
      }
    }

    const data = {
      type: 'create' as const,
      filePath: file_path,
      content,
      structuredPatch: [],
      originalFile: null,
      ...(gitDiff && { gitDiff }),
    }

    // 对于新创建的文件，在生成结果之前，将所有行计为新增行
    countLinesChanged([], content)

    logFileOperation({
      operation: 'write',
      tool: 'FileWriteTool',
      filePath: fullFilePath,
      type: 'create',
    })

    return {
      data,
    }
  },
  mapToolResultToToolResultBlockParam({ filePath, type }, toolUseID) {
    switch (type) {
      case 'create':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `文件创建成功，路径：${filePath}`,
        }
      case 'update':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `文件 ${filePath} 已成功更新。`,
        }
    }
  },
} satisfies ToolDef<InputSchema, Output>)

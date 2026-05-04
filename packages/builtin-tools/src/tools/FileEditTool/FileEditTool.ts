import { dirname, isAbsolute, sep } from 'path'
import { logEvent } from 'src/services/analytics/index.js'
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
import { countLinesChanged } from 'src/utils/diff.js'
import { isEnvTruthy } from 'src/utils/envUtils.js'
import { isENOENT } from 'src/utils/errors.js'
import {
  FILE_NOT_FOUND_CWD_NOTE,
  findSimilarFile,
  getFileModificationTime,
  suggestPathUnderCwd,
  writeTextContent,
} from 'src/utils/file.js'
import {
  fileHistoryEnabled,
  fileHistoryTrackEdit,
} from 'src/utils/fileHistory.js'
import { logFileOperation } from 'src/utils/fileOperationAnalytics.js'
import {
  type LineEndingType,
  readFileSyncWithMetadata,
} from 'src/utils/fileRead.js'
import { formatFileSize } from 'src/utils/format.js'
import { getFsImplementation } from 'src/utils/fsOperations.js'
import { fetchSingleFileGitDiff, type ToolUseDiff } from 'src/utils/gitDiff.js'
import { logError } from 'src/utils/log.js'
import { expandPath } from 'src/utils/path.js'
import {
  checkWritePermissionForTool,
  matchingRuleForInput,
} from 'src/utils/permissions/filesystem.js'
import type { PermissionDecision } from 'src/utils/permissions/PermissionResult.js'
import { matchWildcardPattern } from 'src/utils/permissions/shellRuleMatching.js'
import { validateInputForSettingsFileEdit } from 'src/utils/settings/validateEditTool.js'
import { NOTEBOOK_EDIT_TOOL_NAME } from '../NotebookEditTool/constants.js'
import {
  FILE_EDIT_TOOL_NAME,
  FILE_UNEXPECTEDLY_MODIFIED_ERROR,
} from './constants.js'
import { getEditToolDescription } from './prompt.js'
import {
  type FileEditInput,
  type FileEditOutput,
  inputSchema,
  outputSchema,
} from './types.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage,
  userFacingName,
} from './UI.js'
import {
  areFileEditsInputsEquivalent,
  findActualString,
  getPatchForEdit,
  preserveQuoteStyle,
} from './utils.js'

// V8/Bun 的字符串长度限制约为 2^30 个字符（约 10 亿）。对于
// 典型的 ASCII/Latin-1 文件，磁盘上的 1 字节 = 1 个字
// 符，因此 stat 字节数 1 GiB ≈ 10 亿字符 ≈ 运行时字符串
// 限制。多字节 UTF-8 文件每个字符在磁盘上可能更大，但 1 GiB 是
// 一个安全的字节级防护，可以在不过度限制的情况下防止内存溢出。
const MAX_EDIT_FILE_SIZE = 1024 * 1024 * 1024 // 1 GiB（stat 字节数）

export const FileEditTool = buildTool({
  name: FILE_EDIT_TOOL_NAME,
  searchHint: '就地修改文件内容',
  maxResultSizeChars: 100_000,
  strict: true,
  async description() {
    return '一个用于编辑文件的工具'
  },
  async prompt() {
    return getEditToolDescription()
  },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `Editing ${summary}` : '正在编辑文件'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  toAutoClassifierInput(input) {
    return `${input.file_path}: ${input.new_string}`
  },
  getPath(input): string {
    return input.file_path
  },
  backfillObservableInput(input) {
    // hooks.mdx 将 file_path 记录为绝对路径；进行路径扩展
    // ，以防止通过 ~ 或相对路径绕过钩子允许列表。
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
      FileEditTool,
      input,
      appState.toolPermissionContext,
    )
  },
  renderToolUseMessage,
  renderToolResultMessage,
  renderToolUseRejectedMessage,
  renderToolUseErrorMessage,
  async validateInput(input: FileEditInput, toolUseContext: ToolUseContext) {
    const { file_path, old_string, new_string, replace_all = false } = input
    // 使用 expandPath 进行一致的路径规范化（特别是在 Windows 上，"
    // /" 与 "\" 可能导致 readFileState 查找不匹配）
    const fullFilePath = expandPath(file_path)

    // 拒绝编辑会引入机密的团队记忆文件
    const secretError = checkTeamMemSecrets(fullFilePath, new_string)
    if (secretError) {
      return { result: false, message: secretError, errorCode: 0 }
    }
    if (old_string === new_string) {
      return {
        result: false,
        behavior: 'ask',
        message: '无需更改：old_string 和 new_string 完全相同。',
        errorCode: 1,
      }
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
        behavior: 'ask',
        message: '文件位于您的权限设置禁止的目录中。',
        errorCode: 2,
      }
    }

    // 安全：跳过 UNC 路径的文件系统操作，以防止 NTLM 凭据泄露。在 Wind
    // ows 上，对 UNC 路径执行 fs.existsSync() 会触发 S
    // MB 身份验证，可能导致凭据泄露给恶意服务器。让权限检查来处理 UNC 路径。
    if (fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//')) {
      return { result: true }
    }

    const fs = getFsImplementation()

    // 防止多 GB 文件导致内存溢出。
    try {
      const { size } = await fs.stat(fullFilePath)
      if (size > MAX_EDIT_FILE_SIZE) {
        return {
          result: false,
          behavior: 'ask',
          message: `文件过大无法编辑 (${formatFileSize(size)})。最大可编辑文件大小为 ${formatFileSize(MAX_EDIT_FILE_SIZE)}。`,
          errorCode: 10,
        }
      }
    } catch (e) {
      if (!isENOENT(e)) {
        throw e
      }
    }

    // 首先将文件作为字节读取，以便我们可以从缓冲区检测编码，而不是调用 detect
    // FileEncoding（detectFileEncoding 会执行自己的同步
    // readSync 操作，当文件不存在时会浪费一次 ENOENT 错误）。
    let fileContent: string | null
    try {
      const fileBuffer = await fs.readFileBytes(fullFilePath)
      const encoding: BufferEncoding =
        fileBuffer.length >= 2 &&
        fileBuffer[0] === 0xff &&
        fileBuffer[1] === 0xfe
          ? 'utf16le'
          : 'utf8'
      fileContent = fileBuffer.toString(encoding).replaceAll('\r\n', '\n')
    } catch (e) {
      if (isENOENT(e)) {
        fileContent = null
      } else {
        throw e
      }
    }

    // 文件不存在
    if (fileContent === null) {
      // 不存在的文件上 old_string 为空意味着创建新文件 —— 有效
      if (old_string === '') {
        return { result: true }
      }
      // 尝试查找具有不同扩展名的类似文件
      const similarFilename = findSimilarFile(fullFilePath)
      const cwdSuggestion = await suggestPathUnderCwd(fullFilePath)
      let message = `文件不存在。${FILE_NOT_FOUND_CWD_NOTE} ${getCwd()}。`

      if (cwdSuggestion) {
        message += ` 您是指 ${cwdSuggestion} 吗？`
      } else if (similarFilename) {
        message += ` 您是指 ${similarFilename} 吗？`
      }

      return {
        result: false,
        behavior: 'ask',
        message,
        errorCode: 4,
      }
    }

    // 文件存在但 old_string 为空 —— 仅当文件为空时才有效
    if (old_string === '') {
      // 仅当文件有内容时才拒绝（针对文件创建尝试）
      if (fileContent.trim() !== '') {
        return {
          result: false,
          behavior: 'ask',
          message: '无法创建新文件 - 文件已存在。',
          errorCode: 3,
        }
      }

      // 空文件且 old_string 为空是有效的 - 我们正在用内容替换空文件
      return {
        result: true,
      }
    }

    if (fullFilePath.endsWith('.ipynb')) {
      return {
        result: false,
        behavior: 'ask',
        message: `文件是 Jupyter Notebook。请使用 ${NOTEBOOK_EDIT_TOOL_NAME} 来编辑此文件。`,
        errorCode: 5,
      }
    }

    const readTimestamp = toolUseContext.readFileState.get(fullFilePath)

    // 检查文件是否存在并获取其最后修改时间
    if (readTimestamp) {
      const lastWriteTime = getFileModificationTime(fullFilePath)
      if (lastWriteTime > readTimestamp.timestamp) {
        // 时间戳表明文件已修改，但在 Windows 上，时间戳可
        // 能在内容未更改的情况下发生变化（云同步、杀毒软件等）。对
        // 于完整读取，作为后备方案比较内容以避免误报。
        const isFullRead =
          readTimestamp.offset === undefined &&
          readTimestamp.limit === undefined
        if (isFullRead && fileContent === readTimestamp.content) {
          // 内容未更改，可以安全继续
        } else {
          return {
            result: false,
            behavior: 'ask',
            message:
              '文件自读取后已被修改，可能是用户或代码检查工具所为。在尝试写入前请重新读取。',
            errorCode: 7,
          }
        }
      }
    }

    const file = fileContent

    // 使用 findActualString 来处理引号规范化
    const actualOldString = findActualString(file, old_string)
    if (!actualOldString) {
      return {
        result: false,
        behavior: 'ask',
        message: `文件中未找到要替换的字符串。
字符串：${old_string}`,
        meta: {
          isFilePathAbsolute: String(isAbsolute(file_path)),
        },
        errorCode: 8,
      }
    }

    const matches = file.split(actualOldString).length - 1

    // 检查是否存在多个匹配项但 replace_all 为 false
    if (matches > 1 && !replace_all) {
      return {
        result: false,
        behavior: 'ask',
        message: `找到 ${matches} 个要替换的字符串匹配项，但 replace_all 为 false。要替换所有出现项，请将 replace_all 设为 true。要仅替换一个出现项，请提供更多上下文以唯一标识该实例。
字符串：${old_string}`,
        meta: {
          isFilePathAbsolute: String(isAbsolute(file_path)),
          actualOldString,
        },
        errorCode: 9,
      }
    }

    // 对 Claude 设置文件的额外验证
    const settingsValidationResult = validateInputForSettingsFileEdit(
      fullFilePath,
      file,
      () => {
        // 使用与工具完全相同的逻辑模拟编辑以获取最终内容
        return replace_all
          ? file.replaceAll(actualOldString, new_string)
          : file.replace(actualOldString, new_string)
      },
    )

    if (settingsValidationResult !== null) {
      return settingsValidationResult
    }

    return { result: true, meta: { actualOldString } }
  },
  inputsEquivalent(input1, input2) {
    return areFileEditsInputsEquivalent(
      {
        file_path: input1.file_path,
        edits: [
          {
            old_string: input1.old_string,
            new_string: input1.new_string,
            replace_all: input1.replace_all ?? false,
          },
        ],
      },
      {
        file_path: input2.file_path,
        edits: [
          {
            old_string: input2.old_string,
            new_string: input2.new_string,
            replace_all: input2.replace_all ?? false,
          },
        ],
      },
    )
  },
  async call(
    input: FileEditInput,
    {
      readFileState,
      userModified,
      updateFileHistoryState,
      dynamicSkillDirTriggers,
    },
    _,
    parentMessage,
  ) {
    const { file_path, old_string, new_string, replace_all = false } = input

    // 1. 获取当前状态
    const fs = getFsImplementation()
    const absoluteFilePath = expandPath(file_path)

    // 从此文件路径发现技能（发射后不管，非阻塞）简单
    // 模式下跳过 - 无可用技能
    const cwd = getCwd()
    if (!isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
      const newSkillDirs = await discoverSkillDirsForPaths(
        [absoluteFilePath],
        cwd,
      )
      if (newSkillDirs.length > 0) {
        // 存储已发现的目录以供附件显示
        for (const dir of newSkillDirs) {
          dynamicSkillDirTriggers?.add(dir)
        }
        // 不要等待 - 让技能加载在后台进行
        addSkillDirectories(newSkillDirs).catch(() => {})
      }

      // 激活路径模式与此文件匹配的条件技能
      activateConditionalSkillsForPaths([absoluteFilePath], cwd)
    }

    await diagnosticTracker.beforeFileEdited(absoluteFilePath)

    // 在原子化读-改-写部分之前确保父目录存在。这些 await 必须
    // 保持在下方关键区域之外 —— 在陈旧性检查和 writeText
    // Content 之间的一个 yield 允许并发编辑交错执行。
    await fs.mkdir(dirname(absoluteFilePath))
    if (fileHistoryEnabled()) {
      // 备份捕获编辑前的内容 —— 在陈旧性检查之前调用是安全的
      // （基于内容哈希的幂等 v1 备份键；如果后续陈旧性检查失败
      // ，我们只是有一个未使用的备份，不会破坏状态）。
      await fileHistoryTrackEdit(
        updateFileHistoryState,
        absoluteFilePath,
        parentMessage.uuid,
      )
    }

    // 2. 加载当前状态并确认自上次读取后无更
    // 改 请避免在此处和写入磁盘之间进行异步操作以保持原子性
    const {
      content: originalFileContents,
      fileExists,
      encoding,
      lineEndings: endings,
    } = readFileForEdit(absoluteFilePath)

    if (fileExists) {
      const lastWriteTime = getFileModificationTime(absoluteFilePath)
      const lastRead = readFileState.get(absoluteFilePath)
      if (!lastRead || lastWriteTime > lastRead.timestamp) {
        // 时间戳表明已修改，但在 Windows 上，时间戳可能
        // 在内容未更改的情况下发生变化（云同步、杀毒软件等）。对
        // 于完整读取，比较内容作为后备方案以避免误报。
        const isFullRead =
          lastRead &&
          lastRead.offset === undefined &&
          lastRead.limit === undefined
        const contentUnchanged =
          isFullRead && originalFileContents === lastRead.content
        if (!contentUnchanged) {
          throw new Error(FILE_UNEXPECTEDLY_MODIFIED_ERROR)
        }
      }
    }

    // 3. 使用 findActualString 来处理引号规范化
    const actualOldString =
      findActualString(originalFileContents, old_string) || old_string

    // 当文件使用花引号时，在 new_string 中保留花引号
    const actualNewString = preserveQuoteStyle(
      old_string,
      actualOldString,
      new_string,
    )

    // 4. 生成补丁
    const { patch, updatedFile } = getPatchForEdit({
      filePath: absoluteFilePath,
      fileContents: originalFileContents,
      oldString: actualOldString,
      newString: actualNewString,
      replaceAll: replace_all,
    })

    // 5. 写入磁盘
    writeTextContent(absoluteFilePath, updatedFile, encoding, endings)

    // 通知 LSP 服务器关于文件修改（didChange）和保存（didSave）
    const lspManager = getLspServerManager()
    if (lspManager) {
      // 清除先前已发送的诊断信息，以便显示新的诊断
      clearDeliveredDiagnosticsForFile(`file://${absoluteFilePath}`)
      // didChange：内容已被修改
      lspManager
        .changeFile(absoluteFilePath, updatedFile)
        .catch((err: Error) => {
          logForDebugging(
            `LSP：未能通知服务器文件 ${absoluteFilePath} 的更改：${err.message}`,
          )
          logError(err)
        })
      // didSave：文件已保存到磁盘（在 TypeScript 服务器中触发诊断）
      lspManager.saveFile(absoluteFilePath).catch((err: Error) => {
        logForDebugging(
          `LSP：未能通知服务器文件 ${absoluteFilePath} 的保存：${err.message}`,
        )
        logError(err)
      })
    }

    // 通知 VSCode 关于文件更改以显示差异视图
    notifyVscodeFileUpdated(absoluteFilePath, originalFileContents, updatedFile)

    // 6. 更新读取时间戳，以使陈旧的写入失效
    readFileState.set(absoluteFilePath, {
      content: updatedFile,
      timestamp: getFileModificationTime(absoluteFilePath),
      offset: undefined,
      limit: undefined,
    })

    // 7. 记录事件
    if (absoluteFilePath.endsWith(`${sep}CLAUDE.md`)) {
      logEvent('tengu_write_claudemd', {})
    }
    countLinesChanged(patch)

    logFileOperation({
      operation: 'edit',
      tool: 'FileEditTool',
      filePath: absoluteFilePath,
    })

    logEvent('tengu_edit_string_lengths', {
      oldStringBytes: Buffer.byteLength(old_string, 'utf8'),
      newStringBytes: Buffer.byteLength(new_string, 'utf8'),
      replaceAll: replace_all,
    })

    let gitDiff: ToolUseDiff | undefined
    if (
      isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_quartz_lantern', false)
    ) {
      const startTime = Date.now()
      const diff = await fetchSingleFileGitDiff(absoluteFilePath)
      if (diff) gitDiff = diff
      logEvent('tengu_tool_use_diff_computed', {
        isEditTool: true,
        durationMs: Date.now() - startTime,
        hasDiff: !!diff,
      })
    }

    // 8. 产出结果
    const data = {
      filePath: file_path,
      oldString: actualOldString,
      newString: new_string,
      originalFile: originalFileContents,
      structuredPatch: patch,
      userModified: userModified ?? false,
      replaceAll: replace_all,
      ...(gitDiff && { gitDiff }),
    }
    return {
      data,
    }
  },
  mapToolResultToToolResultBlockParam(data: FileEditOutput, toolUseID) {
    const { filePath, userModified, replaceAll } = data
    const modifiedNote = userModified
      ? '用户在接受您建议的更改前对其进行了修改。'
      : ''

    if (replaceAll) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: `文件 ${filePath} 已更新${modifiedNote}。所有匹配项均已成功替换。`,
      }
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `文件 ${filePath} 已成功更新${modifiedNote}。`,
    }
  },
} satisfies ToolDef<ReturnType<typeof inputSchema>, FileEditOutput>)

// --

function readFileForEdit(absoluteFilePath: string): {
  content: string
  fileExists: boolean
  encoding: BufferEncoding
  lineEndings: LineEndingType
} {
  try {
    // eslint-disable-next-line custom-rules/no-sync-fs
    const meta = readFileSyncWithMetadata(absoluteFilePath)
    return {
      content: meta.content,
      fileExists: true,
      encoding: meta.encoding,
      lineEndings: meta.lineEndings,
    }
  } catch (e) {
    if (isENOENT(e)) {
      return {
        content: '',
        fileExists: false,
        encoding: 'utf8',
        lineEndings: 'LF',
      }
    }
    throw e
  }
}

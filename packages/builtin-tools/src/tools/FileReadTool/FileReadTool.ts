import type { Base64ImageSource } from '@anthropic-ai/sdk/resources/index.mjs'
import { readdir, readFile as readFileAsync } from 'fs/promises'
import * as path from 'path'
import { posix, win32 } from 'path'
import { z } from 'zod/v4'
import {
  PDF_AT_MENTION_INLINE_THRESHOLD,
  PDF_EXTRACT_SIZE_THRESHOLD,
  PDF_MAX_PAGES_PER_READ,
} from 'src/constants/apiLimits.js'
import { hasBinaryExtension } from 'src/constants/files.js'
import { memoryFreshnessNote } from 'src/memdir/memoryAge.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import { logEvent } from 'src/services/analytics/index.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  getFileExtensionForAnalytics,
} from 'src/services/analytics/metadata.js'
import {
  countTokensWithAPI,
  roughTokenCountEstimationForFileType,
} from 'src/services/tokenEstimation.js'
import {
  activateConditionalSkillsForPaths,
  addSkillDirectories,
  discoverSkillDirsForPaths,
} from 'src/skills/loadSkillsDir.js'
import type { ToolUseContext } from 'src/Tool.js'
import { buildTool, type ToolDef } from 'src/Tool.js'
import { getCwd } from 'src/utils/cwd.js'
import { getClaudeConfigHomeDir, isEnvTruthy } from 'src/utils/envUtils.js'
import { getErrnoCode, isENOENT } from 'src/utils/errors.js'
import {
  addLineNumbers,
  FILE_NOT_FOUND_CWD_NOTE,
  findSimilarFile,
  getFileModificationTimeAsync,
  suggestPathUnderCwd,
} from 'src/utils/file.js'
import { logFileOperation } from 'src/utils/fileOperationAnalytics.js'
import { formatFileSize } from 'src/utils/format.js'
import { getFsImplementation } from 'src/utils/fsOperations.js'
import {
  compressImageBufferWithTokenLimit,
  createImageMetadataText,
  detectImageFormatFromBuffer,
  type ImageDimensions,
  ImageResizeError,
  maybeResizeAndDownsampleImageBuffer,
} from 'src/utils/imageResizer.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { logError } from 'src/utils/log.js'
import { isAutoMemFile } from 'src/utils/memoryFileDetection.js'
import { createUserMessage } from 'src/utils/messages.js'
import { getCanonicalName, getMainLoopModel } from 'src/utils/model/model.js'
import {
  mapNotebookCellsToToolResult,
  readNotebook,
} from 'src/utils/notebook.js'
import { expandPath } from 'src/utils/path.js'
import { extractPDFPages, getPDFPageCount, readPDF } from 'src/utils/pdf.js'
import {
  isPDFExtension,
  isPDFSupported,
  parsePDFPageRange,
} from 'src/utils/pdfUtils.js'
import {
  checkReadPermissionForTool,
  matchingRuleForInput,
} from 'src/utils/permissions/filesystem.js'
import type { PermissionDecision } from 'src/utils/permissions/PermissionResult.js'
import { matchWildcardPattern } from 'src/utils/permissions/shellRuleMatching.js'
import { readFileInRange } from 'src/utils/readFileInRange.js'
import { semanticNumber } from 'src/utils/semanticNumber.js'
import { jsonStringify } from 'src/utils/slowOperations.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'
import { getDefaultFileReadingLimits } from './limits.js'
import {
  DESCRIPTION,
  FILE_READ_TOOL_NAME,
  FILE_UNCHANGED_STUB,
  LINE_FORMAT_INSTRUCTION,
  OFFSET_INSTRUCTION_DEFAULT,
  OFFSET_INSTRUCTION_TARGETED,
  renderPromptTemplate,
} from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseTag,
  userFacingName,
} from './UI.js'

// 可能导致进程挂起的设备文件：无限输出或阻塞输入。
// 仅通过路径检查（无 I/O 操作）。故意省略了像 /dev/null 这样的安全设备。
const BLOCKED_DEVICE_PATHS = new Set([
  // 无限输出 — 永不达到 EOF
  '/dev/zero',
  '/dev/random',
  '/dev/urandom',
  '/dev/full',
  // 阻塞等待输入
  '/dev/stdin',
  '/dev/tty',
  '/dev/console',
  // 读取无意义
  '/dev/stdout',
  '/dev/stderr',
  // 标准输入/标准输出/标准错误输出的文件描述符别名
  '/dev/fd/0',
  '/dev/fd/1',
  '/dev/fd/2',
])

function isBlockedDevicePath(filePath: string): boolean {
  if (BLOCKED_DEVICE_PATHS.has(filePath)) return true
  // /proc/self/fd/0-2 和 /proc/<pid>/fd/0-2 是 Linux 中 stdio 的别名
  if (
    filePath.startsWith('/proc/') &&
    (filePath.endsWith('/fd/0') ||
      filePath.endsWith('/fd/1') ||
      filePath.endsWith('/fd/2'))
  )
    return true
  return false
}

// 某些 macOS 版本在截图文件名中使用的窄无间断空格 (U+202F)
const THIN_SPACE = String.fromCharCode(8239)

/** * 解析可能包含不同空格字符的 macOS 截图路径。
 * macOS 在截图的 AM/PM 前使用常规空格或窄空格 (U+202F)，
 * 具体取决于 macOS 版本。如果给定路径的文件不存在，此函数会尝试使用替代的空格字符。
 *
 * @param filePath - 要解析的规范化文件路径
 * @returns 磁盘上实际文件的路径（空格字符可能不同） */
/** * 对于包含 AM/PM 的 macOS 截图路径，AM/PM 前的空格可能是
 * 常规空格或窄空格，具体取决于 macOS 版本。如果原始路径不存在，
 * 则返回要尝试的替代路径，否则返回 undefined。 */
function getAlternateScreenshotPath(filePath: string): string | undefined {
  const filename = path.basename(filePath)
  const amPmPattern = /^(.+)([ \u202F])(AM|PM)(\.png)$/
  const match = filename.match(amPmPattern)
  if (!match) return undefined

  const currentSpace = match[2]
  const alternateSpace = currentSpace === ' ' ? THIN_SPACE : ' '
  return filePath.replace(
    `${currentSpace}${match[3]}${match[4]}`,
    `${alternateSpace}${match[3]}${match[4]}`,
  )
}

// 文件读取监听器 - 允许在其他服务读取文件时收到通知
type FileReadListener = (filePath: string, content: string) => void
const fileReadListeners: FileReadListener[] = []

export function registerFileReadListener(
  listener: FileReadListener,
): () => void {
  fileReadListeners.push(listener)
  return () => {
    const i = fileReadListeners.indexOf(listener)
    if (i >= 0) fileReadListeners.splice(i, 1)
  }
}

export class MaxFileReadTokenExceededError extends Error {
  constructor(
    public tokenCount: number,
    public maxTokens: number,
  ) {
    super(
      `文件内容 (${tokenCount} 个令牌) 超过允许的最大令牌数 (${maxTokens})。请使用 offset 和 limit 参数读取文件的特定部分，或搜索特定内容而非读取整个文件。`,
    )
    this.name = 'MaxFileReadTokenExceededError'
  }
}

// 常见图片扩展名
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

/** * 检测文件路径是否为用于分析日志记录的会话相关文件。
 * 仅匹配 Claude 配置目录内的文件（例如 ~/.claude）。
 * 返回会话文件的类型，如果不是会话文件则返回 null。 */
function detectSessionFileType(
  filePath: string,
): 'session_memory' | 'session_transcript' | null {
  const configDir = getClaudeConfigHomeDir()

  // 仅匹配 Claude 配置目录内的文件
  if (!filePath.startsWith(configDir)) {
    return null
  }

  // 规范化路径以使用正斜杠，确保跨平台匹配的一致性
  const normalizedPath = filePath.split(win32.sep).join(posix.sep)

  // 会话记忆文件：~/.claude/session-memory/*.md (包括 summary.md)
  if (
    normalizedPath.includes('/session-memory/') &&
    normalizedPath.endsWith('.md')
  ) {
    return 'session_memory'
  }

  // 会话 JSONL 转录文件：~/.claude/projects/*/*.jsonl
  if (
    normalizedPath.includes('/projects/') &&
    normalizedPath.endsWith('.jsonl')
  ) {
    return 'session_transcript'
  }

  return null
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z.string().describe('要读取文件的绝对路径'),
    offset: semanticNumber(z.number().int().nonnegative().optional()).describe(
      '开始读取的行号。仅在文件过大无法一次性读取时提供',
    ),
    limit: semanticNumber(z.number().int().positive().optional()).describe(
      '要读取的行数。仅在文件过大无法一次性读取时提供。',
    ),
    pages: z
      .string()
      .optional()
      .describe(
        `PDF 文件的页面范围（例如 "1-5", "3", "10-20"）。仅适用于 PDF 文件。每个请求最多 ${PDF_MAX_PAGES_PER_READ} 页。`,
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() => {
  // 定义支持的图片媒体类型
  const imageMediaTypes = z.enum([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ])

  return z.discriminatedUnion('type', [
    z.object({
      type: z.literal('text'),
      file: z.object({
        filePath: z.string().describe('已读取文件的路径'),
        content: z.string().describe('文件的内容'),
        numLines: z.number().describe('返回内容中的行数'),
        startLine: z.number().describe('起始行号'),
        totalLines: z.number().describe('文件的总行数'),
      }),
    }),
    z.object({
      type: z.literal('image'),
      file: z.object({
        base64: z.string().describe('Base64 编码的图像数据'),
        type: imageMediaTypes.describe('图片的 MIME 类型'),
        originalSize: z.number().describe('原始文件大小（字节）'),
        dimensions: z
          .object({
            originalWidth: z
              .number()
              .optional()
              .describe('原始图片宽度（像素）'),
            originalHeight: z
              .number()
              .optional()
              .describe('原始图片高度（像素）'),
            displayWidth: z
              .number()
              .optional()
              .describe('显示图像宽度（像素，调整大小后）'),
            displayHeight: z
              .number()
              .optional()
              .describe('显示图像高度（像素，调整大小后）'),
          })
          .optional()
          .describe('用于坐标映射的图片尺寸信息'),
      }),
    }),
    z.object({
      type: z.literal('notebook'),
      file: z.object({
        filePath: z.string().describe('笔记本文件的路径'),
        cells: z.array(z.any()).describe('笔记本单元格数组'),
      }),
    }),
    z.object({
      type: z.literal('pdf'),
      file: z.object({
        filePath: z.string().describe('PDF文件的路径'),
        base64: z.string().describe('Base64 编码的 PDF 数据'),
        originalSize: z.number().describe('原始文件大小（字节）'),
      }),
    }),
    z.object({
      type: z.literal('parts'),
      file: z.object({
        filePath: z.string().describe('PDF文件的路径'),
        originalSize: z.number().describe('原始文件大小（字节）'),
        count: z.number().describe('提取的页数'),
        outputDir: z.string().describe('包含提取页面图像的目录'),
      }),
    }),
    z.object({
      type: z.literal('file_unchanged'),
      file: z.object({
        filePath: z.string().describe('文件的路径'),
      }),
    }),
  ])
})
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const FileReadTool = buildTool({
  name: FILE_READ_TOOL_NAME,
  searchHint: 'read files, images, PDFs, notebooks',
  // Output is bounded by maxTokens (validateContentTokens). Results exceeding
  // 100KB are persisted to disk (reducing memory pressure in long sessions)
  // rather than kept in the message array indefinitely.
  maxResultSizeChars: 100_000,
  strict: true,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    const limits = getDefaultFileReadingLimits()
    const maxSizeInstruction = limits.includeMaxSizeInPrompt
      ? `。文件大小超过${formatFileSize(limits.maxSizeBytes)}将返回错误；对于更大的文件，请使用offset和limit`
      : ''
    const offsetInstruction = limits.targetedRangeNudge
      ? OFFSET_INSTRUCTION_TARGETED
      : OFFSET_INSTRUCTION_DEFAULT
    return renderPromptTemplate(
      pickLineFormatInstruction(),
      maxSizeInstruction,
      offsetInstruction,
    )
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `正在读取${summary}` : '正在读取文件'
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.file_path
  },
  isSearchOrReadCommand() {
    return { isSearch: false, isRead: true }
  },
  getPath({ file_path }): string {
    return file_path || getCwd()
  },
  backfillObservableInput(input) {
    // hooks.mdx将file_path记录为绝对路径；进行扩展，以便钩子允许列表
    // 无法通过~或相对路径绕过。
    if (typeof input.file_path === 'string') {
      input.file_path = expandPath(input.file_path)
    }
  },
  async preparePermissionMatcher({ file_path }) {
    return pattern => matchWildcardPattern(pattern, file_path)
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    return checkReadPermissionForTool(
      FileReadTool,
      input,
      appState.toolPermissionContext,
    )
  },
  renderToolUseMessage,
  renderToolUseTag,
  renderToolResultMessage,
  // UI.tsx:140 — 所有类型仅渲染摘要框架："读取N行",
  // "读取图像（42KB）"。从不显示内容本身。面向模型的
  // 序列化（下方）发送内容 + CYBER_RISK_MITIGATION_REMINDER
  // + 行前缀；UI不显示任何内容。无需索引。当最初声明file.content时
  // 被渲染保真度测试捕获。
  extractSearchText() {
    return ''
  },
  renderToolUseErrorMessage,
  async validateInput({ file_path, pages }, toolUseContext: ToolUseContext) {
    // 验证页面参数（纯字符串解析，无I/O）
    if (pages !== undefined) {
      const parsed = parsePDFPageRange(pages)
      if (!parsed) {
        return {
          result: false,
          message: `无效的页面参数："${pages}"。请使用如"1-5"、"3"或"10-20"的格式。页面从1开始编号。`,
          errorCode: 7,
        }
      }
      const rangeSize =
        parsed.lastPage === Infinity
          ? PDF_MAX_PAGES_PER_READ + 1
          : parsed.lastPage - parsed.firstPage + 1
      if (rangeSize > PDF_MAX_PAGES_PER_READ) {
        return {
          result: false,
          message: `页面范围"${pages}"超过了每个请求最多${PDF_MAX_PAGES_PER_READ}页的限制。请使用更小的范围。`,
          errorCode: 8,
        }
      }
    }

    // 路径扩展 + 拒绝规则检查（无I/O）
    const fullFilePath = expandPath(file_path)

    const appState = toolUseContext.getAppState()
    const denyRule = matchingRuleForInput(
      fullFilePath,
      appState.toolPermissionContext,
      'read',
      'deny',
    )
    if (denyRule !== null) {
      return {
        result: false,
        message: '文件位于您的权限设置拒绝的目录中。',
        errorCode: 1,
      }
    }

    // 安全：UNC路径检查（无I/O）——推迟文件系统操作
    // 直到用户授予权限后，以防止NTLM凭据泄露
    const isUncPath =
      fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//')
    if (isUncPath) {
      return { result: true }
    }

    // 二进制扩展名检查（仅对扩展名的字符串检查，无I/O）。
    // PDF、图片和 SVG 文件被排除在外——此工具会原生渲染它们。
    const ext = path.extname(fullFilePath).toLowerCase()
    if (
      hasBinaryExtension(fullFilePath) &&
      !isPDFExtension(ext) &&
      !IMAGE_EXTENSIONS.has(ext.slice(1))
    ) {
      return {
        result: false,
        message: `此工具无法读取二进制文件。该文件似乎是一个二进制 ${ext} 文件。请使用适当的工具进行二进制文件分析。`,
        errorCode: 4,
      }
    }

    // 阻止会导致挂起（无限输出或阻塞输入）的特定设备文件。
    // 这是基于路径的检查，不涉及 I/O——安全的特殊文件（如 /dev/null）是允许的。
    if (isBlockedDevicePath(fullFilePath)) {
      return {
        result: false,
        message: `无法读取 '${file_path}'：此设备文件会阻塞或产生无限输出。`,
        errorCode: 9,
      }
    }

    return { result: true }
  },
  async call(
    { file_path, offset = 1, limit = undefined, pages },
    context,
    _canUseTool?,
    parentMessage?,
  ) {
    const { readFileState, fileReadingLimits } = context

    const defaults = getDefaultFileReadingLimits()
    const maxSizeBytes =
      fileReadingLimits?.maxSizeBytes ?? defaults.maxSizeBytes
    const maxTokens = fileReadingLimits?.maxTokens ?? defaults.maxTokens

    // 遥测：追踪调用者何时覆盖默认读取限制。
    // 仅在覆盖时触发（低频率）——事件计数 = 覆盖频率。
    if (fileReadingLimits !== undefined) {
      logEvent('tengu_file_read_limits_override', {
        hasMaxTokens: fileReadingLimits.maxTokens !== undefined,
        hasMaxSizeBytes: fileReadingLimits.maxSizeBytes !== undefined,
      })
    }

    const ext = path.extname(file_path).toLowerCase().slice(1)
    // 使用 expandPath 实现与 FileEditTool/FileWriteTool 一致的路径规范化
    // （特别处理空格修剪和 Windows 路径分隔符）
    const fullFilePath = expandPath(file_path)

    // 去重：如果我们已经读取过此确切范围，并且文件在磁盘上
    // 未更改，则返回存根而非重新发送完整内容。
    // 较早的 Read tool_result 仍在上下文中——两个完整副本
    // 会在每个后续轮次中浪费 cache_creation 令牌。BQ 代理显示
    // 约 18% 的 Read 调用是相同文件冲突（最高占舰队
    // cache_creation 的 2.64%）。仅适用于文本/笔记本读取——图片/PDF
    // 未在 readFileState 中缓存，因此不会在此处匹配。
    //
    // Ant 浸泡测试：2 小时内 1,734 次去重命中，无 Read 错误回归。
    // 紧急停止模式：如果存根消息在外部使模型困惑，GB 可以禁用它。
    // 第三方默认：紧急停止关闭 = 去重启用。仅限客户端——无需
    // 服务器支持，对 Bedrock/Vertex/Foundry 安全。
    // 仅对来自先前 Read 的条目进行去重（偏移量始终由 Read 设置）。
    const dedupKillswitch = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_read_dedup_killswitch',
      false,
    )
    const existingState = dedupKillswitch
      ? undefined
      : readFileState.get(fullFilePath)
    // Edit/Write 存储 offset=undefined——它们的 readFileState
    // 条目反映编辑后的 mtime，因此针对它去重会错误地
    // 将模型指向编辑前的 Read 内容。
    // stat 失败——回退到完整读取
    if (
      existingState &&
      !existingState.isPartialView &&
      existingState.offset !== undefined
    ) {
      const rangeMatch =
        existingState.offset === offset && existingState.limit === limit
      if (rangeMatch) {
        try {
          const mtimeMs = await getFileModificationTimeAsync(fullFilePath)
          if (mtimeMs === existingState.timestamp) {
            const analyticsExt = getFileExtensionForAnalytics(fullFilePath)
            logEvent('tengu_file_read_dedup', {
              ...(analyticsExt !== undefined && { ext: analyticsExt }),
            })
            return {
              data: {
                type: 'file_unchanged' as const,
                file: { filePath: file_path },
              },
            }
          }
        } catch {
          // 从此文件的路径发现技能（触发即忘，非阻塞）
        }
      }
    }

    // 在简单模式下跳过——无可用技能
    // 存储发现的目录以供附件显示
    const cwd = getCwd()
    if (!isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
      const newSkillDirs = await discoverSkillDirsForPaths([fullFilePath], cwd)
      if (newSkillDirs.length > 0) {
        // 不要等待——让技能加载在后台进行
        for (const dir of newSkillDirs) {
          context.dynamicSkillDirTriggers?.add(dir)
        }
        // 无需等待 - 让技能加载在后台进行
        addSkillDirectories(newSkillDirs).catch(() => {})
      }

      // 激活路径模式与此文件匹配的条件技能
      activateConditionalSkillsForPaths([fullFilePath], cwd)
    }

    try {
      return await callInner(
        file_path,
        fullFilePath,
        fullFilePath,
        ext,
        offset,
        limit,
        pages,
        maxSizeBytes,
        maxTokens,
        readFileState,
        context,
        parentMessage?.message.id,
      )
    } catch (error) {
      // 处理文件未找到的情况：建议相似文件
      const code = getErrnoCode(error)
      if (code === 'ENOENT') {
        // macOS 截图可能在 AM/PM 前使用窄空格或常规空格
        // AM/PM — 在放弃前尝试另一种格式
        const altPath = getAlternateScreenshotPath(fullFilePath)
        if (altPath) {
          try {
            return await callInner(
              file_path,
              fullFilePath,
              altPath,
              ext,
              offset,
              limit,
              pages,
              maxSizeBytes,
              maxTokens,
              readFileState,
              context,
              parentMessage?.message.id,
            )
          } catch (altError) {
            if (!isENOENT(altError)) {
              throw altError
            }
            // 备用路径也缺失 — 回退到友好错误提示
          }
        }

        const similarFilename = findSimilarFile(fullFilePath)
        const cwdSuggestion = await suggestPathUnderCwd(fullFilePath)
        let message = `文件不存在。${FILE_NOT_FOUND_CWD_NOTE} ${getCwd()}。`
        if (cwdSuggestion) {
          message += ` 您要找的是 ${cwdSuggestion} 吗？`
        } else if (similarFilename) {
          message += ` 您要找的是 ${similarFilename} 吗？`
        }
        throw new Error(message)
      }
      throw error
    }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    switch (data.type) {
      case 'image': {
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                data: data.file.base64,
                media_type: data.file.type,
              },
            },
          ],
        }
      }
      case 'notebook':
        return mapNotebookCellsToToolResult(data.file.cells, toolUseID)
      case 'pdf':
        // 仅返回 PDF 元数据 — 实际内容作为补充的 DocumentBlockParam 发送
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `PDF 文件读取：${data.file.filePath} (${formatFileSize(data.file.originalSize)})`,
        }
      case 'parts':
        // 提取的页面图像在 mapToolResultToAPIMessage 中作为图像块读取并发送
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `PDF 页面提取：从 ${data.file.filePath} (${formatFileSize(data.file.originalSize)}) 提取了 ${data.file.count} 页`,
        }
      case 'file_unchanged':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: FILE_UNCHANGED_STUB,
        }
      case 'text': {
        let content: string

        if (data.file.content) {
          content =
            memoryFileFreshnessPrefix(data) +
            formatFileLines(data.file) +
            (shouldIncludeFileReadMitigation()
              ? CYBER_RISK_MITIGATION_REMINDER
              : '')
        } else {
          // 确定合适的警告消息
          content =
            data.file.totalLines === 0
              ? '<system-reminder>警告：文件存在但内容为空。</system-reminder>'
              : `<system-reminder>警告：文件存在但长度小于提供的偏移量 (${data.file.startLine})。该文件有 ${data.file.totalLines} 行。</system-reminder>`
        }

        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content,
        }
      }
    }
  },
} satisfies ToolDef<InputSchema, Output>)

function pickLineFormatInstruction(): string {
  return LINE_FORMAT_INSTRUCTION
}

/** 用行号格式化文件内容。 */
function formatFileLines(file: { content: string; startLine: number }): string {
  return addLineNumbers(file)
}

export const CYBER_RISK_MITIGATION_REMINDER =
  '\n\n<system-reminder>\n每当读取文件时，你应考虑它是否会被视为恶意软件。你可以并且应该分析恶意软件，说明它在做什么。但你必须拒绝改进或增强该代码。你仍然可以分析现有代码、撰写报告或回答有关代码行为的问题。\n</system-reminder>\n'

// 应跳过网络风险缓解的模型
const MITIGATION_EXEMPT_MODELS = new Set(['claude-opus-4-6'])

function shouldIncludeFileReadMitigation(): boolean {
  const shortName = getCanonicalName(getMainLoopModel())
  return !MITIGATION_EXEMPT_MODELS.has(shortName)
}

/** * 从 call() 到 mapToolResultToToolResultBlockParam 的侧信道：自动记忆文件的修改时间，以 `data` 对象标识为键。避免在输出模式（流入 SDK 类型）中添加仅用于展示的字段，并避免在映射器中同步文件系统。当数据对象在渲染后变得不可达时，WeakMap 会自动进行垃圾回收。 */
const memoryFileMtimes = new WeakMap<object, number>()

function memoryFileFreshnessPrefix(data: object): string {
  const mtimeMs = memoryFileMtimes.get(data)
  if (mtimeMs === undefined) return ''
  return memoryFreshnessNote(mtimeMs)
}

async function validateContentTokens(
  content: string,
  ext: string,
  maxTokens?: number,
): Promise<void> {
  const effectiveMaxTokens =
    maxTokens ?? getDefaultFileReadingLimits().maxTokens

  // Fast rejection: if raw byte count exceeds 4x the token limit,
  // no encoding can possibly fit (worst case is ~4 bytes/token).
  const byteLength = Buffer.byteLength(content)
  if (byteLength > effectiveMaxTokens * 4) {
    throw new MaxFileReadTokenExceededError(
      Math.ceil(byteLength / 4),
      effectiveMaxTokens,
    )
  }

  const tokenEstimate = roughTokenCountEstimationForFileType(content, ext)
  if (!tokenEstimate || tokenEstimate <= effectiveMaxTokens / 4) return

  const tokenCount = await countTokensWithAPI(content)
  const effectiveCount = tokenCount ?? tokenEstimate

  if (effectiveCount > effectiveMaxTokens) {
    throw new MaxFileReadTokenExceededError(effectiveCount, effectiveMaxTokens)
  }
}

type ImageResult = {
  type: 'image'
  file: {
    base64: string
    type: Base64ImageSource['media_type']
    originalSize: number
    dimensions?: ImageDimensions
  }
}

function createImageResponse(
  buffer: Buffer,
  mediaType: string,
  originalSize: number,
  dimensions?: ImageDimensions,
): ImageResult {
  return {
    type: 'image',
    file: {
      base64: buffer.toString('base64'),
      type: `image/${mediaType}` as Base64ImageSource['media_type'],
      originalSize,
      dimensions,
    },
  }
}

/** * call 的内部实现，分离出来以便在外层调用中处理 ENOENT 错误。 */
async function callInner(
  file_path: string,
  fullFilePath: string,
  resolvedFilePath: string,
  ext: string,
  offset: number,
  limit: number | undefined,
  pages: string | undefined,
  maxSizeBytes: number,
  maxTokens: number,
  readFileState: ToolUseContext['readFileState'],
  context: ToolUseContext,
  messageId: string | undefined,
): Promise<{
  data: Output
  newMessages?: ReturnType<typeof createUserMessage>[]
}> {
  // --- 笔记本 ---
  if (ext === 'ipynb') {
    const cells = await readNotebook(resolvedFilePath)
    const cellsJson = jsonStringify(cells)

    const cellsJsonBytes = Buffer.byteLength(cellsJson)
    if (cellsJsonBytes > maxSizeBytes) {
      throw new Error(
        `笔记本内容 (${formatFileSize(cellsJsonBytes)}) 超出允许的最大大小 (${formatFileSize(maxSizeBytes)})。` +
          `使用 ${BASH_TOOL_NAME} 配合 jq 读取特定部分：
` +
          `  cat "${file_path}" | jq '.cells[:20]' # 前 20 个单元格
` +
          `  cat "${file_path}" | jq '.cells[100:120]' # 第 100-120 个单元格
` +
          `  cat "${file_path}" | jq '.cells | length' # 统计总单元格数
` +
          `  cat "${file_path}" | jq '.cells[] | select(.cell_type=="code") | .source' # 所有代码源`,
      )
    }

    await validateContentTokens(cellsJson, ext, maxTokens)

    // 通过异步 stat 获取修改时间（单次调用，无需预先检查存在性）
    const stats = await getFsImplementation().stat(resolvedFilePath)
    readFileState.set(fullFilePath, {
      content: cellsJson,
      timestamp: Math.floor(stats.mtimeMs),
      offset,
      limit,
    })
    context.nestedMemoryAttachmentTriggers?.add(fullFilePath)

    const data = {
      type: 'notebook' as const,
      file: { filePath: file_path, cells },
    }

    logFileOperation({
      operation: 'read',
      tool: 'FileReadTool',
      filePath: fullFilePath,
      content: cellsJson,
    })

    return { data }
  }

  // --- 图像（单次读取，无重复读取） ---
  if (IMAGE_EXTENSIONS.has(ext)) {
    // 图像有其自身的大小限制（令牌预算 + 压缩） —
    // 不应用文本的 maxSizeBytes 上限。
    const data = await readImageWithTokenBudget(resolvedFilePath, maxTokens)
    context.nestedMemoryAttachmentTriggers?.add(fullFilePath)

    logFileOperation({
      operation: 'read',
      tool: 'FileReadTool',
      filePath: fullFilePath,
      content: data.file.base64,
    })

    const metadataText = data.file.dimensions
      ? createImageMetadataText(data.file.dimensions)
      : null

    return {
      data,
      ...(metadataText && {
        newMessages: [
          createUserMessage({ content: metadataText, isMeta: true }),
        ],
      }),
    }
  }

  // --- PDF ---
  if (isPDFExtension(ext)) {
    if (pages) {
      const parsedRange = parsePDFPageRange(pages)
      const extractResult = await extractPDFPages(
        resolvedFilePath,
        parsedRange ?? undefined,
      )
      if (!extractResult.success) {
        throw new Error((extractResult as any).error.message)
      }
      logEvent('tengu_pdf_page_extraction', {
        success: true,
        pageCount: (extractResult as any).data.file.count,
        fileSize: extractResult.data.file.originalSize,
        hasPageRange: true,
      })
      logFileOperation({
        operation: 'read',
        tool: 'FileReadTool',
        filePath: fullFilePath,
        content: `PDF 页面 ${pages}`,
      })
      const entries = await readdir(extractResult.data.file.outputDir)
      const imageFiles = entries.filter(f => f.endsWith('.jpg')).sort()
      const imageBlocks = await Promise.all(
        imageFiles.map(async f => {
          const imgPath = path.join(extractResult.data.file.outputDir, f)
          const imgBuffer = await readFileAsync(imgPath)
          const resized = await maybeResizeAndDownsampleImageBuffer(
            imgBuffer,
            imgBuffer.length,
            'jpeg',
          )
          return {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type:
                `image/${resized.mediaType}` as Base64ImageSource['media_type'],
              data: resized.buffer.toString('base64'),
            },
          }
        }),
      )
      return {
        data: extractResult.data,
        ...(imageBlocks.length > 0 && {
          newMessages: [
            createUserMessage({ content: imageBlocks, isMeta: true }),
          ],
        }),
      }
    }

    const pageCount = await getPDFPageCount(resolvedFilePath)
    if (pageCount !== null && pageCount > PDF_AT_MENTION_INLINE_THRESHOLD) {
      throw new Error(
        `此 PDF 有 ${pageCount} 页，数量过多，无法一次性读取。` +
          `使用 pages 参数读取特定页面范围（例如，pages: "1-5"）。` +
          `每次请求最多 ${PDF_MAX_PAGES_PER_READ} 页。`,
      )
    }

    const fs = getFsImplementation()
    const stats = await fs.stat(resolvedFilePath)
    const shouldExtractPages =
      !isPDFSupported() || stats.size > PDF_EXTRACT_SIZE_THRESHOLD

    if (shouldExtractPages) {
      const extractResult = await extractPDFPages(resolvedFilePath)
      if (extractResult.success) {
        logEvent('tengu_pdf_page_extraction', {
          success: true,
          pageCount: extractResult.data.file.count,
          fileSize: extractResult.data.file.originalSize,
        })
      } else {
        logEvent('tengu_pdf_page_extraction', {
          success: false,
          available: (extractResult as any).error.reason !== 'unavailable',
          fileSize: stats.size,
        })
      }
    }

    if (!isPDFSupported()) {
      throw new Error(
        '此模型不支持读取完整 PDF。请使用较新的模型（Sonnet 3.5 v2 或更高版本），' +
          `或使用 pages 参数读取特定页面范围（例如，pages: "1-5"，每次请求最多 ${PDF_MAX_PAGES_PER_READ} 页）。` +
          '页面提取需要 poppler-utils：在 macOS 上使用 `brew install poppler` 安装，或在 Debian/Ubuntu 上使用 `apt-get install poppler-utils` 安装。',
      )
    }

    const readResult = await readPDF(resolvedFilePath)
    if (!readResult.success) {
      throw new Error((readResult as any).error.message)
    }
    const pdfData = readResult.data
    logFileOperation({
      operation: 'read',
      tool: 'FileReadTool',
      filePath: fullFilePath,
      content: pdfData.file.base64,
    })

    return {
      data: pdfData,
      newMessages: [
        createUserMessage({
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfData.file.base64,
              },
            },
          ],
          isMeta: true,
        }),
      ],
    }
  }

  // --- 文本文件（通过 readFileInRange 进行单次异步读取） ---
  const lineOffset = offset === 0 ? 0 : offset - 1
  const { content, lineCount, totalLines, totalBytes, readBytes, mtimeMs } =
    await readFileInRange(
      resolvedFilePath,
      lineOffset,
      limit,
      limit === undefined ? maxSizeBytes : undefined,
      context.abortController.signal,
    )

  await validateContentTokens(content, ext, maxTokens)

  readFileState.set(fullFilePath, {
    content,
    timestamp: Math.floor(mtimeMs),
    offset,
    limit,
  })
  context.nestedMemoryAttachmentTriggers?.add(fullFilePath)

  // 迭代前的快照 —— 一个在回调中途取消订阅的监听器
  // 会拼接实时数组并跳过下一个监听器。
  for (const listener of fileReadListeners.slice()) {
    listener(resolvedFilePath, content)
  }

  const data = {
    type: 'text' as const,
    file: {
      filePath: file_path,
      content,
      numLines: lineCount,
      startLine: offset,
      totalLines,
    },
  }
  if (isAutoMemFile(fullFilePath)) {
    memoryFileMtimes.set(data, mtimeMs)
  }

  logFileOperation({
    operation: 'read',
    tool: 'FileReadTool',
    filePath: fullFilePath,
    content,
  })

  const sessionFileType = detectSessionFileType(fullFilePath)
  const analyticsExt = getFileExtensionForAnalytics(fullFilePath)
  logEvent('tengu_session_file_read', {
    totalLines,
    readLines: lineCount,
    totalBytes,
    readBytes,
    offset,
    ...(limit !== undefined && { limit }),
    ...(analyticsExt !== undefined && { ext: analyticsExt }),
    ...(messageId !== undefined && {
      messageID:
        messageId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
    is_session_memory: sessionFileType === 'session_memory',
    is_session_transcript: sessionFileType === 'session_transcript',
  })

  return { data }
}

/** * 读取图像文件，并在需要时应用基于令牌的压缩。
 * 读取文件一次，然后应用标准调整大小。如果结果超出
 * 令牌限制，则对同一缓冲区应用激进压缩。
 *
 * @param filePath - 图像文件的路径
 * @param maxTokens - 图像的最大令牌预算
 * @returns 应用了适当压缩的图像数据 */
export async function readImageWithTokenBudget(
  filePath: string,
  maxTokens: number = getDefaultFileReadingLimits().maxTokens,
  maxBytes?: number,
): Promise<ImageResult> {
  // 读取文件一次 —— 限制为 maxBytes 以避免大文件导致内存不足
  const imageBuffer = await getFsImplementation().readFileBytes(
    filePath,
    maxBytes,
  )
  const originalSize = imageBuffer.length

  if (originalSize === 0) {
    throw new Error(`图像文件为空：${filePath}`)
  }

  const detectedMediaType = detectImageFormatFromBuffer(imageBuffer)
  const detectedFormat = detectedMediaType.split('/')[1] || 'png'

  // 尝试标准调整大小
  let result: ImageResult
  try {
    const resized = await maybeResizeAndDownsampleImageBuffer(
      imageBuffer,
      originalSize,
      detectedFormat,
    )
    result = createImageResponse(
      resized.buffer,
      resized.mediaType,
      originalSize,
      resized.dimensions,
    )
  } catch (e) {
    if (e instanceof ImageResizeError) throw e
    logError(e)
    result = createImageResponse(imageBuffer, detectedFormat, originalSize)
  }

  // 检查是否符合令牌预算
  const estimatedTokens = Math.ceil(result.file.base64.length * 0.125)
  if (estimatedTokens > maxTokens) {
    // 对同一缓冲区进行激进压缩（无需重新读取）
    try {
      const compressed = await compressImageBufferWithTokenLimit(
        imageBuffer,
        maxTokens,
        detectedMediaType,
      )
      return {
        type: 'image',
        file: {
          base64: compressed.base64,
          type: compressed.mediaType,
          originalSize,
        },
      }
    } catch (e) {
      logError(e)
      // 备用方案：来自同一缓冲区的重度压缩版本
      try {
        const sharpModule = await import('sharp')
        const sharp =
          (
            sharpModule as unknown as {
              default?: typeof sharpModule
            } & typeof sharpModule
          ).default || sharpModule

        const fallbackBuffer = await (sharp as any)(imageBuffer)
          .resize(400, 400, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 20 })
          .toBuffer()

        return createImageResponse(fallbackBuffer, 'jpeg', originalSize)
      } catch (error) {
        logError(error)
        return createImageResponse(imageBuffer, detectedFormat, originalSize)
      }
    }
  }

  return result
}

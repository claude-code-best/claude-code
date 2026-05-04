import { z } from 'zod/v4'
import type { ValidationResult } from 'src/Tool.js'
import { buildTool, type ToolDef } from 'src/Tool.js'
import { getCwd } from 'src/utils/cwd.js'
import { isENOENT } from 'src/utils/errors.js'
import { FILE_NOT_FOUND_CWD_NOTE, suggestPathUnderCwd } from 'src/utils/file.js'
import { getFsImplementation } from 'src/utils/fsOperations.js'
import { glob } from 'src/utils/glob.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { expandPath, toRelativePath } from 'src/utils/path.js'
import { checkReadPermissionForTool } from 'src/utils/permissions/filesystem.js'
import type { PermissionDecision } from 'src/utils/permissions/PermissionResult.js'
import { matchWildcardPattern } from 'src/utils/permissions/shellRuleMatching.js'
import { DESCRIPTION, GLOB_TOOL_NAME } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  userFacingName,
} from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    pattern: z.string().describe('用于匹配文件的 glob 模式'),
    path: z
      .string()
      .optional()
      .describe(
        '要搜索的目录。如果未指定，将使用当前工作目录。重要提示：要使用默认目录，请省略此字段。不要输入 "undefined" 或 "null" —— 直接省略即可获得默认行为。如果提供，必须是有效的目录路径。',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    durationMs: z.number().describe('执行搜索所花费的时间（毫秒）'),
    numFiles: z.number().describe('找到的文件总数'),
    filenames: z.array(z.string()).describe('匹配该模式的文件路径数组'),
    truncated: z.boolean().describe('结果是否被截断（限制为 100 个文件）'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const GlobTool = buildTool({
  name: GLOB_TOOL_NAME,
  searchHint: '按名称模式或通配符查找文件',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION
  },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `Finding ${summary}` : '正在查找文件'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.pattern
  },
  isSearchOrReadCommand() {
    return { isSearch: true, isRead: false }
  },
  getPath({ path }): string {
    return path ? expandPath(path) : getCwd()
  },
  async preparePermissionMatcher({ pattern }) {
    return rulePattern => matchWildcardPattern(rulePattern, pattern)
  },
  async validateInput({ path }): Promise<ValidationResult> {
    // 如果提供了路径，验证其是否存在且是一个目录
    if (path) {
      const fs = getFsImplementation()
      const absolutePath = expandPath(path)

      // 安全提示：跳过 UNC 路径的文件系统操作，以防止 NTLM 凭据泄露。
      if (absolutePath.startsWith('\\\\') || absolutePath.startsWith('//')) {
        return { result: true }
      }

      let stats
      try {
        stats = await fs.stat(absolutePath)
      } catch (e: unknown) {
        if (isENOENT(e)) {
          const cwdSuggestion = await suggestPathUnderCwd(absolutePath)
          let message = `目录不存在：${path}。${FILE_NOT_FOUND_CWD_NOTE} ${getCwd()}。`
          if (cwdSuggestion) {
            message += ` 您是指 ${cwdSuggestion} 吗？`
          }
          return {
            result: false,
            message,
            errorCode: 1,
          }
        }
        throw e
      }

      if (!stats.isDirectory()) {
        return {
          result: false,
          message: `路径不是一个目录：${path}`,
          errorCode: 2,
        }
      }
    }

    return { result: true }
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    return checkReadPermissionForTool(
      GlobTool,
      input,
      appState.toolPermissionContext,
    )
  },
  async prompt() {
    return DESCRIPTION
  },
  renderToolUseMessage,
  renderToolUseErrorMessage,
  renderToolResultMessage,
  // 复用 Grep 的渲染逻辑 (UI.tsx:65) —— 显示 filenames.join。durati
  // onMs/ numFiles 是 "在 12ms 内找到 3 个文件" 的提示（计数偏少，没问题）。
  extractSearchText({ filenames }) {
    return filenames.join('\n')
  },
  async call(input, { abortController, getAppState, globLimits }) {
    const start = Date.now()
    const appState = getAppState()
    const limit = globLimits?.maxResults ?? 100
    const { files, truncated } = await glob(
      input.pattern,
      GlobTool.getPath(input),
      { limit, offset: 0 },
      abortController.signal,
      appState.toolPermissionContext,
    )
    // 将路径相对于当前工作目录进行相对化以节省令牌（与 GrepTool 相同）
    const filenames = files.map(toRelativePath)
    const output: Output = {
      filenames,
      durationMs: Date.now() - start,
      numFiles: filenames.length,
      truncated,
    }
    return {
      data: output,
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (output.filenames.length === 0) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: '未找到文件',
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: [
        ...output.filenames,
        ...(output.truncated
          ? ['（结果已被截断。请考虑使用更具体的路径或模式。）']
          : []),
      ].join('\n'),
    }
  },
} satisfies ToolDef<InputSchema, Output>)

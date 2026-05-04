/** 工具使用摘要生成器

使用 Haiku 生成已完成工具批次的人类可读摘要。
由 SDK 使用，向客户端提供高级进度更新。 */

import { E_TOOL_USE_SUMMARY_GENERATION_FAILED } from '../../constants/errorIds.js'
import { toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { queryHaiku } from '../api/claude.js'

const TOOL_USE_SUMMARY_SYSTEM_PROMPT = `写一个简短的摘要标签，描述这些工具调用完成了什么。它在移动应用中显示为单行，并截断约 30 个字符，因此请像 git 提交主题一样思考，而不是句子。

动词使用过去时，并保留最具区分度的名词。先去掉冠词、连接词和较长的位置上下文。

示例：
- 在 auth/ 中搜索
- 修复 UserService 中的 NPE
- 创建 signup 端点
- 读取 config.json
- 运行失败的测试`

type ToolInfo = {
  name: string
  input: unknown
  output: unknown
}

export type GenerateToolUseSummaryParams = {
  tools: ToolInfo[]
  signal: AbortSignal
  isNonInteractiveSession: boolean
  lastAssistantText?: string
}

/** 生成已完成工具的人类可读摘要。

@param params - 参数，包括执行的工具及其结果
@returns 一个简短的摘要字符串，如果生成失败则返回 null */
export async function generateToolUseSummary({
  tools,
  signal,
  isNonInteractiveSession,
  lastAssistantText,
}: GenerateToolUseSummaryParams): Promise<string | null> {
  if (tools.length === 0) {
    return null
  }

  try {
    // 构建工具所做操作的简洁表示
    const toolSummaries = tools
      .map(tool => {
        const inputStr = truncateJson(tool.input, 300)
        const outputStr = truncateJson(tool.output, 300)
        return `工具：${tool.name}\n输入：${inputStr}\n输出：${outputStr}\n`
      })
      .join('\n\n')

    const contextPrefix = lastAssistantText
      ? `用户意图（来自助手上一条消息）：${lastAssistantText.slice(0, 200)}\n\n`
      : ''

    const response = await queryHaiku({
      systemPrompt: asSystemPrompt([TOOL_USE_SUMMARY_SYSTEM_PROMPT]),
      userPrompt: `${contextPrefix}已完成工具：\n\n${toolSummaries}\n\n标签：`,
      signal,
      options: {
        querySource: 'tool_use_summary_generation',
        enablePromptCaching: true,
        agents: [],
        isNonInteractiveSession,
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    })

    const summary = (
      Array.isArray(response.message.content) ? response.message.content : []
    )
      .filter(block => block.type === 'text')
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim()

    return summary || null
  } catch (error) {
    // 记录日志但不失败——摘要非关键
    const err = toError(error)
    err.cause = { errorId: E_TOOL_USE_SUMMARY_GENERATION_FAILED }
    logError(err)
    return null
  }
}

/** 将 JSON 值截断为提示中的最大长度。 */
function truncateJson(value: unknown, maxLength: number): string {
  try {
    const str = jsonStringify(value)
    if (str.length <= maxLength) {
      return str
    }
    return str.slice(0, maxLength - 3) + '...'
  } catch {
    return '[无法序列化]'
  }
}

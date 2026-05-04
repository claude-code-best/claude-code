import { queryHaiku } from '../../services/api/claude.js'
import type { Message } from '../../types/message.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { safeParseJSON } from '../../utils/json.js'
import { extractTextContent } from '../../utils/messages.js'
import { extractConversationText } from '../../utils/sessionTitle.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'

export async function generateSessionName(
  messages: Message[],
  signal: AbortSignal,
): Promise<string | null> {
  const conversationText = extractConversationText(messages)
  if (!conversationText) {
    return null
  }

  try {
    const result = await queryHaiku({
      systemPrompt: asSystemPrompt([
        '生成一个简短的短横线命名（2-4个单词），概括本次对话的核心主题。使用小写单词，并用连字符分隔。示例："修复登录错误"、"添加认证功能"、"重构API客户端"、"调试测试失败"。返回包含 "name" 字段的 JSON。',
      ]),
      userPrompt: conversationText,
      outputFormat: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
      signal,
      options: {
        querySource: 'rename_generate_name',
        agents: [],
        isNonInteractiveSession: false,
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    })

    const content = Array.isArray(result.message.content)
      ? extractTextContent(result.message.content)
      : (result.message.content as string)

    const response = safeParseJSON(content)
    if (
      response &&
      typeof response === 'object' &&
      'name' in response &&
      typeof (response as { name: unknown }).name === 'string'
    ) {
      return (response as { name: string }).name
    }
    return null
  } catch (error) {
    // Haiku 超时/速率限制/网络问题是预期的运行故障 —— 应使用 logFo
    // rDebugging 记录，而非 logError。此函数在每第3条桥接消息时自
    // 动调用（initReplBridge.ts），因此此处的错误会淹没错误日志文件。
    logForDebugging(`generateSessionName 失败：${errorMessage(error)}`, {
      level: 'error',
    })
    return null
  }
}

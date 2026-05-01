/** 通过 Haiku 生成会话标题。

独立模块，依赖最小化，以便可以从 print.ts（SDK 控制请求处理程序）导入，而无需引入 teleport.tsx 所携带的 React/chalk/git 依赖链。

这是所有界面中 AI 生成会话标题的唯一真实来源。此前存在独立的 Haiku 标题生成器：
- teleport.tsx 中的 generateTitleAndBranch（用于 CCR 的 6 词标题 + 分支）
- rename/generateSessionName.ts（用于 /rename 的 kebab-case 名称）
每个生成器都保留以保持向后兼容；新的调用者应使用此模块。 */

import { z } from 'zod/v4'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import { logEvent } from '../services/analytics/index.js'
import { queryHaiku } from '../services/api/claude.js'
import type { Message } from '../types/message.js'
import { logForDebugging } from './debug.js'
import { safeParseJSON } from './json.js'
import { lazySchema } from './lazySchema.js'
import { extractTextContent } from './messages.js'
import { asSystemPrompt } from './systemPromptType.js'

const MAX_CONVERSATION_TEXT = 1000

/** 将消息数组展平为单个文本字符串，作为 Haiku 标题输入。
跳过元/非人类消息。从尾部截取最后 1000 个字符，以便在对话较长时，最近的上下文占主导地位。 */
export function extractConversationText(messages: Message[]): string {
  const parts: string[] = []
  for (const msg of messages) {
    if (msg.type !== 'user' && msg.type !== 'assistant') continue
    if ('isMeta' in msg && msg.isMeta) continue
    if ('origin' in msg && (msg as any).origin && (msg as any).origin.kind !== 'human') continue
    const content = msg.message!.content
    if (typeof content === 'string') {
      parts.push(content)
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if ('type' in block && block.type === 'text' && 'text' in block) {
          parts.push(block.text as string)
        }
      }
    }
  }
  const text = parts.join('\n')
  return text.length > MAX_CONVERSATION_TEXT
    ? text.slice(-MAX_CONVERSATION_TEXT)
    : text
}

const SESSION_TITLE_PROMPT = `生成一个简洁的句子式标题（3-7 个词），概括此编码会话的主要主题或目标。标题应足够清晰，使用户能在列表中识别出该会话。使用句子式大小写：仅首单词和专有名词大写。

返回包含单个 "title" 字段的 JSON。
好的示例：
{"title": "Fix login button on mobile"}
{"title": "Add OAuth authentication"}
{"title": "Debug failing CI tests"}
{"title": "Refactor API client error handling"}

不好的示例（过于模糊）：{"title": "Code changes"}
不好的示例（过长）：{"title": "Investigate and fix the issue where the login button does not respond on mobile devices"}
不好的示例（大小写错误）：{"title": "Fix Login Button On Mobile"}`

const titleSchema = lazySchema(() => z.object({ title: z.string() }))

/** 根据描述或第一条消息生成句子式会话标题。
如果出错或 Haiku 返回无法解析的响应，则返回 null。

@param description - 用户的第一条消息或会话描述
@param signal - 用于取消的中止信号 */
export async function generateSessionTitle(
  description: string,
  signal: AbortSignal,
): Promise<string | null> {
  const trimmed = description.trim()
  if (!trimmed) return null

  try {
    const result = await queryHaiku({
      systemPrompt: asSystemPrompt([SESSION_TITLE_PROMPT]),
      userPrompt: trimmed,
      outputFormat: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      signal,
      options: {
        querySource: 'generate_session_title',
        agents: [],
        // 反映实际的会话模式——此模块从 SDK 打印路径（非
        // 交互式）和通过 useRemoteSession 的
        // CCR 远程会话路径（交互式）中调用。
        isNonInteractiveSession: getIsNonInteractiveSession(),
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    })

    const text = extractTextContent(result.message.content as any)

    const parsed = titleSchema().safeParse(safeParseJSON(text))
    const title = parsed.success ? parsed.data.title.trim() || null : null

    logEvent('tengu_session_title_generated', { success: title !== null })

    return title
  } catch (error) {
    logForDebugging(`generateSessionTitle 失败：${error}`, {
      level: 'error',
    })
    logEvent('tengu_session_title_generated', { success: false })
    return null
  }
}

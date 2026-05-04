import { randomUUID } from 'crypto'
import type { Command, LocalCommandCall } from '../types/command.js'
import type { Message } from '../types/message.js'

/** 在消息数组中插入一个截断边界。

截断边界是一条系统消息，用于标记其之前的所有内容为“已截断”。在下一个查询周期中，`snipCompactIfNeeded`（位于 services/compact/snipCompact.ts 中）会检测到此边界，并移除（或折叠）较早的消息，使它们不再占用上下文窗口的令牌。REPL 会为 UI 回滚保留完整的历史记录；该边界仅影响面向模型的投影。

`snipMetadata.removedUuids` 字段告知下游消费者（sessionStorage 持久化、snipProjection）哪些消息已被移除。 */
const call: LocalCommandCall = async (_args, context) => {
  const { messages, setMessages } = context

  if (messages.length === 0) {
    return { type: 'text', value: '没有需要截断的消息。' }
  }

  // Collect UUIDs of every message that will be snipped (everything currently
  // in the conversation). The next call to `snipCompactIfNeeded` will honour
  // the boundary and strip these from the model-facing view.
  const removedUuids = messages.map(m => m.uuid)

  const boundaryMessage: Message = {
    type: 'system',
    subtype: 'snip_boundary',
    content: '[截断] 此时间点之前的对话历史已被截断。',
    isMeta: true,
    timestamp: new Date().toISOString(),
    uuid: randomUUID(),
    snipMetadata: {
      removedUuids,
    },
  } as Message // subtype 受功能门控；通过 Message 进行类型转换。

  setMessages(prev => [...prev, boundaryMessage])

  return {
    type: 'text',
    value: `已截断 ${removedUuids.length} 条消息。较早的历史记录将从下一个模型查询中排除。`,
  }
}

const forceSnip = {
  type: 'local',
  name: 'force-snip',
  description: '强制在当前点截断对话历史',
  supportsNonInteractive: true,
  isHidden: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default forceSnip

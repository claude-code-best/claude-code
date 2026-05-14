/** 对话消息联合类型（含用户/助手/系统等）；与宿主 `src/types/message.js` 重导出一致。 */
export type Message = import('src/types/message.js').Message

/** 归一化后的用户消息形状；与宿主 `src/types/message.js` 中 `NormalizedUserMessage` 一致。 */
export type NormalizedUserMessage =
  import('src/types/message.js').NormalizedUserMessage

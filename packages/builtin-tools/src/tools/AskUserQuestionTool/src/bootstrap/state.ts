/** 返回当前允许展示的通道列表（含名称、连接状态等）；与宿主 `src/bootstrap/state.js` 中 `getAllowedChannels` 一致。 */
export type getAllowedChannels =
  typeof import('src/bootstrap/state.js').getAllowedChannels

/** 返回问题预览渲染格式（Markdown/HTML）或未配置；与宿主 `getQuestionPreviewFormat` 一致。 */
export type getQuestionPreviewFormat =
  typeof import('src/bootstrap/state.js').getQuestionPreviewFormat

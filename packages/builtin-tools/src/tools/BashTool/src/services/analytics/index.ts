/** 同步记录分析事件（未附加 sink 时入队）；与宿主 `src/services/analytics/index.js` 中 `logEvent` 一致。 */
export type logEvent = typeof import('src/services/analytics/index.js').logEvent

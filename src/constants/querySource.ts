/**
 * 标识一次模型/API 调用的业务来源，用于遥测拆分、缓存控制与 529 重试策略。
 * 值域随功能增长而扩展（含 `repl_main_thread:*`、`agent:*` 等前缀），故使用 `string`；
 * 常见字面量见各调用点及 `withRetry.ts` 中的 `FOREGROUND_529_RETRY_SOURCES`。
 */
export type QuerySource = string // 与日志/统计中的 source 字段对齐的自由文本标签

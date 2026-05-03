// Usage types for the model provider package.
// Moved from src/entrypoints/sdk/sdkUtilityTypes.ts and src/services/api/emptyUsage.ts

/**
 * Non-nullable usage object representing token consumption from an API response.
 * Moved from src/entrypoints/sdk/sdkUtilityTypes.ts
 */
export type NonNullableUsage = {
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  output_tokens: number
  server_tool_use: { web_search_requests: number; web_fetch_requests: number }
  service_tier: string
  cache_creation: {
    ephemeral_1h_input_tokens: number
    ephemeral_5m_input_tokens: number
  }
  inference_geo: string
  iterations: unknown[]
  speed: string
  cache_deleted_input_tokens?: number
  [key: string]: unknown
}

/**
 * 零初始化的 usage 对象。从 logging.ts 中抽离出来，
 * 以便 bridge/replBridge.ts 可以引用它，而不会间接引入
 * api/errors.ts → utils/messages.ts → BashTool.tsx → 大量依赖。
 */
export const EMPTY_USAGE: Readonly<NonNullableUsage> = {
  input_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 0,
  server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
  service_tier: 'standard',
  cache_creation: {
    ephemeral_1h_input_tokens: 0,
    ephemeral_5m_input_tokens: 0,
  },
  inference_geo: '',
  iterations: [],
  speed: 'standard',
}

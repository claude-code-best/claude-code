import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// 会话范围内的工具 schema 缓存。工具 schema 在服务器位置 2（系统提示之前）渲染，因此任何字节级别的更改都会使整个约 11K token 的工具块及其后的所有内容失效。
// GrowthBook 门控切换（tengu_tool_pear、tengu_fgts）、MCP 重新连接或 tool.prompt() 中的动态内容都会导致这种波动。
// 按会话进行记忆化可在首次渲染时锁定 schema 字节 —— 会话中途的 GB 刷新不再破坏缓存。
//
// 位于叶子模块中，以便 auth.ts 可以清除它而无需导入 api.ts（否则会通过 plans→settings→file→growthbook→config→bridgeEnabled→auth 形成循环）。
type CachedSchema = BetaTool & {
  strict?: boolean
  eager_input_streaming?: boolean
}

const TOOL_SCHEMA_CACHE = new Map<string, CachedSchema>()

export function getToolSchemaCache(): Map<string, CachedSchema> {
  return TOOL_SCHEMA_CACHE
}

export function clearToolSchemaCache(): void {
  TOOL_SCHEMA_CACHE.clear()
}
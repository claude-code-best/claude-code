import { feature } from 'bun:bundle'

/**
 * Claude Code 2025-02-19 版本的 Beta 头
 */
export const CLAUDE_CODE_20250219_BETA_HEADER = 'claude-code-20250219'

/**
 * 交错思考（interleaved thinking）Beta 头，自 2025-05-14 起
 */
export const INTERLEAVED_THINKING_BETA_HEADER =
  'interleaved-thinking-2025-05-14'

/**
 * 1M 上下文 Beta 头，自 2025-08-07 起
 */
export const CONTEXT_1M_BETA_HEADER = 'context-1m-2025-08-07'

/**
 * 上下文管理 Beta 头，自 2025-06-27 起
 */
export const CONTEXT_MANAGEMENT_BETA_HEADER = 'context-management-2025-06-27'

/**
 * 结构化输出 Beta 头，自 2025-12-15 起
 */
export const STRUCTURED_OUTPUTS_BETA_HEADER = 'structured-outputs-2025-12-15'

/**
 * 网络搜索 Beta 头，自 2025-03-05 起
 */
export const WEB_SEARCH_BETA_HEADER = 'web-search-2025-03-05'

// 工具搜索 Beta 头因提供者而异：
// - Claude API / Foundry：advanced-tool-use-2025-11-20
// - Vertex AI / Bedrock：tool-search-tool-2025-10-19
export const TOOL_SEARCH_BETA_HEADER_1P = 'advanced-tool-use-2025-11-20'
export const TOOL_SEARCH_BETA_HEADER_3P = 'tool-search-tool-2025-10-19'

/**
 * 工作量（effort）Beta 头，自 2025-11-24 起
 */
export const EFFORT_BETA_HEADER = 'effort-2025-11-24'

/**
 * 任务预算 Beta 头，自 2026-03-13 起
 */
export const TASK_BUDGETS_BETA_HEADER = 'task-budgets-2026-03-13'

/**
 * 提示缓存作用域 Beta 头，自 2026-01-05 起
 */
export const PROMPT_CACHING_SCOPE_BETA_HEADER =
  'prompt-caching-scope-2026-01-05'

/**
 * 快速模式 Beta 头，自 2026-02-01 起
 */
export const FAST_MODE_BETA_HEADER = 'fast-mode-2026-02-01'

/**
 * 思考内容修正 Beta 头，自 2026-02-12 起
 */
export const REDACT_THINKING_BETA_HEADER = 'redact-thinking-2026-02-12'

/**
 * 令牌高效工具 Beta 头，自 2026-03-28 起
 */
export const TOKEN_EFFICIENT_TOOLS_BETA_HEADER =
  'token-efficient-tools-2026-03-28'

/**
 * 离开模式（AFK Mode）Beta 头，自 2026-01-31 起
 * 仅当 TRANSCRIPT_CLASSIFIER 特性开启时启用
 */
export const AFK_MODE_BETA_HEADER = feature('TRANSCRIPT_CLASSIFIER')
  ? 'afk-mode-2026-01-31'
  : ''

/**
 * CLI 内部 Beta 头，自 2026-02-09 起
 * 仅当 USER_TYPE 为 'ant' 时启用
 */
export const CLI_INTERNAL_BETA_HEADER =
  process.env.USER_TYPE === 'ant' ? 'cli-internal-2026-02-09' : ''

/**
 * 顾问工具 Beta 头，自 2026-03-01 起
 */
export const ADVISOR_BETA_HEADER = 'advisor-tool-2026-03-01'

/**
 * **Bedrock 只支持有限数量的 Beta 头，且只能通过 extraBodyParams 传递。**
 * 此集合记录了那些应放入 Bedrock extraBodyParams *而非* Bedrock 头部中的 Beta 字符串。
 */
export const BEDROCK_EXTRA_PARAMS_HEADERS = new Set([
  INTERLEAVED_THINKING_BETA_HEADER,
  CONTEXT_1M_BETA_HEADER,
  TOOL_SEARCH_BETA_HEADER_3P,
])

/**
 * Vertex 的 countTokens API 所允许的 Beta 头集合。
 * 其他 Beta 头会导致 400 错误。
 */
export const VERTEX_COUNT_TOKENS_ALLOWED_BETAS = new Set([
  CLAUDE_CODE_20250219_BETA_HEADER,
  INTERLEAVED_THINKING_BETA_HEADER,
  CONTEXT_MANAGEMENT_BETA_HEADER,
])

/**
 * 缓存编辑 Beta 头（当前未启用，保留空字符串）
 */
export const CACHE_EDITING_BETA_HEADER: string = ''
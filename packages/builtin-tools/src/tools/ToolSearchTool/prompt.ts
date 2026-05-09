import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import type { Tool } from 'src/Tool.js'
import { CORE_TOOLS } from 'src/constants/tools.js'

export { TOOL_SEARCH_TOOL_NAME } from './constants.js'

import { TOOL_SEARCH_TOOL_NAME } from './constants.js'

const PROMPT_HEAD = `Search for deferred tools by name or keyword.

`

// Matches isDeferredToolsDeltaEnabled in toolSearch.ts (not imported —
// toolSearch.ts imports from this file). When enabled: tools announced
// via system-reminder attachments. When disabled: prepended
// <available-deferred-tools> block (pre-gate behavior).
function getToolLocationHint(): string {
  const deltaEnabled =
    process.env.USER_TYPE === 'ant' ||
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_glacier_2xr', false)
  return deltaEnabled
    ? 'Deferred tools appear by name in <system-reminder> messages.'
    : 'Deferred tools appear by name in <available-deferred-tools> messages.'
}

const PROMPT_TAIL = ` Returns matching tool names.

ExecuteExtraTool is a first-class tool that is always available — you do NOT need to search for it. After this search returns tool names, call ExecuteExtraTool directly with {"tool_name": "<returned_name>", "params": {...}} to invoke any deferred tool.

Query forms:
- "select:CronCreate,Snip" — fetch these exact tools by name
- "discover:schedule cron job" — pure discovery, returns tool info (name, description) without loading. Use when you want to understand available tools before deciding which to invoke.
- "notebook jupyter" — keyword search, up to max_results best matches
- "+slack send" — require "slack" in the name, rank by remaining terms`

/**
 * Check if a tool should be deferred (requires ToolSearch to load).
 * A tool is deferred if it is NOT in CORE_TOOLS and does NOT have alwaysLoad: true.
 * Core tools are always loaded — never deferred.
 * All other tools (non-core built-in + all MCP tools) are deferred
 * and must be discovered via ToolSearchTool / ExecuteExtraTool.
 */
export function isDeferredTool(tool: Tool): boolean {
  // Explicit opt-out via _meta['anthropic/alwaysLoad']
  if (tool.alwaysLoad === true) return false

  // Core tools are always loaded — never deferred
  if (CORE_TOOLS.has(tool.name)) return false

  // Everything else (non-core built-in + all MCP tools) is deferred
  return true
}

/**
 * Format one deferred-tool line for the <available-deferred-tools> user
 * message. Search hints (tool.searchHint) are not rendered — the
 * hints A/B (exp_xenhnnmn0smrx4, stopped Mar 21) showed no benefit.
 */
export function formatDeferredToolLine(tool: Tool): string {
  return tool.name
}

export function getPrompt(): string {
  return PROMPT_HEAD + getToolLocationHint() + PROMPT_TAIL
}

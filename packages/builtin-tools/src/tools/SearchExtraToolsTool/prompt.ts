import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import type { Tool } from 'src/Tool.js'
import { CORE_TOOLS } from 'src/constants/tools.js'

export { SEARCH_EXTRA_TOOLS_TOOL_NAME } from './constants.js'

import { SEARCH_EXTRA_TOOLS_TOOL_NAME } from './constants.js'

const PROMPT_HEAD = `Search for deferred tools by name or keyword. LOW PRIORITY — only use this tool when no core tool can accomplish the task. Core tools (Read, Edit, Write, Bash, Glob, Grep, Agent, WebFetch, WebSearch, Skill) are always available and should be used directly. This tool is for discovering additional capabilities like MCP tools, cron scheduling, worktree management, agent teams (TeamCreate, TeamDelete, SendMessage), etc.

`

// Matches isDeferredToolsDeltaEnabled in searchExtraTools.ts (not imported —
// searchExtraTools.ts imports from this file). When enabled: tools announced
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

## Two-step workflow (MUST follow exactly)

Deferred tools CANNOT be called directly. You MUST use this two-step pattern:

Step 1 — Search: Call this tool (SearchExtraTools) to discover the target tool.
  Input: {"query": "select:CronCreate"}
  Response: "Found 1 deferred tool(s): CronCreate. Use ExecuteExtraTool with {"tool_name": "<name>", "params": {...}} to invoke."

Step 2 — Execute: Call ExecuteExtraTool to run the discovered tool.
  Input: {"tool_name": "CronCreate", "params": {"schedule": "*/5 * * * *", "prompt": "check the deploy"}}
  Response: the actual tool result.

## Example: user asks "schedule a cron to check deploy every 5 minutes"

1. SearchExtraTools({"query": "select:CronCreate"})
   → Response: Found deferred tool CronCreate
2. ExecuteExtraTool({"tool_name": "CronCreate", "params": {"schedule": "*/5 * * * *", "prompt": "check the deploy"}})
   → Response: Cron job created successfully

If you don't know the exact tool name, use keyword search first:
1. SearchExtraTools({"query": "cron schedule"})
   → Response: Found deferred tool(s): CronCreate
2. ExecuteExtraTool({"tool_name": "CronCreate", "params": {...}})

## Query forms
- "select:CronCreate" — exact tool name (fastest, preferred when you know the name from <available-deferred-tools>)
- "select:CronCreate,CronList" — comma-separated multi-select
- "discover:schedule cron job" — returns tool name + description + schema without loading. Use to understand a tool before calling it.
- "notebook jupyter" — keyword search, up to max_results best matches
- "+slack send" — require "slack" in the name, rank by remaining terms

## Failure policy
If ExecuteExtraTool fails, do NOT re-search for the same tool — it will loop. Stop and tell the user what failed.`

/**
 * Check if a tool should be deferred (requires SearchExtraTools to load).
 * A tool is deferred if it is NOT in CORE_TOOLS and does NOT have alwaysLoad: true.
 * Core tools are always loaded — never deferred.
 * All other tools (non-core built-in + all MCP tools) are deferred
 * and must be discovered via SearchExtraToolsTool / ExecuteExtraTool.
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

/**
 * Bridge module: converts Claude Code's SDKMessage stream events from
 * QueryEngine.submitMessage() into ACP SessionUpdate notifications.
 *
 * Handles all SDKMessage types:
 *  - system (compact_boundary, api_retry, local_command_output)
 *  - user (message replay)
 *  - assistant (full messages with content blocks)
 *  - stream_event (real-time streaming: content_block_start/delta)
 *  - result (turn termination with usage/cost)
 *  - progress (subagent progress)
 *  - tool_use_summary
 *
 * This file is the public entrypoint (barrel) re-exporting from the `./bridge/`
 * sub-modules. The split keeps each sub-file under 500 lines while preserving
 * the exact public API surface — permissions.test.ts snapshots every named
 * export from this module, so DO NOT add internal-only exports here.
 */
export type { ToolUseCache, SessionUsage } from './bridge/types.js'
export { toolInfoFromToolUse } from './bridge/toolInfo.js'
export {
  toolUpdateFromToolResult,
  toolUpdateFromEditToolResponse,
} from './bridge/toolResults.js'
export {
  nextSdkMessageOrAbort,
  forwardSessionUpdates,
  replayHistoryMessages,
} from './bridge/forwarding.js'

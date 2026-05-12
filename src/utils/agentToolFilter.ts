/**
 * filterParentToolsForFork — gate layer 2 for subagent tool inheritance.
 *
 * The fork path of AgentTool (and its sibling resumeAgent) sets
 * `useExactTools: true` and passes `toolUseContext.options.tools` to
 * `runAgent` as `availableTools`. With `useExactTools=true`, runAgent
 * skips `resolveAgentTools`, which means the gate layer 1
 * (`ALL_AGENT_DISALLOWED_TOOLS`) — which only takes effect inside
 * `filterToolsForAgent` — is bypassed entirely on fork paths.
 *
 * This filter applies the same disallow-list to the parent tool array
 * before it reaches the fork. Both new-fork (AgentTool.tsx) and
 * resumed-fork (resumeAgent.ts) paths must call this.
 *
 * See docs/jira/LOCAL-WIRING-DESIGN.md §4.5 / §5.5 for design rationale.
 */

import { ALL_AGENT_DISALLOWED_TOOLS } from '../constants/tools.js'
import type { Tool } from '../Tool.js'

export function filterParentToolsForFork(parentTools: readonly Tool[]): Tool[] {
  return parentTools.filter(t => !ALL_AGENT_DISALLOWED_TOOLS.has(t.name))
}

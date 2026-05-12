import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import { getSubscriptionType } from 'src/utils/auth.js'
import { hasEmbeddedSearchTools } from 'src/utils/embeddedTools.js'
import { isEnvDefinedFalsy, isEnvTruthy } from 'src/utils/envUtils.js'
import { isTeammate } from 'src/utils/teammate.js'
import { isInProcessTeammate } from 'src/utils/teammateContext.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { SEND_MESSAGE_TOOL_NAME } from '../SendMessageTool/constants.js'
import { AGENT_TOOL_NAME } from './constants.js'
import { isForkSubagentEnabled } from './forkSubagent.js'
import type { AgentDefinition } from './loadAgentsDir.js'

function getToolsDescription(agent: AgentDefinition): string {
  const { tools, disallowedTools } = agent
  const hasAllowlist = tools && tools.length > 0
  const hasDenylist = disallowedTools && disallowedTools.length > 0

  if (hasAllowlist && hasDenylist) {
    // Both defined: filter allowlist by denylist to match runtime behavior
    const denySet = new Set(disallowedTools)
    const effectiveTools = tools.filter(t => !denySet.has(t))
    if (effectiveTools.length === 0) {
      return 'None'
    }
    return effectiveTools.join(', ')
  } else if (hasAllowlist) {
    // Allowlist only: show the specific tools available
    return tools.join(', ')
  } else if (hasDenylist) {
    // Denylist only: show "All tools except X, Y, Z"
    return `All tools except ${disallowedTools.join(', ')}`
  }
  // No restrictions
  return 'All tools'
}

/**
 * Format one agent line for the agent_listing_delta attachment message:
 * `- type: whenToUse (Tools: ...)`.
 */
export function formatAgentLine(agent: AgentDefinition): string {
  const toolsDescription = getToolsDescription(agent)
  return `- ${agent.agentType}: ${agent.whenToUse} (Tools: ${toolsDescription})`
}

/**
 * Whether the agent list should be injected as an attachment message instead
 * of embedded in the tool description. When true, getPrompt() returns a static
 * description and attachments.ts emits an agent_listing_delta attachment.
 *
 * The dynamic agent list was ~10.2% of fleet cache_creation tokens: MCP async
 * connect, /reload-plugins, or permission-mode changes mutate the list →
 * description changes → full tool-schema cache bust.
 *
 * Override with CLAUDE_CODE_AGENT_LIST_IN_MESSAGES=true/false for testing.
 */
export function shouldInjectAgentListInMessages(): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES)) return true
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES))
    return false
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_agent_list_attach', false)
}

export async function getPrompt(
  agentDefinitions: AgentDefinition[],
  isCoordinator?: boolean,
  allowedAgentTypes?: string[],
): Promise<string> {
  // Filter agents by allowed types when Agent(x,y) restricts which agents can be spawned.
  // In wildcard (no allowedAgentTypes) scenario, also hide agents that declare a visibleTo
  // restriction — they are only meant for specific parent agent types.
  const effectiveAgents = allowedAgentTypes
    ? agentDefinitions.filter(a => allowedAgentTypes.includes(a.agentType))
    : agentDefinitions.filter(a => !a.visibleTo || a.visibleTo.length === 0)

  // Fork subagent feature: when enabled, insert the "When to fork" section
  // (fork semantics, directive-style prompts) and swap in fork-aware examples.
  const forkEnabled = isForkSubagentEnabled()

  const whenToForkSection = forkEnabled
    ? `

## When to fork

When you need to delegate work that benefits from full conversation context (e.g., continuing a multi-file refactor where the child needs the same system prompt and history), use \`fork: true\`. For most tasks, prefer specialized agent types (Explore, Plan, general-purpose).

**Don't peek.** The tool result includes an \`output_file\` path — do not Read or tail it unless the user explicitly asks for a progress check. You get a completion notification; trust it.

**Don't race.** After launching, you know nothing about what the fork found. Never fabricate or predict fork results. If the user asks a follow-up before the notification lands, tell them the fork is still running.

**Writing a fork prompt.** Since the fork inherits your context, the prompt is a *directive* — what to do, not what the situation is. Be specific about scope. Don't re-explain background.
`
    : ''

  const writingThePromptSection = `

## Writing the prompt

${forkEnabled ? 'When spawning an agent without `fork: true`, it starts with zero context. ' : ''}Brief the agent like a smart colleague who just walked into the room — it hasn't seen this conversation, doesn't know what you've tried, doesn't understand why this task matters.
- Explain what you're trying to accomplish and why, what you've already learned or ruled out, and enough context for the agent to make judgment calls.
- If you need a short response, say so ("report in under 200 words").
- Lookups: hand over the exact command. Investigations: hand over the question — prescribed steps become dead weight when the premise is wrong.

${forkEnabled ? 'For non-fork agents, terse' : 'Terse'} command-style prompts produce shallow, generic work.

**Never delegate understanding.** Don't write "based on your findings, fix the bug" or "based on the research, implement it." Write prompts that prove you understood: include file paths, line numbers, what specifically to change.
`

  // When the gate is on, the agent list lives in an agent_listing_delta
  // attachment (see attachments.ts) instead of inline here. This keeps the
  // tool description static across MCP/plugin/permission changes so the
  // tools-block prompt cache doesn't bust every time an agent loads.
  const listViaAttachment = shouldInjectAgentListInMessages()

  const agentListSection = listViaAttachment
    ? `Available agent types are listed in <system-reminder> messages in the conversation.`
    : `Available agent types and the tools they have access to:
${effectiveAgents.map(agent => formatAgentLine(agent)).join('\n')}`

  // Shared core prompt used by both coordinator and non-coordinator modes
  const shared = `Launch a new agent to handle complex, multi-step tasks autonomously.

The ${AGENT_TOOL_NAME} tool launches specialized agents (subprocesses) that autonomously handle complex tasks. Each agent type has specific capabilities and tools available to it.

${agentListSection}

When using the ${AGENT_TOOL_NAME} tool, specify a subagent_type parameter to select which agent type to use. If omitted, the general-purpose agent is used.${forkEnabled ? ` Set \`fork: true\` to fork from the parent conversation context, inheriting full history and model.` : ''}`

  // Coordinator mode gets the slim prompt -- the coordinator system prompt
  // already covers usage notes, examples, and when-not-to-use guidance.
  if (isCoordinator) {
    return shared
  }

  // Ant-native builds alias find/grep to embedded bfs/ugrep and remove the
  // dedicated Glob/Grep tools, so point at find via Bash instead.
  const embedded = hasEmbeddedSearchTools()
  const fileSearchHint = embedded
    ? '`find` via the Bash tool'
    : `the ${GLOB_TOOL_NAME} tool`
  // The "class Foo" example is about content search. Non-embedded stays Glob
  // (original intent: find-the-file-containing). Embedded gets grep because
  // find -name doesn't look at file contents.
  const contentSearchHint = embedded
    ? '`grep` via the Bash tool'
    : `the ${GLOB_TOOL_NAME} tool`
  const whenNotToUseSection = forkEnabled
    ? ''
    : `
When NOT to use the ${AGENT_TOOL_NAME} tool:
- If you want to read a specific file path, use the ${FILE_READ_TOOL_NAME} tool or ${fileSearchHint} instead of the ${AGENT_TOOL_NAME} tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use ${contentSearchHint} instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the ${FILE_READ_TOOL_NAME} tool instead of the ${AGENT_TOOL_NAME} tool, to find the match more quickly
- Other tasks that are not related to the agent descriptions above
`

  // When listing via attachment, the "launch multiple agents" note is in the
  // attachment message (conditioned on subscription there). When inline, keep
  // the existing per-call getSubscriptionType() check.
  const concurrencyNote =
    !listViaAttachment && getSubscriptionType() !== 'pro'
      ? `
- Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses`
      : ''

  // Non-coordinator gets the full prompt with all sections
  return `${shared}
${whenNotToUseSection}

Usage notes:
- Always include a short description (3-5 words) summarizing what the agent will do${concurrencyNote}
- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.${
    // eslint-disable-next-line custom-rules/no-process-env-top-level
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS) &&
    !isInProcessTeammate()
      ? `
- You can optionally run agents in the background using the run_in_background parameter. When an agent runs in the background, you will be automatically notified when it completes — do NOT sleep, poll, or proactively check on its progress. Continue with other work or respond to the user instead.
- **Foreground vs background**: Use foreground (default) when you need the agent's results before you can proceed — e.g., research agents whose findings inform your next steps. Use background when you have genuinely independent work to do in parallel.`
      : ''
  }
- To continue a previously spawned agent, use ${SEND_MESSAGE_TOOL_NAME} with the agent's ID or name as the \`to\` field. The agent resumes with its full context preserved. ${forkEnabled ? 'Each non-fork Agent invocation starts without context — provide a complete task description.' : 'Each Agent invocation starts fresh — provide a complete task description.'}
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.)${forkEnabled ? '' : ", since it is not aware of the user's intent"}
- If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.
- If the user specifies that they want you to run agents "in parallel", you MUST send a single message with multiple ${AGENT_TOOL_NAME} tool use content blocks. For example, if you need to launch both a build-validator agent and a test-runner agent in parallel, send a single message with both tool calls.
- You can optionally set \`isolation: "worktree"\` to run the agent in a temporary git worktree, giving it an isolated copy of the repository. The worktree is automatically cleaned up if the agent makes no changes; if changes are made, the worktree path and branch are returned in the result.${
    process.env.USER_TYPE === 'ant'
      ? `\n- You can set \`isolation: "remote"\` to run the agent in a remote CCR environment. This is always a background task; you'll be notified when it completes. Use for long-running tasks that need a fresh sandbox.`
      : ''
  }${
    isInProcessTeammate()
      ? `
- The run_in_background, name, team_name, and mode parameters are not available in this context. Only synchronous subagents are supported.`
      : isTeammate()
        ? `
- The name, team_name, and mode parameters are not available in this context — teammates cannot spawn other teammates. Omit them to spawn a subagent.`
        : ''
  }${whenToForkSection}${writingThePromptSection}`
}

// Deeply-integrated backend: parses agent/model/tools from the live session, delegates to the core runAgent.
// Implements the AgentAdapter interface, registered and routed by the registry (U5).
import {
  type AgentAdapter,
  type AgentAdapterContext,
  type AgentRunParams,
  type AgentRunResult,
  WorkflowAbortedError,
} from '@claude-code-best/workflow-engine'
import { assembleToolPool } from '../../tools.js'
import { finalizeAgentTool } from '@claude-code-best/builtin-tools/tools/AgentTool/agentToolUtils.js'
import { runAgent } from '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js'
import {
  isBuiltInAgent,
  type AgentDefinition,
  type BuiltInAgentDefinition,
} from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { createUserMessage, extractTextContent } from '../../utils/messages.js'
import { getTokenCountFromUsage } from '../../utils/tokens.js'
import { createHash } from 'node:crypto'
import { createAgentId } from '../../utils/uuid.js'
import { logForDebugging } from '../../utils/debug.js'
import { runWithCwdOverride } from '../../utils/cwd.js'
import {
  createAgentWorktree,
  hasWorktreeChanges,
  removeAgentWorktree,
} from '../../utils/worktree.js'
import { logEvent } from '../../services/analytics/index.js'
import type { ModelAlias } from '../../utils/model/aliases.js'
import type { Message } from '../../types/message.js'
import type { ToolUseContext } from '../../Tool.js'
import { readHostBundle } from '../hostHandle.js'

/** Fallback definition for workflow subagents (used when agentType does not match a real registry entry). */
export const WORKFLOW_AGENT: BuiltInAgentDefinition = {
  agentType: 'workflow-worker',
  whenToUse: 'subtask dispatched by the agent() hook inside a workflow script',
  tools: ['*'],
  source: 'built-in',
  baseDir: 'built-in',
  getSystemPrompt: () =>
    'You are a workflow sub-agent. Complete the task concisely; your final text is the return value relayed to the workflow.',
}

/** agentType -> real agent registry (use if activeAgents hits, otherwise fallback). Exported for unit test coverage. */
export function resolveAgentDefinition(
  agentType: string | undefined,
  toolUseContext: ToolUseContext,
): AgentDefinition {
  if (!agentType) return WORKFLOW_AGENT
  const found = toolUseContext.options.agentDefinitions.activeAgents.find(
    a => a.agentType === agentType,
  )
  return found ?? WORKFLOW_AGENT
}

/** model alias -> the actual model id of the current provider. v1 passes it through directly (keeps a mapping extension point). Exported for unit test coverage. */
export function mapWorkflowModel(
  model: string | undefined,
): string | undefined {
  return model
}

/**
 * Extract the JSON object produced under schema mode from the agent's final message; returns null on failure. Exported for unit test coverage.
 *
 * Robustness strategy (in priority order, returns the first that successfully parses):
 * 1. fenced code block (```json ... ``` or ``` ... ```) - agents often spontaneously add fences
 * 2. the first "brace-balanced" {...} fragment in the bare text - handles preceding/trailing narration / multi-segment output
 *
 * Uses a brace-stack scan instead of `indexOf('{')..lastIndexOf('}')`: correctly handles nested objects,
 * `{}` inside string literals, and escape characters. Will not concatenate multiple unrelated JSON fragments (the original version did).
 *
 * Does not do syntax repair (trailing commas, single quotes -> double quotes, comment removal) - agents do not produce non-standard JSON,
 * and fixing it may instead cause wrong edits inside strings (e.g. `"http://..."` getting eaten by a // comment regex).
 * On parse failure it directly skips to the next candidate.
 *
 * Only returns a plain object (typeof === 'object' && !null && !Array);
 * the schema mode contract is object, array/number/string are all treated as the agent going off-track.
 */
export function extractStructuredOutput(
  content: Array<{ type: string; text?: string }>,
): unknown | null {
  for (const block of content) {
    if (block.type !== 'text' || !block.text) continue
    const found = findFirstJsonObject(block.text)
    if (found !== null) return found
  }
  return null
}

/** Find the first JSON fragment in text that can be parsed as a plain object. */
function findFirstJsonObject(text: string): unknown | null {
  // 1. fenced code blocks - priority (agents naturally tend to add them; strip the fence and parse the whole block)
  for (const m of text.matchAll(
    /```[\t ]*[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```/g,
  )) {
    const parsed = tryParseObject(m[1] ?? '')
    if (parsed !== null) return parsed
  }
  // 2. bare text: scan each '{', find a balanced pair and try parse
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    const end = findBalancedObjectEnd(text, i)
    if (end < 0) continue
    const parsed = tryParseObject(text.slice(i, end + 1))
    if (parsed !== null) return parsed
  }
  return null
}

/**
 * Find the matching `}` index starting from start (which must be `{`); returns -1 when unbalanced.
 * Skips braces inside string literals and escape characters. Does not skip comments (the JSON standard does not allow comments,
 * agents do not produce them; doing so is a risk - see the function doc).
 */
function findBalancedObjectEnd(text: string, start: number): number {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\')
        i++ // skip the escape char and the next character
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** try parse the candidate; only returns a plain object, others (array/number/null) return null. */
function tryParseObject(candidate: string): unknown | null {
  const trimmed = candidate.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
  try {
    const v = JSON.parse(trimmed)
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

type WorkflowWorktreeInfo = Awaited<ReturnType<typeof createAgentWorktree>>

/**
 * Generate a slug for the worktree isolation of a workflow agent: derive hex segments from sha256(runId:agentId),
 * matching the cleanup regex of cleanupStaleAgentWorktrees `^wf_[0-9a-f]{8}-[0-9a-f]{3}-\d+$`.
 * taskId is `w`+base36 (not a UUID), so runId cannot be placed directly into the regex segment; sha256 is a deterministic mapping,
 * and agentId ensures slug uniqueness for multiple agents under the same runId (no shared counter, no thread safety issues).
 */
function makeWorkflowWorktreeSlug(runId: string, agentId: string): string {
  const h = createHash('sha256').update(`${runId}:${agentId}`).digest('hex')
  return `wf_${h.slice(0, 8)}-${h.slice(8, 11)}-${parseInt(h.slice(11, 17), 16) % 100000}`
}

/**
 * Clean up the worktree after the agent finishes: hookBased keeps it (cannot detect VCS changes); otherwise uses
 * hasWorktreeChanges (fail-closed) to detect, auto-removes when there is no change, keeps it on change/detection failure
 * and logs the path (v1 uses logs rather than extending AgentRunResult, to avoid touching journal serialization).
 */
async function cleanupWorkflowWorktree(
  info: WorkflowWorktreeInfo,
  agentType: string,
): Promise<void> {
  if (info.hookBased || !info.headCommit) return
  let changed = true
  try {
    changed = await hasWorktreeChanges(info.worktreePath, info.headCommit)
  } catch (e) {
    logForDebugging(
      `workflow worktree change-detect failed (${agentType}): ${(e as Error).message}`,
    )
    changed = true
  }
  if (!changed) {
    try {
      await removeAgentWorktree(
        info.worktreePath,
        info.worktreeBranch,
        info.gitRoot,
      )
    } catch (e) {
      logForDebugging(
        `workflow worktree remove failed (${agentType}): ${(e as Error).message}`,
      )
    }
  } else {
    logForDebugging(
      `workflow worktree retained (has changes, ${agentType}): ${info.worktreePath}`,
    )
  }
}

/** Deeply-integrated backend: parses agent/model/tools from the live session, delegates to the core runAgent. */
export const claudeCodeBackend: AgentAdapter = {
  id: 'claude-code',
  capabilities: { structuredOutput: true, tools: true },

  async run(
    params: AgentRunParams,
    ctx: AgentAdapterContext,
  ): Promise<AgentRunResult> {
    const { toolUseContext, canUseTool } = readHostBundle(ctx.host)
    const appState = toolUseContext.getAppState()
    const agentDef = resolveAgentDefinition(params.agentType, toolUseContext)
    const model = mapWorkflowModel(params.model)
    // coreAgentId: the tracking ID for the core-layer subagent (a string, used inside runAgent).
    // Different from ctx.agentId (the engine's number seq, used for panel / killAgent routing) - two distinct concepts, must not be mixed up.
    const coreAgentId = createAgentId()

    // isolation:'worktree' - run the agent inside an independent git worktree, so concurrent writes do not conflict.
    let worktreeInfo: WorkflowWorktreeInfo | null = null
    if (params.isolation === 'worktree') {
      try {
        worktreeInfo = await createAgentWorktree(
          makeWorkflowWorktreeSlug(ctx.runId, coreAgentId),
        )
      } catch (e) {
        // fail-closed: when isolation fails, do not silently fall back to a shared cwd (otherwise concurrent writes race on data)
        const detail = (e as Error).message
        logForDebugging(
          `workflow worktree creation failed (${agentDef.agentType}): ${detail}`,
        )
        return { kind: 'dead', reason: 'worktree-failed', detail }
      }
    }
    // runWithCwdOverride makes tools such as Bash/Read inside the agent see the worktree path
    // (AsyncLocalStorage is preserved across awaits); the worktreePath parameter of runAgent only writes metadata.
    const runInCwd = worktreeInfo
      ? <T>(fn: () => T): T =>
          runWithCwdOverride(worktreeInfo!.worktreePath, fn)
      : <T>(fn: () => T): T => fn()

    // Bridge ctx.signal -> runAgent.override.abortController. Otherwise, when the workflow is killed
    // runAgent is unaware (root cause of 'x' being ineffective): the abort signal cannot reach the internal fetch, and the agent runs to completion.
    // Single-agent kill goes through service.kill(runId, agentId) -> ports.taskRegistrar.killAgent ->
    // agentAbortControllers.get(agentId).abort(); the same controller takes over both paths.
    const agentAbort = new AbortController()
    const onParentAbort = (): void => agentAbort.abort()
    if (ctx.signal.aborted) {
      agentAbort.abort()
    } else {
      ctx.signal.addEventListener('abort', onParentAbort, { once: true })
    }
    if (typeof ctx.registerAgentAbort === 'function') {
      ctx.registerAgentAbort(ctx.agentId, agentAbort)
    }

    const workerPermissionContext = {
      ...appState.toolPermissionContext,
      mode: agentDef.permissionMode ?? 'acceptEdits',
    }
    const workerTools = assembleToolPool(
      workerPermissionContext,
      appState.mcp.tools,
    )

    // schema -> instructs the agent to directly emit JSON in the final text block.
    // Does not require calling the StructuredOutput tool - it is not in the workflow subagent's tool set (only
    // the stop_hook path explicitly injects it; workflow goes through assembleToolPool whose default pool does not include it).
    // Historically the prompt required "call StructuredOutput tool", causing 8/12 agents to refuse to wrap up or struggle to call it;
    // empirically the main cause of dead is the tool being unreachable rather than "forgetting". Change the contract: raw JSON text, extractStructuredOutput
    // tolerates fenced fences + preceding/trailing narration + multiple segments.
    const promptText = params.schema
      ? [
          params.prompt,
          '',
          'After completing the task, emit your final answer as a single JSON object matching this JSON Schema:',
          '```json',
          JSON.stringify(params.schema, null, 2),
          '```',
          '',
          'CRITICAL RULES:',
          '- The JSON object must be the LAST text block in your response. Do not write any prose after it.',
          '- Emit the JSON as plain text (markdown code fences optional).',
          '- Do NOT call any "StructuredOutput" or "SyntheticOutput" tool — it is not available in this environment.',
          '- Your turn must end with the JSON object. Anything after it (prose, tool calls) will be ignored or cause your answer to be discarded.',
        ].join('\n')
      : params.prompt

    const promptMessages = [createUserMessage({ content: promptText })]
    const messages: Message[] = []
    const startTime = Date.now()
    // Accumulate running progress (onProgress push -> agent_progress event -> panel refreshes token/tool in real time).
    let tokenCount = 0
    let toolCount = 0

    try {
      await runInCwd(async () => {
        for await (const msg of runAgent({
          agentDefinition: agentDef,
          promptMessages,
          toolUseContext,
          canUseTool,
          isAsync: true,
          querySource: toolUseContext.options.querySource ?? 'workflow',
          availableTools: workerTools,
          // override the same object: coreAgentId (core subagent tracking) + abortController (kill bridge).
          // runAgent's model is the top-level ModelAlias; workflow's model is an arbitrary alias string,
          // the types are incompatible and resolved by the provider layer at runtime. Passes through via double assertion (better than as any/never).
          override: { agentId: coreAgentId, abortController: agentAbort },
          ...(model ? { model: model as unknown as ModelAlias } : {}),
          ...(worktreeInfo ? { worktreePath: worktreeInfo.worktreePath } : {}),
        })) {
          messages.push(msg as Message)
          // Accumulate running progress: assistant message carries usage (cumulative value -> overwrite), tool_use inside content (incremental).
          if (msg.type === 'assistant' && msg.message) {
            const usage = msg.message.usage as
              | Parameters<typeof getTokenCountFromUsage>[0]
              | undefined
            if (usage) tokenCount = getTokenCountFromUsage(usage)
            const content = msg.message.content as
              | Array<{ type: string }>
              | undefined
            if (content)
              toolCount += content.filter(b => b.type === 'tool_use').length
          }
          ctx.onProgress?.({ tokenCount, toolCount })
        }
      })
    } catch (e) {
      // abort (kill workflow / kill agent): must rethrow WorkflowAbortedError after detection,
      // otherwise hooks.agent will swallow the abort as an ordinary failure into dead, and the workflow won't know it was killed
      // (the other side of the 'x' kill path being ineffective: the signal did arrive, but the result was disguised as a normal completion).
      if (agentAbort.signal.aborted || (e as Error)?.name === 'AbortError') {
        throw new WorkflowAbortedError()
      }
      const detail = (e as Error).message
      logForDebugging(
        `workflow sub-agent error (${agentDef.agentType}): ${detail}`,
      )
      logEvent('tengu_workflow_agent', { ok: 0 })
      return { kind: 'dead', reason: 'runagent-threw', detail }
    } finally {
      // cleanup (idempotent): listener removeEventListener / Map.delete are safe to call repeatedly.
      if (typeof ctx.unregisterAgentAbort === 'function') {
        ctx.unregisterAgentAbort(ctx.agentId)
      }
      ctx.signal.removeEventListener('abort', onParentAbort)
      if (worktreeInfo) {
        const info = worktreeInfo
        worktreeInfo = null
        await cleanupWorkflowWorktree(info, agentDef.agentType)
      }
    }

    const finalized = finalizeAgentTool(messages, coreAgentId, {
      prompt: params.prompt,
      resolvedAgentModel: toolUseContext.options.mainLoopModel,
      isBuiltInAgent: isBuiltInAgent(agentDef),
      startTime,
      agentType: agentDef.agentType,
      isAsync: true,
    })
    const outputTokens =
      finalized.usage?.output_tokens ?? finalized.totalTokens ?? 0
    // For panel display: total context tokens, tool-call count, parsed model id at completion.
    const finalTokenCount = finalized.totalTokens ?? 0
    const finalToolCount = finalized.totalToolUseCount ?? 0
    const resolvedModel = model ?? toolUseContext.options.mainLoopModel
    logEvent('tengu_workflow_agent', { ok: 1, outputTokens })

    if (params.schema) {
      const structured = extractStructuredOutput(finalized.content)
      if (structured === null) {
        // The agent finished all tool calls but no plain-object JSON was found in the final text block.
        // Typical scenarios: forgot to emit JSON after a long tool chain, unbalanced JSON nesting, parse failure.
        // Put a preview of the last text into detail so the hooks retry log and the panel can immediately see what the agent actually said.
        const preview = extractTextContent(finalized.content, '\n').slice(
          0,
          200,
        )
        logForDebugging(
          `workflow sub-agent produced no JSON object (${agentDef.agentType}); preview: ${preview}`,
        )
        return {
          kind: 'dead',
          reason: 'no-structured-output',
          detail: preview,
        }
      }
      return {
        kind: 'ok',
        output: structured as object,
        usage: { outputTokens },
        model: resolvedModel,
        toolCount: finalToolCount,
        tokenCount: finalTokenCount,
      }
    }
    const text = extractTextContent(finalized.content, '\n')
    return {
      kind: 'ok',
      output: text,
      usage: { outputTokens },
      model: resolvedModel,
      toolCount: finalToolCount,
      tokenCount: finalTokenCount,
    }
  },
}

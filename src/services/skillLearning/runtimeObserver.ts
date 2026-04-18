import type { REPLHookContext } from '../../utils/hooks/postSamplingHooks.js'
import { registerPostSamplingHook } from '../../utils/hooks/postSamplingHooks.js'
import { isSkillLearningEnabled } from './featureCheck.js'
import {
  appendObservation,
  getSkillLearningRoot,
  purgeOldObservations,
  stringifyField,
} from './observationStore.js'
import { resolveProjectContext } from './projectContext.js'
import './sessionObserver.js'
import { createInstinct } from './instinctParser.js'
import {
  analyzeWithActiveBackend,
  resolveDefaultObserverBackend,
} from './observerBackend.js'
import {
  decayInstinctConfidence,
  loadInstincts,
  prunePendingInstincts,
  upsertInstinct,
} from './instinctStore.js'
import type { StoredSkillObservation } from './observationStore.js'
import type { Message } from '../../types/message.js'
import {
  applySkillLifecycleDecision,
  compareExistingArtifacts,
  decideSkillLifecycle,
} from './skillLifecycle.js'
import {
  generateAgentCandidates,
  generateCommandCandidates,
  clusterInstincts,
} from './evolution.js'
import { generateOrMergeSkillDraft } from './skillGenerator.js'
import { shouldGenerateSkillFromInstincts } from './learningPolicy.js'
import { writeLearnedCommand } from './commandGenerator.js'
import { writeLearnedAgent } from './agentGenerator.js'
import { readObservations } from './observationStore.js'
import { checkPromotion } from './promotion.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

export const RUNTIME_SESSION_ID = 'runtime-session'

let initialized = false
let runtimeTurn = 0
// Timestamp watermark for consumed tool-hook observations — enables replay of
// only the records that arrived since the previous post-sampling pass.
let lastConsumedToolHookTimestamp = ''

export function getRuntimeTurn(): number {
  return runtimeTurn
}

export function initSkillLearning(): void {
  if (initialized) return
  initialized = true
  // Resolve the active observer backend from SKILL_LEARNING_OBSERVER_BACKEND
  // env. Without this call the registry stays on whichever backend was
  // registered first (heuristic) — which means the env switch would silently
  // be a no-op in production. Swallow registry errors so a typo in the env
  // variable can never crash startup.
  try {
    resolveDefaultObserverBackend()
  } catch {
    // No backend registered yet, or env points at unknown name — leave the
    // registry in its existing state.
  }
  registerPostSamplingHook(runSkillLearningPostSampling)
  // Fire-and-forget startup maintenance: ECC parity for confidence decay,
  // observation purge, pending instinct prune. Errors are swallowed so that
  // skill-learning maintenance never blocks CLI startup.
  void runStartupMaintenance().catch(() => {})
}

async function runStartupMaintenance(): Promise<void> {
  if (!isSkillLearningEnabled()) return
  if (process.env.CLAUDE_SKILL_LEARNING_DISABLE) return
  const project = resolveProjectContext(process.cwd())
  const options = { project }
  await Promise.allSettled([
    decayInstinctConfidence(options),
    purgeOldObservations(options),
    prunePendingInstincts(30, options),
  ])
}

function isInsideSkillLearningStorage(cwd: string): boolean {
  try {
    const root = getSkillLearningRoot()
    return cwd.startsWith(root)
  } catch {
    return false
  }
}

export async function runSkillLearningPostSampling(
  context: REPLHookContext,
): Promise<void> {
  if (!isSkillLearningEnabled()) return
  // Self-filter layers in order: env escape hatch, entrypoint (only main REPL
  // thread — `startsWith` covers 'repl_main_thread:outputStyle:<name>'), sub-
  // agent skip, and a path guard that prevents feedback loops when the user
  // hand-edits files inside the skill-learning storage directory itself.
  if (process.env.CLAUDE_SKILL_LEARNING_DISABLE) return
  if (!context.querySource?.startsWith('repl_main_thread')) return
  if (context.toolUseContext.agentId) return
  const cwd = process.cwd()
  if (isInsideSkillLearningStorage(cwd)) return

  const project = resolveProjectContext(cwd)
  const options = { project }
  ++runtimeTurn

  const observations: StoredSkillObservation[] = []

  // Always reconstruct from the REPL message stream — it is the only source
  // that captures user prompts and assistant outcomes (tool-hook observations
  // cover tool events only).
  for (const observation of observationsFromMessages(
    context.messages,
    project,
  )) {
    observations.push(await appendObservation(observation, options))
  }

  // Additionally pull tool-hook observations that arrived since the last
  // consumption watermark — deterministic records with precise outcomes.
  const all = await readObservations(options)
  const fresh = all.filter(
    o =>
      o.source === 'tool-hook' &&
      o.sessionId === RUNTIME_SESSION_ID &&
      typeof o.timestamp === 'string' &&
      o.timestamp > lastConsumedToolHookTimestamp,
  )
  observations.push(...fresh)
  for (const o of fresh) {
    if (o.timestamp > lastConsumedToolHookTimestamp) {
      lastConsumedToolHookTimestamp = o.timestamp
    }
  }

  if (observations.length === 0) return

  const candidates = await analyzeWithActiveBackend(observations, { project })
  for (const candidate of candidates) {
    await upsertInstinct(createInstinct(candidate), options)
  }

  await autoEvolveLearnedSkills(options)
}

export function resetRuntimeObserverForTest(): void {
  runtimeTurn = 0
  lastConsumedToolHookTimestamp = ''
}

async function autoEvolveLearnedSkills(options: {
  project: ReturnType<typeof resolveProjectContext>
}): Promise<void> {
  const instincts = await loadInstincts(options)
  const cwd = process.cwd()

  const skillRoots = [
    join(cwd, '.claude', 'skills'),
    join(getClaudeConfigHomeDir(), 'skills'),
  ]
  const skillClusters = clusterInstincts(instincts).filter(
    candidate =>
      candidate.target === 'skill' &&
      shouldGenerateSkillFromInstincts(candidate.instincts),
  )
  for (const cluster of skillClusters) {
    const outcome = await generateOrMergeSkillDraft(
      cluster.instincts,
      { cwd, scope: cluster.instincts[0]?.scope ?? 'project' },
      skillRoots,
    )
    if (outcome.action === 'append-evidence') continue
    const draft = outcome.draft
    if (existsSync(join(draft.outputPath, 'SKILL.md'))) continue
    const existing = await compareExistingArtifacts('skill', draft, skillRoots)
    const decision = decideSkillLifecycle(draft, existing)
    await applySkillLifecycleDecision(decision)
  }

  const commandDrafts = generateCommandCandidates(instincts, { cwd })
  for (const draft of commandDrafts) {
    const roots = [
      join(cwd, '.claude', 'commands'),
      join(getClaudeConfigHomeDir(), 'commands'),
    ]
    const existing = await compareExistingArtifacts('command', draft, roots)
    if (existing.length > 0) continue
    await writeLearnedCommand(draft)
  }

  const agentDrafts = generateAgentCandidates(instincts, { cwd })
  for (const draft of agentDrafts) {
    const roots = [
      join(cwd, '.claude', 'agents'),
      join(getClaudeConfigHomeDir(), 'agents'),
    ]
    const existing = await compareExistingArtifacts('agent', draft, roots)
    if (existing.length > 0) continue
    await writeLearnedAgent(draft)
  }

  await checkPromotion()
}

function observationsFromMessages(
  messages: Message[],
  project: ReturnType<typeof resolveProjectContext>,
): StoredSkillObservation[] {
  const sessionId = RUNTIME_SESSION_ID
  const base = {
    sessionId,
    projectId: project.projectId,
    projectName: project.projectName,
    cwd: project.cwd,
    timestamp: new Date().toISOString(),
    source: 'hook' as const,
  }

  return messages.flatMap((message): StoredSkillObservation[] => {
    if (message.type === 'user') {
      const toolResults = toolResultsFromContent(message.message?.content)
      if (toolResults.length > 0) {
        return toolResults.map(result => ({
          ...base,
          id: crypto.randomUUID(),
          event: 'tool_complete',
          toolName: result.toolName,
          toolOutput: result.output,
          outcome: result.isError ? 'failure' : 'success',
        }))
      }
      const text = textFromContent(message.message?.content)
      return text.trim()
        ? [
            {
              ...base,
              id: crypto.randomUUID(),
              event: 'user_message',
              messageText: text,
            },
          ]
        : []
    }

    if (message.type === 'assistant') {
      const toolUses = toolUsesFromContent(message.message?.content)
      const text = textFromContent(message.message?.content)
      return [
        ...toolUses.map(toolUse => ({
          ...base,
          id: crypto.randomUUID(),
          event: 'tool_start' as const,
          toolName: toolUse.toolName,
          toolInput: toolUse.input,
        })),
        ...(text.trim()
          ? [
              {
                ...base,
                id: crypto.randomUUID(),
                event: 'assistant_message' as const,
                messageText: text,
              },
            ]
          : []),
      ]
    }

    return []
  })
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(block => {
      if (!block || typeof block !== 'object') return ''
      const record = block as Record<string, unknown>
      return typeof record.text === 'string' ? record.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

function toolUsesFromContent(
  content: unknown,
): Array<{ toolName: string; input?: string }> {
  if (!Array.isArray(content)) return []
  return content.flatMap(block => {
    if (!block || typeof block !== 'object') return []
    const record = block as Record<string, unknown>
    if (record.type !== 'tool_use') return []
    return [
      {
        toolName: String(record.name ?? 'unknown_tool'),
        input: stringifyField(record.input),
      },
    ]
  })
}

function toolResultsFromContent(
  content: unknown,
): Array<{ toolName: string; output?: string; isError: boolean }> {
  if (!Array.isArray(content)) return []
  return content.flatMap(block => {
    if (!block || typeof block !== 'object') return []
    const record = block as Record<string, unknown>
    if (record.type !== 'tool_result') return []
    return [
      {
        toolName: String(record.name ?? record.tool_name ?? 'unknown_tool'),
        output: stringifyField(record.content),
        isError: record.is_error === true,
      },
    ]
  })
}

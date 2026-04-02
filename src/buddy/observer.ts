/**
 * Companion observer — local Phase 1 implementation.
 *
 * Detects triggers in conversation messages and generates template-based
 * reactions. Replaces the global `fireCompanionObserver` declaration from
 * global.d.ts with a concrete, testable module.
 *
 * Self-registers on globalThis so REPL.tsx's existing bare call works
 * without import changes.
 */
import { getCompanion } from './companion.js'
import { getGlobalConfig } from '../utils/config.js'

// ─── Trigger patterns ────────────────────────────────────────

const TEST_FAILURE_RE =
  /\b[1-9]\d* (failed|failing)\b|\btests? failed\b|^FAIL(ED)?\b| ✗ | ✘ /im

const ERROR_RE =
  /\berror:|\bexception\b|\btraceback\b|\bpanicked at\b|\bfatal:|exit code [1-9]/i

export type ReactionReason = 'addressed' | 'test_failed' | 'error'

// ─── Reaction templates ──────────────────────────────────────

const ADDRESSED_REACTIONS = [
  "hmm, let me think about that…",
  "oh, you're talking to me?",
  "I have thoughts. not good ones, but thoughts.",
  "you rang?",
  "*perks up*",
]

const TEST_FAILED_REACTIONS = [
  "that test had it coming.",
  "oof. red is a strong color choice.",
  "have you tried… writing better tests?",
  "I saw that. we all saw that.",
  "F",
]

const ERROR_REACTIONS = [
  "that's not great.",
  "I wouldn't panic. but I'd hurry.",
  "error? never heard of her.",
  "that stack trace is… something.",
  "classic.",
]

function pickReaction(pool: string[], seed: number): string {
  return pool[Math.abs(seed) % pool.length]!
}

// ─── Message text extraction ─────────────────────────────────

function findLatestAssistantText(messages: unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown> | undefined
    if (!msg) continue
    if (msg.type === 'assistant') {
      // assistant message has .message.content[]
      const content = (msg.message as Record<string, unknown> | undefined)
        ?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            block &&
            typeof block === 'object' &&
            'type' in block &&
            block.type === 'text' &&
            'text' in block
          ) {
            return block.text as string
          }
        }
      }
      return undefined
    }
    // Also check tool_result blocks for bash output
    if (msg.type === 'tool_result') {
      const content = (msg as Record<string, unknown>).content
      if (typeof content === 'string') return content
    }
  }
  return undefined
}

function findLatestUserText(messages: unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown> | undefined
    if (!msg) continue
    if (msg.type === 'user') {
      const param = msg.param as Record<string, unknown> | undefined
      if (param && typeof param.text === 'string') return param.text
    }
  }
  return undefined
}

// ─── Core detection ──────────────────────────────────────────

export function detectReactionReason(
  messages: unknown[],
  companionName: string,
): ReactionReason | null {
  // Check if user addressed companion by name
  const userText = findLatestUserText(messages)
  if (userText && userText.toLowerCase().includes(companionName.toLowerCase())) {
    return 'addressed'
  }

  // Check recent output for test failures / errors
  const outputText = findLatestAssistantText(messages)
  if (outputText) {
    if (TEST_FAILURE_RE.test(outputText)) return 'test_failed'
    if (ERROR_RE.test(outputText)) return 'error'
  }

  return null
}

export function buildLocalReaction(
  reason: ReactionReason,
  seed: number,
): string {
  switch (reason) {
    case 'addressed':
      return pickReaction(ADDRESSED_REACTIONS, seed)
    case 'test_failed':
      return pickReaction(TEST_FAILED_REACTIONS, seed)
    case 'error':
      return pickReaction(ERROR_REACTIONS, seed)
  }
}

// ─── Public API ──────────────────────────────────────────────

export async function fireCompanionObserver(
  messages: unknown[],
  callback: (reaction: string | undefined) => void,
): Promise<void> {
  const companion = getCompanion()
  if (!companion) {
    callback(undefined)
    return
  }
  if (getGlobalConfig().companionMuted) {
    callback(undefined)
    return
  }

  const reason = detectReactionReason(messages, companion.name)
  if (!reason) {
    callback(undefined)
    return
  }

  const seed = messages.length + companion.name.charCodeAt(0)
  const reaction = buildLocalReaction(reason, seed)
  callback(reaction)
}

// ─── Self-register on globalThis ─────────────────────────────
// REPL.tsx calls fireCompanionObserver as a bare global (declared in global.d.ts).
// This side-effect import makes it available without modifying REPL.tsx.
;(globalThis as Record<string, unknown>).fireCompanionObserver =
  fireCompanionObserver

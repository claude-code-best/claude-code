/**
 * Proactive mode — tick-driven autonomous agent.
 *
 * State machine: inactive → active (→ paused → active) → inactive
 *
 * When active, the REPL periodically injects <tick> prompts so the model
 * keeps working even when the user is idle.  SleepTool lets the model
 * control its own wake-up cadence.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let active = false
let paused = false
let contextBlocked = false
let nextTickAt: number | null = null
let activationSource: string | undefined

const listeners = new Set<() => void>()

function notify(): void {
  for (const cb of listeners) {
    try {
      cb()
    } catch {
      // subscriber errors must not break the notifier
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — consumed by REPL.tsx, PromptInputFooterLeftSide, prompts.ts
// ---------------------------------------------------------------------------

export function isProactiveActive(): boolean {
  return active
}

export function activateProactive(source?: string): void {
  if (active) return
  active = true
  paused = false
  contextBlocked = false
  activationSource = source
  notify()
}

export function deactivateProactive(): void {
  if (!active) return
  active = false
  paused = false
  contextBlocked = false
  nextTickAt = null
  activationSource = undefined
  notify()
}

export function isProactivePaused(): boolean {
  return paused
}

export function pauseProactive(): void {
  if (!active || paused) return
  paused = true
  nextTickAt = null
  notify()
}

export function resumeProactive(): void {
  if (!active || !paused) return
  paused = false
  notify()
}

/**
 * Block / unblock tick generation.
 *
 * Set to `true` on API errors to prevent tick → error → tick runaway loops.
 * Cleared on successful response or after compaction.
 */
export function setContextBlocked(blocked: boolean): void {
  if (contextBlocked === blocked) return
  contextBlocked = blocked
  if (blocked) {
    nextTickAt = null
  }
  notify()
}

export function isContextBlocked(): boolean {
  return contextBlocked
}

/**
 * Schedule the next tick timestamp (epoch ms).
 * Called by useProactive after submitting a tick.
 */
export function setNextTickAt(ts: number | null): void {
  nextTickAt = ts
  notify()
}

/**
 * Returns the epoch-ms timestamp of the next scheduled tick, or null.
 * Used by PromptInputFooterLeftSide to render a countdown.
 */
export function getNextTickAt(): number | null {
  if (!active || paused || contextBlocked) return null
  return nextTickAt
}

export function getActivationSource(): string | undefined {
  return activationSource
}

/**
 * Subscribe to any proactive state change.
 * Returns an unsubscribe function.
 */
export function subscribeToProactiveChanges(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/**
 * Whether ticks should fire right now.
 * Convenience predicate combining all blocking conditions.
 */
export function shouldTick(): boolean {
  return active && !paused && !contextBlocked
}

/**
 * Fullscreen renderer health tracking + automatic degradation.
 *
 * Official Claude Code 2.1.330 behavior (recovered from the native binary):
 * if the fullscreen (alt-screen) renderer fails to finish starting, later
 * launches fall back to the classic renderer automatically:
 *
 *  1. Last launch entered fullscreen but never completed its first render
 *     (`starting === true` on disk) → this launch uses the classic renderer,
 *     clears `starting`, bumps `failureCount`, and retries fullscreen on the
 *     next launch.
 *  2. `failureCount >= 2` (repeated failures) → fullscreen is persistently
 *     turned off until the user runs `/tui fullscreen` or Claude Code updates
 *     to a new version (`lastVersion !== current` resets `failureCount`).
 *  3. `CLAUDE_CODE_NO_FLICKER=1` explicitly forces fullscreen and skips the
 *     degradation check entirely (official: "…or CLAUDE_CODE_NO_FLICKER=1 to
 *     override").
 *
 * State lives in `~/.claude/.tui-renderer-state.json`:
 *
 *   { "starting": boolean, "failureCount": number, "lastVersion": string }
 *
 * `lastVersion` is only recorded after a *successful* first render, so a
 * machine where fullscreen never worked keeps accumulating failures across
 * versions, while a machine where it worked before an update gets a fresh
 * chance on the new version.
 *
 * The evaluation core (`evaluateRendererHealth`) is a pure function so tests
 * can cover every degradation rule without touching the filesystem; the
 * read/write helpers take an optional path override for the same reason.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { safeParseJSON } from './json.js'

/** File name of the persisted renderer health state (under config home). */
export const RENDERER_STATE_FILENAME = '.tui-renderer-state.json'

/**
 * Consecutive startup failures before fullscreen is persistently turned off.
 * Official semantics: one missed start retries next launch; two means
 * "repeatedly failed to start" and the renderer is switched off.
 */
export const RENDERER_FAILURE_THRESHOLD = 2

export type RendererHealthState = {
  /** True while a launch is between "entered alt-screen" and "first render done". */
  starting: boolean
  /** Consecutive failed startups (cleared on success or version update). */
  failureCount: number
  /** Version that last completed a successful fullscreen start ('' = never). */
  lastVersion: string
}

export type RendererHealthDecision =
  /** Fullscreen may start this launch. */
  | 'proceed'
  /** Previous launch never finished starting — classic this launch, retry next. */
  | 'degrade-retry'
  /** Repeated failures — classic until /tui fullscreen or a version update. */
  | 'degrade-off'

export type RendererHealthEvaluation = {
  decision: RendererHealthDecision
  /** State to persist for the next launch (already includes side effects). */
  nextState: RendererHealthState
  /** Official user-facing message when degrading; null when proceeding. */
  message: string | null
}

// Official 2.1.330 strings — recovered verbatim from the native binary.
export const RENDERER_DEGRADED_RETRY_MESSAGE =
  "Claude Code's fullscreen renderer didn't finish starting last time on this machine, so this launch is using the classic renderer. It will try fullscreen again next launch; /tui classic keeps the classic renderer."

export const RENDERER_DEGRADED_OFF_MESSAGE =
  "Claude Code's fullscreen renderer has repeatedly failed to start on this machine, so it has been turned off here. Run /tui fullscreen to try it again (this also resets after an update)."

export const RENDERER_OVERRIDE_HINT =
  '/tui fullscreen or CLAUDE_CODE_NO_FLICKER=1 to override'

/** Compile-time version (MACRO.VERSION), defensively read for test runtimes. */
export function getCurrentVersion(): string {
  return typeof MACRO !== 'undefined' && MACRO.VERSION
    ? MACRO.VERSION
    : 'unknown'
}

/** Path of the persisted renderer health state file. */
export function getRendererHealthStatePath(): string {
  return join(getClaudeConfigHomeDir(), RENDERER_STATE_FILENAME)
}

function isFreshState(value: unknown): value is RendererHealthState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).starting === 'boolean' &&
    typeof (value as Record<string, unknown>).failureCount === 'number' &&
    typeof (value as Record<string, unknown>).lastVersion === 'string'
  )
}

/**
 * Read the persisted renderer health state. Missing or corrupt files are
 * treated as a fresh state — a corrupt file must never brick the renderer
 * (worst case we lose the failure count and try fullscreen again).
 */
export function readRendererHealthState(
  filePath: string = getRendererHealthStatePath(),
): RendererHealthState {
  try {
    if (!existsSync(filePath)) {
      return { starting: false, failureCount: 0, lastVersion: '' }
    }
    const parsed = safeParseJSON(readFileSync(filePath, 'utf8'), false)
    if (!isFreshState(parsed)) {
      return { starting: false, failureCount: 0, lastVersion: '' }
    }
    return {
      starting: parsed.starting,
      failureCount: parsed.failureCount,
      lastVersion: parsed.lastVersion,
    }
  } catch {
    return { starting: false, failureCount: 0, lastVersion: '' }
  }
}

/** Persist the renderer health state. Best-effort — errors are swallowed. */
export function writeRendererHealthState(
  state: RendererHealthState,
  filePath: string = getRendererHealthStatePath(),
): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(state), 'utf8')
  } catch {
    // A read-only or missing config dir must never crash startup.
  }
}

/**
 * Pure evaluation of the degradation rules. Order matters:
 *
 *  1. Version update reset — `lastVersion` is only recorded on success, so
 *     this is "the last version this worked on differs" → fresh chance.
 *  2. `starting === true` — previous launch entered fullscreen but never
 *     finished its first render → classic this launch, retry next.
 *  3. `failureCount >= threshold` — repeatedly failed → persistently off.
 */
export function evaluateRendererHealth(
  state: RendererHealthState,
  currentVersion: string,
): RendererHealthEvaluation {
  let failureCount = state.failureCount
  const lastVersion = state.lastVersion
  // Version update resets the failure count (official: "this also resets
  // after an update"). Only when lastVersion is set — a machine where
  // fullscreen never succeeded has nothing to reset against and must keep
  // accumulating failures, otherwise it would retry forever.
  if (lastVersion && lastVersion !== currentVersion) {
    failureCount = 0
  }

  if (state.starting) {
    return {
      decision: 'degrade-retry',
      nextState: {
        starting: false,
        failureCount: failureCount + 1,
        lastVersion,
      },
      message: RENDERER_DEGRADED_RETRY_MESSAGE,
    }
  }

  if (failureCount >= RENDERER_FAILURE_THRESHOLD) {
    return {
      decision: 'degrade-off',
      nextState: { starting: false, failureCount, lastVersion },
      message: RENDERER_DEGRADED_OFF_MESSAGE,
    }
  }

  return {
    decision: 'proceed',
    nextState: { starting: false, failureCount, lastVersion },
    message: null,
  }
}

// ─── Session-scoped integration (wired from fullscreen.ts / REPL / /tui) ─────

/**
 * True when this session's fullscreen resolution degraded to the classic
 * renderer because of startup failures (set once per session by
 * `shouldDegradeFullscreenForHealth`).
 */
let sessionDegraded = false

/** Official degradation message for this session (null when not degraded). */
let sessionNotice: string | null = null

/** Set once the fullscreen session actually starts (REPL alt-screen branch). */
let startingMarked = false

/** Set once a successful first alt-screen render is recorded. */
let successMarked = false

/** Set once shouldDegradeFullscreenForHealth ran (evaluation is one-shot). */
let healthEvaluated = false

/**
 * One-shot health check, called by fullscreen.ts when the resolved
 * preference is fullscreen (and the env var didn't explicitly force it —
 * CLAUDE_CODE_NO_FLICKER=1 overrides degradation per official semantics).
 *
 * Reads the persisted state, applies the degradation rules, persists the
 * post-evaluation state and records the session notice. Returns true when
 * fullscreen should be degraded to classic for this launch.
 */
export function shouldDegradeFullscreenForHealth(): boolean {
  if (healthEvaluated) return sessionDegraded
  healthEvaluated = true
  const evaluation = evaluateRendererHealth(
    readRendererHealthState(),
    getCurrentVersion(),
  )
  writeRendererHealthState(evaluation.nextState)
  if (evaluation.decision !== 'proceed') {
    sessionDegraded = true
    sessionNotice = evaluation.message
    return true
  }
  sessionNotice = null
  return false
}

/**
 * Record that this session is entering the fullscreen renderer, before the
 * alt-screen is actually entered. If the process dies before the first
 * render completes, `starting` stays true on disk and the next launch
 * degrades. Called from the REPL's fullscreen branch; once per session.
 */
export function markFullscreenStarting(): void {
  if (startingMarked) return
  startingMarked = true
  const state = readRendererHealthState()
  writeRendererHealthState({ ...state, starting: true })
}

/**
 * Record that the fullscreen renderer finished starting (first alt-screen
 * render completed). Clears `starting`, resets the failure count and stamps
 * the current version. No-op unless `markFullscreenStarting` ran first, so
 * alt-screen overlays in classic sessions can't erase real failure counts.
 * Fired from Ink's `onFirstAltScreenRender`; once per session.
 */
export function markFullscreenRenderSucceeded(): void {
  if (successMarked || !startingMarked) return
  successMarked = true
  writeRendererHealthState({
    starting: false,
    failureCount: 0,
    lastVersion: getCurrentVersion(),
  })
}

/**
 * Clear all recorded renderer failures. Run by `/tui fullscreen` so the
 * renderer gets a fresh chance next launch (official: "Run /tui fullscreen
 * to try it again").
 */
export function resetRendererFailures(): void {
  writeRendererHealthState({
    starting: false,
    failureCount: 0,
    lastVersion: getCurrentVersion(),
  })
}

/** Official degradation message for this session (null when not degraded). */
export function getFullscreenDegradationNotice(): string | null {
  return sessionNotice
}

/** True when this session degraded to classic because of startup failures. */
export function wasFullscreenDegradedThisSession(): boolean {
  return sessionDegraded
}

/** Current persisted health state, for the /tui status panel. */
export function getRendererHealthSummary(): RendererHealthState & {
  threshold: number
  degradedThisSession: boolean
} {
  const state = readRendererHealthState()
  return {
    ...state,
    threshold: RENDERER_FAILURE_THRESHOLD,
    degradedThisSession: sessionDegraded,
  }
}

/** Test-only: reset the session-scoped flags. */
export function _resetRendererHealthForTesting(): void {
  sessionDegraded = false
  sessionNotice = null
  startingMarked = false
  successMarked = false
  healthEvaluated = false
}

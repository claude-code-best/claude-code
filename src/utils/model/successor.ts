// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
/**
 * Saved-model successor (official 2.1.330 `chat:defaultToNewerModel`,
 * binary L936681, reverse-engineered).
 *
 * When the user's saved default model (settings `model`) has an official
 * successor, the prompt input shows a one-time notice:
 *
 *   "{from} is your default model. Press `{key}` to make `{to}` your default."
 *
 * - `{key}` resolves through the keybinding system
 *   (`chat:defaultToNewerModel`, Chat context, default ctrl+y — see
 *   shortcutFormat.ts / useShortcutDisplay.ts).
 * - Pressing the key switches the default model to `to` (writes settings
 *   `model` + applies to the session) and consumes the notice.
 * - Each from→to pair is shown at most once, ever: the runtime
 *   `savedModelSuccessorDrawnAt` state (official L930982) keeps the notice on
 *   screen for the rest of the session after it is drawn, while the persisted
 *   `savedModelSuccessorShown` map (official storageV5 field, L909295 —
 *   GlobalConfig here) suppresses it in future sessions.
 * - Telemetry: `tengu_saved_model_successor_shown` (from_model / to_model /
 *   view).
 *
 * The successor mapping itself lives on the model registry
 * (ALL_MODEL_CONFIGS' optional `successor` field — see configs.ts). It starts
 * empty: official has no static table (registry/service-driven) and the
 * repo's newest models have no known successors. `getSavedModelSuccessor`
 * accepts an injected registry so the mechanism is fully testable before any
 * real from→to data lands.
 */

import { ALL_MODEL_CONFIGS } from './configs.js'

export type SavedModelSuccessor = {
  /** The saved default model, exactly as stored in settings (may carry [1m]). */
  from: string
  /** Canonical first-party ID of the successor model. */
  to: string
}

/** Registry shape getSavedModelSuccessor matches against (see configs.ts). */
type SuccessorRegistry = Record<
  string,
  { firstParty: string; successor?: string }
>

/**
 * Resolve the saved default model's successor, if any.
 *
 * Matching is containment-based on the [1m]-stripped, lowercased saved
 * setting: `saved.includes(canonical)`. That folds the dated full IDs
 * ('claude-opus-4-6-20251120'), the [1m] suffix ('claude-opus-4-6[1m]') and
 * provider-prefixed IDs ('us.anthropic.claude-opus-4-6-v1') onto the
 * canonical registry ID, while deliberately NOT matching bare family aliases
 * ('opus'): an alias floats to the newest generation, so "opus-4-6 is your
 * default" would be wrong for a user who saved `opus`. When several
 * successor-bearing configs match, the longest canonical ID wins (most
 * specific — 'claude-opus-4-6' over 'claude-opus-4').
 */
export function getSavedModelSuccessor(
  savedModel: string | null | undefined,
  configs: SuccessorRegistry = ALL_MODEL_CONFIGS,
): SavedModelSuccessor | null {
  if (savedModel === null || savedModel === undefined) {
    return null
  }
  const base = savedModel
    .toLowerCase()
    .replace(/\[1m\]$/, '')
    .trim()
  if (base === '') {
    return null
  }

  let best: { from: string; to: string; canonical: string } | null = null
  for (const config of Object.values(configs)) {
    const to = config.successor
    if (!to) {
      continue
    }
    const canonical = config.firstParty.toLowerCase()
    if (!base.includes(canonical)) {
      continue
    }
    if (best === null || canonical.length > best.canonical.length) {
      best = { from: savedModel, to, canonical }
    }
  }
  return best === null ? null : { from: best.from, to: best.to }
}

/** Stable identity of a from→to pair (persisted-shown + runtime-draw keys). */
export function savedModelSuccessorPair(
  successor: SavedModelSuccessor,
): string {
  return `${successor.from}→${successor.to}`
}

/**
 * Runtime draw state (official `savedModelSuccessorDrawnAt`, L930982): when
 * the notice was drawn this session, and for which pair. Once drawn, the
 * notice stays up for the rest of the session even though the shown flag is
 * persisted immediately — the persisted flag only suppresses FUTURE
 * sessions. Module-level like the official runtime state: it survives
 * PromptInput remounts (screen switches) within a session.
 */
let savedModelSuccessorDrawnAt: number | null = null
let savedModelSuccessorDrawnPair: string | null = null

export type SavedModelSuccessorDraw = {
  pair: string
  at: number
}

/** Current session draw state (null = not drawn yet this session). */
export function getSavedModelSuccessorDraw(): SavedModelSuccessorDraw | null {
  if (
    savedModelSuccessorDrawnPair === null ||
    savedModelSuccessorDrawnAt === null
  ) {
    return null
  }
  return { pair: savedModelSuccessorDrawnPair, at: savedModelSuccessorDrawnAt }
}

/** Record that the notice was drawn (official sets savedModelSuccessorDrawnAt). */
export function markSavedModelSuccessorDrawn(
  successor: SavedModelSuccessor,
): SavedModelSuccessorDraw {
  savedModelSuccessorDrawnPair = savedModelSuccessorPair(successor)
  savedModelSuccessorDrawnAt = Date.now()
  return { pair: savedModelSuccessorDrawnPair, at: savedModelSuccessorDrawnAt }
}

/** Test helper: reset the session draw state. */
export function resetSavedModelSuccessorDrawForTest(): void {
  savedModelSuccessorDrawnAt = null
  savedModelSuccessorDrawnPair = null
}

/**
 * Display gate (official L936681): the notice shows only while the input box
 * is empty (or for screen readers — no screen-reader signal exists in this
 * repo yet) and never while the main loop is busy. A pair already drawn this
 * session keeps showing (runtime draw state); a pair shown in a previous
 * session (persisted `savedModelSuccessorShown` map, keyed by the saved
 * model → successor ID) never comes back.
 */
export function shouldShowSavedModelSuccessor(args: {
  successor: SavedModelSuccessor | null
  /** GlobalConfig.savedModelSuccessorShown — from → already-shown successor. */
  shown?: Record<string, string> | null
  /** Session draw state (getSavedModelSuccessorDraw()). */
  drawn: SavedModelSuccessorDraw | null
  inputEmpty: boolean
  mainLoopBusy: boolean
}): boolean {
  const { successor, shown, drawn, inputEmpty, mainLoopBusy } = args
  if (successor === null || !inputEmpty || mainLoopBusy) {
    return false
  }
  if (drawn !== null && drawn.pair === savedModelSuccessorPair(successor)) {
    // Drawn this session — stay up until consumed (ctrl+y) or session end.
    return true
  }
  // Fresh pair: show only if this from→to pair was never shown before.
  return shown?.[successor.from] !== successor.to
}

/**
 * Notification copy (official verbatim, two segments; `{to}` renders with
 * backticks, `{key}` is the resolved keybinding display text):
 *   "{from} is your default model."
 *   "Press `{key}` to make `{to}` your default."
 */
export function buildSavedModelSuccessorMessage(args: {
  fromDisplayName: string
  to: string
  key: string
}): { first: string; second: string } {
  return {
    first: `${args.fromDisplayName} is your default model.`,
    second: `Press \`${args.key}\` to make \`${args.to}\` your default.`,
  }
}

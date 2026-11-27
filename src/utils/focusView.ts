import type { AppState } from '../state/AppStateStore.js'
import type { SettingsJson } from './settings/types.js'

/**
 * Focus View (official Claude Code 2.1.330, strings L918597/L912387/L926504).
 *
 * When focus view is active, each conversation turn renders as just the
 * user's prompt and the turn's final assistant text response — tool calls,
 * tool results, and intermediate text are hidden (see filterForFocusView in
 * components/Messages.tsx). Transcript mode (ctrl+o) and verbose still show
 * everything (official fWs, L936681).
 *
 * State model (official qat()/JBn()/Yat(), L912387):
 * - `AppState.briefTranscript` is the in-session source of truth — /focus
 *   flips it (official kept the legacy `briefTranscript` field name).
 * - At startup it is seeded from settings (official `wt`, L926504):
 *   `viewMode` takes priority as the startup default, falling back to the
 *   persisted `briefTranscript` runtime toggle.
 * - `getEffectiveViewMode()` exposes the effective mode to the system prompt
 *   context / SDK bridge (official Yat(), L933730).
 */

/**
 * Official qat() (L912387): compute whether focus view is active at startup.
 * `settings.viewMode` wins as the startup default; otherwise fall back to
 * the persisted runtime toggle `settings.briefTranscript`.
 */
export function computeFocusAtStartup(
  settings: Pick<SettingsJson, 'viewMode' | 'briefTranscript'>,
): boolean {
  return settings.viewMode
    ? settings.viewMode === 'focus'
    : (settings.briefTranscript ?? false)
}

/**
 * Module-level mirror of `AppState.briefTranscript`.
 *
 * The system prompt's focus_mode section (constants/prompts.ts) is computed
 * from plain compute functions with no access to the React store — same
 * situation as modes/store.ts `getCurrentMode()`. /focus keeps this mirror
 * in sync whenever it flips appState.briefTranscript.
 *
 * Seeded lazily from settings on first read (startup seeding, official wt).
 */
let focusViewActive: boolean | undefined

/** Read the startup-seeded focus state (system-prompt-facing, official Yat()). */
export function getFocusViewActive(): boolean {
  if (focusViewActive === undefined) {
    focusViewActive = computeFocusAtStartup(readStartupSettings())
  }
  return focusViewActive
}

/** Sync the mirror after a /focus toggle (or test setup). */
export function setFocusViewActive(value: boolean): void {
  focusViewActive = value
}

/** Test-only: clear the lazy seed so the next read re-seeds from settings. */
export function _resetFocusViewForTesting(): void {
  focusViewActive = undefined
}

// Late-bound to keep this module importable from settings-heavy modules
// without pulling the settings loader (and its fs side effects) at import
// time in tests that mock it.
function readStartupSettings(): Pick<
  SettingsJson,
  'viewMode' | 'briefTranscript'
> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./settings/settings.js').getInitialSettings() as Pick<
    SettingsJson,
    'viewMode' | 'briefTranscript'
  >
}

/**
 * Official JBn()/qat() (L912387): is focus view active? In-session the
 * appState field is authoritative — /focus flips it.
 */
export function isFocusViewActive(appState: AppState): boolean {
  return appState.briefTranscript
}

/**
 * Official Yat() (L933730): the effective view mode exposed to the system
 * prompt context / SDK bridge, alongside commands/agents/skills.
 */
export function getEffectiveViewMode(appState: AppState): 'default' | 'focus' {
  return isFocusViewActive(appState) ? 'focus' : 'default'
}

/**
 * Scroll speed knob — the adjustable point behind /scroll-speed.
 *
 * The wheel/scroll acceleration lives in
 * `src/components/ScrollKeybindingHandler.tsx` (see `readScrollSpeedBase` /
 * `initWheelAccel`). Its per-event baseline ("base", rows per wheel event
 * before acceleration ramps) is resolved here from two sources:
 *
 * 1. `CLAUDE_CODE_SCROLL_SPEED` env var — escape hatch / override, wins
 *    when set (same pattern as `CLAUDE_CODE_EFFORT_LEVEL` for /effort).
 * 2. `scrollSpeed` in settings.json — persisted by the /scroll-speed
 *    command slider. Absent → default 1.
 *
 * Values are clamped to (0, SCROLL_SPEED_MAX] — matching the historical
 * env-var clamp — so a bad settings.json value can never zero out or blow
 * up scrolling.
 */

/** Minimum allowed base (must be > 0: 0 would disable wheel scrolling). */
export const SCROLL_SPEED_MIN = 1

/** Maximum allowed base (historical env-var clamp ceiling). */
export const SCROLL_SPEED_MAX = 20

/** Base used when neither env var nor settings provide a value. */
export const SCROLL_SPEED_DEFAULT = 1

/**
 * The slider's discrete value set for /scroll-speed. Every value is shown
 * at once (official 2.1.330 slider behavior); Home/End jump to the ends.
 */
export const SCROLL_SPEED_VALUES: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]

function clampScrollSpeed(value: number): number {
  if (Number.isNaN(value) || value < SCROLL_SPEED_MIN)
    return SCROLL_SPEED_DEFAULT
  return Math.min(value, SCROLL_SPEED_MAX)
}

/**
 * Parse a raw env-var / CLI-arg string into a valid scroll speed.
 * Returns undefined when unset or invalid (caller falls back to settings).
 */
export function parseScrollSpeed(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = parseFloat(raw)
  return Number.isNaN(n) || n <= 0 ? undefined : clampScrollSpeed(n)
}

/**
 * Resolve the effective scroll-speed base.
 * Precedence: env var (override) > settings value > default.
 */
export function resolveScrollSpeedBase(
  envRaw: string | undefined,
  settingsValue: number | undefined,
): number {
  const fromEnv = parseScrollSpeed(envRaw)
  if (fromEnv !== undefined) return fromEnv
  if (settingsValue === undefined) return SCROLL_SPEED_DEFAULT
  return clampScrollSpeed(settingsValue)
}

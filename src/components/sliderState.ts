/**
 * Pure state helpers for the shared Slider component
 * (src/components/Slider.tsx). Mirrors the interaction model of
 * EffortPanel/effortPanelState.ts — left/right step, home/end jump to the
 * ends — but generic over an index so /autocompact, /scroll-speed and any
 * future slider command can share it.
 */

/** Clamp an index into [0, length - 1]. Empty item lists yield 0. */
export function clampSliderIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(Math.max(index, 0), length - 1)
}

/** Step one position left; already at the start → stays there. */
export function moveSliderLeft(index: number, length: number): number {
  return clampSliderIndex(index - 1, length)
}

/** Step one position right; already at the end → stays there. */
export function moveSliderRight(index: number, length: number): number {
  return clampSliderIndex(index + 1, length)
}

/**
 * Initial cursor position: the index of `currentValue` when the slider
 * exposes one (so the cursor starts on the live setting), else 0.
 */
export function getInitialSliderIndex(
  values: readonly string[],
  currentValue: string | undefined,
): number {
  if (currentValue !== undefined) {
    const idx = values.indexOf(currentValue)
    if (idx !== -1) return idx
  }
  return 0
}

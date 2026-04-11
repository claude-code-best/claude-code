/**
 * Poor mode state — when active, skips extract_memories and prompt_suggestion
 * to reduce token consumption.
 */

let poorModeActive = false

export function isPoorModeActive(): boolean {
  return poorModeActive
}

export function setPoorMode(active: boolean): void {
  poorModeActive = active
}

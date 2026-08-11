import { release } from 'node:os'

/**
 * Legacy Windows console detection (pre-ConPTY).
 *
 * ConPTY shipped in Windows 10 1809 (build 17763). On older builds the
 * conhost VT parser predates it and mis-handles incremental TUI updates
 * (pending-wrap semantics at the last column drift the real cursor away
 * from the virtual one), so residue accumulates until a full repaint.
 * Every terminal on such a machine is affected — VS Code and mintty fall
 * back to winpty, which scrapes the same corrupted conhost buffer.
 *
 * Overrides:
 *   CLAUDE_CODE_LEGACY_CONSOLE=0        force off
 *   CLAUDE_CODE_LEGACY_CONSOLE=1        force on (periodic full repaint)
 *   CLAUDE_CODE_LEGACY_CONSOLE=2|always full repaint on EVERY frame — for
 *     machines where each incremental diff corrupts immediately and the
 *     periodic self-heal is not enough. Maximum flicker, maximum
 *     correctness.
 *   CLAUDE_CODE_LEGACY_CONSOLE_RESET_MS=<ms>
 *     periodic repaint interval, clamped to [100, 10000]. Default 1000.
 */

export type LegacyConsoleMode = 'off' | 'periodic' | 'always'

/** Pure build-number check, exported for tests. */
export function isLegacyWindowsBuild(releaseString: string): boolean {
  const build = Number(releaseString.split('.')[2])
  return Number.isFinite(build) && build < 17763
}

/** Pure override/auto-detect resolution, exported for tests. */
export function parseLegacyConsoleMode(
  override: string | undefined,
  autoDetected: boolean,
): LegacyConsoleMode {
  if (override === '0') return 'off'
  if (override === '2' || override === 'always') return 'always'
  if (override === '1') return 'periodic'
  return autoDetected ? 'periodic' : 'off'
}

/** Pure interval parser with clamping, exported for tests. */
export function parseLegacyConsoleResetMs(raw: string | undefined): number {
  // Number('') === 0, so an empty env var must be treated as unset.
  if (raw === undefined || raw.trim() === '') return 1000
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 1000
  return Math.min(10_000, Math.max(100, Math.floor(parsed)))
}

let cachedMode: LegacyConsoleMode | undefined
let cachedResetMs: number | undefined

export function legacyConsoleMode(): LegacyConsoleMode {
  if (cachedMode === undefined) {
    cachedMode = parseLegacyConsoleMode(
      process.env.CLAUDE_CODE_LEGACY_CONSOLE,
      process.platform === 'win32' && isLegacyWindowsBuild(release()),
    )
  }
  return cachedMode
}

export function isLegacyWindowsConsole(): boolean {
  return legacyConsoleMode() !== 'off'
}

export function legacyConsoleResetMs(): number {
  if (cachedResetMs === undefined) {
    cachedResetMs = parseLegacyConsoleResetMs(
      process.env.CLAUDE_CODE_LEGACY_CONSOLE_RESET_MS,
    )
  }
  return cachedResetMs
}

/**
 * Effective render width for the terminal.
 *
 * Legacy conhost mis-handles pending-wrap: writing the last column wraps
 * immediately (modern terminals defer the wrap), so every full-width line
 * pushes the real cursor one row past where the renderer believes it is —
 * both incremental diffs AND full repaints drift, and each full repaint
 * scrolls extra lines into view (the "garbage grows with every flash"
 * failure mode). Rendering one column narrower means no line ever touches
 * the last column, so the buggy code path never fires.
 */
export function effectiveColumns(columns: number | undefined): number {
  const cols = columns || 80
  if (!isLegacyWindowsConsole()) return cols
  return Math.max(20, cols - 1)
}

export function resetLegacyConsoleCacheForTesting(): void {
  cachedMode = undefined
  cachedResetMs = undefined
}

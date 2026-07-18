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
 * Override with CLAUDE_CODE_LEGACY_CONSOLE=1 (force on) / =0 (force off).
 */

/** Pure build-number check, exported for tests. */
export function isLegacyWindowsBuild(releaseString: string): boolean {
  const build = Number(releaseString.split('.')[2])
  return Number.isFinite(build) && build < 17763
}

let cached: boolean | undefined

export function isLegacyWindowsConsole(): boolean {
  if (cached !== undefined) return cached
  const override = process.env.CLAUDE_CODE_LEGACY_CONSOLE
  if (override === '1') {
    cached = true
  } else if (override === '0') {
    cached = false
  } else {
    cached = process.platform === 'win32' && isLegacyWindowsBuild(release())
  }
  return cached
}

export function resetLegacyConsoleCacheForTesting(): void {
  cached = undefined
}

/**
 * Detects if the current runtime is Bun.
 * Returns true when:
 * - Running a JS file via the `bun` command
 * - Running a Bun-compiled standalone executable
 */
export function isRunningWithBun(): boolean {
  // https://bun.com/guides/util/detect-bun
  return process.versions.bun !== undefined
}

/**
 * Detects if running as a Bun-compiled standalone executable.
 *
 * Primary check: Bun.embeddedFiles (present in compiled binaries).
 * Fallback: BUNDLED_MODE compile-time constant injected by compile.ts.
 */
// BUNDLED_MODE is injected at compile time by compile.ts --define flag.
declare const BUNDLED_MODE: string | undefined
export function isInBundledMode(): boolean {
  if (typeof BUNDLED_MODE !== 'undefined') return true
  return (
    typeof Bun !== 'undefined' &&
    Array.isArray(Bun.embeddedFiles) &&
    Bun.embeddedFiles.length > 0
  )
}

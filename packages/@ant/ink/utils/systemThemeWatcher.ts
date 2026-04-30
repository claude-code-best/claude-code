import type { SystemTheme } from '../src/theme/systemTheme.js'

/**
 * Watch for live terminal theme changes via OSC 11 polling.
 * Stub implementation for the standalone @anthropic/ink package.
 */
export function watchSystemTheme(
  _querier: unknown,
  _setTheme: React.Dispatch<React.SetStateAction<SystemTheme>>,
): () => void {
  return () => {}
}

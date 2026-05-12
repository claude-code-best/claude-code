/**
 * Bundle IDs that are escalations-in-disguise. The approval UI shows a warning
 * badge for these; they are NOT blocked. Power users may legitimately want the
 * model controlling a terminal.
 *
 * Imported by the renderer via the `./sentinelApps` subpath (package.json
 * `exports`), which keeps Next.js from reaching index.ts → mcpServer.ts →
 * @modelcontextprotocol/sdk (devDep, would fail module resolution). Keep
 * this file import-free so the subpath stays clean.
 */

/** These apps can execute arbitrary shell commands. */
const SHELL_ACCESS_BUNDLE_IDS = new Set([
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'com.microsoft.VSCode',
  'dev.warp.Warp-Stable',
  'com.github.wez.wezterm',
  'io.alacritty',
  'net.kovidgoyal.kitty',
  'com.jetbrains.intellij',
  'com.jetbrains.pycharm',
])

/** Finder in the allowlist ≈ browse + open-any-file. */
const FILESYSTEM_ACCESS_BUNDLE_IDS = new Set(['com.apple.finder'])

const SYSTEM_SETTINGS_BUNDLE_IDS = new Set(['com.apple.systempreferences'])

export const SENTINEL_BUNDLE_IDS: ReadonlySet<string> = new Set([
  ...SHELL_ACCESS_BUNDLE_IDS,
  ...FILESYSTEM_ACCESS_BUNDLE_IDS,
  ...SYSTEM_SETTINGS_BUNDLE_IDS,
])

export type SentinelCategory = 'shell' | 'filesystem' | 'system_settings'

export function getSentinelCategory(bundleId: string): SentinelCategory | null {
  if (SHELL_ACCESS_BUNDLE_IDS.has(bundleId)) return 'shell'
  if (FILESYSTEM_ACCESS_BUNDLE_IDS.has(bundleId)) return 'filesystem'
  if (SYSTEM_SETTINGS_BUNDLE_IDS.has(bundleId)) return 'system_settings'
  return null
}

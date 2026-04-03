/**
 * Sentinel apps — List of applications requiring special permission warnings
 *
 * Includes terminals, file managers, system settings, and other sensitive apps.
 * Computer Use displays additional warnings when operating on these applications.
 */

type SentinelCategory = 'shell' | 'filesystem' | 'system_settings'

const SENTINEL_MAP: Record<string, SentinelCategory> = {
  // Shell / Terminal
  'com.apple.Terminal': 'shell',
  'com.googlecode.iterm2': 'shell',
  'dev.warp.Warp-Stable': 'shell',
  'io.alacritty': 'shell',
  'com.github.wez.wezterm': 'shell',
  'net.kovidgoyal.kitty': 'shell',
  'co.zeit.hyper': 'shell',

  // Filesystem
  'com.apple.finder': 'filesystem',

  // System Settings
  'com.apple.systempreferences': 'system_settings',
  'com.apple.SystemPreferences': 'system_settings',
}

export const sentinelApps: string[] = Object.keys(SENTINEL_MAP)

export function getSentinelCategory(bundleId: string): SentinelCategory | null {
  return SENTINEL_MAP[bundleId] ?? null
}

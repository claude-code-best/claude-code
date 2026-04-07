/**
 * Terminal dark/light mode detection.
 *
 * Detection is based on the terminal's actual background color (queried via
 * OSC 11) rather than the OS appearance setting.
 *
 * Vendored from src/utils/systemTheme.ts for package independence.
 */

export type SystemTheme = 'dark' | 'light'

let cachedSystemTheme: SystemTheme | undefined

/**
 * Detect theme from $COLORFGBG environment variable (set by some terminals).
 */
function detectFromColorFgBg(): SystemTheme | undefined {
  const colorFgBg = process.env.COLORFGBG
  if (!colorFgBg) return undefined
  const parts = colorFgBg.split(';')
  if (parts.length < 2) return undefined
  const bg = parseInt(parts[parts.length - 1]!, 10)
  // Standard ANSI color indices: 0-7 are dark, 8-15 are bright/light
  if (isNaN(bg)) return undefined
  return bg >= 8 ? 'light' : 'dark'
}

/**
 * Get the current terminal theme. Cached after first detection.
 */
export function getSystemThemeName(): SystemTheme {
  if (cachedSystemTheme === undefined) {
    cachedSystemTheme = detectFromColorFgBg() ?? 'dark'
  }
  return cachedSystemTheme
}

export function setCachedSystemTheme(theme: SystemTheme): void {
  cachedSystemTheme = theme
}

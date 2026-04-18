/**
 * System Theme Watcher — poll terminal background color via OSC 11 to
 * detect dark/light theme changes at runtime.
 *
 * Returns a cleanup function that stops polling.
 */
import type { SystemTheme } from './systemTheme.js'
import { themeFromOscColor, setCachedSystemTheme } from './systemTheme.js'
import { logForDebugging } from './debug.js'

const POLL_INTERVAL_MS = 10_000 // Check every 10 seconds

/**
 * Start watching for system theme changes by periodically querying the
 * terminal's background color via OSC 11.
 *
 * @param querier  Unused in this implementation (reserved for platform-specific queriers)
 * @param setTheme React state setter to update the theme in the UI
 * @returns Cleanup function that stops watching
 */
export function watchSystemTheme(
  _querier: unknown,
  setTheme: React.Dispatch<React.SetStateAction<SystemTheme>>,
): () => void {
  if (!process.stdout.isTTY) {
    return () => {}
  }

  let lastTheme: SystemTheme | undefined
  let buffer = ''

  // Listen for OSC 11 responses on stdin
  const onData = (data: Buffer): void => {
    buffer += data.toString()
    // OSC 11 response format: ESC ] 11 ; <color> ESC \  or BEL
    // biome-ignore lint/suspicious/noControlCharactersInRegex: OSC escape sequences require control characters
    const match = buffer.match(/\x1b\]11;([^\x1b\x07]+)[\x1b\x07]/)
    if (match) {
      buffer = ''
      const theme = themeFromOscColor(match[1]!)
      if (theme && theme !== lastTheme) {
        lastTheme = theme
        setCachedSystemTheme(theme)
        setTheme(theme)
        logForDebugging(`[theme-watcher] theme changed to ${theme}`)
      }
    }
    // Prevent buffer from growing unbounded
    if (buffer.length > 256) {
      buffer = buffer.slice(-64)
    }
  }

  // Send OSC 11 query to terminal
  const query = (): void => {
    try {
      process.stdout.write('\x1b]11;?\x1b\\')
    } catch {
      // stdout may be closed
    }
  }

  if (process.stdin.isTTY) {
    process.stdin.on('data', onData)
  }

  // Initial query
  query()

  // Periodic polling
  const timer = setInterval(query, POLL_INTERVAL_MS)
  timer.unref()

  return () => {
    clearInterval(timer)
    if (process.stdin.isTTY) {
      process.stdin.off('data', onData)
    }
  }
}

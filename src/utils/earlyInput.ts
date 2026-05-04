/**
 * Early Input Capture
 *
 * This module captures terminal input that is typed before the REPL is fully
 * initialized. Users often type `claude` and immediately start typing their
 * prompt, but those early keystrokes would otherwise be lost during startup.
 *
 * Usage:
 * 1. Call startCapturingEarlyInput() as early as possible in cli.tsx
 * 2. When REPL is ready, call consumeEarlyInput() to get any buffered text
 * 3. stopCapturingEarlyInput() is called automatically when input is consumed
 */

import { lastGrapheme } from './intl.js'

// Buffer for early input characters
let earlyInputBuffer = ''
// Flag to track if we're currently capturing
let isCapturing = false
// Reference to the readable handler so we can remove it later
let readableHandler: (() => void) | null = null
// Safety valve: auto-cleanup after timeout so stdin.ref() never leaks
let safetyTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Start capturing stdin data early, before the REPL is initialized.
 * Should be called as early as possible in the startup sequence.
 *
 * Only captures if stdin is a TTY (interactive terminal).
 */
export function startCapturingEarlyInput(): void {
  // Only capture in interactive mode: stdin must be a TTY, and we must not
  // be in print mode. Raw mode disables ISIG (terminal Ctrl+C → SIGINT),
  // which would make -p uninterruptible.
  if (
    !process.stdin.isTTY ||
    isCapturing ||
    process.argv.includes('-p') ||
    process.argv.includes('--print')
  ) {
    return
  }

  isCapturing = true
  earlyInputBuffer = ''

  // Set stdin to raw mode and use 'readable' event like Ink does
  // This ensures compatibility with how the REPL will handle stdin later
  try {
    process.stdin.setEncoding('utf8')
    process.stdin.setRawMode(true)
    process.stdin.ref()

    readableHandler = () => {
      let chunk = process.stdin.read()
      while (chunk !== null) {
        if (typeof chunk === 'string') {
          processChunk(chunk)
        }
        chunk = process.stdin.read()
      }
    }

    process.stdin.on('readable', readableHandler)

    // Safety valve: if Ink never takes over within 10s (e.g. setup dialog
    // stalls, or an error prevents Ink mount on Windows), unref stdin so
    // the process doesn't hang forever. The REPL's Ink App normally calls
    // consumeEarlyInput() → stopCapturingEarlyInput() long before this.
    safetyTimer = setTimeout(() => {
      if (isCapturing) {
        stopCapturingEarlyInput()
      }
    }, 10_000)
    // Don't let the timer itself keep the event loop alive
    if (
      safetyTimer &&
      typeof safetyTimer === 'object' &&
      'unref' in safetyTimer
    ) {
      safetyTimer.unref()
    }
  } catch {
    // If we can't set raw mode, just silently continue without early capture
    isCapturing = false
  }
}

/**
 * Process a chunk of input data
 */
function processChunk(str: string): void {
  let i = 0
  while (i < str.length) {
    const char = str[i]!
    const code = char.charCodeAt(0)

    // Ctrl+C (code 3) - stop capturing and exit immediately.
    // We use process.exit here instead of gracefulShutdown because at this
    // early stage of startup, the shutdown machinery isn't initialized yet.
    if (code === 3) {
      stopCapturingEarlyInput()
      // eslint-disable-next-line custom-rules/no-process-exit
      process.exit(130) // Standard exit code for Ctrl+C
      return
    }

    // Ctrl+D (code 4) - EOF, stop capturing
    if (code === 4) {
      stopCapturingEarlyInput()
      return
    }

    // Backspace (code 127 or 8) - remove last grapheme cluster
    if (code === 127 || code === 8) {
      if (earlyInputBuffer.length > 0) {
        const last = lastGrapheme(earlyInputBuffer)
        earlyInputBuffer = earlyInputBuffer.slice(0, -(last.length || 1))
      }
      i++
      continue
    }

    // Skip escape sequences (arrow keys, function keys, focus events, etc.)
    // All escape sequences start with ESC (0x1B).
    if (code === 27) {
      i++ // Skip the ESC character
      if (i >= str.length) continue

      const next = str.charCodeAt(i)!

      // CSI sequences: ESC [ ... <final_byte 0x40-0x7E>
      // e.g. \x1b[?64;1;2;4;6;17;18;21;22c (DA1 response)
      if (next === 0x5b /* [ */) {
        i++ // skip '['
        // Skip parameter bytes (0x30-0x3F) and intermediate bytes (0x20-0x2F)
        while (
          i < str.length &&
          str.charCodeAt(i)! >= 0x20 &&
          str.charCodeAt(i)! <= 0x3f
        ) {
          i++
        }
        // Skip the final byte (0x40-0x7E)
        if (
          i < str.length &&
          str.charCodeAt(i)! >= 0x40 &&
          str.charCodeAt(i)! <= 0x7e
        )
          i++
        continue
      }

      // String sequences: DCS (P), OSC (]), SOS (X), PM (^)
      // These end with BEL (0x07) or ST (ESC \)
      if (
        next === 0x50 /* P */ ||
        next === 0x5d /* ] */ ||
        next === 0x58 /* X */ ||
        next === 0x5e /* ^ */
      ) {
        i++ // skip the introducer
        while (i < str.length) {
          if (str.charCodeAt(i) === 0x07) {
            i++
            break
          } // BEL terminates
          if (
            str.charCodeAt(i) === 0x1b &&
            i + 1 < str.length &&
            str.charCodeAt(i + 1)! === 0x5c
          ) {
            i += 2
            break // ESC \ (ST) terminates
          }
          i++
        }
        continue
      }

      // SS2 (N), SS3 (O) — 2-byte sequences, just skip both
      // Other simple escape sequences: ESC <byte 0x40-0x7E> — just skip the one byte
      if (i < str.length) i++
      continue
    }

    // Skip other control characters (except tab and newline)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      i++
      continue
    }

    // Convert carriage return to newline
    if (code === 13) {
      earlyInputBuffer += '\n'
      i++
      continue
    }

    // Add printable characters and allowed control chars to buffer
    earlyInputBuffer += char
    i++
  }
}

/**
 * Stop capturing early input.
 * Called automatically when input is consumed, or can be called manually.
 */
export function stopCapturingEarlyInput(): void {
  if (!isCapturing) {
    return
  }

  isCapturing = false

  // Clear safety timer
  if (safetyTimer) {
    clearTimeout(safetyTimer)
    safetyTimer = null
  }

  if (readableHandler) {
    process.stdin.removeListener('readable', readableHandler)
    readableHandler = null
  }

  // Undo the ref() from startCapturingEarlyInput so the event loop isn't
  // kept alive if Ink never takes over (e.g. raw mode unsupported on
  // Windows Node.js, or an error during setup). Ink's own
  // handleSetRawMode(true) calls stdin.ref() again, and its
  // handleSetRawMode(false) / unmount path calls stdin.unref(), so this
  // unref is safe even when Ink does take over — the two ref/unref calls
  // balance out.
  try {
    process.stdin.unref()
  } catch {
    // stdin may already be destroyed
  }

  // Don't reset setRawMode here — Ink's App.handleSetRawMode(true)
  // calls stopCapturingEarlyInput() synchronously and then immediately
  // calls setRawMode(true) + ref() on the same stdin, so toggling it
  // off here would add a visible flicker on Windows.
}

/**
 * Consume any early input that was captured.
 * Returns the captured input and clears the buffer.
 * Automatically stops capturing when called.
 */
export function consumeEarlyInput(): string {
  stopCapturingEarlyInput()
  const input = earlyInputBuffer.trim()
  earlyInputBuffer = ''
  return input
}

/**
 * Check if there is any early input available without consuming it.
 */
export function hasEarlyInput(): boolean {
  return earlyInputBuffer.trim().length > 0
}

/**
 * Seed the early input buffer with text that will appear pre-filled
 * in the prompt input when the REPL renders. Does not auto-submit.
 */
export function seedEarlyInput(text: string): void {
  earlyInputBuffer = text
}

/**
 * Check if early input capture is currently active.
 */
export function isCapturingEarlyInput(): boolean {
  return isCapturing
}

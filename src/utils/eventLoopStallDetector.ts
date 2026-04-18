/**
 * Event Loop Stall Detector — logs when the main thread is blocked too long.
 *
 * Uses a periodic timer to measure event loop latency. If the gap between
 * expected and actual firing time exceeds the threshold, it means the main
 * thread was blocked by synchronous work (e.g. large JSON parse, sync I/O).
 *
 * Called from main.tsx at startup.
 */
import { logForDebugging } from './debug.js'

const POLL_INTERVAL_MS = 500
const STALL_THRESHOLD_MS = 500

/**
 * Start monitoring the event loop for stalls.
 * Logs a warning when the event loop is blocked for more than 500ms.
 */
export function startEventLoopStallDetector(): void {
  let lastTick = Date.now()

  const timer = setInterval(() => {
    const now = Date.now()
    const elapsed = now - lastTick
    const drift = elapsed - POLL_INTERVAL_MS

    if (drift > STALL_THRESHOLD_MS) {
      logForDebugging(
        `[stall-detector] Event loop stalled for ${drift}ms (elapsed=${elapsed}ms, expected=${POLL_INTERVAL_MS}ms)`,
      )
    }

    lastTick = now
  }, POLL_INTERVAL_MS)

  // Don't prevent process exit
  timer.unref()
}

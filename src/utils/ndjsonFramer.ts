/**
 * Shared NDJSON (Newline-Delimited JSON) socket framing.
 *
 * Accumulates incoming data chunks, splits on newlines, and emits
 * parsed JSON objects. Used by both pipeTransport (UDS+TCP) and
 * udsMessaging to avoid duplicating the same buffer logic.
 */
import type { Socket } from 'net'

/**
 * Attach an NDJSON framer to a socket. Calls `onMessage` for each
 * complete JSON line received. Malformed lines are silently skipped.
 *
 * @param parse - Optional custom JSON parser (defaults to JSON.parse).
 *                Useful when the caller uses a wrapped parser like jsonParse
 *                from slowOperations.
 */
export function attachNdjsonFramer<T = unknown>(
  socket: Socket,
  onMessage: (msg: T) => void,
  parse: (text: string) => T = text => JSON.parse(text) as T,
): void {
  let buffer = ''

  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        onMessage(parse(line))
      } catch {
        // Malformed JSON — skip
      }
    }
  })
}

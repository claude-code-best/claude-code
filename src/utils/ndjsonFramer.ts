/**
 * Shared NDJSON (Newline-Delimited JSON) socket framing.
 *
 * Accumulates incoming data chunks, splits on newlines, and emits
 * parsed JSON objects. Used by both pipeTransport (UDS+TCP) and
 * udsMessaging to avoid duplicating the same buffer logic.
 */
import type { Socket } from 'net'

export type NdjsonFramerOptions = {
  maxFrameBytes?: number
  onFrameError?: (error: Error) => void
}

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
  options: NdjsonFramerOptions = {},
): void {
  let buffer = ''
  const maxFrameBytes = options.maxFrameBytes ?? Number.POSITIVE_INFINITY

  const rejectOversizedFrame = (bytes: number): void => {
    const error = new Error(
      `NDJSON frame exceeded ${maxFrameBytes} bytes (${bytes})`,
    )
    options.onFrameError?.(error)
    socket.destroy(error)
  }

  socket.on('data', (chunk: Buffer) => {
    if (
      Number.isFinite(maxFrameBytes) &&
      !chunk.includes(0x0a) &&
      Buffer.byteLength(buffer, 'utf8') + chunk.byteLength > maxFrameBytes
    ) {
      rejectOversizedFrame(Buffer.byteLength(buffer, 'utf8') + chunk.byteLength)
      return
    }

    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      if (
        Number.isFinite(maxFrameBytes) &&
        Buffer.byteLength(line, 'utf8') > maxFrameBytes
      ) {
        rejectOversizedFrame(Buffer.byteLength(line, 'utf8'))
        return
      }
      try {
        onMessage(parse(line))
      } catch {
        // Malformed JSON — skip
      }
    }

    if (
      Number.isFinite(maxFrameBytes) &&
      Buffer.byteLength(buffer, 'utf8') > maxFrameBytes
    ) {
      rejectOversizedFrame(Buffer.byteLength(buffer, 'utf8'))
    }
  })
}

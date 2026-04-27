import type { Socket } from 'net'
import { errorMessage } from './errors.js'
import { jsonParse } from './slowOperations.js'
import type { UdsMessage } from './udsMessaging.js'

type UdsResponseReaderOptions = {
  maxFrameBytes: number
  acceptPong?: boolean
  onSettled: (error?: Error) => void
  formatSocketError?: (error: unknown) => Error
}

export function getChunkBytes(chunk: string | Buffer): number {
  return typeof chunk === 'string'
    ? Buffer.byteLength(chunk, 'utf8')
    : chunk.byteLength
}

function parseResponseLine(line: string): UdsMessage | null {
  try {
    return jsonParse(line) as UdsMessage
  } catch {
    return null
  }
}

export function attachUdsResponseReader(
  socket: Socket,
  options: UdsResponseReaderOptions,
): void {
  let buffer = ''
  let settled = false

  const finish = (error?: Error): void => {
    if (settled) return
    settled = true
    if (error) {
      socket.destroy(error)
    } else {
      socket.end()
    }
    options.onSettled(error)
  }

  socket.on('data', chunk => {
    if (
      Buffer.byteLength(buffer, 'utf8') + getChunkBytes(chunk) >
      options.maxFrameBytes
    ) {
      finish(new Error('UDS response frame exceeded size limit'))
      return
    }

    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const response = parseResponseLine(line)
      if (!response) continue
      if (
        response.type === 'response' ||
        (options.acceptPong === true && response.type === 'pong')
      ) {
        finish()
        return
      }
      if (response.type === 'error') {
        finish(new Error(response.data ?? 'UDS receiver rejected message'))
        return
      }
    }
  })

  socket.on('error', error => {
    finish(
      options.formatSocketError?.(error) ??
        (error instanceof Error ? error : new Error(errorMessage(error))),
    )
  })
}

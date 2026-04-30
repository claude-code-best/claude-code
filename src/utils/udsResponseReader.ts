import type { Socket } from 'net'
import { StringDecoder } from 'node:string_decoder'
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

function parseResponseLine(line: string): UdsMessage {
  try {
    return jsonParse(line) as UdsMessage
  } catch {
    throw new Error('Invalid UDS response frame')
  }
}

export function attachUdsResponseReader(
  socket: Socket,
  options: UdsResponseReaderOptions,
): void {
  let buffer = ''
  let bufferBytes = 0
  let settled = false
  const decoder = new StringDecoder('utf8')

  function cleanupListeners(): void {
    socket.off('data', onData)
    socket.off('error', onError)
    socket.off('end', onEnd)
    socket.off('close', onClose)
  }

  function finish(error?: Error): void {
    if (settled) return
    settled = true
    buffer = ''
    bufferBytes = 0
    cleanupListeners()
    if (error) {
      socket.destroy()
    } else {
      socket.end()
    }
    options.onSettled(error)
  }

  function onData(chunk: Buffer): void {
    const decoded = decoder.write(chunk)
    const decodedBytes = Buffer.byteLength(decoded, 'utf8')
    if (bufferBytes + decodedBytes > options.maxFrameBytes) {
      finish(new Error('UDS response frame exceeded size limit'))
      return
    }

    buffer += decoded
    bufferBytes += decodedBytes
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      const consumed = buffer.slice(0, newlineIndex + 1)
      buffer = buffer.slice(newlineIndex + 1)
      bufferBytes -= Buffer.byteLength(consumed, 'utf8')
      if (!line.trim()) {
        newlineIndex = buffer.indexOf('\n')
        continue
      }
      let response: UdsMessage
      try {
        response = parseResponseLine(line)
      } catch (error) {
        finish(error instanceof Error ? error : new Error(errorMessage(error)))
        return
      }
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
      newlineIndex = buffer.indexOf('\n')
    }
  }

  function onError(error: Error): void {
    finish(
      options.formatSocketError?.(error) ??
        (error instanceof Error ? error : new Error(errorMessage(error))),
    )
  }

  function onEnd(): void {
    finish(new Error('UDS socket ended before response'))
  }

  function onClose(hadError: boolean): void {
    if (hadError) return
    finish(new Error('UDS socket closed before response'))
  }

  socket.on('data', onData)
  socket.on('error', onError)
  socket.on('end', onEnd)
  socket.on('close', onClose)
}

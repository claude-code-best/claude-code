// Doubao (豆包) ASR speech-to-text adapter for voice mode.
//
// Wraps the doubaoime-asr npm package to expose the same interface as
// voiceStreamSTT.ts. The doubao backend uses an AsyncGenerator-based
// streaming protocol internally; this adapter bridges it to the
// send/finalize/close pattern used by useVoice.ts.

import { homedir } from 'node:os'
import type { ASRResponse } from 'doubaoime-asr'
import type {
  FinalizeSource,
  VoiceStreamCallbacks,
  VoiceStreamConnection,
} from './voiceStreamSTT.js'
import { logForDebugging } from '../utils/debug.js'
import { logError } from '../utils/log.js'

// Re-export FinalizeSource so useVoice can import from either module
export type { FinalizeSource } from './voiceStreamSTT.js'

// Maximum time to wait for the generator to finish after end-of-stream signal.
const FINALIZE_SAFETY_TIMEOUT_MS = 5_000

// ─── AsyncIterable audio queue ─────────────────────────────────────────

// A push-based queue that implements AsyncIterable<Uint8Array>.
// send() pushes chunks; push(null) signals end-of-stream.
class AudioChunkQueue {
  private chunks: (Uint8Array | null)[] = []
  private waiting: ((result: IteratorResult<Uint8Array>) => void) | null = null
  private done = false

  push(chunk: Uint8Array | null): void {
    if (this.done) return
    if (chunk === null) {
      this.done = true
      if (this.waiting) {
        const resolve = this.waiting
        this.waiting = null
        resolve({ value: undefined, done: true })
      }
      return
    }
    if (this.waiting) {
      const resolve = this.waiting
      this.waiting = null
      resolve({ value: chunk, done: false })
    } else {
      this.chunks.push(chunk)
    }
  }

  abort(): void {
    this.done = true
    this.chunks.length = 0
    if (this.waiting) {
      const resolve = this.waiting
      this.waiting = null
      resolve({ value: undefined, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next: async (): Promise<IteratorResult<Uint8Array>> => {
        if (this.chunks.length > 0) {
          const chunk = this.chunks.shift()!
          return { value: chunk, done: false }
        }
        if (this.done) {
          return { value: undefined, done: true }
        }
        return new Promise<IteratorResult<Uint8Array>>(resolve => {
          this.waiting = resolve
        })
      },
    }
  }
}

// ─── Availability ────────────────────────────────────────────────────────

let doubaoAvailable: boolean | null = null

export async function isDoubaoAvailable(): Promise<boolean> {
  if (doubaoAvailable !== null) return doubaoAvailable
  try {
    await import('doubaoime-asr')
    doubaoAvailable = true
  } catch {
    doubaoAvailable = false
  }
  return doubaoAvailable
}

// Synchronous check — returns cached result or optimistic true when
// VOICE_PROVIDER=doubao is set and no cached result exists yet.
// The actual import happens in connectDoubaoStream which reports errors.
export function isDoubaoAvailableSync(): boolean {
  if (doubaoAvailable !== null) return doubaoAvailable
  return true
}

// ─── Connection ──────────────────────────────────────────────────────────

export async function connectDoubaoStream(
  callbacks: VoiceStreamCallbacks,
  _options?: { language?: string },
): Promise<VoiceStreamConnection | null> {
  let doubaoAsr: typeof import('doubaoime-asr')
  try {
    doubaoAsr = await import('doubaoime-asr')
  } catch (err) {
    logError(
      new Error(
        `[doubao-asr] Failed to import doubaoime-asr package: ${String(err)}`,
      ),
    )
    callbacks.onError(`doubaoime-asr package import failed: ${String(err)}`, {
      fatal: true,
    })
    return null
  }

  const { transcribeRealtime, ASRConfig, ResponseType } = doubaoAsr

  const queue = new AudioChunkQueue()
  let finalized = false

  // Resolve handle for finalize() promise — wrapped in an object to avoid
  // TypeScript closure-scope type narrowing issues (TS2349 "not callable").
  const finalizeHandle: { resolve: ((source: FinalizeSource) => void) | null } =
    { resolve: null }

  const connection: VoiceStreamConnection = {
    send(audioChunk: Buffer): void {
      if (finalized) return
      queue.push(
        new Uint8Array(
          audioChunk.buffer,
          audioChunk.byteOffset,
          audioChunk.byteLength,
        ),
      )
    },
    finalize(): Promise<FinalizeSource> {
      if (finalized) return Promise.resolve<FinalizeSource>('ws_already_closed')
      finalized = true
      queue.push(null) // signal end-of-stream to the generator
      // Doubao returns FINAL_RESULT during recording — by the time the user
      // releases the key, all transcripts are already in accumulatedRef.
      // Resolve immediately so the UI skips the 'processing' state and goes
      // straight to displaying the result.
      logForDebugging('[doubao-asr] Finalize — resolving immediately')
      return Promise.resolve<FinalizeSource>('post_closestream_endpoint')
    },
    close(): void {
      finalized = true
      queue.abort()
      const r = finalizeHandle.resolve
      finalizeHandle.resolve = null
      if (r) r('ws_close')
      callbacks.onClose()
    },
    isConnected(): boolean {
      return true
    },
  }

  // Start the ASR session in the background
  const config = new ASRConfig({
    credentialPath: `${homedir()}/.claude/tts/doubao/credentials.json`,
  })

  // Ensure credentials are initialized (may auto-generate)
  try {
    await config.ensureCredentials()
  } catch (err) {
    logError(
      new Error(
        `[doubao-asr] Credential initialization failed: ${String(err)}`,
      ),
    )
    callbacks.onError(`Doubao ASR 凭证初始化失败: ${String(err)}`, {
      fatal: true,
    })
    return null
  }

  // Fire onReady immediately — unlike the Anthropic WebSocket which needs to
  // wait for a handshake, the doubao backend accepts audio through the queue
  // and handles connection internally. The caller (useVoice.ts) needs onReady
  // to fire before it will route audio chunks via connection.send().
  logForDebugging('[doubao-asr] Firing onReady immediately')
  callbacks.onReady(connection)

  // Consume the AsyncGenerator in the background
  void (async () => {
    try {
      const audioSource: AsyncIterable<Uint8Array> = queue
      const gen: AsyncGenerator<ASRResponse> = transcribeRealtime(audioSource, {
        config,
      })

      for await (const resp of gen) {
        if (
          finalized &&
          resp.type !== ResponseType.FINAL_RESULT &&
          resp.type !== ResponseType.SESSION_FINISHED
        ) {
          continue
        }

        switch (resp.type) {
          case ResponseType.SESSION_STARTED:
            logForDebugging('[doubao-asr] Session started')
            break
          case ResponseType.VAD_START:
            logForDebugging('[doubao-asr] VAD detected speech start')
            break
          case ResponseType.INTERIM_RESULT:
            if (resp.text) {
              callbacks.onTranscript(resp.text, false)
            }
            break
          case ResponseType.FINAL_RESULT:
            if (resp.text) {
              callbacks.onTranscript(resp.text, true)
            }
            break
          case ResponseType.ERROR:
            logError(new Error(`[doubao-asr] Error: ${resp.errorMsg}`))
            if (!finalized) {
              callbacks.onError(resp.errorMsg || 'Doubao ASR 识别错误')
            }
            break
          case ResponseType.SESSION_FINISHED:
            logForDebugging('[doubao-asr] Session finished')
            break
          default:
            break
        }
      }

      // Generator exhausted naturally
      const r = finalizeHandle.resolve
      finalizeHandle.resolve = null
      if (r) r('post_closestream_endpoint')
    } catch (err) {
      logError(new Error(`[doubao-asr] Stream error: ${String(err)}`))
      if (!finalized) {
        callbacks.onError(`Doubao ASR 连接错误: ${String(err)}`)
      }
      const r2 = finalizeHandle.resolve
      finalizeHandle.resolve = null
      if (r2) r2('ws_close')
    }
  })()

  return connection
}

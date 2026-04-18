/**
 * Python Bridge Client — manages a long-lived Python subprocess for Windows
 * Computer Use operations.
 *
 * Replaces per-call PowerShell spawning with a persistent Python process
 * that communicates via JSON lines over stdin/stdout.
 *
 * Performance: ~1-5ms per call vs ~200-500ms per PowerShell spawn.
 */

import * as path from 'path'
import type { Writable } from 'stream'

interface BridgeRequest {
  id: number
  method: string
  params: Record<string, unknown>
}

interface BridgeResponse {
  id: number
  result?: unknown
  error?: string
}

let bridgeProc: ReturnType<typeof Bun.spawn> | null = null
let requestId = 0
const pendingRequests = new Map<
  number,
  {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }
>()
let outputBuffer = ''

/**
 * Start the Python bridge process if not already running.
 */
export function ensureBridge(): boolean {
  if (bridgeProc) return true
  try {
    const scriptPath = path.join(__dirname, 'bridge.py')
    bridgeProc = Bun.spawn(['python', '-u', scriptPath], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'ignore',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    })

    // Read stdout lines asynchronously
    const reader = (bridgeProc.stdout as ReadableStream<Uint8Array>).getReader()
    const readLoop = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          outputBuffer += new TextDecoder().decode(value)
          // Process complete lines
          let newlineIdx: number
          while ((newlineIdx = outputBuffer.indexOf('\n')) !== -1) {
            const line = outputBuffer.slice(0, newlineIdx).trim()
            outputBuffer = outputBuffer.slice(newlineIdx + 1)
            if (!line) continue
            try {
              const resp: BridgeResponse = JSON.parse(line)
              const pending = pendingRequests.get(resp.id)
              if (pending) {
                pendingRequests.delete(resp.id)
                if (resp.error) {
                  pending.reject(new Error(resp.error))
                } else {
                  pending.resolve(resp.result)
                }
              }
            } catch {}
          }
        }
      } catch {}
    }
    readLoop()

    return true
  } catch {
    bridgeProc = null
    return false
  }
}

/**
 * Send a request to the Python bridge and wait for the response.
 */
export async function call<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs: number = 10000,
): Promise<T> {
  if (!ensureBridge()) {
    throw new Error('Python bridge not available')
  }

  const id = ++requestId
  const req: BridgeRequest = { id, method, params }

  return new Promise<T>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
    })

    // Timeout
    const timer = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`Bridge call ${method} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    // Clear timeout on resolve/reject
    const origResolve = resolve as (v: unknown) => void
    const origReject = reject
    pendingRequests.set(id, {
      resolve: v => {
        clearTimeout(timer)
        origResolve(v)
      },
      reject: e => {
        clearTimeout(timer)
        origReject(e)
      },
    })

    try {
      const stdin = bridgeProc!.stdin
      if (stdin) {
        const writable = stdin as unknown as Writable
        writable.write(JSON.stringify(req) + '\n')
        if (typeof (writable as any).flush === 'function') {
          ;(writable as any).flush()
        }
      }
    } catch (err) {
      clearTimeout(timer)
      pendingRequests.delete(id)
      reject(new Error(`Bridge write failed: ${err}`))
    }
  })
}

/**
 * Synchronous call — blocks the event loop. Use sparingly.
 * Falls back to PowerShell if bridge is not available.
 */
export function callSync<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs: number = 10000,
): T | null {
  // For sync calls, spawn a one-shot Python process.
  // SECURITY: JSON is passed via stdin (not embedded in -c) to prevent code injection.
  try {
    const scriptPath = path.join(__dirname, 'bridge.py')
    const req = JSON.stringify({ id: 1, method, params })
    const result = Bun.spawnSync({
      cmd: ['python', '-u', scriptPath],
      stdin: Buffer.from(req + '\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      timeout: timeoutMs,
    })
    const out = new TextDecoder().decode(result.stdout).trim()
    if (!out) return null
    const resp: BridgeResponse = JSON.parse(out)
    if (resp.error) throw new Error(resp.error)
    return resp.result as T
  } catch {
    return null
  }
}

/**
 * Kill the bridge process.
 */
export function stopBridge(): void {
  if (bridgeProc) {
    try {
      const stdin = bridgeProc.stdin
      if (stdin) {
        const writable = stdin as unknown as Writable
        if (typeof writable.end === 'function') {
          writable.end()
        }
      }
      bridgeProc.kill()
    } catch {}
    bridgeProc = null
  }
  pendingRequests.clear()
  outputBuffer = ''
}

// NOTE: No process exit handlers here — the platform-level win32.ts
// already registers exit/SIGINT/SIGTERM handlers that call cleanupAll(),
// which includes stopBridge(). Adding handlers here would cause double
// cleanup and duplicate process.exit() calls.

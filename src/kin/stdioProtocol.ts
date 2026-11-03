export const KIN_PROTOCOL_VERSION = 2
export const KIN_CAPABILITIES = [
  'multi_slot',
  'native_sse',
  'stateless',
] as const

export type KinStdin =
  | {
      type: 'kin_job_start'
      job_id: string
      slot_id: string
      request: Record<string, unknown>
    }
  | { type: 'kin_cancel'; job_id: string; slot_id?: string }

export type KinStdout =
  | {
      type: 'kin_host_ready'
      protocol_version: number
      slots: number
      system_layout: string
      timezone: string
      capabilities: string[]
      config_hash?: string
    }
  | { type: 'kin_slot_ready'; slot_id: string }
  | {
      type: 'kin_stream_event'
      job_id: string
      slot_id: string
      event: unknown
    }
  | {
      type: 'kin_job_done'
      job_id: string
      slot_id: string
      stop_reason: string
      usage?: unknown
    }
  | { type: 'kin_job_error'; job_id: string; slot_id?: string; error: string }
  | { type: 'kin_cancel_ack'; job_id: string; slot_id: string }

export function parseStdinLine(line: string): KinStdin | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as KinStdin
    if (!parsed || typeof parsed.type !== 'string') return null
    if (!parsed.type.startsWith('kin_')) return null
    return parsed
  } catch {
    return null
  }
}

let writeChain: Promise<void> = Promise.resolve()

export function writeStdout(frame: KinStdout): Promise<void> {
  const line = JSON.stringify(frame) + '\n'
  const next = writeChain.then(
    () => writeLine(line),
    () => writeLine(line),
  )
  writeChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

function writeLine(line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (err?: Error | null) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }
    const ok = process.stdout.write(line, err => done(err))
    if (!ok) process.stdout.once('drain', () => done())
  })
}

export function slotId(index: number): string {
  return `s${String(index).padStart(2, '0')}`
}

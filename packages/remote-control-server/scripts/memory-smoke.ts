import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await mkdtemp(join(tmpdir(), 'rcs-memory-smoke-'))
const databasePath = join(temporaryRoot, 'rcs.sqlite')
const port = Number(process.env.RCS_MEMORY_PORT || 43_120)
const baseUrl = `http://127.0.0.1:${port}`
const owner = 'memory-smoke-owner'
const eventCount = Number(process.env.RCS_MEMORY_EVENTS || 10_000)
const streamCycles = Number(process.env.RCS_MEMORY_SSE_CYCLES || 500)
const warmIdleMs = Number(process.env.RCS_MEMORY_WARM_IDLE_MS || 120_000)
const cooldownMs = Number(process.env.RCS_MEMORY_COOLDOWN_MS || 30_000)
const startedAt = Date.now()

const server = Bun.spawn([process.execPath, 'src/index.ts'], {
  cwd: packageRoot,
  env: {
    ...process.env,
    RCS_PORT: String(port),
    RCS_HOST: '127.0.0.1',
    RCS_DB_PATH: databasePath,
  },
  stdout: 'ignore',
  stderr: 'ignore',
})

async function wait(ms: number) {
  await new Promise(resolveWait => setTimeout(resolveWait, ms))
}

async function waitForHealth() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await wait(100)
  }
  throw new Error('RCS memory smoke server did not become healthy')
}

async function rssKiB(): Promise<number> {
  const sample = Bun.spawn(['ps', '-o', 'rss=', '-p', String(server.pid)], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const output = await new Response(sample.stdout).text()
  const exitCode = await sample.exited
  if (exitCode !== 0) {
    throw new Error(`ps failed for RCS process ${server.pid}`)
  }
  return Number(output.trim())
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init)
  const body = await response.json()
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(body)}`)
  }
  return body as Record<string, unknown>
}

async function sample(phase: string, durableEvents: number) {
  console.log(
    [phase, Date.now() - startedAt, await rssKiB(), durableEvents].join(','),
  )
}

console.log('phase,elapsed_ms,rss_kib,durable_events')
try {
  await waitForHealth()
  await sample('ready', 0)
  await wait(warmIdleMs)
  await sample('warm_idle', 0)

  const session = await requestJson(`/web/sessions?uuid=${owner}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Memory smoke' }),
  })
  const sessionId = String(session.id)

  for (let offset = 0; offset < eventCount; offset += 100) {
    await Promise.all(
      Array.from({ length: Math.min(100, eventCount - offset) }, (_, index) => {
        const sequence = offset + index + 1
        return requestJson(`/web/sessions/${sessionId}/events?uuid=${owner}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'assistant',
            uuid: `memory-${sequence}`,
            content: `payload-${sequence}`,
          }),
        })
      }),
    )
  }
  await sample('durable_events', eventCount)

  for (let cycle = 0; cycle < streamCycles; cycle++) {
    const controller = new AbortController()
    const response = await fetch(
      `${baseUrl}/web/sessions/${sessionId}/events?uuid=${owner}&from_sequence_num=${eventCount}`,
      { signal: controller.signal },
    )
    if (!response.ok || !response.body) {
      throw new Error(`SSE cycle failed with ${response.status}`)
    }
    const reader = response.body.getReader()
    await reader.read()
    controller.abort()
    try {
      await reader.cancel()
    } catch {
      // Expected when abort closes the transport first.
    }
  }
  await sample('sse_cycles', eventCount)

  await requestJson(`/web/sessions/${sessionId}/archive?uuid=${owner}`, {
    method: 'POST',
  })
  await wait(cooldownMs)
  await sample('archive_cooldown', eventCount + 1)
} finally {
  server.kill('SIGTERM')
  await server.exited
  await rm(temporaryRoot, { recursive: true, force: true })
}

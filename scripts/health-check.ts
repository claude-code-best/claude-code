#!/usr/bin/env bun

const host = process.env.RCS_HOST || '127.0.0.1'
const port = process.env.RCS_PORT || '3000'
const baseUrl = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`

async function check(path: '/health' | '/ready'): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(2_000),
    })
    if (!response.ok) {
      console.error(`[health] ${path} returned HTTP ${response.status}`)
      return false
    }
    const body = (await response.json()) as Record<string, unknown>
    if (path === '/ready' && body.control_lane !== true) {
      console.error('[health] /ready reports no control lane')
      return false
    }
    console.log(`[health] ${path} ok`)
    return true
  } catch (error) {
    console.error(
      `[health] ${path} unavailable: ${error instanceof Error ? error.message : 'request failed'}`,
    )
    return false
  }
}

const healthy = await check('/health')
const ready = await check('/ready')
process.exitCode = healthy && ready ? 0 : 1

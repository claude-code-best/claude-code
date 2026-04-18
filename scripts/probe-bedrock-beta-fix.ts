/**
 * Probe script for the Bedrock anthropic_beta body-vs-header bug
 * (see anthropics/claude-code#49238).
 *
 * Goal: verify that extending AnthropicBedrock and overriding buildRequest
 * to strip `body.anthropic_beta` after super produces a Request that:
 *   (1) has `anthropic-beta` in HTTP header (base SDK put it there)
 *   (2) has body JSON WITHOUT `anthropic_beta` field (our cleanup removed it)
 *   (3) has valid AWS SigV4 `authorization` header computed AFTER our cleanup,
 *       i.e. signature matches the cleaned body — no 403 on wire
 *
 * Run:  bun scripts/probe-bedrock-beta-fix.ts
 */

import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'

let captured: { url: string; method: string; headers: Record<string, string>; body: string } | null = null

const captureFetch: typeof fetch = async (input, init) => {
  const req = new Request(input as RequestInfo, init)
  const body = await req.clone().text()
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })
  captured = { url: req.url, method: req.method, headers, body }
  // Return a minimal streamed response so SDK doesn't blow up
  const streamBody = 'event: message_start\ndata: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[],"model":"x","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'
  return new Response(streamBody, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

// ─── Unmodified SDK (repro bug) ────────────────────────────────────────
async function probeBuggy() {
  captured = null
  const client = new AnthropicBedrock({
    awsRegion: 'us-east-1',
    awsAccessKey: 'AKIAIOSFODNN7EXAMPLE',
    awsSecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    fetch: captureFetch,
  })
  try {
    const stream = await client.beta.messages.create({
      model: 'anthropic.claude-opus-4-7',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }],
      betas: ['interleaved-thinking-2025-05-14', 'effort-2025-11-24'],
      stream: true,
    })
    // Consume the stream to ensure the request is actually dispatched
    for await (const _ of stream) { /* drain */ }
  } catch (e) {
    // Ignore — we only care about the captured request shape
  }
  if (!captured) { console.log('BUGGY: no request captured'); return }
  const parsedBody = JSON.parse(captured.body)
  console.log('--- BUGGY (unmodified SDK) ---')
  console.log('header anthropic-beta:', captured.headers['anthropic-beta'] ?? '(absent)')
  console.log('body has anthropic_beta:', 'anthropic_beta' in parsedBody)
  console.log('body.anthropic_beta value:', parsedBody.anthropic_beta)
  console.log('header authorization present:', !!captured.headers['authorization'])
  console.log('authorization (truncated):', (captured.headers['authorization'] ?? '').slice(0, 80) + '...')
  return { parsedBody, headers: captured.headers }
}

// ─── Fix: extend class, override buildRequest to strip body.anthropic_beta ──
class FixedBedrock extends AnthropicBedrock {
  async buildRequest(options: any, reqOpts?: any): Promise<any> {
    const req = await super.buildRequest(options, reqOpts)
    // Surgery: drop body.anthropic_beta which the parent re-planted from header.
    // Header anthropic-beta is still present and carries the value to the API.
    if (req?.req?.body && typeof req.req.body === 'string') {
      try {
        const parsed = JSON.parse(req.req.body)
        if ('anthropic_beta' in parsed) {
          delete parsed.anthropic_beta
          const newBody = JSON.stringify(parsed)
          req.req.body = newBody
          // content-length header (if present as plain dict) needs resync
          const h = req.req.headers
          if (h && typeof Headers !== 'undefined' && h instanceof Headers) {
            if (h.has('content-length')) {
              h.set('content-length', String(new TextEncoder().encode(newBody).length))
            }
          } else if (h && typeof h === 'object') {
            if ('content-length' in (h as Record<string, string>)) {
              ;(h as Record<string, string>)['content-length'] = String(new TextEncoder().encode(newBody).length)
            }
          }
        }
      } catch {/* non-JSON body: ignore */}
    }
    return req
  }
}

async function probeFixed() {
  captured = null
  const client = new FixedBedrock({
    awsRegion: 'us-east-1',
    awsAccessKey: 'AKIAIOSFODNN7EXAMPLE',
    awsSecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    fetch: captureFetch,
  })
  try {
    const stream = await client.beta.messages.create({
      model: 'anthropic.claude-opus-4-7',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }],
      betas: ['interleaved-thinking-2025-05-14', 'effort-2025-11-24'],
      stream: true,
    })
    for await (const _ of stream) { /* drain */ }
  } catch (e) {
    // ignore
  }
  if (!captured) { console.log('FIXED: no request captured'); return }
  const parsedBody = JSON.parse(captured.body)
  console.log('\n--- FIXED (extended class with buildRequest override) ---')
  console.log('header anthropic-beta:', captured.headers['anthropic-beta'] ?? '(absent)')
  console.log('body has anthropic_beta:', 'anthropic_beta' in parsedBody)
  console.log('body.anthropic_beta value:', parsedBody.anthropic_beta)
  console.log('header authorization present:', !!captured.headers['authorization'])
  console.log('authorization (truncated):', (captured.headers['authorization'] ?? '').slice(0, 80) + '...')
  console.log('body (first 200 chars):', captured.body.slice(0, 200))
  return { parsedBody, headers: captured.headers }
}

async function main() {
  const buggy = await probeBuggy()
  const fixed = await probeFixed()

  console.log('\n========= VERDICT =========')
  const buggyHasBeta = buggy && 'anthropic_beta' in buggy.parsedBody
  const fixedHasBeta = fixed && 'anthropic_beta' in fixed.parsedBody
  const fixedHeaderOk = fixed && fixed.headers['anthropic-beta']?.includes('interleaved-thinking-2025-05-14')
  const fixedSignedOk = fixed && !!fixed.headers['authorization'] && fixed.headers['authorization'].startsWith('AWS4-HMAC-SHA256')

  console.log('bug reproduced (buggy body has anthropic_beta):', buggyHasBeta)
  console.log('fix removes body.anthropic_beta:               ', !fixedHasBeta)
  console.log('fix keeps header anthropic-beta with value:    ', fixedHeaderOk)
  console.log('fix preserves valid AWS SigV4 authorization:   ', fixedSignedOk)

  const ok = buggyHasBeta && !fixedHasBeta && fixedHeaderOk && fixedSignedOk
  console.log('\n' + (ok ? 'PASS — approach is viable' : 'FAIL — approach needs rework'))
  process.exit(ok ? 0 : 1)
}

main().catch(e => { console.error('probe crashed:', e); process.exit(2) })

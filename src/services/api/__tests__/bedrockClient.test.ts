/**
 * Tests for the Bedrock anthropic_beta body-vs-header workaround
 * (see src/services/api/bedrockClient.ts and anthropics/claude-code#49238).
 */
import { describe, expect, test } from 'bun:test'
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import { BedrockClient } from '../bedrockClient.js'

type Captured = {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

function makeCaptureFetch(): {
  fetch: typeof fetch
  get(): Captured | null
} {
  let captured: Captured | null = null
  const capture = async (
    input: URL | RequestInfo,
    init?: RequestInit,
  ): Promise<Response> => {
    const req = new Request(input as RequestInfo, init)
    const body = await req.clone().text()
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v
    })
    captured = { url: req.url, method: req.method, headers, body }
    const streamBody =
      'event: message_start\ndata: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[],"model":"x","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'
    return new Response(streamBody, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  // SDK only calls the fetch function form, never the static `preconnect` that
  // Bun/Node's `typeof fetch` declares. Cast is safe (mirrors openai/client.ts).
  return { fetch: capture as unknown as typeof fetch, get: () => captured }
}

const BEDROCK_ARGS = {
  awsRegion: 'us-east-1',
  awsAccessKey: 'AKIAIOSFODNN7EXAMPLE',
  awsSecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
}
const REQUEST_PARAMS = {
  model: 'anthropic.claude-opus-4-7',
  max_tokens: 10,
  messages: [{ role: 'user' as const, content: 'hi' }],
  betas: ['interleaved-thinking-2025-05-14', 'effort-2025-11-24'],
  stream: true as const,
}

async function dispatch(client: AnthropicBedrock): Promise<void> {
  try {
    const stream = await client.beta.messages.create(REQUEST_PARAMS)
    for await (const _ of stream) {
      /* drain */
    }
  } catch {
    /* ignore: only the captured request shape matters */
  }
}

describe('BedrockClient.buildRequest body.anthropic_beta cleanup', () => {
  test('BUG REPRO: unmodified AnthropicBedrock puts anthropic_beta in body', async () => {
    const { fetch: captureFetch, get } = makeCaptureFetch()
    const client = new AnthropicBedrock({
      ...BEDROCK_ARGS,
      fetch: captureFetch,
    })
    await dispatch(client)
    const c = get()
    expect(c).not.toBeNull()
    const body = JSON.parse(c!.body) as Record<string, unknown>
    expect('anthropic_beta' in body).toBe(true)
    expect(body.anthropic_beta).toEqual([
      'interleaved-thinking-2025-05-14',
      'effort-2025-11-24',
    ])
  })

  test('FIX: BedrockClient strips anthropic_beta from body', async () => {
    const { fetch: captureFetch, get } = makeCaptureFetch()
    const client = new BedrockClient({ ...BEDROCK_ARGS, fetch: captureFetch })
    await dispatch(client)
    const c = get()
    expect(c).not.toBeNull()
    const body = JSON.parse(c!.body) as Record<string, unknown>
    expect('anthropic_beta' in body).toBe(false)
  })

  test('FIX preserves anthropic-beta HTTP header with the original csv value', async () => {
    const { fetch: captureFetch, get } = makeCaptureFetch()
    const client = new BedrockClient({ ...BEDROCK_ARGS, fetch: captureFetch })
    await dispatch(client)
    const c = get()
    expect(c).not.toBeNull()
    expect(c!.headers['anthropic-beta']).toBe(
      'interleaved-thinking-2025-05-14,effort-2025-11-24',
    )
  })

  test('FIX keeps a valid AWS SigV4 authorization header (signing happens after cleanup)', async () => {
    const { fetch: captureFetch, get } = makeCaptureFetch()
    const client = new BedrockClient({ ...BEDROCK_ARGS, fetch: captureFetch })
    await dispatch(client)
    const c = get()
    expect(c).not.toBeNull()
    expect(c!.headers.authorization).toBeDefined()
    expect(c!.headers.authorization.startsWith('AWS4-HMAC-SHA256')).toBe(true)
  })

  test('FIX does not disturb requests that never had anthropic_beta', async () => {
    const { fetch: captureFetch, get } = makeCaptureFetch()
    const client = new BedrockClient({ ...BEDROCK_ARGS, fetch: captureFetch })
    try {
      const stream = await client.beta.messages.create({
        model: 'anthropic.claude-opus-4-7',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      })
      for await (const _ of stream) {
        /* drain */
      }
    } catch {
      /* ignore */
    }
    const c = get()
    expect(c).not.toBeNull()
    const body = JSON.parse(c!.body) as Record<string, unknown>
    expect('anthropic_beta' in body).toBe(false)
    expect(c!.headers['anthropic-beta']).toBeUndefined()
  })
})

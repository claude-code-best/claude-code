import { afterEach, describe, expect, mock, test } from 'bun:test'
import { uploadArtifact } from '../client.js'

const originalFetch = globalThis.fetch

function mockFetch(body: object, status = 200): typeof fetch {
  return mock((_url: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  ) as unknown as typeof fetch
}

describe('uploadArtifact', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('returns id/url/expiresAt on successful upload', async () => {
    globalThis.fetch = mockFetch({
      id: 'V1StGXR8_Z5jdHi6B',
      url: 'https://cloud-artifacts.claude-code-best.win/7d/V1StGXR8_Z5jdHi6B.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
    })

    const result = await uploadArtifact({
      html: '<h1>hello</h1>',
      token: 'test-token',
      uploadUrl: 'https://example.test/upload',
    })

    expect(result).toEqual({
      id: 'V1StGXR8_Z5jdHi6B',
      url: 'https://cloud-artifacts.claude-code-best.win/7d/V1StGXR8_Z5jdHi6B.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
    })
  })

  test('passes hash as query param when provided', async () => {
    const fetchMock = mockFetch({
      id: 'my-id',
      url: 'https://x/y.html',
      expiresAt: '2026-06-27T00:00:00.000Z',
    })
    globalThis.fetch = fetchMock

    await uploadArtifact({
      html: '<p>x</p>',
      token: 't',
      uploadUrl: 'https://example.test/upload',
      hash: 'my-id',
    })

    const calledUrl = (
      fetchMock as unknown as { mock: { calls: [string | URL | Request][] } }
    ).mock.calls[0][0]
    expect(calledUrl.toString()).toContain('hash=my-id')
  })

  test('passes ttl=30 query param when provided', async () => {
    const fetchMock = mockFetch({
      id: 'x',
      url: 'https://x',
      expiresAt: '2026-07-20T00:00:00.000Z',
    })
    globalThis.fetch = fetchMock

    await uploadArtifact({
      html: '<p>x</p>',
      token: 't',
      uploadUrl: 'https://example.test/upload',
      ttl: 30,
    })

    const calledUrl = (
      fetchMock as unknown as { mock: { calls: [string | URL | Request][] } }
    ).mock.calls[0][0]
    expect(calledUrl.toString()).toContain('ttl=30')
  })

  test('throws with error code when body contains {error} (Deno Deploy flattens status)', async () => {
    globalThis.fetch = mockFetch({ error: 'payload_too_large' }, 200)

    await expect(
      uploadArtifact({
        html: 'x'.repeat(100),
        token: 't',
        uploadUrl: 'https://example.test/upload',
      }),
    ).rejects.toThrow(/payload_too_large/)
  })

  test('throws on non-JSON body', async () => {
    globalThis.fetch = mock((_u: string | URL | Request) =>
      Promise.resolve(new Response('Internal Server Error', { status: 500 })),
    ) as unknown as typeof fetch

    await expect(
      uploadArtifact({
        html: '<p/>',
        token: 't',
        uploadUrl: 'https://example.test/upload',
      }),
    ).rejects.toThrow()
  })
})

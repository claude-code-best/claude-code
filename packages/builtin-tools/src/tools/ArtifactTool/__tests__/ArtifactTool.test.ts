import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { ArtifactTool } from '../ArtifactTool.js'

const TEST_DIR = join(tmpdir(), 'artifact-tool-test')
const TEST_FILE = join(TEST_DIR, 'report.html')
const MD_FILE = join(TEST_DIR, 'report.md')
const TXT_FILE = join(TEST_DIR, 'notes.txt')
const MISSING_FILE = join(TEST_DIR, 'does-not-exist.html')
const DIR_AS_FILE = TEST_DIR

const originalFetch = globalThis.fetch

function mockFetchSuccess(body: object): typeof fetch {
  return mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  ) as unknown as typeof fetch
}

describe('ArtifactTool.call', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    writeFileSync(TEST_FILE, '<h1>test report</h1>', 'utf8')
    writeFileSync(
      MD_FILE,
      '# MD Report\n\n| a | b |\n| - | - |\n| 1 | 2 |\n',
      'utf8',
    )
    writeFileSync(TXT_FILE, 'plain text content', 'utf8')
    process.env.CLAUDE_ARTIFACTS_TOKEN = 'test-token'
    process.env.CLAUDE_ARTIFACTS_URL = 'https://example.test'
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
    delete process.env.CLAUDE_ARTIFACTS_TOKEN
    delete process.env.CLAUDE_ARTIFACTS_URL
    globalThis.fetch = originalFetch
  })

  test('uploads existing HTML file and returns id/url/expiresAt', async () => {
    globalThis.fetch = mockFetchSuccess({
      id: 'abc123',
      url: 'https://example.test/7d/abc123.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
    })

    const result = await ArtifactTool.call({ file_path: TEST_FILE, ttl: 7 })

    expect(result.data).toMatchObject({
      id: 'abc123',
      url: 'https://example.test/7d/abc123.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
    })
    expect((result.data as { error?: string }).error).toBeUndefined()
  })

  test('passes hash through when overwriting', async () => {
    const fetchMock = mockFetchSuccess({
      id: 'stable-id',
      url: 'https://example.test/7d/stable-id.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
    })
    globalThis.fetch = fetchMock

    await ArtifactTool.call({ file_path: TEST_FILE, hash: 'stable-id', ttl: 7 })

    const calledUrl = (
      fetchMock as unknown as { mock: { calls: [string | URL | Request][] } }
    ).mock.calls[0][0]
    expect(calledUrl.toString()).toContain('hash=stable-id')
  })

  test('returns error when file does not exist (no HTTP call)', async () => {
    let fetchCalled = false
    globalThis.fetch = mock(() => {
      fetchCalled = true
      return Promise.resolve(new Response('{}'))
    }) as unknown as typeof fetch

    const result = await ArtifactTool.call({ file_path: MISSING_FILE, ttl: 7 })

    expect(fetchCalled).toBe(false)
    expect((result.data as { error?: string }).error).toContain(
      'does not exist',
    )
  })

  test('returns error when path is a directory', async () => {
    const result = await ArtifactTool.call({ file_path: DIR_AS_FILE, ttl: 7 })

    expect((result.data as { error?: string }).error).toContain(
      'not a regular file',
    )
  })

  test('returns error verbatim when backend rejects', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'payload_too_large' }), {
          status: 200,
        }),
      ),
    ) as unknown as typeof fetch

    // Force the size guard to pass by writing a small file but having backend complain.
    const result = await ArtifactTool.call({ file_path: TEST_FILE, ttl: 7 })

    expect((result.data as { error?: string }).error).toContain(
      'payload_too_large',
    )
  })

  test('converts .md file to styled HTML before upload', async () => {
    const fetchMock = mockFetchSuccess({
      id: 'md-id',
      url: 'https://example.test/7d/md-id.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
    })
    globalThis.fetch = fetchMock

    const result = await ArtifactTool.call({ file_path: MD_FILE, ttl: 7 })

    expect(result.data).toMatchObject({ id: 'md-id' })
    expect((result.data as { error?: string }).error).toBeUndefined()

    const calls = (
      fetchMock as unknown as {
        mock: { calls: [string | URL | Request, RequestInit | undefined][] }
      }
    ).mock.calls
    expect(calls.length).toBe(1)
    const body = String(calls[0][1]?.body)
    expect(body.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(body).toContain('<h1>MD Report</h1>')
    expect(body).toContain('<table>')
    expect(body).toContain('<title>MD Report</title>')
    // Content-Type header must remain text/html — the Worker only accepts HTML.
    expect(calls[0][1]?.headers).toMatchObject({ 'Content-Type': 'text/html' })
  })

  test('rejects unsupported extension without calling fetch', async () => {
    let fetchCalled = false
    globalThis.fetch = mock(() => {
      fetchCalled = true
      return Promise.resolve(new Response('{}'))
    }) as unknown as typeof fetch

    const result = await ArtifactTool.call({ file_path: TXT_FILE, ttl: 7 })

    expect(fetchCalled).toBe(false)
    expect((result.data as { error?: string }).error).toContain(
      'Unsupported file extension',
    )
    expect((result.data as { error?: string }).error).toContain('.md')
  })
})

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { uploadCodexBase64Image } from '../imageUpload.js'

describe('codex image upload', () => {
  const originalFetch = globalThis.fetch
  const originalImgbbApiKey = process.env.CODEX_IMGBB_API_KEY
  const originalUploadTimeout = process.env.CODEX_IMAGE_UPLOAD_TIMEOUT_MS
  const originalLegacyTimeout = process.env.CODEX_IMAGE_URL_TIMEOUT_MS

  beforeEach(() => {
    process.env.CODEX_IMGBB_API_KEY = 'imgbb-test-key'
    delete process.env.CODEX_IMAGE_UPLOAD_TIMEOUT_MS
    delete process.env.CODEX_IMAGE_URL_TIMEOUT_MS
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalImgbbApiKey === undefined) {
      delete process.env.CODEX_IMGBB_API_KEY
    } else {
      process.env.CODEX_IMGBB_API_KEY = originalImgbbApiKey
    }
    if (originalUploadTimeout === undefined) {
      delete process.env.CODEX_IMAGE_UPLOAD_TIMEOUT_MS
    } else {
      process.env.CODEX_IMAGE_UPLOAD_TIMEOUT_MS = originalUploadTimeout
    }
    if (originalLegacyTimeout === undefined) {
      delete process.env.CODEX_IMAGE_URL_TIMEOUT_MS
    } else {
      process.env.CODEX_IMAGE_URL_TIMEOUT_MS = originalLegacyTimeout
    }
  })

  test('uploads inline base64 images to ImgBB and caches the result', async () => {
    let fetchCalls = 0
    globalThis.fetch = (async (input: string | URL | Request) => {
      fetchCalls += 1
      expect(String(input)).toBe(
        'https://api.imgbb.com/1/upload?key=imgbb-test-key',
      )
      return new Response(
        JSON.stringify({ data: { url: 'https://i.ibb.co/base64.png' } }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const first = await uploadCodexBase64Image('YWJj', 'image/png')
    const second = await uploadCodexBase64Image('YWJj', 'image/png')

    expect(first).toBe('https://i.ibb.co/base64.png')
    expect(second).toBe('https://i.ibb.co/base64.png')
    expect(fetchCalls).toBe(1)
  })

  test('prefers ImgBB derived variants before the raw url', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: {
            url: 'https://i.ibb.co/raw/base64.png',
            image: { url: 'https://i.ibb.co/image/base64.png' },
            thumb: { url: 'https://i.ibb.co/thumb/base64.png' },
            medium: { url: 'https://i.ibb.co/medium/base64.png' },
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch

    const url = await uploadCodexBase64Image('ZGVm', 'image/png')

    expect(url).toBe('https://i.ibb.co/medium/base64.png')
  })

  test('prefers the new upload timeout env name over the legacy one', async () => {
    let aborted = false
    process.env.CODEX_IMAGE_UPLOAD_TIMEOUT_MS = '1'
    process.env.CODEX_IMAGE_URL_TIMEOUT_MS = '1000'
    globalThis.fetch = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const signal = init?.signal
      if (!(signal instanceof AbortSignal)) {
        throw new Error('Expected AbortSignal')
      }

      await new Promise<void>(resolve => {
        signal.addEventListener('abort', () => {
          aborted = true
          resolve()
        })
      })

      throw new Error('aborted')
    }) as unknown as typeof fetch

    const url = await uploadCodexBase64Image('Z2hp', 'image/png')

    expect(url).toBeNull()
    expect(aborted).toBe(true)
  })
})

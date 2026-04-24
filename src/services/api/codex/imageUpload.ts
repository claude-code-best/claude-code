import { createHash } from 'crypto'
import { logForDebugging } from '../../../utils/debug.js'

const resolvedImageUrls = new Map<string, string>()
const DEFAULT_TIMEOUT_MS = 30_000
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload'

type ImgbbVariant = {
  url?: unknown
}

type ImgbbPayload = {
  data?: {
    url?: unknown
    display_url?: unknown
    image?: ImgbbVariant
    medium?: ImgbbVariant
    thumb?: ImgbbVariant
  }
}

function getUploadTimeoutMs(): number {
  const raw =
    process.env.CODEX_IMAGE_UPLOAD_TIMEOUT_MS ??
    process.env.CODEX_IMAGE_URL_TIMEOUT_MS
  if (!raw) {
    return DEFAULT_TIMEOUT_MS
  }

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
}

function getCacheKey(prefix: string, value: string): string {
  return `${prefix}:${createHash('sha256').update(value).digest('hex')}`
}

function getImgbbApiKey(): string | null {
  const apiKey = process.env.CODEX_IMGBB_API_KEY?.trim()
  return apiKey && apiKey.length > 0 ? apiKey : null
}

function pickImgbbImageUrl(payload: ImgbbPayload): string | null {
  const candidates = [
    payload.data?.medium?.url,
    payload.data?.thumb?.url,
    payload.data?.image?.url,
    payload.data?.url,
    payload.data?.display_url,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }

  return null
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getUploadTimeoutMs())

  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}

async function uploadToImgbb(
  base64Image: string,
): Promise<string | null> {
  const apiKey = getImgbbApiKey()
  if (!apiKey) {
    return null
  }

  try {
    const url = await withTimeout(async signal => {
      const body = new FormData()
      body.append('image', base64Image)

      const response = await fetch(`${IMGBB_UPLOAD_URL}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        body,
        signal,
      })

      if (!response.ok) {
        logForDebugging(
          `[Codex] ImgBB upload failed: ${response.status} ${response.statusText}`,
        )
        return null
      }

      return pickImgbbImageUrl((await response.json()) as ImgbbPayload)
    })

    if (!url) {
      logForDebugging('[Codex] ImgBB upload produced no usable URL.')
      return null
    }

    return url
  } catch (error) {
    logForDebugging(`[Codex] Failed to upload image to ImgBB: ${error}`)
    return null
  }
}

export async function uploadCodexBase64Image(
  data: string,
  mediaType: string = 'image/png',
): Promise<string | null> {
  const cacheKey = getCacheKey('base64', `${mediaType}:${data}`)
  const cached = resolvedImageUrls.get(cacheKey)
  if (cached) {
    return cached
  }

  const url = await uploadToImgbb(data)
  if (!url) {
    return null
  }

  resolvedImageUrls.set(cacheKey, url)
  return url
}

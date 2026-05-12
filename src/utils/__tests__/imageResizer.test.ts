/**
 * Tests for fix: 修复截图 MIME 类型硬编码导致 API 拒绝的问题
 *
 * macOS screencapture outputs PNG but the code was hardcoding "image/jpeg",
 * causing API errors. The fix detects the actual format from magic bytes.
 */
import { describe, expect, test } from 'bun:test'
import {
  detectImageFormatFromBase64,
  detectImageFormatFromBuffer,
} from '../imageResizer.js'

// ── Magic byte helpers ────────────────────────────────────────────────────────

/** PNG magic bytes: 0x89 0x50 0x4E 0x47 ... */
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** JPEG magic bytes: 0xFF 0xD8 0xFF */
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
/** GIF magic bytes: GIF89a */
const GIF_HEADER = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
/** WebP: RIFF....WEBP */
const WEBP_HEADER = Buffer.from([
  0x52,
  0x49,
  0x46,
  0x46, // RIFF
  0x00,
  0x00,
  0x00,
  0x00, // file size (placeholder)
  0x57,
  0x45,
  0x42,
  0x50, // WEBP
])

function toBase64(buf: Buffer): string {
  return buf.toString('base64')
}

// ── detectImageFormatFromBuffer ───────────────────────────────────────────────

describe('detectImageFormatFromBuffer', () => {
  test('detects PNG from magic bytes', () => {
    expect(detectImageFormatFromBuffer(PNG_HEADER)).toBe('image/png')
  })

  test('detects JPEG from magic bytes', () => {
    expect(detectImageFormatFromBuffer(JPEG_HEADER)).toBe('image/jpeg')
  })

  test('detects GIF from magic bytes', () => {
    expect(detectImageFormatFromBuffer(GIF_HEADER)).toBe('image/gif')
  })

  test('detects WebP from RIFF+WEBP magic bytes', () => {
    expect(detectImageFormatFromBuffer(WEBP_HEADER)).toBe('image/webp')
  })

  test('returns image/png as default for unknown format', () => {
    const unknown = Buffer.from([0x00, 0x01, 0x02, 0x03])
    expect(detectImageFormatFromBuffer(unknown)).toBe('image/png')
  })

  test('returns image/png for buffer shorter than 4 bytes', () => {
    expect(detectImageFormatFromBuffer(Buffer.from([0x89]))).toBe('image/png')
    expect(detectImageFormatFromBuffer(Buffer.alloc(0))).toBe('image/png')
  })
})

// ── detectImageFormatFromBase64 ───────────────────────────────────────────────

describe('detectImageFormatFromBase64', () => {
  test('detects PNG from base64-encoded PNG header', () => {
    expect(detectImageFormatFromBase64(toBase64(PNG_HEADER))).toBe('image/png')
  })

  test('detects JPEG from base64-encoded JPEG header', () => {
    expect(detectImageFormatFromBase64(toBase64(JPEG_HEADER))).toBe(
      'image/jpeg',
    )
  })

  test('detects GIF from base64-encoded GIF header', () => {
    expect(detectImageFormatFromBase64(toBase64(GIF_HEADER))).toBe('image/gif')
  })

  test('detects WebP from base64-encoded WebP header', () => {
    expect(detectImageFormatFromBase64(toBase64(WEBP_HEADER))).toBe(
      'image/webp',
    )
  })

  test('returns image/png as default for empty string', () => {
    expect(detectImageFormatFromBase64('')).toBe('image/png')
  })

  test('returns image/png for invalid base64', () => {
    // Should not throw — gracefully defaults
    expect(detectImageFormatFromBase64('!!!not-base64!!!')).toBe('image/png')
  })

  test('macOS screencapture PNG is not misidentified as JPEG', () => {
    // This is the core regression: PNG data must NOT return image/jpeg
    const result = detectImageFormatFromBase64(toBase64(PNG_HEADER))
    expect(result).not.toBe('image/jpeg')
    expect(result).toBe('image/png')
  })
})

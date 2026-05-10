/**
 * Encoding detection and conversion utilities for file I/O.
 *
 * Provides three-layer encoding detection (BOM → UTF-8 fatal → GBK fallback)
 * and Buffer/string conversion functions. Zero external dependencies — uses only
 * TextDecoder/TextEncoder APIs available in Bun/Node.js.
 */

/** Extended encoding type covering non-UTF-8 encodings used in CJK files */
export type FileEncoding = BufferEncoding | 'gbk'

/** Encoding name accepted by TextDecoder (string), broader than FileEncoding */
export type DetectedEncoding = string

/**
 * Detect the encoding of a buffer using three-layer detection:
 * 1. BOM (Byte Order Mark) detection
 * 2. UTF-8 fatal validation
 * 3. GBK fallback (most common non-UTF-8 CJK encoding)
 */
export function detectEncoding(buffer: Buffer): FileEncoding {
  // Layer 1: BOM detection
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return 'utf-16le'
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return 'utf-8'
  }

  // Layer 2: UTF-8 fatal validation
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return 'utf-8'
  } catch {
    // Not valid UTF-8, proceed to Layer 3
  }

  // Layer 3: GBK fallback
  try {
    new TextDecoder('gbk', { fatal: true }).decode(buffer)
    return 'gbk'
  } catch {
    // Not valid GBK, fall back to latin1 (single-byte, always succeeds)
    return 'latin1'
  }
}

/**
 * Decode a buffer using the specified encoding.
 * Unified decoding entry point for all file read paths.
 */
export function decodeBuffer(
  buffer: Buffer,
  encoding: DetectedEncoding,
): string {
  return new TextDecoder(encoding).decode(buffer)
}

/**
 * Encode a string to a Buffer using the specified encoding.
 * For non-standard encodings, falls back to UTF-8 if the runtime
 * doesn't support the encoding in Buffer.from.
 *
 * @returns buffer - the encoded bytes, converted - true if encoding was
 *   fallbacked to UTF-8 (caller should warn the user)
 */
export function encodeString(
  content: string,
  encoding: DetectedEncoding,
): { buffer: Buffer; converted: boolean } {
  if (encoding === 'utf-8' || encoding === 'utf8') {
    return { buffer: Buffer.from(content, 'utf-8'), converted: false }
  }
  if (encoding === 'utf-16le') {
    return { buffer: Buffer.from(content, 'utf-16le'), converted: false }
  }

  // Other encodings (e.g. gbk): try Buffer.from, fall back to UTF-8
  try {
    const buf = Buffer.from(content, encoding as BufferEncoding)
    return { buffer: buf, converted: false }
  } catch {
    return { buffer: Buffer.from(content, 'utf-8'), converted: true }
  }
}

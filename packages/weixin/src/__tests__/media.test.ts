import { describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import {
  aesEcbPaddedSize,
  buildCdnDownloadUrl,
  buildCdnUploadUrl,
  decryptAesEcb,
  encryptAesEcb,
  guessMediaType,
  parseAesKey,
} from '../media.js'
import { UploadMediaType } from '../types.js'

describe('AES-128-ECB', () => {
  test('encrypt then decrypt returns original data', () => {
    const key = randomBytes(16)
    const plaintext = Buffer.from('hello world test data!!')
    const ciphertext = encryptAesEcb(plaintext, key)
    expect(decryptAesEcb(ciphertext, key)).toEqual(plaintext)
  })

  test('different keys produce different ciphertext', () => {
    const plaintext = Buffer.from('test data')
    expect(encryptAesEcb(plaintext, randomBytes(16))).not.toEqual(
      encryptAesEcb(plaintext, randomBytes(16)),
    )
  })
})

describe('aesEcbPaddedSize', () => {
  test('pads to next 16-byte boundary', () => {
    expect(aesEcbPaddedSize(1)).toBe(16)
    expect(aesEcbPaddedSize(16)).toBe(32)
    expect(aesEcbPaddedSize(17)).toBe(32)
    expect(aesEcbPaddedSize(32)).toBe(48)
  })
})

describe('parseAesKey', () => {
  test('parses 16 raw bytes from base64', () => {
    const raw = randomBytes(16)
    expect(parseAesKey(raw.toString('base64'))).toEqual(raw)
  })

  test('parses hex-encoded key from base64', () => {
    const raw = randomBytes(16)
    const b64 = Buffer.from(raw.toString('hex'), 'ascii').toString('base64')
    expect(parseAesKey(b64)).toEqual(raw)
  })

  test('throws on invalid key length', () => {
    expect(() => parseAesKey(Buffer.from('short').toString('base64'))).toThrow(
      'Invalid aes_key',
    )
  })
})

describe('CDN URL builders', () => {
  test('buildCdnDownloadUrl encodes param', () => {
    expect(buildCdnDownloadUrl('abc=123', 'https://cdn.example.com')).toBe(
      'https://cdn.example.com/download?encrypted_query_param=abc%3D123',
    )
  })

  test('buildCdnUploadUrl encodes params', () => {
    expect(buildCdnUploadUrl('https://cdn.example.com', 'param1', 'key1')).toBe(
      'https://cdn.example.com/upload?encrypted_query_param=param1&filekey=key1',
    )
  })
})

describe('guessMediaType', () => {
  test('detects image extensions', () => {
    expect(guessMediaType('photo.jpg')).toBe(UploadMediaType.IMAGE)
    expect(guessMediaType('photo.png')).toBe(UploadMediaType.IMAGE)
    expect(guessMediaType('photo.webp')).toBe(UploadMediaType.IMAGE)
  })

  test('detects video extensions', () => {
    expect(guessMediaType('video.mp4')).toBe(UploadMediaType.VIDEO)
    expect(guessMediaType('video.mov')).toBe(UploadMediaType.VIDEO)
  })

  test('defaults to FILE for unknown extensions', () => {
    expect(guessMediaType('doc.pdf')).toBe(UploadMediaType.FILE)
    expect(guessMediaType('archive.zip')).toBe(UploadMediaType.FILE)
  })
})

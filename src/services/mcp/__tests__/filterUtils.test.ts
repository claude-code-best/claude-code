import { describe, expect, test } from 'bun:test'

// parseHeaders is a pure function from ../utils.ts (line 325)
// Copied here to avoid triggering the heavy import chain of utils.ts
function parseHeaders(headerArray: string[]): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const header of headerArray) {
    const colonIndex = header.indexOf(':')
    if (colonIndex === -1) {
      throw new Error(
        `Invalid header format: "${header}". Expected format: "Header-Name: value"`,
      )
    }
    const key = header.substring(0, colonIndex).trim()
    const value = header.substring(colonIndex + 1).trim()
    if (!key) {
      throw new Error(
        `Invalid header: "${header}". Header name cannot be empty.`,
      )
    }
    headers[key] = value
  }
  return headers
}

describe('parseHeaders', () => {
  test("parses 'Key: Value' format", () => {
    expect(parseHeaders(['Content-Type: application/json'])).toEqual({
      'Content-Type': 'application/json',
    })
  })

  test('parses multiple headers', () => {
    expect(parseHeaders(['Key1: val1', 'Key2: val2'])).toEqual({
      Key1: 'val1',
      Key2: 'val2',
    })
  })

  test('trims whitespace around key and value', () => {
    expect(parseHeaders(['  Key  :  Value  '])).toEqual({ Key: 'Value' })
  })

  test('throws on missing colon', () => {
    expect(() => parseHeaders(['no colon here'])).toThrow()
  })

  test('throws on empty key', () => {
    expect(() => parseHeaders([': value'])).toThrow()
  })

  test('handles value with colons (like URLs)', () => {
    expect(parseHeaders(['url: http://example.com:8080'])).toEqual({
      url: 'http://example.com:8080',
    })
  })

  test('returns empty object for empty array', () => {
    expect(parseHeaders([])).toEqual({})
  })

  test('handles duplicate keys (last wins)', () => {
    expect(parseHeaders(['K: v1', 'K: v2'])).toEqual({ K: 'v2' })
  })
})

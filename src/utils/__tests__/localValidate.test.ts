import { describe, expect, test } from 'bun:test'
import { isValidKey, validateKey } from '../localValidate.js'

describe('validateKey', () => {
  test('rejects empty', () => {
    expect(() => validateKey('')).toThrow(/empty/i)
  })

  test('rejects too long', () => {
    expect(() => validateKey('a'.repeat(129))).toThrow(/too long/i)
  })

  test('rejects path separators', () => {
    expect(() => validateKey('a/b')).toThrow(/invalid key chars/i)
    expect(() => validateKey('a\\b')).toThrow(/invalid key chars/i)
  })

  test('rejects null byte', () => {
    expect(() => validateKey('a\0b')).toThrow(/invalid key chars/i)
  })

  test('rejects spaces', () => {
    expect(() => validateKey('a b')).toThrow(/invalid key chars/i)
  })

  test('rejects unicode', () => {
    expect(() => validateKey('键名')).toThrow(/invalid key chars/i)
  })

  test('rejects leading dot', () => {
    expect(() => validateKey('.gitconfig')).toThrow(/leading dot/i)
    expect(() => validateKey('..parent')).toThrow(/leading dot/i)
    expect(() => validateKey('.')).toThrow(/leading dot/i)
  })

  test('rejects Windows reserved names (case-insensitive)', () => {
    for (const name of [
      'NUL',
      'CON',
      'PRN',
      'AUX',
      'COM1',
      'COM9',
      'LPT1',
      'LPT9',
    ]) {
      expect(() => validateKey(name)).toThrow(/windows reserved/i)
      expect(() => validateKey(name.toLowerCase())).toThrow(/windows reserved/i)
    }
  })

  test('accepts valid keys', () => {
    expect(() => validateKey('a')).not.toThrow()
    expect(() => validateKey('a_b')).not.toThrow()
    expect(() => validateKey('a-b')).not.toThrow()
    expect(() => validateKey('a.b')).not.toThrow()
    expect(() => validateKey('My_Key-2026.01')).not.toThrow()
    expect(() => validateKey('a'.repeat(128))).not.toThrow()
  })

  test('M6: Windows reserved name with extension is REJECTED', () => {
    // Windows aliases NUL.txt → NUL device regardless of extension.
    expect(() => validateKey('NUL.txt')).toThrow(/windows reserved/i)
    expect(() => validateKey('CON.foo')).toThrow(/windows reserved/i)
    expect(() => validateKey('COM1.bak')).toThrow(/windows reserved/i)
    expect(() => validateKey('lpt9.dat')).toThrow(/windows reserved/i)
  })

  test('Names containing reserved as substring are still allowed (myCON)', () => {
    expect(() => validateKey('myCON')).not.toThrow()
    expect(() => validateKey('CONfetti')).not.toThrow()
  })

  test('L2: bare ".." is rejected (leading-dot guard)', () => {
    expect(() => validateKey('..')).toThrow(/leading dot/i)
  })
})

describe('isValidKey', () => {
  test('returns true for valid keys', () => {
    expect(isValidKey('a_b')).toBe(true)
  })

  test('returns false for invalid keys', () => {
    expect(isValidKey('')).toBe(false)
    expect(isValidKey('.git')).toBe(false)
    expect(isValidKey('a/b')).toBe(false)
    expect(isValidKey('NUL')).toBe(false)
  })
})

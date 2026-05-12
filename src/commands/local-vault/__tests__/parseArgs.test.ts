import { describe, test, expect } from 'bun:test'
import { parseLocalVaultArgs } from '../parseArgs.js'

describe('parseLocalVaultArgs', () => {
  test('empty string → list', () => {
    expect(parseLocalVaultArgs('')).toEqual({ action: 'list' })
  })

  test('"list" → list', () => {
    expect(parseLocalVaultArgs('list')).toEqual({ action: 'list' })
  })

  test('set with key and value', () => {
    expect(parseLocalVaultArgs('set MY_KEY my-secret-value')).toEqual({
      action: 'set',
      key: 'MY_KEY',
      value: 'my-secret-value',
    })
  })

  test('set with value containing spaces', () => {
    expect(parseLocalVaultArgs('set MY_KEY value with spaces')).toEqual({
      action: 'set',
      key: 'MY_KEY',
      value: 'value with spaces',
    })
  })

  test('set without value → invalid', () => {
    const result = parseLocalVaultArgs('set MY_KEY')
    expect(result.action).toBe('invalid')
  })

  test('set without key → invalid', () => {
    const result = parseLocalVaultArgs('set')
    expect(result.action).toBe('invalid')
  })

  test('get without --reveal → reveal=false', () => {
    expect(parseLocalVaultArgs('get MY_KEY')).toEqual({
      action: 'get',
      key: 'MY_KEY',
      reveal: false,
    })
  })

  test('get with --reveal → reveal=true', () => {
    expect(parseLocalVaultArgs('get MY_KEY --reveal')).toEqual({
      action: 'get',
      key: 'MY_KEY',
      reveal: true,
    })
  })

  test('get with --reveal before key → reveal=true, key correctly resolved', () => {
    expect(parseLocalVaultArgs('get --reveal MY_KEY')).toEqual({
      action: 'get',
      key: 'MY_KEY',
      reveal: true,
    })
  })

  test('get without key → invalid', () => {
    const result = parseLocalVaultArgs('get')
    expect(result.action).toBe('invalid')
  })

  test('delete with key', () => {
    expect(parseLocalVaultArgs('delete MY_KEY')).toEqual({
      action: 'delete',
      key: 'MY_KEY',
    })
  })

  test('delete without key → invalid', () => {
    const result = parseLocalVaultArgs('delete')
    expect(result.action).toBe('invalid')
  })

  test('unknown sub-command → invalid', () => {
    const result = parseLocalVaultArgs('frobnicate')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toContain('frobnicate')
    }
  })

  test('"list" with trailing args still returns list action', () => {
    expect(parseLocalVaultArgs('list extra-arg')).toEqual({ action: 'list' })
  })

  test('set with key starting with "-" → invalid (reserved for flags)', () => {
    const r = parseLocalVaultArgs('set --some-flag value')
    expect(r.action).toBe('invalid')
    if (r.action === 'invalid') {
      expect(r.reason.toLowerCase()).toContain('flag')
    }
  })

  test('set with key starting with single "-" → invalid', () => {
    const r = parseLocalVaultArgs('set -k v')
    expect(r.action).toBe('invalid')
  })

  // ── M1 (codecov-100 audit #4): hyphen-like Unicode prefix rejection ──
  // U+2212 MINUS SIGN visually looks like '-' but the shell would not
  // round-trip it back to ASCII '-'. If we accepted such keys, the user
  // could store them but never retrieve them via the CLI.
  describe('M1: hyphen-like Unicode prefix rejection (audit #4)', () => {
    test('U+2212 MINUS SIGN prefix → invalid', () => {
      const r = parseLocalVaultArgs('set −key value')
      expect(r.action).toBe('invalid')
      if (r.action === 'invalid') {
        expect(r.reason.toLowerCase()).toContain('hyphen')
      }
    })

    test('U+2010 HYPHEN prefix → invalid', () => {
      const r = parseLocalVaultArgs('set ‐key value')
      expect(r.action).toBe('invalid')
    })

    test('U+2013 EN DASH prefix → invalid', () => {
      const r = parseLocalVaultArgs('set –key value')
      expect(r.action).toBe('invalid')
    })

    test('U+2014 EM DASH prefix → invalid', () => {
      const r = parseLocalVaultArgs('set —key value')
      expect(r.action).toBe('invalid')
    })

    test('U+FF0D FULLWIDTH HYPHEN-MINUS prefix → invalid', () => {
      const r = parseLocalVaultArgs('set －key value')
      expect(r.action).toBe('invalid')
    })

    test('non-hyphen unicode prefix is still allowed (e.g. CJK)', () => {
      // Defensive: we only reject hyphen-like; legitimate unicode keys
      // like '日本語' must still be accepted.
      const r = parseLocalVaultArgs('set 日本語key value')
      expect(r.action).toBe('set')
      if (r.action === 'set') {
        expect(r.key).toBe('日本語key')
        expect(r.value).toBe('value')
      }
    })

    test('underscore prefix is still allowed (not a hyphen)', () => {
      const r = parseLocalVaultArgs('set _under value')
      expect(r.action).toBe('set')
    })
  })
})

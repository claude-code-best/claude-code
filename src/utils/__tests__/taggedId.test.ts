import { describe, expect, test } from 'bun:test'
import { toTaggedId } from '../taggedId'

const BASE_58_CHARS =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

describe('toTaggedId', () => {
  test("zero UUID produces all base58 '1's (first char)", () => {
    const result = toTaggedId('user', '00000000-0000-0000-0000-000000000000')
    // base58 of 0 is all '1's (the first base58 character)
    expect(result).toBe('user_01' + '1'.repeat(22))
  })

  test('format is tag_01 + 22 base58 chars', () => {
    const result = toTaggedId('user', '550e8400-e29b-41d4-a716-446655440000')
    expect(result).toMatch(
      new RegExp(`^user_01[${BASE_58_CHARS.replace(/[-]/g, '\\-')}]{22}$`),
    )
  })

  test('output starts with the provided tag', () => {
    const result = toTaggedId('org', '550e8400-e29b-41d4-a716-446655440000')
    expect(result.startsWith('org_01')).toBe(true)
  })

  test('UUID with hyphens equals UUID without hyphens', () => {
    const withHyphens = toTaggedId(
      'user',
      '550e8400-e29b-41d4-a716-446655440000',
    )
    const withoutHyphens = toTaggedId(
      'user',
      '550e8400e29b41d4a716446655440000',
    )
    expect(withHyphens).toBe(withoutHyphens)
  })

  test('different tags produce different prefixes', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const userResult = toTaggedId('user', uuid)
    const orgResult = toTaggedId('org', uuid)
    const msgResult = toTaggedId('msg', uuid)
    // They share the same base58 suffix but different prefixes
    expect(userResult.slice(userResult.indexOf('_01') + 3)).toBe(
      orgResult.slice(orgResult.indexOf('_01') + 3),
    )
    expect(userResult).not.toBe(orgResult)
    expect(orgResult).not.toBe(msgResult)
  })

  test('different UUIDs produce different encoded parts', () => {
    const result1 = toTaggedId('user', '550e8400-e29b-41d4-a716-446655440000')
    const result2 = toTaggedId('user', '661f9500-f3ac-52e5-b827-557766550111')
    expect(result1).not.toBe(result2)
  })

  test('encoded part is always exactly 22 characters', () => {
    const uuids = [
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '550e8400-e29b-41d4-a716-446655440000',
      '00000000-0000-0000-0000-000000000001',
    ]
    for (const uuid of uuids) {
      const result = toTaggedId('test', uuid)
      const encoded = result.slice('test_01'.length)
      expect(encoded).toHaveLength(22)
    }
  })

  test('throws on invalid UUID (too short)', () => {
    expect(() => toTaggedId('user', 'abcdef')).toThrow(
      'Invalid UUID hex length',
    )
  })

  test('throws on invalid UUID (too long)', () => {
    expect(() =>
      toTaggedId('user', '550e8400e29b41d4a716446655440000ff'),
    ).toThrow('Invalid UUID hex length')
  })

  test("max UUID (all f's) produces valid base58 output", () => {
    const result = toTaggedId('user', 'ffffffff-ffff-ffff-ffff-ffffffffffff')
    expect(result.startsWith('user_01')).toBe(true)
    const encoded = result.slice('user_01'.length)
    for (const ch of encoded) {
      expect(BASE_58_CHARS).toContain(ch)
    }
  })
})

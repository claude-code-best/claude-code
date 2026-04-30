import { describe, expect, test } from 'bun:test'
import { extractPermissionReply } from '../monitor.js'

describe('extractPermissionReply', () => {
  test('parses allow replies', () => {
    expect(extractPermissionReply('yes abcde')).toEqual({
      requestId: 'abcde',
      behavior: 'allow',
    })
  })

  test('parses deny replies', () => {
    expect(extractPermissionReply('No abcde')).toEqual({
      requestId: 'abcde',
      behavior: 'deny',
    })
  })

  test('ignores unrelated text', () => {
    expect(extractPermissionReply('yes please do it')).toBeNull()
  })
})

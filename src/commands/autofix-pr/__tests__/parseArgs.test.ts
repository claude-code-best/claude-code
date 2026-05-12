import { describe, expect, test } from 'bun:test'
import { parseAutofixArgs } from '../parseArgs.js'

describe('parseAutofixArgs', () => {
  test('empty string returns invalid', () => {
    expect(parseAutofixArgs('')).toEqual({ action: 'invalid', reason: 'empty' })
  })

  test('whitespace-only returns invalid', () => {
    expect(parseAutofixArgs('   ')).toEqual({
      action: 'invalid',
      reason: 'empty',
    })
  })

  test('"stop" returns stop action', () => {
    expect(parseAutofixArgs('stop')).toEqual({ action: 'stop' })
  })

  test('"off" returns stop action', () => {
    expect(parseAutofixArgs('off')).toEqual({ action: 'stop' })
  })

  test('"stop" with surrounding whitespace returns stop action', () => {
    expect(parseAutofixArgs('  stop  ')).toEqual({ action: 'stop' })
  })

  test('digit-only string returns start with prNumber', () => {
    expect(parseAutofixArgs('386')).toEqual({ action: 'start', prNumber: 386 })
  })

  test('cross-repo owner/repo#n returns start with owner/repo/prNumber', () => {
    expect(parseAutofixArgs('anthropics/claude-code#999')).toEqual({
      action: 'start',
      owner: 'anthropics',
      repo: 'claude-code',
      prNumber: 999,
    })
  })

  test('cross-repo with dots in owner/repo', () => {
    expect(parseAutofixArgs('my.org/my.repo#42')).toEqual({
      action: 'start',
      owner: 'my.org',
      repo: 'my.repo',
      prNumber: 42,
    })
  })

  test('freeform text returns freeform action', () => {
    expect(parseAutofixArgs('fix the CI please')).toEqual({
      action: 'freeform',
      prompt: 'fix the CI please',
    })
  })

  test('invalid pattern (no hash) returns freeform', () => {
    expect(parseAutofixArgs('owner/repo')).toEqual({
      action: 'freeform',
      prompt: 'owner/repo',
    })
  })
})

import { describe, expect, test } from 'bun:test'
import {
  matchesNegativeKeyword,
  matchesKeepGoingKeyword,
} from '../userPromptKeywords'

describe('matchesNegativeKeyword', () => {
  test("matches 'wtf'", () => {
    expect(matchesNegativeKeyword('wtf is going on')).toBe(true)
  })

  test("matches 'shit'", () => {
    expect(matchesNegativeKeyword('this is shit')).toBe(true)
  })

  test("matches 'fucking broken'", () => {
    expect(matchesNegativeKeyword('this is fucking broken')).toBe(true)
  })

  test("does not match normal input like 'fix the bug'", () => {
    expect(matchesNegativeKeyword('fix the bug')).toBe(false)
  })

  test('is case-insensitive', () => {
    expect(matchesNegativeKeyword('WTF is this')).toBe(true)
    expect(matchesNegativeKeyword('This Sucks')).toBe(true)
  })

  test('matches partial word in sentence', () => {
    expect(matchesNegativeKeyword('please help, damn it')).toBe(true)
  })
})

describe('matchesKeepGoingKeyword', () => {
  test("matches exact 'continue'", () => {
    expect(matchesKeepGoingKeyword('continue')).toBe(true)
  })

  test("matches 'keep going'", () => {
    expect(matchesKeepGoingKeyword('keep going')).toBe(true)
  })

  test("matches 'go on'", () => {
    expect(matchesKeepGoingKeyword('go on')).toBe(true)
  })

  test("does not match 'cont'", () => {
    expect(matchesKeepGoingKeyword('cont')).toBe(false)
  })

  test('does not match empty string', () => {
    expect(matchesKeepGoingKeyword('')).toBe(false)
  })

  test("matches within larger sentence 'please continue'", () => {
    // 'continue' must be the entire prompt (lowercased), not a substring
    expect(matchesKeepGoingKeyword('please continue')).toBe(false)
  })

  test("matches 'keep going' in sentence", () => {
    expect(matchesKeepGoingKeyword('please keep going')).toBe(true)
  })

  test("matches 'go on' in sentence", () => {
    expect(matchesKeepGoingKeyword('yes, go on')).toBe(true)
  })

  test("is case-insensitive for 'continue'", () => {
    expect(matchesKeepGoingKeyword('Continue')).toBe(true)
    expect(matchesKeepGoingKeyword('CONTINUE')).toBe(true)
  })

  test("is case-insensitive for 'keep going'", () => {
    expect(matchesKeepGoingKeyword('Keep Going')).toBe(true)
  })
})

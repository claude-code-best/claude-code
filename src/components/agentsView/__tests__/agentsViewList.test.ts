import { describe, expect, test } from 'bun:test'
import type { SessionEntry } from '../../../cli/bg.js'
import {
  filterSessions,
  groupStartIndices,
  nextGroupIndex,
  previousGroupIndex,
} from '../agentsViewList.js'

function entry(overrides: Partial<SessionEntry>): SessionEntry {
  return {
    pid: 1,
    sessionId: 'session',
    cwd: '/tmp/project',
    startedAt: 0,
    kind: 'bg',
    ...overrides,
  }
}

describe('filterSessions', () => {
  const sessions = [
    entry({
      sessionId: 'aaa',
      name: 'frontend',
      cwd: '/repo/web',
      agent: 'builder',
    }),
    entry({ sessionId: 'bbb', name: 'backend', cwd: '/repo/api' }),
    entry({ sessionId: 'ccc', cwd: '/other' }),
  ]

  test('empty query returns everything', () => {
    expect(filterSessions(sessions, '')).toHaveLength(3)
    expect(filterSessions(sessions, '   ')).toHaveLength(3)
  })

  test('matches name case-insensitively', () => {
    expect(filterSessions(sessions, 'FRONT').map(s => s.sessionId)).toEqual([
      'aaa',
    ])
  })

  test('matches session id, cwd, and agent', () => {
    expect(filterSessions(sessions, 'bbb').map(s => s.sessionId)).toEqual([
      'bbb',
    ])
    expect(filterSessions(sessions, '/repo/').map(s => s.sessionId)).toEqual([
      'aaa',
      'bbb',
    ])
    expect(filterSessions(sessions, 'builder').map(s => s.sessionId)).toEqual([
      'aaa',
    ])
  })

  test('returns an empty list when nothing matches', () => {
    expect(filterSessions(sessions, 'zzz')).toEqual([])
  })
})

describe('group navigation', () => {
  // Groups: [0,1] cwd A, [2] cwd B, [3,4] cwd A again (pinned split)
  const sessions = [
    entry({ sessionId: 'a1', cwd: '/a' }),
    entry({ sessionId: 'a2', cwd: '/a' }),
    entry({ sessionId: 'b1', cwd: '/b' }),
    entry({ sessionId: 'a3', cwd: '/a' }),
    entry({ sessionId: 'a4', cwd: '/a' }),
  ]

  test('groupStartIndices finds contiguous cwd runs', () => {
    expect(groupStartIndices(sessions)).toEqual([0, 2, 3])
  })

  test('previousGroupIndex returns to the current group start first', () => {
    expect(previousGroupIndex(sessions, 4)).toBe(3)
    expect(previousGroupIndex(sessions, 3)).toBe(2)
    expect(previousGroupIndex(sessions, 2)).toBe(0)
    expect(previousGroupIndex(sessions, 0)).toBe(0)
  })

  test('nextGroupIndex jumps to the next group start', () => {
    expect(nextGroupIndex(sessions, 0)).toBe(2)
    expect(nextGroupIndex(sessions, 1)).toBe(2)
    expect(nextGroupIndex(sessions, 2)).toBe(3)
    expect(nextGroupIndex(sessions, 4)).toBe(4)
  })

  test('empty list is safe', () => {
    expect(previousGroupIndex([], 0)).toBe(0)
    expect(nextGroupIndex([], 0)).toBe(0)
  })
})

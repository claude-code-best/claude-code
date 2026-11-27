import { describe, expect, test } from 'bun:test'
import type { SessionEntry } from '../../../cli/bg.js'
import {
  buildCountsLine,
  filterSessions,
  formatRelativeTime,
  groupByStatus,
  nextGroupIndex,
  previousGroupIndex,
  sessionGroup,
  SESSION_GROUP_ICONS,
  SESSION_GROUP_LABELS,
  SESSION_GROUP_ORDER,
  SLASH_COMMANDS,
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

// ── Status groups (official: Needs input / Working / Completed) ────────────

describe('sessionGroup', () => {
  test('waitingFor wins over liveness (tmux-verified rule)', () => {
    const session = entry({ waitingFor: 'approval' })
    expect(sessionGroup(session, true)).toBe('needs-input')
    expect(sessionGroup(session, false)).toBe('needs-input')
  })

  test('alive without waitingFor → working', () => {
    expect(sessionGroup(entry({}), true)).toBe('working')
  })

  test('exited without waitingFor → completed', () => {
    expect(sessionGroup(entry({}), false)).toBe('completed')
  })

  test('group order, labels, and icons (✻/✶/∙)', () => {
    expect(SESSION_GROUP_ORDER).toEqual(['needs-input', 'working', 'completed'])
    expect(SESSION_GROUP_LABELS).toEqual({
      'needs-input': 'Needs input',
      working: 'Working',
      completed: 'Completed',
    })
    expect(SESSION_GROUP_ICONS['needs-input']).toBe('✻')
    expect(SESSION_GROUP_ICONS.working).toBe('✶')
    expect(SESSION_GROUP_ICONS.completed).toBe('∙')
  })
})

describe('groupByStatus', () => {
  // waiting (alive), working (alive), completed (exited) ×2
  const sessions = [
    entry({ sessionId: 'w1', waitingFor: 'approval' }),
    entry({ sessionId: 'work1' }),
    entry({ sessionId: 'done1' }),
    entry({ sessionId: 'done2' }),
  ]
  const alive = (s: SessionEntry) => !s.sessionId.startsWith('done')
  const grouped = groupByStatus(sessions, alive)

  test('groups in the official order: Needs input, Working, Completed', () => {
    expect(grouped.groups.map(g => g.key)).toEqual([
      'needs-input',
      'working',
      'completed',
    ])
    expect(grouped.flat.map(s => s.sessionId)).toEqual([
      'w1',
      'work1',
      'done1',
      'done2',
    ])
  })

  test('groupStartIndices point at each displayed group start', () => {
    expect(grouped.groupStartIndices).toEqual([0, 1, 2])
  })

  test('counts cover all groups including hidden ones', () => {
    expect(grouped.counts).toEqual({
      'needs-input': 1,
      working: 1,
      completed: 2,
    })
  })

  test('zero-count groups are hidden but still counted', () => {
    const only = groupByStatus([entry({ sessionId: 'only' })], () => true)
    expect(only.groups.map(g => g.key)).toEqual(['working'])
    expect(only.groupStartIndices).toEqual([0])
    expect(only.counts).toEqual({
      'needs-input': 0,
      working: 1,
      completed: 0,
    })
  })

  test('empty list is safe', () => {
    const empty = groupByStatus([], () => true)
    expect(empty.groups).toEqual([])
    expect(empty.flat).toEqual([])
    expect(empty.groupStartIndices).toEqual([])
  })
})

describe('group navigation (opt+↑/↓ jump groups)', () => {
  // Groups: [0] needs-input, [1..2] working, [3] completed
  const sessions = [
    entry({ sessionId: 'w1', waitingFor: 'approval' }),
    entry({ sessionId: 'work1' }),
    entry({ sessionId: 'work2' }),
    entry({ sessionId: 'done1' }),
  ]
  const alive = (s: SessionEntry) => !s.sessionId.startsWith('done')
  const grouped = groupByStatus(sessions, alive)

  test('previousGroupIndex returns to the current group start first', () => {
    // 3 is the completed group's start → jumps to the working group's start
    expect(previousGroupIndex(grouped, 3)).toBe(1)
    // 2 is inside the working group → returns to its start first
    expect(previousGroupIndex(grouped, 2)).toBe(1)
    // 1 is the working group's start → previous group (needs input)
    expect(previousGroupIndex(grouped, 1)).toBe(0)
    expect(previousGroupIndex(grouped, 0)).toBe(0)
  })

  test('nextGroupIndex jumps to the next group start', () => {
    expect(nextGroupIndex(grouped, 0)).toBe(1)
    expect(nextGroupIndex(grouped, 1)).toBe(3)
    expect(nextGroupIndex(grouped, 2)).toBe(3)
    expect(nextGroupIndex(grouped, 3)).toBe(3)
  })

  test('empty list is safe', () => {
    const empty = groupByStatus([], () => true)
    expect(previousGroupIndex(empty, 0)).toBe(0)
    expect(nextGroupIndex(empty, 0)).toBe(0)
  })
})

// ── Counts line (official: `1 awaiting input · 1 working · 2 completed`) ───

describe('buildCountsLine', () => {
  test('joins non-zero counts in the official order', () => {
    expect(
      buildCountsLine({ 'needs-input': 1, working: 1, completed: 2 }),
    ).toBe('1 awaiting input · 1 working · 2 completed')
  })

  test('omits zero-count groups', () => {
    expect(
      buildCountsLine({ 'needs-input': 0, working: 1, completed: 2 }),
    ).toBe('1 working · 2 completed')
    expect(
      buildCountsLine({ 'needs-input': 0, working: 0, completed: 3 }),
    ).toBe('3 completed')
    expect(
      buildCountsLine({ 'needs-input': 0, working: 0, completed: 0 }),
    ).toBe('')
  })
})

// ── formatRelativeTime (official: `0s` / `4s` / `9m` / `120d`) ─────────────

describe('formatRelativeTime', () => {
  const now = 1_785_000_000_000

  test('seconds under a minute', () => {
    expect(formatRelativeTime(now, now)).toBe('0s')
    expect(formatRelativeTime(now, now - 4_000)).toBe('4s')
    expect(formatRelativeTime(now, now - 59_999)).toBe('59s')
  })

  test('minutes under an hour', () => {
    expect(formatRelativeTime(now, now - 9 * 60_000)).toBe('9m')
    expect(formatRelativeTime(now, now - 59 * 60_000)).toBe('59m')
  })

  test('hours under a day', () => {
    expect(formatRelativeTime(now, now - 2 * 3_600_000)).toBe('2h')
    expect(formatRelativeTime(now, now - 23 * 3_600_000)).toBe('23h')
  })

  test('days beyond a day', () => {
    expect(formatRelativeTime(now, now - 120 * 86_400_000)).toBe('120d')
  })

  test('future timestamps clamp to 0s', () => {
    expect(formatRelativeTime(now, now + 30_000)).toBe('0s')
  })
})

// ── Slash-command autocomplete (official: /permissions /plan /plugin
//    /powerup appear in the completion list) ────────────────────────────────

describe('SLASH_COMMANDS', () => {
  test('contains the official completion list', () => {
    expect(SLASH_COMMANDS).toContain('permissions')
    expect(SLASH_COMMANDS).toContain('plan')
    expect(SLASH_COMMANDS).toContain('plugin')
    expect(SLASH_COMMANDS).toContain('powerup')
  })
})

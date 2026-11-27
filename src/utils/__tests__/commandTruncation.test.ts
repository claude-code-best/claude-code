import { describe, expect, test } from 'bun:test'
import {
  COMMAND_TRUNCATION_THRESHOLD,
  truncateCommandForClaude,
} from '../commandTruncation.js'

function makeCommand(length: number): string {
  return 'x'.repeat(length)
}

describe('truncateCommandForClaude (official 2.1.330 L1530: commands over 1,000 characters show Claude only the start and end)', () => {
  test('commands at or below 1000 characters pass through unchanged', () => {
    expect(truncateCommandForClaude('')).toBe('')
    expect(truncateCommandForClaude(makeCommand(999))).toBe(makeCommand(999))
    expect(truncateCommandForClaude(makeCommand(1000))).toBe(makeCommand(1000))
  })

  test('commands over 1000 characters are truncated to head + tail', () => {
    const out = truncateCommandForClaude(makeCommand(1001))
    expect(out).not.toBe(makeCommand(1001))
    // 450 head + marker + 450 tail
    expect(out.startsWith('x'.repeat(450))).toBe(true)
    expect(out.endsWith('x'.repeat(450))).toBe(true)
    // The marker records the original length so Claude knows the real size.
    expect(out).toContain('[1001 characters total]')
    expect(out).toContain('…')
  })

  test('the boundary is exactly at 1000 (999/1000/1001)', () => {
    expect(truncateCommandForClaude(makeCommand(999))).toHaveLength(999)
    expect(truncateCommandForClaude(makeCommand(1000))).toHaveLength(1000)
    // 1001: 450 head + `…[1001 characters total]…` marker + 450 tail = 925 —
    // the truncated form is SHORTER than the original (that is the point:
    // it saves context) while recording the original length.
    expect(truncateCommandForClaude(makeCommand(1001))).toHaveLength(925)
  })

  test('head and tail are the START and END of the original command', () => {
    const command = `${'a'.repeat(450)}MIDDLE${'b'.repeat(450)}END`
    // 450 + 6 + 450 + 3 = 909 — under the threshold, unchanged
    expect(truncateCommandForClaude(command)).toBe(command)

    const long = `${'a'.repeat(450)}…MISSING MIDDLE…${'b'.repeat(450)}END`
    // 450 + 17 + 450 + 3 = 920 — still under
    expect(truncateCommandForClaude(long)).toBe(long)

    const over = `${'a'.repeat(500)}MIDDLE${'b'.repeat(500)}`
    const out = truncateCommandForClaude(over)
    // Head keeps the first 450 a's; tail keeps the last 450 b's — the
    // middle (including the MIDDLE marker) is dropped.
    expect(out.startsWith('a'.repeat(450))).toBe(true)
    expect(out.endsWith('b'.repeat(450))).toBe(true)
    expect(out).not.toContain('MIDDLE')
  })

  test('threshold constant is 1000 (official: "over 1,000 characters")', () => {
    expect(COMMAND_TRUNCATION_THRESHOLD).toBe(1000)
  })
})

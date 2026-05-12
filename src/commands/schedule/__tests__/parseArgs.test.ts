import { describe, expect, test } from 'bun:test'
import {
  isValidCronExpression,
  parseScheduleArgs,
  splitCronAndPrompt,
} from '../parseArgs.js'

describe('splitCronAndPrompt', () => {
  test('splits 5 cron fields + prompt', () => {
    const result = splitCronAndPrompt('0 9 * * 1 Run standup')
    expect(result).toEqual({ cron: '0 9 * * 1', prompt: 'Run standup' })
  })

  test('handles multi-word prompt', () => {
    const result = splitCronAndPrompt(
      '0 9 * * * Generate daily report for team',
    )
    expect(result?.cron).toBe('0 9 * * *')
    expect(result?.prompt).toBe('Generate daily report for team')
  })

  test('returns null with fewer than 6 tokens', () => {
    expect(splitCronAndPrompt('0 9 * * *')).toBeNull()
    expect(splitCronAndPrompt('0 9 *')).toBeNull()
    expect(splitCronAndPrompt('')).toBeNull()
  })
})

describe('isValidCronExpression', () => {
  test('accepts valid 5-field expressions', () => {
    expect(isValidCronExpression('0 9 * * 1')).toBe(true)
    expect(isValidCronExpression('*/5 * * * *')).toBe(true)
    expect(isValidCronExpression('0 0 1 1 *')).toBe(true)
  })

  test('rejects expressions with wrong field count', () => {
    expect(isValidCronExpression('0 9 * *')).toBe(false)
    expect(isValidCronExpression('0 9 * * * *')).toBe(false)
    expect(isValidCronExpression('')).toBe(false)
  })
})

describe('parseScheduleArgs', () => {
  test('empty string → list', () => {
    expect(parseScheduleArgs('')).toEqual({ action: 'list' })
  })

  test('"list" → list', () => {
    expect(parseScheduleArgs('list')).toEqual({ action: 'list' })
  })

  test('"list" with extra whitespace → list', () => {
    expect(parseScheduleArgs('  list  ')).toEqual({ action: 'list' })
  })

  // ── get ───────────────────────────────────────────────────────────────────
  test('get <id> → get action', () => {
    expect(parseScheduleArgs('get trg_123')).toEqual({
      action: 'get',
      id: 'trg_123',
    })
  })

  test('get without id → invalid', () => {
    const result = parseScheduleArgs('get')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toMatch(/trigger id/i)
    }
  })

  // ── create ────────────────────────────────────────────────────────────────
  test('create with cron + prompt → create action', () => {
    const result = parseScheduleArgs('create 0 9 * * 1 Run daily standup')
    expect(result).toEqual({
      action: 'create',
      cron: '0 9 * * 1',
      prompt: 'Run daily standup',
    })
  })

  test('create without args → invalid', () => {
    const result = parseScheduleArgs('create')
    expect(result.action).toBe('invalid')
  })

  test('create with only cron (no prompt) → invalid', () => {
    const result = parseScheduleArgs('create 0 9 * * 1')
    expect(result.action).toBe('invalid')
  })

  // ── update ────────────────────────────────────────────────────────────────
  test('update <id> enabled false → update action', () => {
    const result = parseScheduleArgs('update trg_123 enabled false')
    expect(result).toEqual({
      action: 'update',
      id: 'trg_123',
      field: 'enabled',
      value: 'false',
    })
  })

  test('update <id> prompt new text → update action with multi-word value', () => {
    const result = parseScheduleArgs(
      'update trg_abc prompt New prompt text here',
    )
    expect(result).toEqual({
      action: 'update',
      id: 'trg_abc',
      field: 'prompt',
      value: 'New prompt text here',
    })
  })

  test('update missing field → invalid', () => {
    const result = parseScheduleArgs('update trg_123')
    expect(result.action).toBe('invalid')
  })

  test('update missing value → invalid', () => {
    const result = parseScheduleArgs('update trg_123 enabled')
    expect(result.action).toBe('invalid')
  })

  // ── delete ────────────────────────────────────────────────────────────────
  test('delete <id> → delete action', () => {
    expect(parseScheduleArgs('delete trg_del')).toEqual({
      action: 'delete',
      id: 'trg_del',
    })
  })

  test('delete without id → invalid', () => {
    const result = parseScheduleArgs('delete')
    expect(result.action).toBe('invalid')
  })

  // ── run ───────────────────────────────────────────────────────────────────
  test('run <id> → run action', () => {
    expect(parseScheduleArgs('run trg_run')).toEqual({
      action: 'run',
      id: 'trg_run',
    })
  })

  test('run without id → invalid', () => {
    const result = parseScheduleArgs('run')
    expect(result.action).toBe('invalid')
  })

  // ── enable / disable ──────────────────────────────────────────────────────
  test('enable <id> → enable action', () => {
    expect(parseScheduleArgs('enable trg_en')).toEqual({
      action: 'enable',
      id: 'trg_en',
    })
  })

  test('disable <id> → disable action', () => {
    expect(parseScheduleArgs('disable trg_dis')).toEqual({
      action: 'disable',
      id: 'trg_dis',
    })
  })

  test('enable without id → invalid', () => {
    const result = parseScheduleArgs('enable')
    expect(result.action).toBe('invalid')
  })

  test('disable without id → invalid', () => {
    const result = parseScheduleArgs('disable')
    expect(result.action).toBe('invalid')
  })

  // ── unknown subcommand ────────────────────────────────────────────────────
  test('unknown subcommand → invalid', () => {
    const result = parseScheduleArgs('foobar trg_123')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toMatch(/unknown sub-command/i)
    }
  })
})

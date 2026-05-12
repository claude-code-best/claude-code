import { describe, expect, test } from 'bun:test'
import { parseAgentsPlatformArgs, splitCronAndPrompt } from '../parseArgs.js'

describe('parseAgentsPlatformArgs', () => {
  test('empty string returns list', () => {
    const r = parseAgentsPlatformArgs('')
    expect(r.action).toBe('list')
  })

  test('"list" returns list', () => {
    const r = parseAgentsPlatformArgs('list')
    expect(r.action).toBe('list')
  })

  test('whitespace-only returns list', () => {
    const r = parseAgentsPlatformArgs('   ')
    expect(r.action).toBe('list')
  })

  test('create with valid cron and prompt', () => {
    const r = parseAgentsPlatformArgs('create 0 9 * * 1 Run daily standup')
    expect(r.action).toBe('create')
    if (r.action === 'create') {
      expect(r.cron).toBe('0 9 * * 1')
      expect(r.prompt).toBe('Run daily standup')
    }
  })

  test('create with multi-word prompt', () => {
    const r = parseAgentsPlatformArgs(
      'create 30 8 * * * Check emails and summarize',
    )
    expect(r.action).toBe('create')
    if (r.action === 'create') {
      expect(r.cron).toBe('30 8 * * *')
      expect(r.prompt).toBe('Check emails and summarize')
    }
  })

  test('create with missing prompt is invalid', () => {
    const r = parseAgentsPlatformArgs('create 0 9 * * 1')
    expect(r.action).toBe('invalid')
    if (r.action === 'invalid') {
      expect(r.reason).toContain('5 cron fields')
    }
  })

  test('create with no args is invalid', () => {
    const r = parseAgentsPlatformArgs('create')
    expect(r.action).toBe('invalid')
    if (r.action === 'invalid') {
      expect(r.reason).toContain('cron expression')
    }
  })

  test('delete with id', () => {
    const r = parseAgentsPlatformArgs('delete agt_abc123')
    expect(r.action).toBe('delete')
    if (r.action === 'delete') {
      expect(r.id).toBe('agt_abc123')
    }
  })

  test('delete without id is invalid', () => {
    const r = parseAgentsPlatformArgs('delete')
    expect(r.action).toBe('invalid')
    if (r.action === 'invalid') {
      expect(r.reason).toContain('agent id')
    }
  })

  test('run with id', () => {
    const r = parseAgentsPlatformArgs('run agt_xyz789')
    expect(r.action).toBe('run')
    if (r.action === 'run') {
      expect(r.id).toBe('agt_xyz789')
    }
  })

  test('run without id is invalid', () => {
    const r = parseAgentsPlatformArgs('run')
    expect(r.action).toBe('invalid')
    if (r.action === 'invalid') {
      expect(r.reason).toContain('agent id')
    }
  })

  test('unknown sub-command is invalid', () => {
    const r = parseAgentsPlatformArgs('foobar something')
    expect(r.action).toBe('invalid')
    if (r.action === 'invalid') {
      expect(r.reason).toContain('Unknown sub-command')
    }
  })
})

describe('splitCronAndPrompt', () => {
  test('splits 5-field cron from prompt', () => {
    const r = splitCronAndPrompt('0 9 * * 1 My prompt here')
    expect(r).not.toBeNull()
    expect(r?.cron).toBe('0 9 * * 1')
    expect(r?.prompt).toBe('My prompt here')
  })

  test('returns null if fewer than 6 tokens', () => {
    expect(splitCronAndPrompt('0 9 * * 1')).toBeNull()
    expect(splitCronAndPrompt('0 9 *')).toBeNull()
  })

  test('handles extra spaces in input', () => {
    const r = splitCronAndPrompt('  0  9  *  *  1  hello  world  ')
    expect(r).not.toBeNull()
    expect(r?.cron).toBe('0 9 * * 1')
    expect(r?.prompt).toBe('hello world')
  })
})

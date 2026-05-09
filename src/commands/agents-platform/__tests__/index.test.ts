/**
 * Tests for agents-platform/index.ts — command metadata only.
 * We verify load() resolves without error but do NOT mock launchAgentsPlatform,
 * to avoid polluting other test files via Bun's process-level mock.module cache.
 */
import { beforeAll, describe, expect, mock, test } from 'bun:test'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

let cmd: {
  load?: () => Promise<{ call: unknown }>
  isEnabled?: () => boolean
  name?: string
  type?: string
  aliases?: string[]
  bridgeSafe?: boolean
  availability?: string[]
}

beforeAll(async () => {
  const mod = await import('../index.js')
  cmd = mod.default as typeof cmd
})

describe('agentsPlatform index metadata', () => {
  test('command name is agents-platform', () => {
    expect(cmd.name).toBe('agents-platform')
  })

  test('command type is local-jsx', () => {
    expect(cmd.type).toBe('local-jsx')
  })

  test('isEnabled returns true', () => {
    expect(cmd.isEnabled?.()).toBe(true)
  })

  test('aliases includes agents and schedule-agent', () => {
    expect(cmd.aliases).toContain('agents')
    expect(cmd.aliases).toContain('schedule-agent')
  })

  test('bridgeSafe is false', () => {
    expect(cmd.bridgeSafe).toBe(false)
  })

  test('availability includes claude-ai', () => {
    expect(cmd.availability).toContain('claude-ai')
  })

  test('load() exists and is a function', () => {
    expect(typeof cmd.load).toBe('function')
  })

  test('load() resolves to object with call function', async () => {
    const loaded = await cmd.load!()
    expect(typeof (loaded as { call?: unknown }).call).toBe('function')
  })

  test('isHidden is boolean (dynamic: false when ANTHROPIC_API_KEY set, true when absent)', () => {
    // isHidden = !process.env['ANTHROPIC_API_KEY']
    expect(typeof (cmd as { isHidden?: unknown }).isHidden).toBe('boolean')
  })
})

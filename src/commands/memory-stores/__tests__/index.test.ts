/**
 * Tests for memory-stores/index.ts — command metadata only.
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
  description?: string
  bridgeSafe?: boolean
  availability?: string[]
}

beforeAll(async () => {
  const mod = await import('../index.js')
  cmd = mod.default as typeof cmd
})

describe('memoryStoresCommand metadata', () => {
  test('name is "memory-stores"', () => {
    expect(cmd.name).toBe('memory-stores')
  })

  test('type is local-jsx', () => {
    expect(cmd.type).toBe('local-jsx')
  })

  test('isEnabled returns true', () => {
    expect(cmd.isEnabled?.()).toBe(true)
  })

  test('aliases include mem and mstore', () => {
    expect(cmd.aliases).toContain('mem')
    expect(cmd.aliases).toContain('mstore')
  })

  test('bridgeSafe is false', () => {
    expect(cmd.bridgeSafe).toBe(false)
  })

  test('availability includes claude-ai', () => {
    expect(cmd.availability).toContain('claude-ai')
  })

  test('description mentions memory', () => {
    expect(cmd.description?.toLowerCase()).toMatch(/memory/)
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

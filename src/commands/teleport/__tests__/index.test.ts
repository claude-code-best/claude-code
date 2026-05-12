/**
 * Tests for teleport/index.ts — command metadata + load() body.
 * We do NOT mock launchTeleport to avoid polluting launchTeleport.test.ts
 * via Bun's process-level mock.module cache.
 * load() is tested by verifying it resolves to an object with a call function.
 */
import { beforeAll, describe, expect, mock, test } from 'bun:test'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => false,
}))

let cmd: {
  load?: () => Promise<{ call: unknown }>
  isEnabled?: () => boolean
  name?: string
  type?: string
  aliases?: string[]
  getBridgeInvocationError?: (args: string) => string | undefined
}

beforeAll(async () => {
  const mod = await import('../index.js')
  cmd = mod.default as typeof cmd
})

describe('teleport index', () => {
  test('command name is teleport', () => {
    expect(cmd.name).toBe('teleport')
  })

  test('command type is local-jsx', () => {
    expect(cmd.type).toBe('local-jsx')
  })

  test('isEnabled returns true', () => {
    expect(cmd.isEnabled?.()).toBe(true)
  })

  test('aliases includes tp', () => {
    expect(cmd.aliases).toContain('tp')
  })

  test('getBridgeInvocationError returns error string (not bridge-safe)', () => {
    const err = cmd.getBridgeInvocationError?.('anything')
    expect(typeof err).toBe('string')
    expect(err).toContain('not bridge-safe')
  })

  test('load() exists and is a function', () => {
    expect(typeof cmd.load).toBe('function')
  })

  test('load() resolves to object with call function', async () => {
    const loaded = await cmd.load!()
    expect(typeof (loaded as { call?: unknown }).call).toBe('function')
  })
})

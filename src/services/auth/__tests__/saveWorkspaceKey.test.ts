/**
 * Regression tests for saveWorkspaceKey.ts
 * Tests: valid key / wrong prefix / empty / too short / too long / error mask
 *
 * Uses Bun's test-mode saveGlobalConfig (NODE_ENV=test writes to
 * TEST_GLOBAL_CONFIG_FOR_TESTING in-memory, no disk I/O needed).
 * The tryChmod600 step may log an error (non-existent test file) — that is fine.
 */
import { afterAll, describe, expect, test, mock } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'

// Mock side-effect modules first
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))
// Pre-import the real settings module so we keep all its exports for any
// downstream test file in the same process (mock.module is global).
// We override the two keys this suite uses; the rest delegates to real impls.
const _realSettings = await import('src/utils/settings/settings.js')
mock.module('src/utils/settings/settings.js', () => ({
  ..._realSettings,
  getCachedOrDefaultSettings: () => ({}),
  getSettings: () => ({}),
}))

// Mock src/utils/config.ts with closure-driven impls and a flag-gated noop
// fallback. Other test files (e.g. processSlashCommand.test.ts) run in the
// same process and call saveGlobalConfig via recordSkillUsage; if our last
// mock leaves a "throw new Error('disk full')" body installed, those calls
// crash. After this suite we flip useMockForConfig=false so the noop fallback
// returns undefined for getGlobalConfig/saveGlobalConfig — matching the
// behavior of unmocked side-effect-free defaults rather than throwing.
let _useMockForConfig = true
let _mockGetGlobalConfig: () => unknown = () => ({
  workspaceApiKey: undefined,
})
let _mockSaveGlobalConfig: (updater: unknown) => unknown = (_u: unknown) =>
  undefined
mock.module('src/utils/config.ts', () => ({
  isConfigEnabled: () => true,
  getGlobalConfig: () =>
    _useMockForConfig ? _mockGetGlobalConfig() : { workspaceApiKey: undefined },
  saveGlobalConfig: (updater: unknown) =>
    _useMockForConfig ? _mockSaveGlobalConfig(updater) : undefined,
}))

afterAll(() => {
  _useMockForConfig = false
  // Reset closure state so nothing leaks even if a teammate test elsewhere
  // re-flips the flag.
  _mockGetGlobalConfig = () => ({ workspaceApiKey: undefined })
  _mockSaveGlobalConfig = () => undefined
})
// Provide a stable path so tryChmod600 at least knows which file to chmod
// (it will fail gracefully for a non-existent file and log via logError)
mock.module('src/utils/env.ts', () => ({
  getGlobalClaudeFile: () => '/tmp/.claude-saveWorkspaceKey-test.json',
  getClaudeConfigHomeDir: () => '/tmp/.claude-test',
}))

describe('saveWorkspaceKey', () => {
  test('saves valid sk-ant-api03-* key successfully', async () => {
    const { saveWorkspaceKey } = await import('../saveWorkspaceKey.js')
    const key = 'sk-ant-api03-' + 'A'.repeat(80)
    // Should not throw (chmod error is non-fatal)
    await expect(saveWorkspaceKey(key)).resolves.toBeUndefined()
  })

  test('rejects key without sk-ant-api03- prefix', async () => {
    const { saveWorkspaceKey } = await import('../saveWorkspaceKey.js')
    await expect(
      saveWorkspaceKey('sk-wrong-prefix-' + 'A'.repeat(80)),
    ).rejects.toThrow(/sk-ant-api03-/)
  })

  test('rejects empty key', async () => {
    const { saveWorkspaceKey } = await import('../saveWorkspaceKey.js')
    await expect(saveWorkspaceKey('')).rejects.toThrow()
  })

  test('rejects key shorter than minimum length', async () => {
    const { saveWorkspaceKey } = await import('../saveWorkspaceKey.js')
    // 'sk-ant-api03-short' = 18 chars (< MIN_KEY_LENGTH 20)
    await expect(saveWorkspaceKey('sk-ant-api03-short')).rejects.toThrow(
      /short|minimum/,
    )
  })

  test('rejects key longer than 256 chars', async () => {
    const { saveWorkspaceKey } = await import('../saveWorkspaceKey.js')
    const tooLong = 'sk-ant-api03-' + 'A'.repeat(250)
    await expect(saveWorkspaceKey(tooLong)).rejects.toThrow(
      /too long|exceed|256/,
    )
  })

  test('error message does not contain high-entropy key suffix', async () => {
    const { saveWorkspaceKey } = await import('../saveWorkspaceKey.js')
    const badKey = 'sk-wrong-SECRETSECRET-' + 'A'.repeat(50)
    let thrownError: Error | null = null
    try {
      await saveWorkspaceKey(badKey)
    } catch (e) {
      thrownError = e as Error
    }
    expect(thrownError).not.toBeNull()
    // Error must not leak the high-entropy suffix
    expect(thrownError!.message).not.toContain('SECRETSECRET')
    expect(thrownError!.message).not.toContain('A'.repeat(50))
  })

  test('removeWorkspaceKey deletes workspaceApiKey field via saveGlobalConfig', async () => {
    let captured: { workspaceApiKey?: string } | null = null
    _mockGetGlobalConfig = () => ({ workspaceApiKey: 'sk-ant-api03-EXISTING' })
    _mockSaveGlobalConfig = (updater: unknown) => {
      captured = (updater as (cur: { workspaceApiKey?: string }) => unknown)({
        workspaceApiKey: 'sk-ant-api03-EXISTING',
      }) as {
        workspaceApiKey?: string
      }
      return undefined
    }
    const { removeWorkspaceKey } = await import('../saveWorkspaceKey.js')
    await expect(removeWorkspaceKey()).resolves.toBeUndefined()
    expect(captured).not.toBeNull()
    const next = captured as unknown as { workspaceApiKey?: string }
    expect('workspaceApiKey' in next).toBe(false)
  })

  test('removeWorkspaceKey wraps underlying error with sanitized message', async () => {
    _mockGetGlobalConfig = () => ({})
    _mockSaveGlobalConfig = () => {
      throw new Error('disk full at /tmp/x')
    }
    const { removeWorkspaceKey } = await import('../saveWorkspaceKey.js')
    await expect(removeWorkspaceKey()).rejects.toThrow(
      /Failed to remove workspace API key/,
    )
  })
})

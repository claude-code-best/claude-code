import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logMock } from '../../../../tests/mocks/log.js'

mock.module('src/utils/log.ts', logMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

// Re-register ../keychain.js to override pollution from store.test.ts (which
// mocks keychain as always-throwing) and keychain.test.ts (which mocks it with
// an in-memory MockEntry). Force KeychainUnavailableError so the store always
// uses the encrypted-file fallback path.
class KeychainUnavailableError extends Error {
  override name = 'KeychainUnavailableError'
}

const keychainUnavailable = async (): Promise<never> => {
  throw new KeychainUnavailableError('test: keychain mocked as unavailable')
}

mock.module('../../../services/localVault/keychain.js', () => ({
  KeychainUnavailableError,
  tryKeychain: {
    set: keychainUnavailable,
    get: keychainUnavailable,
    delete: keychainUnavailable,
    list: keychainUnavailable,
    _addToIndex: keychainUnavailable,
    _removeFromIndex: keychainUnavailable,
  },
  _resetKeychainModuleCache: () => {},
}))

let callLocalVault: typeof import('../launchLocalVault.js').callLocalVault

describe('callLocalVault', () => {
  let tmpDir: string
  const messages: string[] = []
  const onDone = (msg?: string) => {
    if (msg) messages.push(msg)
  }

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lv-launch-test-'))
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir
    process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE'] =
      'test-passphrase-fixed-32chars-xxx'
    messages.length = 0
    const mod = await import('../launchLocalVault.js')
    callLocalVault = mod.callLocalVault
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
    delete process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE']
  })

  test('no args renders action panel without completing', async () => {
    const node = await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      '',
    )

    expect(node).not.toBeNull()
    expect(messages).toHaveLength(0)
  })

  test('list sub-command shows key count', async () => {
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      'list',
    )
    expect(messages.some(m => m.includes('0') || m.includes('secret'))).toBe(
      true,
    )
  })

  test('set sub-command stores secret; onDone contains [REDACTED], not value', async () => {
    const secretValue = 'SUPER_SENSITIVE_VALUE_XYZ_789'
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      `set MY_API_KEY ${secretValue}`,
    )
    // Security invariant: value must NOT appear in any message
    for (const msg of messages) {
      expect(msg).not.toContain(secretValue)
    }
    expect(messages.some(m => m.includes('[REDACTED]'))).toBe(true)
  })

  test('get sub-command shows masked value by default', async () => {
    const secretValue = 'ABCDEFGHIJ1234567890'
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      `set KEY_MASK ${secretValue}`,
    )
    messages.length = 0
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      'get KEY_MASK',
    )
    // Masked: should contain "..." but NOT the full value
    const allMessages = messages.join('\n')
    expect(allMessages).toContain('...')
    // Security invariant: full secret should NOT appear in masked messages
    expect(allMessages).not.toContain(secretValue)
  })

  test('get --reveal shows plaintext value', async () => {
    const secretValue = 'REVEAL_TEST_VALUE_9988'
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      `set REVEAL_KEY ${secretValue}`,
    )
    messages.length = 0
    const node = await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      'get REVEAL_KEY --reveal',
    )
    expect(messages.some(m => m.includes('REVEAL_KEY'))).toBe(true)
    const allMessages = messages.join('\n')
    expect(allMessages).toContain(secretValue)
    expect(allMessages).toContain('Warning')
    expect(node).toBeNull()
  })

  test('get without --reveal does NOT expose full secret in onDone messages', async () => {
    const secretValue = 'MUST_NOT_APPEAR_IN_MESSAGES_ZZZZ'
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      `set MASK_CHECK ${secretValue}`,
    )
    messages.length = 0
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      'get MASK_CHECK',
    )
    for (const msg of messages) {
      expect(msg).not.toContain(secretValue)
    }
  })

  test('get for nonexistent key → not-found view', async () => {
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      'get GHOST_KEY',
    )
    expect(
      messages.some(m => m.includes('not found') || m.includes('GHOST_KEY')),
    ).toBe(true)
  })

  test('delete sub-command removes key', async () => {
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      'set TO_DEL_KEY some-value',
    )
    messages.length = 0
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      'delete TO_DEL_KEY',
    )
    expect(
      messages.some(m => m.includes('Deleted') || m.includes('TO_DEL_KEY')),
    ).toBe(true)
  })

  test('invalid sub-command shows usage', async () => {
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      'frobnicate MY_KEY',
    )
    expect(
      messages.some(
        m => m.toLowerCase().includes('usage') || m.includes('frobnicate'),
      ),
    ).toBe(true)
  })

  test('reveal flag safety invariant: masked path never exposes full value in messages', async () => {
    const secret = 'INVARIANT_TEST_123456789ABC'
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      `set INV_KEY ${secret}`,
    )
    messages.length = 0
    // Without --reveal
    await callLocalVault(
      onDone as Parameters<typeof callLocalVault>[0],
      {} as Parameters<typeof callLocalVault>[1],
      'get INV_KEY',
    )
    for (const msg of messages) {
      expect(msg).not.toContain(secret)
    }
  })
})

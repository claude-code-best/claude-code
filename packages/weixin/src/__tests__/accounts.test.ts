import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const testDir = mkdtempSync(join(tmpdir(), 'weixin-test-accounts-'))
process.env.WEIXIN_STATE_DIR = testDir

import { clearAccount, loadAccount, saveAccount } from '../accounts.js'

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe('account storage', () => {
  test('loadAccount returns null when no account exists', () => {
    expect(loadAccount()).toBeNull()
  })

  test('saveAccount and loadAccount round-trip', () => {
    const data = {
      token: 'test-token',
      baseUrl: 'https://example.com',
      userId: 'user1',
      savedAt: '2025-01-01T00:00:00.000Z',
    }
    saveAccount(data)
    expect(loadAccount()).toEqual(data)
  })

  test('saveAccount sets file permissions to 0600', () => {
    saveAccount({
      token: 'test',
      baseUrl: 'https://example.com',
      savedAt: new Date().toISOString(),
    })
    const stats = statSync(join(testDir, 'account.json'))
    if (process.platform === 'win32') {
      expect(stats.isFile()).toBe(true)
      return
    }
    expect(stats.mode & 0o777).toBe(0o600)
  })

  test('clearAccount removes the file', () => {
    saveAccount({
      token: 'test',
      baseUrl: 'https://example.com',
      savedAt: new Date().toISOString(),
    })
    clearAccount()
    expect(loadAccount()).toBeNull()
  })
})

/**
 * Tests for vault parseArgs.ts
 */

import { describe, expect, test } from 'bun:test'
import { parseVaultArgs } from '../parseArgs.js'

describe('parseVaultArgs', () => {
  // ── list ──────────────────────────────────────────────────────────────────
  test('empty string → list', () => {
    expect(parseVaultArgs('')).toEqual({ action: 'list' })
  })

  test('"list" → list', () => {
    expect(parseVaultArgs('list')).toEqual({ action: 'list' })
  })

  test('"  list  " with whitespace → list', () => {
    expect(parseVaultArgs('  list  ')).toEqual({ action: 'list' })
  })

  // ── create ────────────────────────────────────────────────────────────────
  test('create with name → create action', () => {
    expect(parseVaultArgs('create My Work Vault')).toEqual({
      action: 'create',
      name: 'My Work Vault',
    })
  })

  test('create with no name → invalid', () => {
    const result = parseVaultArgs('create')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toMatch(/name/i)
    }
  })

  // ── get ───────────────────────────────────────────────────────────────────
  test('get with id → get action', () => {
    expect(parseVaultArgs('get vault_123')).toEqual({
      action: 'get',
      id: 'vault_123',
    })
  })

  test('get with no id → invalid', () => {
    const result = parseVaultArgs('get')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toMatch(/id/i)
    }
  })

  // ── archive ───────────────────────────────────────────────────────────────
  test('archive with id → archive action', () => {
    expect(parseVaultArgs('archive vault_456')).toEqual({
      action: 'archive',
      id: 'vault_456',
    })
  })

  test('archive with no id → invalid', () => {
    const result = parseVaultArgs('archive')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toMatch(/id/i)
    }
  })

  // ── add-credential ────────────────────────────────────────────────────────
  test('add-credential with vault_id, key, value → add-credential action', () => {
    expect(
      parseVaultArgs('add-credential vault_123 MY_KEY secret-value'),
    ).toEqual({
      action: 'add-credential',
      vaultId: 'vault_123',
      key: 'MY_KEY',
      secret: 'secret-value',
    })
  })

  test('add-credential with multi-word value → joins value correctly', () => {
    const result = parseVaultArgs(
      'add-credential vault_xyz API_KEY my secret value here',
    )
    expect(result.action).toBe('add-credential')
    if (result.action === 'add-credential') {
      expect(result.secret).toBe('my secret value here')
    }
  })

  test('add-credential with missing value → invalid', () => {
    const result = parseVaultArgs('add-credential vault_123 MY_KEY')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toMatch(/value|non-empty/i)
    }
  })

  test('add-credential with missing key → invalid', () => {
    const result = parseVaultArgs('add-credential vault_123')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toMatch(/key|value/i)
    }
  })

  test('add-credential with no args → invalid', () => {
    const result = parseVaultArgs('add-credential')
    expect(result.action).toBe('invalid')
  })

  // ── archive-credential ────────────────────────────────────────────────────
  test('archive-credential with vault_id and cred_id → archive-credential action', () => {
    expect(parseVaultArgs('archive-credential vault_123 cred_456')).toEqual({
      action: 'archive-credential',
      vaultId: 'vault_123',
      credentialId: 'cred_456',
    })
  })

  test('archive-credential with missing cred_id → invalid', () => {
    const result = parseVaultArgs('archive-credential vault_123')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toMatch(/credential_id|cred/i)
    }
  })

  test('archive-credential with no args → invalid', () => {
    const result = parseVaultArgs('archive-credential')
    expect(result.action).toBe('invalid')
  })

  // ── unknown subcommand ────────────────────────────────────────────────────
  test('unknown subcommand → invalid with usage hint', () => {
    const result = parseVaultArgs('delete vault_123')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toMatch(/unknown.*delete/i)
    }
  })
})

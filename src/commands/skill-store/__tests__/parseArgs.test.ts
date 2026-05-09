/**
 * Unit tests for parseSkillStoreArgs
 */

import { describe, expect, test } from 'bun:test'
import { parseSkillStoreArgs } from '../parseArgs.js'

describe('parseSkillStoreArgs', () => {
  test('empty string → list', () => {
    expect(parseSkillStoreArgs('')).toEqual({ action: 'list' })
  })

  test('"list" → list', () => {
    expect(parseSkillStoreArgs('list')).toEqual({ action: 'list' })
  })

  test('"list" with whitespace → list', () => {
    expect(parseSkillStoreArgs('  list  ')).toEqual({ action: 'list' })
  })

  describe('get', () => {
    test('get <id> → { action: get, id }', () => {
      expect(parseSkillStoreArgs('get sk_123')).toEqual({
        action: 'get',
        id: 'sk_123',
      })
    })

    test('get without id → invalid', () => {
      const result = parseSkillStoreArgs('get')
      expect(result.action).toBe('invalid')
    })
  })

  describe('versions', () => {
    test('versions <id> → { action: versions, id }', () => {
      expect(parseSkillStoreArgs('versions sk_abc')).toEqual({
        action: 'versions',
        id: 'sk_abc',
      })
    })

    test('versions without id → invalid', () => {
      const result = parseSkillStoreArgs('versions')
      expect(result.action).toBe('invalid')
    })
  })

  describe('version', () => {
    test('version <id> <ver> → { action: version, id, version }', () => {
      expect(parseSkillStoreArgs('version sk_1 v2')).toEqual({
        action: 'version',
        id: 'sk_1',
        version: 'v2',
      })
    })

    test('version without version string → invalid', () => {
      const result = parseSkillStoreArgs('version sk_1')
      expect(result.action).toBe('invalid')
    })

    test('version without any args → invalid', () => {
      const result = parseSkillStoreArgs('version')
      expect(result.action).toBe('invalid')
    })
  })

  describe('create', () => {
    test('create <name> <markdown> → { action: create, name, markdown }', () => {
      const result = parseSkillStoreArgs('create my-skill # Skill Content')
      expect(result).toEqual({
        action: 'create',
        name: 'my-skill',
        markdown: '# Skill Content',
      })
    })

    test('create without markdown → invalid', () => {
      const result = parseSkillStoreArgs('create my-skill')
      expect(result.action).toBe('invalid')
    })

    test('create without name → invalid', () => {
      const result = parseSkillStoreArgs('create')
      expect(result.action).toBe('invalid')
    })
  })

  describe('delete', () => {
    test('delete <id> → { action: delete, id }', () => {
      expect(parseSkillStoreArgs('delete sk_del')).toEqual({
        action: 'delete',
        id: 'sk_del',
      })
    })

    test('delete without id → invalid', () => {
      const result = parseSkillStoreArgs('delete')
      expect(result.action).toBe('invalid')
    })
  })

  describe('install', () => {
    test('install <id> → { action: install, id, version: undefined }', () => {
      expect(parseSkillStoreArgs('install sk_123')).toEqual({
        action: 'install',
        id: 'sk_123',
        version: undefined,
      })
    })

    test('install <id>@<version> → { action: install, id, version }', () => {
      expect(parseSkillStoreArgs('install sk_123@v2')).toEqual({
        action: 'install',
        id: 'sk_123',
        version: 'v2',
      })
    })

    test('install without id → invalid', () => {
      const result = parseSkillStoreArgs('install')
      expect(result.action).toBe('invalid')
    })

    test('install @version without id → invalid', () => {
      const result = parseSkillStoreArgs('install @v1')
      expect(result.action).toBe('invalid')
    })

    test('install id@ without version → invalid', () => {
      const result = parseSkillStoreArgs('install sk_1@')
      expect(result.action).toBe('invalid')
    })
  })

  describe('unknown subcommand', () => {
    test('unknown subcommand → invalid with reason', () => {
      const result = parseSkillStoreArgs('foobar')
      expect(result.action).toBe('invalid')
      if (result.action === 'invalid') {
        expect(result.reason).toContain('foobar')
      }
    })
  })
})

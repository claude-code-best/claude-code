/**
 * Unit tests for parseMemoryStoresArgs
 */

import { describe, expect, test } from 'bun:test'
import { parseMemoryStoresArgs } from '../parseArgs.js'

describe('parseMemoryStoresArgs: list', () => {
  test('empty string → list', () => {
    expect(parseMemoryStoresArgs('')).toEqual({ action: 'list' })
  })

  test('"list" → list', () => {
    expect(parseMemoryStoresArgs('list')).toEqual({ action: 'list' })
  })

  test('whitespace-only → list', () => {
    expect(parseMemoryStoresArgs('   ')).toEqual({ action: 'list' })
  })
})

describe('parseMemoryStoresArgs: get', () => {
  test('get ms_123 → { action: get, id: ms_123 }', () => {
    expect(parseMemoryStoresArgs('get ms_123')).toEqual({
      action: 'get',
      id: 'ms_123',
    })
  })

  test('get without id → invalid', () => {
    const result = parseMemoryStoresArgs('get')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toMatch(/store id/i)
    }
  })
})

describe('parseMemoryStoresArgs: create', () => {
  test('create "My Store" → { action: create, name }', () => {
    const result = parseMemoryStoresArgs('create My Work Store')
    expect(result).toEqual({ action: 'create', name: 'My Work Store' })
  })

  test('create without name → invalid', () => {
    const result = parseMemoryStoresArgs('create')
    expect(result.action).toBe('invalid')
  })
})

describe('parseMemoryStoresArgs: archive', () => {
  test('archive ms_123 → { action: archive, id: ms_123 }', () => {
    expect(parseMemoryStoresArgs('archive ms_123')).toEqual({
      action: 'archive',
      id: 'ms_123',
    })
  })

  test('archive without id → invalid', () => {
    const result = parseMemoryStoresArgs('archive')
    expect(result.action).toBe('invalid')
  })
})

describe('parseMemoryStoresArgs: memories', () => {
  test('memories ms_123 → { action: memories, storeId: ms_123 }', () => {
    expect(parseMemoryStoresArgs('memories ms_123')).toEqual({
      action: 'memories',
      storeId: 'ms_123',
    })
  })

  test('memories without storeId → invalid', () => {
    const result = parseMemoryStoresArgs('memories')
    expect(result.action).toBe('invalid')
  })
})

describe('parseMemoryStoresArgs: create-memory', () => {
  test('create-memory ms_123 hello world → { action: create-memory, storeId, content }', () => {
    const result = parseMemoryStoresArgs('create-memory ms_123 hello world')
    expect(result).toEqual({
      action: 'create-memory',
      storeId: 'ms_123',
      content: 'hello world',
    })
  })

  test('create-memory without content → invalid', () => {
    const result = parseMemoryStoresArgs('create-memory ms_123')
    expect(result.action).toBe('invalid')
  })

  test('create-memory without args → invalid', () => {
    const result = parseMemoryStoresArgs('create-memory')
    expect(result.action).toBe('invalid')
  })
})

describe('parseMemoryStoresArgs: get-memory', () => {
  test('get-memory ms_123 mem_456 → { action: get-memory, storeId, memoryId }', () => {
    const result = parseMemoryStoresArgs('get-memory ms_123 mem_456')
    expect(result).toEqual({
      action: 'get-memory',
      storeId: 'ms_123',
      memoryId: 'mem_456',
    })
  })

  test('get-memory with only store id → invalid', () => {
    const result = parseMemoryStoresArgs('get-memory ms_123')
    expect(result.action).toBe('invalid')
  })
})

describe('parseMemoryStoresArgs: update-memory', () => {
  test('update-memory ms_123 mem_456 new content → { action: update-memory, storeId, memoryId, content }', () => {
    const result = parseMemoryStoresArgs(
      'update-memory ms_123 mem_456 new content',
    )
    expect(result).toEqual({
      action: 'update-memory',
      storeId: 'ms_123',
      memoryId: 'mem_456',
      content: 'new content',
    })
  })

  test('update-memory without content → invalid', () => {
    const result = parseMemoryStoresArgs('update-memory ms_123 mem_456')
    expect(result.action).toBe('invalid')
  })
})

describe('parseMemoryStoresArgs: delete-memory', () => {
  test('delete-memory ms_123 mem_456 → { action: delete-memory, storeId, memoryId }', () => {
    const result = parseMemoryStoresArgs('delete-memory ms_123 mem_456')
    expect(result).toEqual({
      action: 'delete-memory',
      storeId: 'ms_123',
      memoryId: 'mem_456',
    })
  })

  test('delete-memory with only store id → invalid', () => {
    const result = parseMemoryStoresArgs('delete-memory ms_123')
    expect(result.action).toBe('invalid')
  })
})

describe('parseMemoryStoresArgs: versions', () => {
  test('versions ms_123 → { action: versions, storeId: ms_123 }', () => {
    expect(parseMemoryStoresArgs('versions ms_123')).toEqual({
      action: 'versions',
      storeId: 'ms_123',
    })
  })

  test('versions without storeId → invalid', () => {
    const result = parseMemoryStoresArgs('versions')
    expect(result.action).toBe('invalid')
  })
})

describe('parseMemoryStoresArgs: redact', () => {
  test('redact ms_123 ver_456 → { action: redact, storeId, versionId }', () => {
    const result = parseMemoryStoresArgs('redact ms_123 ver_456')
    expect(result).toEqual({
      action: 'redact',
      storeId: 'ms_123',
      versionId: 'ver_456',
    })
  })

  test('redact with only store id → invalid', () => {
    const result = parseMemoryStoresArgs('redact ms_123')
    expect(result.action).toBe('invalid')
  })
})

describe('parseMemoryStoresArgs: unknown sub-command', () => {
  test('unknown subcommand → invalid with reason', () => {
    const result = parseMemoryStoresArgs('foobar')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toMatch(/unknown sub-command/i)
      expect(result.reason).toContain('foobar')
    }
  })
})

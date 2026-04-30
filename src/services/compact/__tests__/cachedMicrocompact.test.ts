import { describe, test, expect, beforeEach } from 'bun:test'
import {
  createCachedMCState,
  registerToolResult,
  getToolResultsToDelete,
  createCacheEditsBlock,
  markToolsSentToAPI,
  resetCachedMCState,
  isCachedMicrocompactEnabled,
  isModelSupportedForCacheEditing,
  type CachedMCState,
} from '../cachedMicrocompact.js'

describe('cachedMicrocompact', () => {
  let state: CachedMCState

  beforeEach(() => {
    state = createCachedMCState()
  })

  test('createCachedMCState returns clean state', () => {
    expect(state.registeredTools.size).toBe(0)
    expect(state.toolOrder).toEqual([])
    expect(state.deletedRefs.size).toBe(0)
    expect(state.pinnedEdits).toEqual([])
    expect(state.toolsSentToAPI).toBe(false)
  })

  test('registerToolResult tracks tool IDs in order', () => {
    registerToolResult(state, 'tool-1')
    registerToolResult(state, 'tool-2')
    registerToolResult(state, 'tool-3')
    expect(state.registeredTools.size).toBe(3)
    expect(state.toolOrder).toEqual(['tool-1', 'tool-2', 'tool-3'])
  })

  test('getToolResultsToDelete returns empty when below threshold', () => {
    for (let i = 0; i < 5; i++) {
      registerToolResult(state, `tool-${i}`)
    }
    const toDelete = getToolResultsToDelete(state)
    expect(toDelete).toEqual([])
  })

  test('getToolResultsToDelete returns oldest when above threshold', () => {
    for (let i = 0; i < 12; i++) {
      registerToolResult(state, `tool-${i}`)
    }
    const toDelete = getToolResultsToDelete(state)
    // Should suggest deleting oldest, keeping recent
    expect(toDelete.length).toBeGreaterThan(0)
    // Should not include the most recent tools
    expect(toDelete).not.toContain('tool-11')
    expect(toDelete).not.toContain('tool-10')
  })

  test('createCacheEditsBlock generates correct structure', () => {
    for (let i = 0; i < 12; i++) {
      registerToolResult(state, `tool-${i}`)
    }
    const toDelete = getToolResultsToDelete(state)
    const block = createCacheEditsBlock(state, toDelete)
    if (block) {
      expect(block.type).toBe('cache_edits')
      expect(block.edits.length).toBe(toDelete.length)
      for (const edit of block.edits) {
        expect(edit.type).toBe('delete_tool_result')
        expect(typeof edit.tool_use_id).toBe('string')
      }
    }
  })

  test('createCacheEditsBlock returns null for empty list', () => {
    const block = createCacheEditsBlock(state, [])
    expect(block).toBeNull()
  })

  test('already deleted tools are not suggested again', () => {
    for (let i = 0; i < 12; i++) {
      registerToolResult(state, `tool-${i}`)
    }
    const first = getToolResultsToDelete(state)
    // Simulate deletion
    for (const id of first) {
      state.deletedRefs.add(id)
    }
    const second = getToolResultsToDelete(state)
    // Should not re-suggest already deleted
    for (const id of first) {
      expect(second).not.toContain(id)
    }
  })

  test('markToolsSentToAPI sets flag', () => {
    expect(state.toolsSentToAPI).toBe(false)
    markToolsSentToAPI(state)
    expect(state.toolsSentToAPI).toBe(true)
  })

  test('resetCachedMCState clears everything', () => {
    registerToolResult(state, 'tool-1')
    markToolsSentToAPI(state)
    resetCachedMCState(state)
    expect(state.registeredTools.size).toBe(0)
    expect(state.toolOrder).toEqual([])
    expect(state.toolsSentToAPI).toBe(false)
  })

  test('isModelSupportedForCacheEditing accepts Claude 4.x', () => {
    expect(isModelSupportedForCacheEditing('claude-opus-4-6')).toBe(true)
    expect(isModelSupportedForCacheEditing('claude-sonnet-4-6')).toBe(true)
  })

  test('isModelSupportedForCacheEditing rejects old models', () => {
    expect(isModelSupportedForCacheEditing('claude-2')).toBe(false)
    expect(isModelSupportedForCacheEditing('gpt-4')).toBe(false)
  })
})

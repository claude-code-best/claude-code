import { describe, expect, test } from 'bun:test'
import { isValidLSPOperation } from '../schemas'

describe('isValidLSPOperation', () => {
  const validOps = [
    'goToDefinition',
    'findReferences',
    'hover',
    'documentSymbol',
    'workspaceSymbol',
    'goToImplementation',
    'prepareCallHierarchy',
    'incomingCalls',
    'outgoingCalls',
  ]

  test.each(validOps)('returns true for valid operation: %s', op => {
    expect(isValidLSPOperation(op)).toBe(true)
  })

  test('returns false for invalid operation', () => {
    expect(isValidLSPOperation('invalidOp')).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(isValidLSPOperation('')).toBe(false)
  })

  test('returns false for undefined', () => {
    expect(isValidLSPOperation(undefined as any)).toBe(false)
  })

  test('is case sensitive', () => {
    expect(isValidLSPOperation('GoToDefinition')).toBe(false)
    expect(isValidLSPOperation('HOVER')).toBe(false)
  })
})

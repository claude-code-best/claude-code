import { mock, describe, expect, test } from 'bun:test'

// Mock debug.ts to cut bootstrap/state dependency chain
mock.module('src/utils/debug.ts', () => ({
  logForDebugging: () => {},
  isDebugMode: () => false,
  isDebugToStdErr: () => false,
  getDebugFilePath: () => null,
  getDebugFilter: () => null,
  getMinDebugLogLevel: () => 'debug',
  getDebugLogPath: () => '/tmp/mock-debug.log',
  flushDebugLogs: async () => {},
  enableDebugLogging: () => false,
  setHasFormattedOutput: () => {},
  getHasFormattedOutput: () => false,
  logAntError: () => {},
}))

const { validateBoundedIntEnvVar } = await import('../envValidation')

describe('validateBoundedIntEnvVar', () => {
  test('returns default when value is undefined', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', undefined, 100, 1000)
    expect(result).toEqual({ effective: 100, status: 'valid' })
  })

  test('returns default when value is empty string', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', '', 100, 1000)
    expect(result).toEqual({ effective: 100, status: 'valid' })
  })

  test('returns parsed value when valid and within limit', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', '500', 100, 1000)
    expect(result).toEqual({ effective: 500, status: 'valid' })
  })

  test('caps value at upper limit', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', '2000', 100, 1000)
    expect(result.effective).toBe(1000)
    expect(result.status).toBe('capped')
    expect(result.message).toBe('Capped from 2000 to 1000')
  })

  test('returns default for non-numeric value', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', 'abc', 100, 1000)
    expect(result.effective).toBe(100)
    expect(result.status).toBe('invalid')
    expect(result.message).toBe('Invalid value "abc" (using default: 100)')
  })

  test('returns default for zero', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', '0', 100, 1000)
    expect(result.effective).toBe(100)
    expect(result.status).toBe('invalid')
  })

  test('returns default for negative value', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', '-5', 100, 1000)
    expect(result.effective).toBe(100)
    expect(result.status).toBe('invalid')
  })

  test('handles value at exact upper limit', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', '1000', 100, 1000)
    expect(result.effective).toBe(1000)
    expect(result.status).toBe('valid')
  })

  test('handles value of 1 (no lower bound check, only parsed > 0)', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', '1', 100, 1000)
    expect(result.effective).toBe(1)
    expect(result.status).toBe('valid')
  })

  test('truncates float input via parseInt', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', '50.7', 100, 1000)
    expect(result.effective).toBe(50)
    expect(result.status).toBe('valid')
  })

  test('handles whitespace in value', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', ' 500 ', 100, 1000)
    expect(result.effective).toBe(500)
    expect(result.status).toBe('valid')
  })

  test('value=1 with high defaultValue returns 1 (no lower bound enforcement)', () => {
    // Function only checks parsed > 0 and parsed <= upperLimit
    // It does NOT enforce that parsed >= defaultValue
    const result = validateBoundedIntEnvVar('TEST_VAR', '1', 100, 1000)
    expect(result.effective).toBe(1)
    expect(result.status).toBe('valid')
  })

  test('caps very large number at upper limit', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', '999999999', 100, 1000)
    expect(result.effective).toBe(1000)
    expect(result.status).toBe('capped')
  })

  test('treats NaN-producing strings as invalid', () => {
    const result = validateBoundedIntEnvVar('TEST_VAR', 'NaN', 100, 1000)
    expect(result.effective).toBe(100)
    expect(result.status).toBe('invalid')
  })
})

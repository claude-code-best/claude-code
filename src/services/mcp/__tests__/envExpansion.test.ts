import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { expandEnvVarsInString } from '../envExpansion'

describe('expandEnvVarsInString', () => {
  // Save and restore env vars touched by tests
  const savedEnv: Record<string, string | undefined> = {}
  const trackedKeys = [
    'TEST_HOME',
    'MISSING',
    'TEST_A',
    'TEST_B',
    'TEST_EMPTY',
    'TEST_X',
    'VAR',
    'TEST_FOUND',
  ]

  beforeEach(() => {
    for (const key of trackedKeys) {
      savedEnv[key] = process.env[key]
    }
  })

  afterEach(() => {
    for (const key of trackedKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = savedEnv[key]
      }
    }
  })

  test('expands a single env var that exists', () => {
    process.env.TEST_HOME = '/home/user'
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    const result = expandEnvVarsInString('${TEST_HOME}')
    expect(result.expanded).toBe('/home/user')
    expect(result.missingVars).toEqual([])
  })

  test('returns original placeholder and tracks missing var when not found', () => {
    delete process.env.MISSING
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    const result = expandEnvVarsInString('${MISSING}')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    expect(result.expanded).toBe('${MISSING}')
    expect(result.missingVars).toEqual(['MISSING'])
  })

  test('uses default value when var is missing and default is provided', () => {
    delete process.env.MISSING
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    const result = expandEnvVarsInString('${MISSING:-fallback}')
    expect(result.expanded).toBe('fallback')
    expect(result.missingVars).toEqual([])
  })

  test('expands multiple vars', () => {
    process.env.TEST_A = 'hello'
    process.env.TEST_B = 'world'
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    const result = expandEnvVarsInString('${TEST_A}/${TEST_B}')
    expect(result.expanded).toBe('hello/world')
    expect(result.missingVars).toEqual([])
  })

  test('handles mix of found and missing vars', () => {
    process.env.TEST_FOUND = 'yes'
    delete process.env.MISSING
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    const result = expandEnvVarsInString('${TEST_FOUND}-${MISSING}')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    expect(result.expanded).toBe('yes-${MISSING}')
    expect(result.missingVars).toEqual(['MISSING'])
  })

  test('returns plain string unchanged with empty missingVars', () => {
    const result = expandEnvVarsInString('plain string')
    expect(result.expanded).toBe('plain string')
    expect(result.missingVars).toEqual([])
  })

  test('expands empty env var value', () => {
    process.env.TEST_EMPTY = ''
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    const result = expandEnvVarsInString('${TEST_EMPTY}')
    expect(result.expanded).toBe('')
    expect(result.missingVars).toEqual([])
  })

  test('prefers env var value over default when var exists', () => {
    process.env.TEST_X = 'real'
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    const result = expandEnvVarsInString('${TEST_X:-default}')
    expect(result.expanded).toBe('real')
    expect(result.missingVars).toEqual([])
  })

  test('handles default value containing colons', () => {
    // split(':-', 2) means only the first :- is the delimiter
    delete process.env.TEST_X
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    const result = expandEnvVarsInString('${TEST_X:-value:-with:-colons}')
    // The default is "value" because split(':-', 2) gives ["TEST_X", "value"]
    // Wait -- actually split(':-', 2) on "TEST_X:-value:-with:-colons" gives:
    //   ["TEST_X", "value"] because limit=2 stops at 2 pieces
    expect(result.expanded).toBe('value')
    expect(result.missingVars).toEqual([])
  })

  test('handles nested-looking syntax as literal (not supported)', () => {
    // ${${VAR}} - the regex [^}]+ matches "${VAR" (up to first })
    // so varName would be "${VAR" which won't be found in env
    delete process.env.VAR
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    const result = expandEnvVarsInString('${${VAR}}')
    // The regex \$\{([^}]+)\} matches "${${VAR}" with capture "${VAR"
    // That env var won't exist, so it stays as "${${VAR}" + remaining "}"
    expect(result.missingVars).toEqual(['${VAR'])
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    expect(result.expanded).toBe('${${VAR}}')
  })

  test('handles empty string input', () => {
    const result = expandEnvVarsInString('')
    expect(result.expanded).toBe('')
    expect(result.missingVars).toEqual([])
  })

  test('handles var surrounded by text', () => {
    process.env.TEST_A = 'middle'
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    const result = expandEnvVarsInString('before-${TEST_A}-after')
    expect(result.expanded).toBe('before-middle-after')
    expect(result.missingVars).toEqual([])
  })

  test('handles default value that is empty string', () => {
    delete process.env.MISSING
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${} is test input for env var expansion, not a JS template literal
    const result = expandEnvVarsInString('${MISSING:-}')
    expect(result.expanded).toBe('')
    expect(result.missingVars).toEqual([])
  })

  test('does not expand $VAR without braces', () => {
    process.env.TEST_A = 'value'
    const result = expandEnvVarsInString('$TEST_A')
    expect(result.expanded).toBe('$TEST_A')
    expect(result.missingVars).toEqual([])
  })
})

import { describe, expect, test } from 'bun:test'
import {
  escapeRuleContent,
  unescapeRuleContent,
  permissionRuleValueFromString,
  permissionRuleValueToString,
  normalizeLegacyToolName,
} from '../permissionRuleParser'

describe('escapeRuleContent', () => {
  test('escapes backslashes first', () => {
    expect(escapeRuleContent('a\\b')).toBe('a\\\\b')
  })

  test('escapes opening parentheses', () => {
    expect(escapeRuleContent('fn(x)')).toBe('fn\\(x\\)')
  })

  test('escapes backslash before parens correctly', () => {
    expect(escapeRuleContent('echo "test\\nvalue"')).toBe(
      'echo "test\\\\nvalue"',
    )
  })

  test('returns unchanged string with no special chars', () => {
    expect(escapeRuleContent('npm install')).toBe('npm install')
  })

  test('handles empty string', () => {
    expect(escapeRuleContent('')).toBe('')
  })
})

describe('unescapeRuleContent', () => {
  test('unescapes parentheses', () => {
    expect(unescapeRuleContent('fn\\(x\\)')).toBe('fn(x)')
  })

  test('unescapes backslashes', () => {
    expect(unescapeRuleContent('a\\\\b')).toBe('a\\b')
  })

  test('roundtrips with escapeRuleContent', () => {
    const original = 'python -c "print(1)"'
    expect(unescapeRuleContent(escapeRuleContent(original))).toBe(original)
  })

  test('handles content with backslash-paren combo', () => {
    const original = 'echo "test\\nvalue"'
    expect(unescapeRuleContent(escapeRuleContent(original))).toBe(original)
  })

  test('returns unchanged string with no escapes', () => {
    expect(unescapeRuleContent('npm install')).toBe('npm install')
  })
})

describe('permissionRuleValueFromString', () => {
  test('parses tool name only', () => {
    expect(permissionRuleValueFromString('Bash')).toEqual({
      toolName: 'Bash',
    })
  })

  test('parses tool name with content', () => {
    expect(permissionRuleValueFromString('Bash(npm install)')).toEqual({
      toolName: 'Bash',
      ruleContent: 'npm install',
    })
  })

  test('handles escaped parens in content', () => {
    const result = permissionRuleValueFromString(
      'Bash(python -c "print\\(1\\)")',
    )
    expect(result.toolName).toBe('Bash')
    expect(result.ruleContent).toBe('python -c "print(1)"')
  })

  test('treats empty content as tool-wide rule', () => {
    expect(permissionRuleValueFromString('Bash()')).toEqual({
      toolName: 'Bash',
    })
  })

  test('treats wildcard content as tool-wide rule', () => {
    expect(permissionRuleValueFromString('Bash(*)')).toEqual({
      toolName: 'Bash',
    })
  })

  test('normalizes legacy tool names', () => {
    const result = permissionRuleValueFromString('Task')
    expect(result.toolName).toBe('Agent')
  })

  test('handles MCP-style tool names', () => {
    expect(permissionRuleValueFromString('mcp__server__tool')).toEqual({
      toolName: 'mcp__server__tool',
    })
  })
})

describe('permissionRuleValueToString', () => {
  test('formats tool name only', () => {
    expect(permissionRuleValueToString({ toolName: 'Bash' })).toBe('Bash')
  })

  test('formats tool name with content', () => {
    expect(
      permissionRuleValueToString({
        toolName: 'Bash',
        ruleContent: 'npm install',
      }),
    ).toBe('Bash(npm install)')
  })

  test('escapes parens in content', () => {
    expect(
      permissionRuleValueToString({
        toolName: 'Bash',
        ruleContent: 'python -c "print(1)"',
      }),
    ).toBe('Bash(python -c "print\\(1\\)")')
  })

  test('roundtrips with permissionRuleValueFromString', () => {
    const original = { toolName: 'Bash', ruleContent: 'npm install' }
    const str = permissionRuleValueToString(original)
    const parsed = permissionRuleValueFromString(str)
    expect(parsed).toEqual(original)
  })
})

describe('normalizeLegacyToolName', () => {
  test('maps Task to Agent', () => {
    expect(normalizeLegacyToolName('Task')).toBe('Agent')
  })

  test('maps KillShell to TaskStop', () => {
    expect(normalizeLegacyToolName('KillShell')).toBe('TaskStop')
  })

  test('returns unknown name as-is', () => {
    expect(normalizeLegacyToolName('UnknownTool')).toBe('UnknownTool')
  })

  test('preserves current canonical names', () => {
    expect(normalizeLegacyToolName('Bash')).toBe('Bash')
    expect(normalizeLegacyToolName('Agent')).toBe('Agent')
  })
})

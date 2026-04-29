import { describe, expect, test } from 'bun:test'
import hljs from 'highlight.js/lib/core'

// Re-import the module to trigger language registration side effects
// The module-level registerLanguage calls happen on import
import '../index.js'

describe('highlight.js language registration', () => {
  const expectedLanguages = [
    'bash', 'c', 'cmake', 'cpp', 'csharp', 'css', 'diff', 'dockerfile',
    'go', 'graphql', 'java', 'javascript', 'json', 'kotlin', 'makefile',
    'markdown', 'perl', 'php', 'python', 'ruby', 'rust', 'shell', 'sql',
    'typescript', 'xml', 'yaml',
  ]

  test('all expected languages are registered', () => {
    for (const lang of expectedLanguages) {
      expect(hljs.getLanguage(lang)).toBeDefined()
    }
  })

  test('unregistered language returns undefined', () => {
    expect(hljs.getLanguage('totally-not-a-real-language-xyz')).toBeUndefined()
  })

  test('highlight works for TypeScript', () => {
    const result = hljs.highlight('const x: number = 42', {
      language: 'typescript',
      ignoreIllegals: true,
    })
    expect(result.value).toContain('const')
    expect(result.language).toBe('typescript')
  })

  test('highlight works for Python', () => {
    const result = hljs.highlight('def hello():\n    print("hi")', {
      language: 'python',
      ignoreIllegals: true,
    })
    expect(result.value).toContain('def')
    expect(result.language).toBe('python')
  })

  test('highlight works for JSON', () => {
    const result = hljs.highlight('{"key": "value"}', {
      language: 'json',
      ignoreIllegals: true,
    })
    expect(result.language).toBe('json')
  })

  test('highlight works for Bash', () => {
    const result = hljs.highlight('echo "hello world"', {
      language: 'bash',
      ignoreIllegals: true,
    })
    expect(result.language).toBe('bash')
  })

  test('all expected languages are registered (standalone)', () => {
    // When running standalone, only 26 languages are registered via index.ts.
    // When running in the full test suite, cliHighlight.ts imports the full
    // highlight.js bundle (190+ languages) which shares the same core singleton,
    // so the total count is higher. We verify our 26 languages are present regardless.
    const registered = hljs.listLanguages()
    for (const lang of expectedLanguages) {
      expect(registered).toContain(lang)
    }
    expect(registered.length).toBeGreaterThanOrEqual(expectedLanguages.length)
  })
})

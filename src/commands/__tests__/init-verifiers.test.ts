import { describe, expect, test } from 'bun:test'

// init-verifiers.ts has no external dependencies that need mocking
// It's a simple prompt-type command that returns a static text prompt

let initVerifiers: any

// Import once - no async deps
const mod = await import('../init-verifiers.js')
initVerifiers = mod.default

describe('init-verifiers command metadata', () => {
  test('has correct name', () => {
    expect(initVerifiers.name).toBe('init-verifiers')
  })

  test('has description', () => {
    expect(initVerifiers.description).toBeTruthy()
    expect(typeof initVerifiers.description).toBe('string')
  })

  test('type is prompt', () => {
    expect(initVerifiers.type).toBe('prompt')
  })

  test('has progressMessage', () => {
    expect(initVerifiers.progressMessage).toBeTruthy()
  })

  test('source is builtin', () => {
    expect(initVerifiers.source).toBe('builtin')
  })

  test('contentLength is 0 (dynamic)', () => {
    expect(initVerifiers.contentLength).toBe(0)
  })
})

describe('init-verifiers getPromptForCommand', () => {
  test('returns a non-empty array', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  test('first element has type "text"', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(result[0].type).toBe('text')
  })

  test('text contains Phase 1 auto-detection instructions', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(result[0].text).toContain('Phase 1')
  })

  test('text contains Phase 2 verification tool setup', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(result[0].text).toContain('Phase 2')
  })

  test('text contains Phase 3 interactive Q&A', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(result[0].text).toContain('Phase 3')
  })

  test('text contains Phase 4 generate verifier skill', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(result[0].text).toContain('Phase 4')
  })

  test('text contains Phase 5 confirm creation', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(result[0].text).toContain('Phase 5')
  })

  test('text mentions Playwright', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(result[0].text).toContain('Playwright')
  })

  test('text mentions SKILL.md template', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(result[0].text).toContain('SKILL.md')
  })

  test('text mentions TodoWrite tool', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(result[0].text).toContain('TodoWrite')
  })

  test('text mentions verifier naming convention', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(result[0].text).toContain('verifier')
  })

  test('text mentions authentication handling', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(result[0].text).toContain('Authentication')
  })

  test('text is a non-empty string', async () => {
    const result = await initVerifiers.getPromptForCommand()
    expect(typeof result[0].text).toBe('string')
    expect(result[0].text.length).toBeGreaterThan(100)
  })

  test('works with no arguments (no args parameter)', async () => {
    // getPromptForCommand takes no required params
    const result = await initVerifiers.getPromptForCommand(undefined, undefined)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })
})

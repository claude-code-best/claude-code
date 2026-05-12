import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log.js'

mock.module('src/utils/log.ts', logMock)
mock.module('bun:bundle', () => ({ feature: () => false }))
mock.module('src/utils/settings/settings.js', () => ({
  getSettings_DEPRECATED: () => ({}),
  updateSettingsForSource: () => {},
}))

beforeEach(() => {
  // Clean OpenAI env vars before each test
  delete process.env['CLAUDE_CODE_USE_OPENAI']
  delete process.env['OPENAI_API_KEY']
  delete process.env['OPENAI_BASE_URL']
  delete process.env['ANTHROPIC_API_KEY']
  delete process.env['CEREBRAS_API_KEY']
  delete process.env['GROQ_API_KEY']
  delete process.env['DASHSCOPE_API_KEY']
  delete process.env['DEEPSEEK_API_KEY']
})

afterEach(() => {
  delete process.env['CLAUDE_CODE_USE_OPENAI']
  delete process.env['OPENAI_API_KEY']
  delete process.env['OPENAI_BASE_URL']
  delete process.env['ANTHROPIC_API_KEY']
})

describe('switchProvider', () => {
  test('switching to cerebras returns correct env vars', async () => {
    const { switchProvider } = await import('../switcher.js')
    const { DEFAULT_PROVIDERS } = await import('../loader.js')
    const result = switchProvider('cerebras', DEFAULT_PROVIDERS)
    expect(result.env['CLAUDE_CODE_USE_OPENAI']).toBe('1')
    expect(result.env['OPENAI_BASE_URL']).toBe('https://api.cerebras.ai/v1')
    expect(result.env['OPENAI_MODEL']).toBe('llama-3.3-70b')
    expect(result.provider.id).toBe('cerebras')
  })

  test('switching to groq returns correct env vars', async () => {
    const { switchProvider } = await import('../switcher.js')
    const { DEFAULT_PROVIDERS } = await import('../loader.js')
    const result = switchProvider('groq', DEFAULT_PROVIDERS)
    expect(result.env['OPENAI_BASE_URL']).toBe('https://api.groq.com/openai/v1')
    expect(result.env['OPENAI_MODEL']).toBe('llama-3.3-70b-versatile')
  })

  test('switching to qwen returns correct env vars', async () => {
    const { switchProvider } = await import('../switcher.js')
    const { DEFAULT_PROVIDERS } = await import('../loader.js')
    const result = switchProvider('qwen', DEFAULT_PROVIDERS)
    expect(result.env['OPENAI_BASE_URL']).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    )
    expect(result.env['OPENAI_MODEL']).toBe('qwen-max')
  })

  test('switching to deepseek returns correct env vars', async () => {
    const { switchProvider } = await import('../switcher.js')
    const { DEFAULT_PROVIDERS } = await import('../loader.js')
    const result = switchProvider('deepseek', DEFAULT_PROVIDERS)
    expect(result.env['OPENAI_BASE_URL']).toBe('https://api.deepseek.com/v1')
    expect(result.env['OPENAI_MODEL']).toBe('deepseek-chat')
  })

  test('throws for non-existent provider id', async () => {
    const { switchProvider } = await import('../switcher.js')
    const { DEFAULT_PROVIDERS } = await import('../loader.js')
    expect(() => switchProvider('nonexistent', DEFAULT_PROVIDERS)).toThrow(
      'provider "nonexistent" not found',
    )
  })

  test('warns when provider API key env var is not set', async () => {
    const { switchProvider } = await import('../switcher.js')
    const { DEFAULT_PROVIDERS } = await import('../loader.js')
    const result = switchProvider('cerebras', DEFAULT_PROVIDERS)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('CEREBRAS_API_KEY')
  })

  test('no warning when provider API key env var is set', async () => {
    process.env['GROQ_API_KEY'] = 'test-key'
    const { switchProvider } = await import('../switcher.js')
    const { DEFAULT_PROVIDERS } = await import('../loader.js')
    const result = switchProvider('groq', DEFAULT_PROVIDERS)
    expect(result.warnings).toHaveLength(0)
    delete process.env['GROQ_API_KEY']
  })

  test('does not mutate process.env', async () => {
    const { switchProvider } = await import('../switcher.js')
    const { DEFAULT_PROVIDERS } = await import('../loader.js')
    const before = process.env['OPENAI_BASE_URL']
    switchProvider('cerebras', DEFAULT_PROVIDERS)
    expect(process.env['OPENAI_BASE_URL']).toBe(before)
  })
})

describe('buildShellExportBlock', () => {
  test('produces correct shell export lines for cerebras', async () => {
    const { switchProvider, buildShellExportBlock } = await import(
      '../switcher.js'
    )
    const { DEFAULT_PROVIDERS } = await import('../loader.js')
    const result = switchProvider('cerebras', DEFAULT_PROVIDERS)
    const block = buildShellExportBlock(result)
    expect(block).toContain('export CLAUDE_CODE_USE_OPENAI=1')
    expect(block).toContain('export OPENAI_BASE_URL=https://api.cerebras.ai/v1')
    expect(block).toContain('export OPENAI_API_KEY=$CEREBRAS_API_KEY')
    expect(block).toContain('export OPENAI_MODEL=llama-3.3-70b')
  })

  test('api key line uses variable reference not literal value', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-secret-key'
    const { switchProvider, buildShellExportBlock } = await import(
      '../switcher.js'
    )
    const { DEFAULT_PROVIDERS } = await import('../loader.js')
    const result = switchProvider('deepseek', DEFAULT_PROVIDERS)
    const block = buildShellExportBlock(result)
    // Must NOT contain the literal key value
    expect(block).not.toContain('sk-secret-key')
    // Must use variable reference
    expect(block).toContain('$DEEPSEEK_API_KEY')
    delete process.env['DEEPSEEK_API_KEY']
  })
})

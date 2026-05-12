import { describe, expect, test } from 'bun:test'
import { buildEffectiveSystemPrompt } from '../systemPrompt'

const defaultPrompt = ['You are a helpful assistant.', 'Follow instructions.']

function buildPrompt(overrides: Record<string, unknown> = {}) {
  return buildEffectiveSystemPrompt({
    mainThreadAgentDefinition: undefined,
    toolUseContext: { options: {} as any },
    customSystemPrompt: undefined,
    defaultSystemPrompt: defaultPrompt,
    appendSystemPrompt: undefined,
    ...overrides,
  })
}

describe('buildEffectiveSystemPrompt', () => {
  test('returns default system prompt when no overrides', () => {
    const result = buildPrompt()
    expect(Array.from(result)).toEqual(defaultPrompt)
  })

  test('overrideSystemPrompt replaces everything', () => {
    const result = buildPrompt({ overrideSystemPrompt: 'override' })
    expect(Array.from(result)).toEqual(['override'])
  })

  test('customSystemPrompt replaces default', () => {
    const result = buildPrompt({ customSystemPrompt: 'custom' })
    expect(Array.from(result)).toEqual(['custom'])
  })

  test('appendSystemPrompt is appended after main prompt', () => {
    const result = buildPrompt({ appendSystemPrompt: 'appended' })
    expect(Array.from(result)).toEqual([...defaultPrompt, 'appended'])
  })

  test('agent definition replaces default prompt', () => {
    const agentDef = {
      getSystemPrompt: () => 'agent prompt',
      agentType: 'custom',
    } as any
    const result = buildPrompt({ mainThreadAgentDefinition: agentDef })
    expect(Array.from(result)).toEqual(['agent prompt'])
  })

  test('agent definition with append combines both', () => {
    const agentDef = {
      getSystemPrompt: () => 'agent prompt',
      agentType: 'custom',
    } as any
    const result = buildPrompt({
      mainThreadAgentDefinition: agentDef,
      appendSystemPrompt: 'extra',
    })
    expect(Array.from(result)).toEqual(['agent prompt', 'extra'])
  })

  test('override takes precedence over agent and custom', () => {
    const agentDef = {
      getSystemPrompt: () => 'agent prompt',
      agentType: 'custom',
    } as any
    const result = buildPrompt({
      mainThreadAgentDefinition: agentDef,
      customSystemPrompt: 'custom',
      appendSystemPrompt: 'extra',
      overrideSystemPrompt: 'override',
    })
    expect(Array.from(result)).toEqual(['override'])
  })

  test('returns array of strings', () => {
    const result = buildPrompt()
    expect(Array.isArray(result)).toBe(true)
    for (const item of result) {
      expect(typeof item).toBe('string')
    }
  })

  test('custom + append combines both', () => {
    const result = buildPrompt({
      customSystemPrompt: 'custom',
      appendSystemPrompt: 'extra',
    })
    expect(Array.from(result)).toEqual(['custom', 'extra'])
  })
})

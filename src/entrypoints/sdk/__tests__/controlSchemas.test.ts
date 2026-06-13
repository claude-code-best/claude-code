import { describe, expect, test } from 'bun:test'
import { SDKControlInitializeRequestSchema } from '../controlSchemas.js'

describe('SDKControlInitializeRequestSchema', () => {
  test('parses minimal init with only subtype', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
    })
    expect(result.success).toBe(true)
  })

  test('parses title field when provided', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      title: 'My Custom Session Title',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('My Custom Session Title')
    }
  })

  test('title is optional', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      promptSuggestions: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBeUndefined()
    }
  })

  test('rejects non-string title', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      title: 123,
    })
    expect(result.success).toBe(false)
  })

  test('preserves all existing fields', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      sdkMcpServers: ['server1'],
      jsonSchema: { type: 'object' },
      systemPrompt: 'You are helpful',
      appendSystemPrompt: 'Be concise',
      agents: {},
      promptSuggestions: true,
      agentProgressSummaries: false,
      title: 'Test Title',
      planModeInstructions: 'Custom workflow body',
    })
    expect(result.success).toBe(true)
  })

  test('parses planModeInstructions field when provided', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      planModeInstructions: 'Step 1: explore. Step 2: design.',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.planModeInstructions).toBe(
        'Step 1: explore. Step 2: design.',
      )
    }
  })

  test('parses enableFileCheckpointing field when provided', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      enableFileCheckpointing: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enableFileCheckpointing).toBe(true)
    }
  })

  test('parses agent.skills array when provided', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      agents: {
        'code-reviewer': {
          description: 'Reviews code changes',
          prompt: 'You are a code reviewer.',
          skills: ['superpowers:tdd', 'superpowers:code-review'],
        },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const agentDef = result.data.agents?.['code-reviewer']
      expect(agentDef?.skills).toEqual([
        'superpowers:tdd',
        'superpowers:code-review',
      ])
    }
  })

  test('agent.skills is optional', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      agents: {
        'basic-agent': {
          description: 'A basic agent',
          prompt: 'You are helpful.',
        },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const agentDef = result.data.agents?.['basic-agent']
      expect(agentDef?.skills).toBeUndefined()
    }
  })

  test('rejects non-array agent.skills', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      agents: {
        'bad-agent': {
          description: 'Bad',
          prompt: 'x',
          skills: 'superpowers:tdd',
        },
      },
    })
    expect(result.success).toBe(false)
  })

  test('parses excludeDynamicSections field when provided', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      excludeDynamicSections: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.excludeDynamicSections).toBe(true)
    }
  })

  test('excludeDynamicSections is optional', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.excludeDynamicSections).toBeUndefined()
    }
  })

  test('rejects non-boolean excludeDynamicSections', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      excludeDynamicSections: 'true',
    })
    expect(result.success).toBe(false)
  })

  test('parses toolConfig.askUserQuestion.previewFormat=markdown', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      toolConfig: {
        askUserQuestion: { previewFormat: 'markdown' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.toolConfig?.askUserQuestion?.previewFormat).toBe(
        'markdown',
      )
    }
  })

  test('parses toolConfig.askUserQuestion.previewFormat=html', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      toolConfig: {
        askUserQuestion: { previewFormat: 'html' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.toolConfig?.askUserQuestion?.previewFormat).toBe(
        'html',
      )
    }
  })

  test('rejects invalid toolConfig.askUserQuestion.previewFormat', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      toolConfig: {
        askUserQuestion: { previewFormat: 'plaintext' },
      },
    })
    expect(result.success).toBe(false)
  })

  test('toolConfig is optional', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.toolConfig).toBeUndefined()
    }
  })

  test('parses appendSubagentSystemPrompt field when provided', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      appendSubagentSystemPrompt: 'Always cite file paths in your responses.',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.appendSubagentSystemPrompt).toBe(
        'Always cite file paths in your responses.',
      )
    }
  })

  test('appendSubagentSystemPrompt is optional', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.appendSubagentSystemPrompt).toBeUndefined()
    }
  })

  test('rejects non-string appendSubagentSystemPrompt', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      appendSubagentSystemPrompt: 123,
    })
    expect(result.success).toBe(false)
  })

  test('parses forwardSubagentText field when provided (forward-compat)', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      forwardSubagentText: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.forwardSubagentText).toBe(true)
    }
  })

  test('forwardSubagentText is optional', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.forwardSubagentText).toBeUndefined()
    }
  })

  test('rejects non-boolean forwardSubagentText', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      forwardSubagentText: 'yes',
    })
    expect(result.success).toBe(false)
  })

  test('parses webSearchIsolationExemptMcpServers when provided (forward-compat)', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      webSearchIsolationExemptMcpServers: ['brave-search', 'tavily-mcp'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.webSearchIsolationExemptMcpServers).toEqual([
        'brave-search',
        'tavily-mcp',
      ])
    }
  })

  test('webSearchIsolationExemptMcpServers is optional', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.webSearchIsolationExemptMcpServers).toBeUndefined()
    }
  })

  test('rejects non-array webSearchIsolationExemptMcpServers', () => {
    const result = SDKControlInitializeRequestSchema().safeParse({
      subtype: 'initialize',
      webSearchIsolationExemptMcpServers: 'brave-search',
    })
    expect(result.success).toBe(false)
  })
})

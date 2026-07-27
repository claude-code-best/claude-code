import { describe, expect, test } from 'bun:test'
import { applyProviderRuntimeCompatRule } from '../../../providerRuntime/runtimeService.js'

describe('applyProviderRuntimeCompatRule', () => {
  test('removes unsupported fields for strict providers', () => {
    const input = {
      model: 'remote-model',
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'assistant', content: 'answer', reasoning_content: 'private' },
      ],
    }

    const result = applyProviderRuntimeCompatRule(input, 'groq')

    expect(result).not.toHaveProperty('stream_options')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toMatchObject({
      role: 'assistant',
      content: 'answer',
    })
    expect(result.messages[0]).not.toHaveProperty('reasoning_content')
    expect(input).toHaveProperty('stream_options')
  })

  test('preserves fields for permissive providers', () => {
    const input = {
      model: 'remote-reasoning-model',
      stream_options: { include_usage: true },
      messages: [{ role: 'assistant', reasoning_content: 'thought' }],
    }

    expect(applyProviderRuntimeCompatRule(input, 'permissive')).toEqual(input)
  })
})

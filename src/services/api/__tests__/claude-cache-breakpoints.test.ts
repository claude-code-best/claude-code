import { describe, expect, test } from 'bun:test'
import { addCacheBreakpoints, buildSystemPromptBlocks } from '../claude'
import { asSystemPrompt } from '../../../utils/systemPromptType'

function message(type: 'user' | 'assistant', text: string) {
  return { type, message: { role: type, content: text } } as never
}

describe('native Messages cache breakpoints', () => {
  test('marks only the current tail for native Messages', () => {
    const result = addCacheBreakpoints(
      [
        message('user', 'u1'),
        message('assistant', 'a1'),
        message('user', 'u2'),
        message('assistant', 'a2'),
        message('user', 'u3'),
      ],
      true,
      'kin_native_messages',
      false,
      null,
      [],
      false,
      '1h',
    )

    const marked = result.flatMap((entry, index) => {
      const content = Array.isArray(entry.content) ? entry.content : []
      return content.some(
        block =>
          typeof block === 'object' &&
          block !== null &&
          'cache_control' in block,
      )
        ? [index]
        : []
    })

    expect(marked).toEqual([4])
  })
  test('does not add a system marker for native Messages', () => {
    const result = buildSystemPromptBlocks(
      asSystemPrompt(['stable system prompt']),
      true,
      {
        querySource: 'kin_native_messages',
        cacheTtl: '1h',
      },
    )

    expect(result.some(block => 'cache_control' in block)).toBe(false)
  })
})

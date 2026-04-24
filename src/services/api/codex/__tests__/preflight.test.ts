import { describe, expect, test } from 'bun:test'
import { sanitizeCodexRequest } from '../preflight.js'

describe('sanitizeCodexRequest', () => {
  test('normalizes function call ids and tool names', () => {
    const request = sanitizeCodexRequest({
      model: 'gpt-5.4',
      input: [
        {
          type: 'function_call',
          call_id: ' tool 1 / weird ',
          name: ' Read ',
          arguments: '{}',
        },
      ] as any,
      tools: [
        {
          type: 'function',
          name: ' Read ',
          parameters: null,
        },
      ] as any,
    } as any)

    expect(request.input?.[0]).toMatchObject({
      type: 'function_call',
      call_id: 'tool_1_weird',
      name: 'Read',
    })
    expect(request.tools?.[0]).toMatchObject({
      type: 'function',
      name: 'Read',
      parameters: {},
    })
  })

  test('rejects invalid function_call_output without call_id', () => {
    expect(() =>
      sanitizeCodexRequest({
        model: 'gpt-5.4',
        input: [
          {
            type: 'function_call_output',
            call_id: '   ',
            output: 'ok',
          },
        ] as any,
      } as any),
    ).toThrow('Codex preflight: function_call_output.call_id is required.')
  })
})

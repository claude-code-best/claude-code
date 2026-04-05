import { describe, expect, test } from 'bun:test'
import type {
  AssistantMessage,
  UserMessage,
} from '../../../../types/message.js'
import { anthropicMessagesToGemini } from '../convertMessages.js'

function makeUserMsg(content: string | any[]): UserMessage {
  return {
    type: 'user',
    uuid: '00000000-0000-0000-0000-000000000000',
    message: { role: 'user', content },
  } as UserMessage
}

function makeAssistantMsg(content: string | any[]): AssistantMessage {
  return {
    type: 'assistant',
    uuid: '00000000-0000-0000-0000-000000000001',
    message: { role: 'assistant', content },
  } as AssistantMessage
}

describe('anthropicMessagesToGemini', () => {
  test('converts system prompt to systemInstruction', () => {
    const result = anthropicMessagesToGemini(
      [makeUserMsg('hello')],
      ['You are helpful.'] as any,
    )

    expect(result.systemInstruction).toEqual({
      parts: [{ text: 'You are helpful.' }],
    })
  })

  test('converts assistant tool_use to functionCall', () => {
    const result = anthropicMessagesToGemini(
      [
        makeAssistantMsg([
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'bash',
            input: { command: 'ls' },
            _geminiThoughtSignature: 'sig-tool',
          },
        ]),
      ],
      [] as any,
    )

    expect(result.contents).toEqual([
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'bash',
              args: { command: 'ls' },
            },
            thoughtSignature: 'sig-tool',
          },
        ],
      },
    ])
  })

  test('converts tool_result to functionResponse using prior tool name', () => {
    const result = anthropicMessagesToGemini(
      [
        makeAssistantMsg([
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'bash',
            input: { command: 'ls' },
          },
        ]),
        makeUserMsg([
          {
            type: 'tool_result',
            tool_use_id: 'toolu_123',
            content: 'file.txt',
          },
        ]),
      ],
      [] as any,
    )

    expect(result.contents[1]).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'bash',
            response: {
              result: 'file.txt',
            },
          },
        },
      ],
    })
  })

  test('converts thinking blocks with signatures', () => {
    const result = anthropicMessagesToGemini(
      [
        makeAssistantMsg([
          {
            type: 'thinking',
            thinking: 'internal reasoning',
            signature: 'sig-thinking',
          },
          {
            type: 'text',
            text: 'visible answer',
          },
        ]),
      ],
      [] as any,
    )

    expect(result.contents[0]).toEqual({
      role: 'model',
      parts: [
        {
          text: 'internal reasoning',
          thought: true,
          thoughtSignature: 'sig-thinking',
        },
        {
          text: 'visible answer',
        },
      ],
    })
  })

  test('filters empty assistant text and signature-only thinking parts', () => {
    const result = anthropicMessagesToGemini(
      [
        makeAssistantMsg([
          {
            type: 'text',
            text: '',
            _geminiThoughtSignature: 'sig-empty-text',
          },
          {
            type: 'thinking',
            thinking: '',
            signature: 'sig-empty-thinking',
          },
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'bash',
            input: { command: 'pwd' },
          },
        ]),
      ],
      [] as any,
    )

    expect(result.contents).toEqual([
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'bash',
              args: { command: 'pwd' },
            },
          },
        ],
      },
    ])
  })

  test('filters empty user text blocks', () => {
    const result = anthropicMessagesToGemini(
      [
        makeUserMsg([
          {
            type: 'text',
            text: '',
          },
          {
            type: 'text',
            text: 'hello',
          },
        ]),
      ],
      [] as any,
    )

    expect(result.contents).toEqual([
      {
        role: 'user',
        parts: [{ text: 'hello' }],
      },
    ])
  })
})

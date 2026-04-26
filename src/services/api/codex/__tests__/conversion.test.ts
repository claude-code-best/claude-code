import { describe, expect, test } from 'bun:test'
import { createAssistantMessage, createUserMessage } from '../../../../utils/messages.js'
import { anthropicMessagesToCodexInput, anthropicToolsToCodex } from '@ant/model-provider'

describe('anthropicMessagesToCodexInput', () => {
  test('replays assistant tool calls and user tool results in order', async () => {
    const assistant = createAssistantMessage({
      content: [
        'I will inspect the file.',
        {
          type: 'tool_use',
          id: 'tool_1',
          name: 'Read',
          input: { file_path: 'README.md' },
        },
        'Then I will summarize.',
      ] as any,
    })
    const user = createUserMessage({
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool_1',
          content: [
            { type: 'text', text: 'file contents' },
            { type: 'text', text: 'second line' },
          ],
        },
        'Please continue.',
      ] as any,
    })

    const items = await anthropicMessagesToCodexInput([assistant, user])

    expect(items).toHaveLength(5)
    expect(items[0]).toMatchObject({
      type: 'message',
      role: 'assistant',
    })
    expect(items[0]).not.toHaveProperty('id')
    expect(items[0]).not.toHaveProperty('status')
    expect(items[1]).toMatchObject({
      type: 'function_call',
      call_id: 'tool_1',
      name: 'Read',
      arguments: '{"file_path":"README.md"}',
    })
    expect(items[1]).not.toHaveProperty('id')
    expect(items[1]).not.toHaveProperty('status')
    expect(items[2]).toMatchObject({
      type: 'message',
      role: 'assistant',
    })
    expect(items[2]).not.toHaveProperty('id')
    expect(items[2]).not.toHaveProperty('status')
    expect(items[3]).toMatchObject({
      type: 'function_call_output',
      call_id: 'tool_1',
      output: [
        { type: 'input_text', text: 'file contents' },
        { type: 'input_text', text: 'second line' },
      ],
    })
    expect(items[3]).not.toHaveProperty('id')
    expect(items[3]).not.toHaveProperty('status')
    expect(items[4]).toMatchObject({
      type: 'message',
      role: 'user',
    })
  })

  test('normalizes tool call ids consistently across assistant replay and tool results', async () => {
    const assistant = createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: ' tool 1 / weird ',
          name: 'Read',
          input: { file_path: 'README.md' },
        },
      ] as any,
    })
    const user = createUserMessage({
      content: [
        {
          type: 'tool_result',
          tool_use_id: ' tool 1 / weird ',
          content: 'ok',
        },
      ] as any,
    })

    const items = await anthropicMessagesToCodexInput([assistant, user])

    expect(items[0]).toMatchObject({
      type: 'function_call',
      call_id: 'tool_1_weird',
    })
    expect(items[1]).toMatchObject({
      type: 'function_call_output',
      call_id: 'tool_1_weird',
      output: 'ok',
    })
  })

  test('creates a deterministic fallback tool call id when assistant replay is missing one', async () => {
    const assistant = createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: '',
          name: 'Read',
          input: { file_path: 'README.md' },
        },
      ] as any,
    })

    const items = await anthropicMessagesToCodexInput([assistant])

    expect(items[0]).toMatchObject({
      type: 'function_call',
      name: 'Read',
      arguments: '{"file_path":"README.md"}',
    })
    expect((items[0] as any).call_id).toMatch(/^call_[a-f0-9]{24}$/)
  })

  test('degrades unsupported user media blocks to text placeholders', async () => {
    const user = createUserMessage({
      content: [
        { type: 'text', text: 'Inspect the attachment.' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'abc',
          },
        },
      ] as any,
    })

    const items = await anthropicMessagesToCodexInput([user])

    expect(items).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text:
              'Inspect the attachment.\n[Image omitted: codex gateway currently requires remote image URLs. Configure CODEX_IMGBB_API_KEY to auto-convert local images.]',
          },
        ],
      },
    ])
  })

  test('passes through remote image URLs for user messages', async () => {
    const user = createUserMessage({
      content: [
        { type: 'text', text: 'Read the image.' },
        {
          type: 'image',
          source: {
            type: 'url',
            url: 'https://example.com/vision.png',
          },
        },
      ] as any,
    })

    const items = await anthropicMessagesToCodexInput([user])

    expect(items).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Read the image.',
          },
          {
            type: 'input_image',
            image_url: 'https://example.com/vision.png',
            detail: 'high',
          },
        ],
      },
    ])
  })

  test('converts base64 user images through the configured inline resolver', async () => {
    const user = createUserMessage({
      content: [
        { type: 'text', text: 'Read the image.' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'abc',
          },
        },
      ] as any,
    })

    const items = await anthropicMessagesToCodexInput([user], {
      resolveBase64ImageUrl: async (data, mediaType) =>
        data === 'abc' && mediaType === 'image/png'
          ? 'https://example.com/inline-uploaded.png'
          : null,
    })

    expect(items).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Read the image.',
          },
          {
            type: 'input_image',
            image_url: 'https://example.com/inline-uploaded.png',
            detail: 'high',
          },
        ],
      },
    ])
  })

  test('passes through remote image URLs inside tool results', async () => {
    const assistant = createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: 'tool_vision',
          name: 'Read',
          input: { file_path: '/tmp/screenshot.png' },
        },
      ] as any,
    })
    const user = createUserMessage({
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool_vision',
          content: [
            { type: 'text', text: 'Screenshot attached.' },
            {
              type: 'image',
              source: {
                type: 'url',
                url: 'https://example.com/tool-screenshot.png',
              },
            },
          ],
        },
      ] as any,
    })

    const items = await anthropicMessagesToCodexInput([assistant, user])

    expect(items[1]).toEqual({
      type: 'function_call_output',
      call_id: 'tool_vision',
      output: [
        { type: 'input_text', text: 'Screenshot attached.' },
        {
          type: 'input_image',
          image_url: 'https://example.com/tool-screenshot.png',
          detail: 'high',
        },
      ],
    })
  })

  test('degrades unsupported tool result images to text placeholders', async () => {
    const assistant = createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: 'tool_vision',
          name: 'Read',
          input: { file_path: '/tmp/screenshot.png' },
        },
      ] as any,
    })
    const user = createUserMessage({
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool_vision',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'abc',
              },
            },
          ],
        },
      ] as any,
    })

    const items = await anthropicMessagesToCodexInput([assistant, user])

    expect(items[1]).toEqual({
      type: 'function_call_output',
      call_id: 'tool_vision',
      output:
        '[Image omitted: codex gateway currently requires remote image URLs. Configure CODEX_IMGBB_API_KEY to auto-convert local images.]',
    })
  })

  test('converts base64 tool result images through the configured inline resolver', async () => {
    const assistant = createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: 'tool_vision',
          name: 'Read',
          input: { file_path: '/tmp/screenshot.png' },
        },
      ] as any,
    })
    const user = createUserMessage({
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool_vision',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'abc',
              },
            },
          ],
        },
      ] as any,
    })

    const items = await anthropicMessagesToCodexInput([assistant, user], {
      resolveBase64ImageUrl: async (data, mediaType) =>
        data === 'abc' && mediaType === 'image/png'
          ? 'https://example.com/tool-inline-uploaded.png'
          : null,
    })

    expect(items[1]).toEqual({
      type: 'function_call_output',
      call_id: 'tool_vision',
      output: [
        {
          type: 'input_image',
          image_url: 'https://example.com/tool-inline-uploaded.png',
          detail: 'high',
        },
      ],
    })
  })
})

describe('anthropicToolsToCodex', () => {
  test('converts only client function tools', () => {
    const tools = anthropicToolsToCodex([
      {
        name: 'Read',
        description: 'Read a file',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
          },
        },
        strict: true,
      } as any,
      {
        type: 'advisor_20260301',
      } as any,
    ])

    expect(tools).toEqual([
      {
        type: 'function',
        name: 'Read',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
          },
        },
        strict: true,
      },
    ])
  })
})

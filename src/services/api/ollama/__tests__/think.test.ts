import { describe, expect, test } from 'bun:test'
import { getEmptyToolPermissionContext } from '../../../../Tool.js'
import { asSystemPrompt } from '../../../../utils/systemPromptType.js'
import type { Options } from '../../claude.js'
import { resolveOllamaThink } from '../index.js'
import { queryModelOllama } from '../index.js'

describe('resolveOllamaThink', () => {
  test('maps disabled thinking to false for regular Ollama models', () => {
    expect(
      resolveOllamaThink({ type: 'disabled' }, undefined, 'qwen3-coder'),
    ).toBe(false)
  })

  test('maps disabled thinking to low for gpt-oss models', () => {
    expect(
      resolveOllamaThink({ type: 'disabled' }, undefined, 'gpt-oss:120b'),
    ).toBe('low')
  })

  test('uses Ollama think levels from effort values', () => {
    expect(resolveOllamaThink({ type: 'adaptive' }, 'low', 'qwen3-coder')).toBe(
      'low',
    )
    expect(
      resolveOllamaThink({ type: 'adaptive' }, 'medium', 'qwen3-coder'),
    ).toBe('medium')
    expect(
      resolveOllamaThink({ type: 'adaptive' }, 'high', 'qwen3-coder'),
    ).toBe('high')
  })

  test('clamps unsupported effort values to high', () => {
    expect(
      resolveOllamaThink({ type: 'adaptive' }, 'xhigh', 'qwen3-coder'),
    ).toBe('high')
    expect(resolveOllamaThink({ type: 'adaptive' }, 'max', 'qwen3-coder')).toBe(
      'high',
    )
    expect(resolveOllamaThink({ type: 'adaptive' }, 100, 'qwen3-coder')).toBe(
      'high',
    )
  })

  test('uses true for regular models when no explicit effort is set', () => {
    expect(
      resolveOllamaThink({ type: 'adaptive' }, undefined, 'qwen3-coder'),
    ).toBe(true)
  })

  test('uses medium for gpt-oss models when no explicit effort is set', () => {
    expect(
      resolveOllamaThink({ type: 'adaptive' }, undefined, 'gpt-oss:120b'),
    ).toBe('medium')
  })

  test('sends resolved think value in the Ollama chat request body', async () => {
    let requestBody: Record<string, unknown> | undefined
    let showCalled = false

    const options = {
      model: 'qwen3-coder',
      effortValue: 'low',
      querySource: 'test',
      agents: [],
      mcpTools: [],
      hasAppendSystemPrompt: false,
      isNonInteractiveSession: true,
      getToolPermissionContext: () => getEmptyToolPermissionContext(),
      fetchOverride: (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/show')) {
          showCalled = true
          return new Response(
            JSON.stringify({
              model_info: { 'qwen3.context_length': 4096 },
            }),
          )
        }
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(
          [
            JSON.stringify({
              model: 'qwen3-coder',
              message: { role: 'assistant', content: 'ok' },
            }),
            JSON.stringify({ done: true, done_reason: 'stop' }),
          ].join('\n'),
        )
      }) as typeof fetch,
    } as unknown as Options

    const messages = [
      {
        type: 'user' as const,
        uuid: crypto.randomUUID(),
        message: { role: 'user', content: 'hello' },
      },
    ]

    for await (const _ of queryModelOllama(
      messages,
      asSystemPrompt(['system']),
      [],
      new AbortController().signal,
      options,
      { type: 'adaptive' },
    )) {
      // Consume the stream so the request is executed.
    }

    expect(requestBody?.think).toBe('low')
    expect(showCalled).toBe(true)
    expect((requestBody?.options as Record<string, unknown>)?.num_predict).toBe(
      4096,
    )
  })

  test('clamps max output token overrides to the detected context length', async () => {
    let requestBody: Record<string, unknown> | undefined

    const options = {
      model: 'qwen3-coder',
      maxOutputTokensOverride: 8192,
      querySource: 'test',
      agents: [],
      mcpTools: [],
      hasAppendSystemPrompt: false,
      isNonInteractiveSession: true,
      getToolPermissionContext: () => getEmptyToolPermissionContext(),
      fetchOverride: (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/show')) {
          return new Response(
            JSON.stringify({
              model_info: { 'qwen3.context_length': 4096 },
            }),
          )
        }
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(
          [
            JSON.stringify({
              model: 'qwen3-coder',
              message: { role: 'assistant', content: 'ok' },
            }),
            JSON.stringify({ done: true, done_reason: 'stop' }),
          ].join('\n'),
        )
      }) as typeof fetch,
    } as unknown as Options

    const messages = [
      {
        type: 'user' as const,
        uuid: crypto.randomUUID(),
        message: { role: 'user', content: 'hello' },
      },
    ]

    for await (const _ of queryModelOllama(
      messages,
      asSystemPrompt(['system']),
      [],
      new AbortController().signal,
      options,
      { type: 'adaptive' },
    )) {
      // Consume the stream so the request is executed.
    }

    expect((requestBody?.options as Record<string, unknown>)?.num_predict).toBe(
      4096,
    )
  })
})

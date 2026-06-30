import { describe, expect, test } from 'bun:test'
import { extractArtifacts } from '../scanner.js'
import type { Message } from 'src/types/message.js'

function assistantToolUse(id: string, input: Record<string, unknown>): Message {
  return {
    type: 'assistant',
    uuid: crypto.randomUUID(),
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use' as const, id, name: 'artifact', input }],
    },
  }
}

function userToolResult(id: string, content: string, isError = false): Message {
  return {
    type: 'user',
    uuid: crypto.randomUUID(),
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result' as const,
          tool_use_id: id,
          content,
          is_error: isError,
        },
      ],
    },
  }
}

describe('extractArtifacts', () => {
  test('returns empty list when no artifact tool_use messages', () => {
    expect(extractArtifacts([])).toEqual([])
    expect(
      extractArtifacts([
        {
          type: 'user',
          uuid: crypto.randomUUID(),
          message: {
            role: 'user',
            content: [{ type: 'text' as const, text: 'hi' }],
          },
        },
      ]),
    ).toEqual([])
  })

  test('pairs a successful tool_use with its tool_result and returns parsed fields', () => {
    const messages: Message[] = [
      assistantToolUse('tu1', { file_path: '/tmp/report.html', ttl: 7 }),
      userToolResult(
        'tu1',
        'Artifact uploaded: https://x.test/7d/abc.html (id: abc, expires: 2026-06-27T10:00:00.000Z)',
      ),
    ]

    const result = extractArtifacts(messages)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      filePath: '/tmp/report.html',
      hash: 'abc',
      url: 'https://x.test/7d/abc.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
      basename: 'report.html',
      isError: false,
    })
  })

  test('skips artifact tool_use without a matching tool_result', () => {
    const messages: Message[] = [
      assistantToolUse('tu1', { file_path: '/tmp/report.html', ttl: 7 }),
    ]

    expect(extractArtifacts(messages)).toEqual([])
  })

  test('keeps error results with isError=true and no parsed fields', () => {
    const messages: Message[] = [
      assistantToolUse('tu1', { file_path: '/tmp/missing.html', ttl: 7 }),
      userToolResult(
        'tu1',
        'File does not exist or is not readable: /tmp/missing.html',
        true,
      ),
    ]

    const result = extractArtifacts(messages)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      filePath: '/tmp/missing.html',
      basename: 'missing.html',
      isError: true,
    })
    expect(result[0].url).toBeUndefined()
  })

  test('parses url/id/expires from array-form tool_result content', () => {
    const messages: Message[] = [
      assistantToolUse('tu1', { file_path: '/tmp/report.html', ttl: 7 }),
      {
        type: 'user',
        uuid: crypto.randomUUID(),
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: 'tu1',
              content: [
                { type: 'text' as const, text: 'Artifact uploaded: ' },
                {
                  type: 'text' as const,
                  text: 'https://x.test/7d/def.html (id: def, expires: 2026-06-27T10:00:00.000Z)',
                },
              ],
            },
          ],
        },
      },
    ]

    const result = extractArtifacts(messages)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      filePath: '/tmp/report.html',
      hash: 'def',
      url: 'https://x.test/7d/def.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
      basename: 'report.html',
      isError: false,
    })
  })

  test('orders newest first (last in conversation appears at top)', () => {
    const messages: Message[] = [
      assistantToolUse('tu1', { file_path: '/tmp/a.html', ttl: 7 }),
      userToolResult(
        'tu1',
        'Artifact uploaded: https://x.test/7d/a.html (id: a, expires: 2026-06-27T10:00:00.000Z)',
      ),
      assistantToolUse('tu2', { file_path: '/tmp/b.html', ttl: 7 }),
      userToolResult(
        'tu2',
        'Artifact uploaded: https://x.test/7d/b.html (id: b, expires: 2026-06-27T10:00:00.000Z)',
      ),
    ]

    const result = extractArtifacts(messages)

    expect(result.map(r => r.basename)).toEqual(['b.html', 'a.html'])
  })
})

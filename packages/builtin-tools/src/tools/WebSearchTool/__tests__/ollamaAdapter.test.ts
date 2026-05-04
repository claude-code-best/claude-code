import { describe, expect, mock, test } from 'bun:test'

mock.module('src/services/api/ollama/client.js', () => ({
  getOllamaClient: () => ({
    webSearch: async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              title: 'Allowed',
              url: 'https://Docs.Example.com/path',
              content: 'Allowed result',
            },
            {
              title: 'Blocked',
              url: 'https://blocked.example.com/path',
              content: 'Blocked result',
            },
          ],
        }),
      ),
  }),
}))

const { OllamaSearchAdapter } = await import('../adapters/ollamaAdapter.js')

describe('OllamaSearchAdapter', () => {
  test('normalizes allowed and blocked domain filters', async () => {
    const adapter = new OllamaSearchAdapter()

    const results = await adapter.search('query', {
      allowedDomains: [' .EXAMPLE.com. '],
      blockedDomains: ['BLOCKED.example.com'],
    })

    expect(results).toEqual([
      {
        title: 'Allowed',
        url: 'https://Docs.Example.com/path',
        snippet: 'Allowed result',
      },
    ])
  })
})

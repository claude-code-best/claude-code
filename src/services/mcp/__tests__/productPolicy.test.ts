import { afterEach, describe, expect, test } from 'bun:test'
import { setProductRuntimeForTest } from '../../../utils/productMode.js'
import { filterMcpConfigsForProduct } from '../productPolicy.js'
import type { ScopedMcpServerConfig } from '../types.js'

afterEach(() => setProductRuntimeForTest(null))

describe('MCP product policy', () => {
  test('keeps remote and browser-style servers but removes Chat stdio processes', () => {
    setProductRuntimeForTest({
      product: 'chat',
      sessionDataDirectory: '/scratch/session-1',
      browserScopeId: 'session-1',
      sandboxRequired: true,
    })
    const configs = {
      local: {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        scope: 'user',
      },
      remote: {
        type: 'http',
        url: 'https://example.test/mcp',
        scope: 'user',
      },
      browser: {
        type: 'sdk',
        name: 'browser',
        scope: 'dynamic',
      },
    } satisfies Record<string, ScopedMcpServerConfig>

    expect(Object.keys(filterMcpConfigsForProduct(configs))).toEqual([
      'remote',
      'browser',
    ])
  })
})

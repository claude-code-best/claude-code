import { describe, expect, test } from 'bun:test'

import { findUnmatched } from '../ChannelsNotice.js'

describe('findUnmatched', () => {
  test('does not flag builtin weixin as plugin not installed', () => {
    expect(
      findUnmatched(
        [{ kind: 'plugin', name: 'weixin', marketplace: 'builtin' }],
        {
          configuredServerNames: new Set(),
          installedPluginIds: new Set(['weixin@builtin']),
        },
      ),
    ).toEqual([])
  })
})

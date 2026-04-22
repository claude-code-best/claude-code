import { afterAll, describe, expect, mock, test } from 'bun:test'

const _restores: (() => void)[] = []

function safeMockModule(tsPath: string, overrides: Record<string, unknown>) {
  const jsPath = tsPath.replace(/\.ts$/, '.js')
  const real = require(tsPath)
  const snapshot = { ...real }
  mock.module(jsPath, () => ({ ...snapshot, ...overrides }))
  _restores.push(() => mock.module(jsPath, () => snapshot))
}

safeMockModule('../../analytics/growthbook.ts', {
  getFeatureValue_CACHED_MAY_BE_STALE: () => [],
})

afterAll(() => {
  for (const restore of _restores) restore()
})

import { isChannelAllowlisted } from '../channelAllowlist.js'

describe('isChannelAllowlisted', () => {
  test('allows builtin weixin plugin', () => {
    expect(isChannelAllowlisted('weixin@builtin')).toBe(true)
  })

  test('rejects undefined plugin source', () => {
    expect(isChannelAllowlisted(undefined)).toBe(false)
  })
})

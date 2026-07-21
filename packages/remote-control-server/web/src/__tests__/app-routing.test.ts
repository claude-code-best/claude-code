import { describe, expect, test } from 'bun:test'

import { parsePath } from '../App'

describe('product-aware shell routing', () => {
  test('keeps global system pages inside the selected product slice', () => {
    expect(parsePath('/code/runtime', '#chat')).toEqual({
      view: 'runtime-center',
      product: 'chat',
    })
    expect(parsePath('/code/channels', '')).toEqual({
      view: 'channels',
      product: 'code',
    })
    expect(parsePath('/code/providers', '#chat')).toEqual({
      view: 'providers',
      product: 'chat',
    })
  })
})

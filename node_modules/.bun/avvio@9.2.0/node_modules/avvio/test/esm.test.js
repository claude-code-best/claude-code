'use strict'

const { test } = require('node:test')

test('support esm import', async t => {
  await import('./esm.mjs')
  t.assert.ok('esm is supported')
})

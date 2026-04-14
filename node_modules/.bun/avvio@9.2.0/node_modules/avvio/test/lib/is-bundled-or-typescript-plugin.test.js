'use strict'

const { test } = require('node:test')
const { isBundledOrTypescriptPlugin } = require('../../lib/is-bundled-or-typescript-plugin')

test('isBundledOrTypescriptPlugin', (t) => {
  t.plan(9)

  t.assert.strictEqual(isBundledOrTypescriptPlugin(1), false)
  t.assert.strictEqual(isBundledOrTypescriptPlugin('function'), false)
  t.assert.strictEqual(isBundledOrTypescriptPlugin({}), false)
  t.assert.strictEqual(isBundledOrTypescriptPlugin([]), false)
  t.assert.strictEqual(isBundledOrTypescriptPlugin(null), false)

  t.assert.strictEqual(isBundledOrTypescriptPlugin(function () {}), false)
  t.assert.strictEqual(isBundledOrTypescriptPlugin(new Promise((resolve) => resolve)), false)
  t.assert.strictEqual(isBundledOrTypescriptPlugin(Promise.resolve()), false)

  t.assert.strictEqual(isBundledOrTypescriptPlugin({ default: () => {} }), true)
})

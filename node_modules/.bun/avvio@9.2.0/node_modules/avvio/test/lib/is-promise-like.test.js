'use strict'

const { test } = require('node:test')
const { isPromiseLike } = require('../../lib/is-promise-like')

test('isPromiseLike', (t) => {
  t.plan(9)

  t.assert.strictEqual(isPromiseLike(1), false)
  t.assert.strictEqual(isPromiseLike('function'), false)
  t.assert.strictEqual(isPromiseLike({}), false)
  t.assert.strictEqual(isPromiseLike([]), false)
  t.assert.strictEqual(isPromiseLike(null), false)

  t.assert.strictEqual(isPromiseLike(function () {}), false)
  t.assert.strictEqual(isPromiseLike(new Promise((resolve) => resolve)), true)
  t.assert.strictEqual(isPromiseLike(Promise.resolve()), true)

  t.assert.strictEqual(isPromiseLike({ then: () => {} }), true)
})

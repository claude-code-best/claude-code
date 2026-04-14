'use strict'

const { test } = require('node:test')
const boot = require('..')

test('not taking done does not throw error.', (t, testDone) => {
  t.plan(2)

  const app = boot()

  app.use(noDone).ready((err) => {
    t.assert.strictEqual(err, null, 'no error')
    testDone()
  })

  function noDone (s, opts) {
    t.assert.ok('did not throw')
  }
})

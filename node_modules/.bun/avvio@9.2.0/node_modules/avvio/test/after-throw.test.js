'use strict'

const { test } = require('node:test')
const boot = require('..')

test('catched error by Promise.reject', async (t) => {
  const app = boot()
  t.plan(3)

  try {
    await app
      .use(function (f, opts) {
        return Promise.reject(new Error('kaboom'))
      })
      .after(async function (err) {
        t.assert.strictEqual(err.message, 'kaboom')
        throw new Error('kaboom2')
      })
  } catch (err) {
    t.assert.strictEqual(err.message, 'kaboom2')
  }

  app.ready(function () {
    t.assert.fail('the ready callback should never be called')
  })
})

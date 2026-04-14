'use strict'

const { test } = require('node:test')
const boot = require('..')

test('catch exceptions in parent.override', (t, testDone) => {
  t.plan(2)

  const server = {}

  const app = boot(server, {
    autostart: false
  })
  app.override = function () {
    throw Error('catch it')
  }

  app
    .use(function () {})
    .start()

  app.ready(function (err) {
    t.assert.ok(err instanceof Error)
    t.assert.strictEqual(err.message, 'catch it')
    testDone()
  })
})

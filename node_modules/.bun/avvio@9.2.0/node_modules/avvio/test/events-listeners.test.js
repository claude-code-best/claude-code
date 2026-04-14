'use strict'

const { test } = require('node:test')
const boot = require('..')
const noop = () => {}

test('boot a plugin and then execute a call after that', (t, testDone) => {
  t.plan(1)

  process.on('warning', (warning) => {
    t.assert.fail('we should not get a warning')
  })

  const app = boot()
  for (let i = 0; i < 12; i++) {
    app.on('preReady', noop)
  }

  setTimeout(() => {
    t.assert.ok('Everything ok')
    testDone()
  }, 500)
})

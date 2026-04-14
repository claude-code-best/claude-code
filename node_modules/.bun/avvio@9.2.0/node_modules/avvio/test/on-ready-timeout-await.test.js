'use strict'

/* eslint no-prototype-builtins: off */

const { test } = require('node:test')
const boot = require('../boot')

test('onReadyTimeout', async (t) => {
  const app = boot({}, {
    timeout: 10, // 10 ms
    autostart: false
  })

  app.use(function one (innerApp, opts, next) {
    t.assert.ok('loaded')
    innerApp.ready(function readyNoResolve (err, done) {
      t.assert.ifError(err)
      t.assert.ok('first ready called')
      // Do not call done() to timeout
    })
    next()
  })

  await app.start()

  try {
    await app.ready()
    t.assert.fail('should throw')
  } catch (err) {
    t.assert.strictEqual(err.message, 'Plugin did not start in time: \'readyNoResolve\'. You may have forgotten to call \'done\' function or to resolve a Promise')
    // And not Plugin did not start in time: 'bound _encapsulateThreeParam'. You may have forgotten to call 'done' function or to resolve a Promise
  }
})

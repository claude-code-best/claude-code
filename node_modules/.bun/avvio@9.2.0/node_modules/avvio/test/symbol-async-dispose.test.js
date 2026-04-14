'use strict'

const { test } = require('node:test')
const boot = require('..')

// asyncDispose doesn't exist in Node.js < 20
test('Symbol.asyncDispose should close avvio', { skip: !('asyncDispose' in Symbol) }, async (t) => {
  t.plan(2)

  const app = boot()
  let closeHandlerCalled = false

  app.use(function (server, opts, done) {
    app.onClose(() => {
      closeHandlerCalled = true
    })
    done()
  })

  await app.ready()

  t.assert.strictEqual(app.booted, true)

  // Simulates using keyword behavior: await using app = boot()
  await app[Symbol.asyncDispose]()

  t.assert.ok(closeHandlerCalled, 'onClose handler should be called')
})

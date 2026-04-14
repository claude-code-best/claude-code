'use strict'

const { test } = require('node:test')
const boot = require('../..')

test('should print the time tree', (t, done) => {
  t.plan(2)
  const app = boot()

  app.use(function first (instance, opts, cb) {
    const out = instance.prettyPrint().split('\n')
    t.assert.strictEqual(out[0], 'root -1 ms')
    t.assert.strictEqual(out[1], '└── first -1 ms')
    cb()
    done()
  })
})

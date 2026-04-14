'use strict'

const { test } = require('node:test')
const boot = require('..')

test('proper support for after with a passed async function in wrapped mode', (t, testCompleted) => {
  const app = {}
  boot(app)

  t.plan(5)

  const e = new Error('kaboom')

  app.use(function (f, opts) {
    return Promise.reject(e)
  }).after(function (err, cb) {
    t.assert.deepStrictEqual(err, e)
    cb(err)
  }).after(function () {
    t.assert.ok('this is just called')
  }).after(function (err, cb) {
    t.assert.deepStrictEqual(err, e)
    cb(err)
  })

  app.ready().then(() => {
    t.assert.fail('this should not be called')
  }).catch(err => {
    t.assert.ok(err)
    t.assert.strictEqual(err.message, 'kaboom')
    testCompleted()
  })
})

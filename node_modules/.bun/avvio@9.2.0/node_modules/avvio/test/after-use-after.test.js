'use strict'

const { test } = require('node:test')
const boot = require('..')
const app = {}

boot(app)

test('multi after', async (t) => {
  t.plan(6)
  const app = {}
  boot(app)

  app.use(function (f, opts, cb) {
    cb()
  }).after(() => {
    t.assert.ok('this is just called')

    app.use(function (f, opts, cb) {
      t.assert.ok('this is just called')
      cb()
    })
  }).after(function () {
    t.assert.ok('this is just called')
    app.use(function (f, opts, cb) {
      t.assert.ok('this is just called')
      cb()
    })
  }).after(function (err, cb) {
    t.assert.ok('this is just called')
    cb(err)
  })

  await app.ready().then(() => {
    t.assert.ok('ready')
  }).catch(() => {
    t.assert.fail('this should not be called')
  })
})

test('after grouping - use called after after called', async (t) => {
  t.plan(8)
  const app = {}
  boot(app)

  const TEST_VALUE = {}
  const OTHER_TEST_VALUE = {}
  const NEW_TEST_VALUE = {}

  const sO = (fn) => {
    fn[Symbol.for('skip-override')] = true
    return fn
  }

  app.use(sO(function (f, options, next) {
    f.test = TEST_VALUE

    next()
  }))

  app.after(function (err, f, done) {
    t.assert.ifError(err)
    t.assert.strictEqual(f.test, TEST_VALUE)

    f.test2 = OTHER_TEST_VALUE
    done()
  })

  app.use(sO(function (f, options, next) {
    t.assert.strictEqual(f.test, TEST_VALUE)
    t.assert.strictEqual(f.test2, OTHER_TEST_VALUE)

    f.test3 = NEW_TEST_VALUE

    next()
  }))

  app.after(function (err, f, done) {
    t.assert.ifError(err)
    t.assert.strictEqual(f.test, TEST_VALUE)
    t.assert.strictEqual(f.test2, OTHER_TEST_VALUE)
    t.assert.strictEqual(f.test3, NEW_TEST_VALUE)
    done()
  })

  await app.ready()
})

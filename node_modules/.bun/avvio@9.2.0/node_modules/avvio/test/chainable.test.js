'use strict'

const { test } = require('node:test')
const boot = require('..')

test('chainable standalone', (t, testDone) => {
  t.plan(5)

  const readyResult = boot()
    .use(function (ctx, opts, done) {
      t.assert.ok('1st plugin')
      done()
    }).after(function (err, done) {
      t.assert.ifError(err)
      t.assert.ok('2nd after')
      done()
    }).ready(function () {
      t.assert.ok('we are ready')
      testDone()
    })
  t.assert.strictEqual(readyResult, undefined)
})

test('chainable automatically binded', (t, testDone) => {
  t.plan(5)

  const app = {}
  boot(app)

  const readyResult = app
    .use(function (ctx, opts, done) {
      t.assert.ok('1st plugin')
      done()
    }).after(function (err, done) {
      t.assert.ifError(err)
      t.assert.ok('2nd after')
      done()
    }).ready(function () {
      t.assert.ok('we are ready')
      testDone()
    })
  t.assert.strictEqual(readyResult, undefined)
})

test('chainable standalone with server', (t, testDone) => {
  t.plan(6)

  const server = {}
  boot(server, {
    expose: {
      use: 'register'
    }
  })

  const readyResult = server.register(function (ctx, opts, done) {
    t.assert.ok('1st plugin')
    done()
  }).after(function (err, done) {
    t.assert.ifError(err)
    t.assert.ok('2nd after')
    done()
  }).register(function (ctx, opts, done) {
    t.assert.ok('3rd plugin')
    done()
  }).ready(function () {
    t.assert.ok('we are ready')
    testDone()
  })
  t.assert.strictEqual(readyResult, undefined)
})

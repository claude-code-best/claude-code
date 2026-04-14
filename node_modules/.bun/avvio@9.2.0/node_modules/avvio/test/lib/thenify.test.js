'use strict'

const { test } = require('node:test')
const { kThenifyDoNotWrap } = require('../../lib/symbols')
const libDebug = require('../../lib/debug')

test('thenify', async (t) => {
  t.plan(7)

  const mockDebug = (t, debugImpl) => {
    const originalDebug = libDebug.debug.bind(libDebug)

    t.before((ctx) => {
      libDebug.debug = debugImpl
      delete require.cache[require.resolve('../../lib/thenify')]
    })

    t.after((ctx) => {
      libDebug.debug = originalDebug
    })
  }

  await t.test('return undefined if booted', (t) => {
    t.plan(2)

    mockDebug(t, (message) => {
      t.assert.strictEqual(message, 'thenify returning undefined because we are already booted')
    })

    const { thenify } = require('../../lib/thenify')

    const result = thenify.call({
      booted: true
    })
    t.assert.strictEqual(result, undefined)
  })

  await t.test('return undefined if kThenifyDoNotWrap is true', (t) => {
    t.plan(1)

    const { thenify } = require('../../lib/thenify')
    const result = thenify.call({
      [kThenifyDoNotWrap]: true
    })
    t.assert.strictEqual(result, undefined)
  })

  await t.test('return PromiseConstructorLike if kThenifyDoNotWrap is false', (t) => {
    t.plan(3)

    mockDebug(t, (message) => {
      t.assert.strictEqual(message, 'thenify')
    })

    const { thenify } = require('../../lib/thenify')

    const promiseContructorLike = thenify.call({
      [kThenifyDoNotWrap]: false
    })

    t.assert.strictEqual(typeof promiseContructorLike, 'function')
    t.assert.strictEqual(promiseContructorLike.length, 2)
  })

  await t.test('return PromiseConstructorLike', (t) => {
    t.plan(3)

    mockDebug(t, (message) => {
      t.assert.strictEqual(message, 'thenify')
    })

    const { thenify } = require('../../lib/thenify')

    const promiseContructorLike = thenify.call({})

    t.assert.strictEqual(typeof promiseContructorLike, 'function')
    t.assert.strictEqual(promiseContructorLike.length, 2)
  })

  await t.test('resolve should return _server', async (t) => {
    t.plan(1)

    const { thenify } = require('../../lib/thenify')

    const server = {
      _loadRegistered: () => {
        return Promise.resolve()
      },
      _server: 'server'
    }
    const promiseContructorLike = thenify.call(server)

    promiseContructorLike(function (value) {
      t.assert.strictEqual(value, 'server')
    }, function (reason) {
      t.assert.ifError(reason)
    })
  })

  await t.test('resolving should set kThenifyDoNotWrap to true', async (t) => {
    t.plan(1)

    const { thenify } = require('../../lib/thenify')

    const server = {
      _loadRegistered: () => {
        return Promise.resolve()
      },
      [kThenifyDoNotWrap]: false,
      _server: 'server'
    }
    const promiseContructorLike = thenify.call(server)

    promiseContructorLike(function (value) {
      t.assert.strictEqual(server[kThenifyDoNotWrap], true)
    }, function (reason) {
      t.assert.ifError(reason)
    })
  })

  await t.test('rejection should pass through to reject', async (t) => {
    t.plan(1)

    const { thenify } = require('../../lib/thenify')

    const server = {
      _loadRegistered: () => {
        return Promise.reject(new Error('Arbitrary rejection'))
      },
      _server: 'server'
    }
    const promiseContructorLike = thenify.call(server)

    promiseContructorLike(function (value) {
      t.assert.ifError(value)
    }, function (reason) {
      t.assert.strictEqual(reason.message, 'Arbitrary rejection')
    })
  })
})

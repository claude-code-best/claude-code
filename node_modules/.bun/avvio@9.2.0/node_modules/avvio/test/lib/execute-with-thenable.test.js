'use strict'

const { describe, test: t } = require('node:test')
const { executeWithThenable } = require('../../lib/execute-with-thenable')
const { kAvvio } = require('../../lib/symbols')

describe('executeWithThenable', () => {
  t.test('passes the arguments to the function', (t, done) => {
    t.plan(5)

    executeWithThenable((...args) => {
      t.assert.strictEqual(args.length, 3)
      t.assert.strictEqual(args[0], 1)
      t.assert.strictEqual(args[1], 2)
      t.assert.strictEqual(args[2], 3)
    }, [1, 2, 3], (err) => {
      t.assert.ifError(err)
      done()
    })
  })

  t.test('function references this to itself', (t, done) => {
    t.plan(2)

    const func = function () {
      t.assert.strictEqual(this, func)
    }
    executeWithThenable(func, [], (err) => {
      t.assert.ifError(err)
      done()
    })
  })

  t.test('handle resolving Promise of func', (t, done) => {
    t.plan(1)

    const fn = function () {
      return Promise.resolve(42)
    }

    executeWithThenable(fn, [], (err) => {
      t.assert.ifError(err)
      done()
    })
  })

  t.test('handle rejecting Promise of func', (t, done) => {
    t.plan(1)

    const fn = function () {
      return Promise.reject(new Error('Arbitrary Error'))
    }

    executeWithThenable(fn, [], (err) => {
      t.assert.strictEqual(err.message, 'Arbitrary Error')
      done()
    })
  })

  t.test('dont handle avvio mocks PromiseLike results but use callback if provided', (t, done) => {
    t.plan(1)

    const fn = function () {
      const result = Promise.resolve(42)
      result[kAvvio] = true
    }

    executeWithThenable(fn, [], (err) => {
      t.assert.ifError(err)
      done()
    })
  })

  t.test('dont handle avvio mocks Promises and if no callback is provided', (t, done) => {
    t.plan(1)

    const fn = function () {
      t.assert.ok(true)
      const result = Promise.resolve(42)
      result[kAvvio] = true
      done()
    }

    executeWithThenable(fn, [])
  })
})

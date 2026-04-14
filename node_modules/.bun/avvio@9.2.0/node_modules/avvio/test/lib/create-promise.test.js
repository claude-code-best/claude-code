'use strict'

const { test } = require('node:test')
const { createPromise } = require('../../lib/create-promise')

test('createPromise() returns an object', async (t) => {
  t.plan(3)

  t.assert.strictEqual(typeof createPromise(), 'object')
  t.assert.strictEqual(Array.isArray(createPromise()), false)
  t.assert.notStrictEqual(Array.isArray(createPromise()), null)
})

test('createPromise() returns an attribute with attribute resolve', (t) => {
  t.plan(1)
  t.assert.ok('resolve' in createPromise())
})

test('createPromise() returns an attribute with attribute reject', (t) => {
  t.plan(1)
  t.assert.ok('reject' in createPromise())
})

test('createPromise() returns an attribute with attribute createPromise', (t) => {
  t.plan(1)
  t.assert.ok('promise' in createPromise())
})

test('when resolve is called, createPromise attribute is resolved', (t) => {
  t.plan(1)
  const p = createPromise()

  p.promise
    .then(() => {
      t.assert.ok('pass')
    })
    .catch(() => {
      t.assert.fail()
    })
  p.resolve()
})

test('when reject is called, createPromise attribute is rejected', (t) => {
  t.plan(1)
  const p = createPromise()

  p.promise
    .then(() => {
      t.assert.fail()
    })
    .catch(() => {
      t.assert.ok('pass')
    })

  p.reject()
})

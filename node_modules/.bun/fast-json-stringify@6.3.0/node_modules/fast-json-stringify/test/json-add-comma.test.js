'use strict'

const { test } = require('node:test')
const build = require('..')

test('additionalProperties: false', (t) => {
  t.plan(1)
  const stringify = build({
    title: 'additionalProperties',
    type: 'object',
    properties: {
      foo: {
        type: 'string'
      }
    },
    additionalProperties: false
  })

  const obj = { foo: 'a', bar: 'b', baz: 'c' }
  t.assert.equal(stringify(obj), '{"foo":"a"}')
})

test('additionalProperties: {}', (t) => {
  t.plan(1)
  const stringify = build({
    title: 'additionalProperties',
    type: 'object',
    properties: {
      foo: {
        type: 'string'
      }
    },
    additionalProperties: {}
  })

  const obj = { foo: 'a', bar: 'b', baz: 'c' }
  t.assert.equal(stringify(obj), '{"foo":"a","bar":"b","baz":"c"}')
})

test('additionalProperties: {type: string}', (t) => {
  t.plan(1)
  const stringify = build({
    title: 'additionalProperties',
    type: 'object',
    properties: {
      foo: {
        type: 'string'
      }
    },
    additionalProperties: {
      type: 'string'
    }
  })

  const obj = { foo: 'a', bar: 'b', baz: 'c' }
  t.assert.equal(stringify(obj), '{"foo":"a","bar":"b","baz":"c"}')
})

'use strict'

/* eslint no-extend-native: off */

const { test } = require('node:test')

// Something could extend the Array prototype
Array.prototype.test = null
test('for-in-loop', t => {
  t.assert.doesNotThrow(() => {
    require('../')
  })
})

test('ignore inherited constraint keys', t => {
  const findMyWay = require('../')()
  const constraints = Object.create({ tap: true })

  t.assert.doesNotThrow(() => {
    findMyWay.on('GET', '/test', { constraints }, () => {})
  })
})

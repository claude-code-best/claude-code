'use strict'

const { test } = require('node:test')
const { validatePlugin } = require('../../lib/validate-plugin')
const { AVV_ERR_PLUGIN_NOT_VALID } = require('../../lib/errors')

test('validatePlugin', (t) => {
  t.plan(8)

  t.assert.throws(() => validatePlugin(1), new AVV_ERR_PLUGIN_NOT_VALID('number'))
  t.assert.throws(() => validatePlugin('function'), new AVV_ERR_PLUGIN_NOT_VALID('string'))
  t.assert.throws(() => validatePlugin({}), new AVV_ERR_PLUGIN_NOT_VALID('object'))
  t.assert.throws(() => validatePlugin([]), new AVV_ERR_PLUGIN_NOT_VALID('array'))
  t.assert.throws(() => validatePlugin(null), new AVV_ERR_PLUGIN_NOT_VALID('null'))

  t.assert.doesNotThrow(() => validatePlugin(function () {}))
  t.assert.doesNotThrow(() => validatePlugin(new Promise((resolve) => resolve)))
  t.assert.doesNotThrow(() => validatePlugin(Promise.resolve()))
})

'use strict'

const { test } = require('node:test')
const boot = require('..')
const { kPluginMeta } = require('../lib/symbols')

test('plugins get a name from the plugin metadata if it is set', async (t) => {
  t.plan(2)
  const app = boot()

  const func = (app, opts, next) => next()
  func[kPluginMeta] = { name: 'a-test-plugin' }
  app.use(func)
  await app.ready()

  const jsonToCompare = app.toJSON()

  t.assert.strictEqual(jsonToCompare.label, 'root')
  t.assert.strictEqual(jsonToCompare.nodes[0].label, 'a-test-plugin')
})

test('plugins get a name from the options if theres no metadata', async (t) => {
  t.plan(2)
  const app = boot()

  function testPlugin (app, opts, next) { next() }
  app.use(testPlugin, { name: 'test registration options name' })
  await app.ready()

  const jsonToCompare = app.toJSON()
  t.assert.strictEqual(jsonToCompare.label, 'root')
  t.assert.strictEqual(jsonToCompare.nodes[0].label, 'test registration options name')
})

test('plugins get a name from the function name if theres no name in the options and no metadata', async (t) => {
  t.plan(2)
  const app = boot()

  function testPlugin (app, opts, next) { next() }
  app.use(testPlugin)
  await app.ready()

  const jsonToCompare = app.toJSON()
  t.assert.strictEqual(jsonToCompare.label, 'root')
  t.assert.strictEqual(jsonToCompare.nodes[0].label, 'testPlugin')
})

test('plugins get a name from the function source if theres no other option', async (t) => {
  t.plan(2)
  const app = boot()

  app.use((app, opts, next) => next())
  await app.ready()

  const jsonToCompare = app.toJSON()
  t.assert.strictEqual(jsonToCompare.label, 'root')
  t.assert.strictEqual(jsonToCompare.nodes[0].label, '(app, opts, next) => next()')
})

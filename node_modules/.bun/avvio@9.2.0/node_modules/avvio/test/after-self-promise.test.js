'use strict'

const { test } = require('node:test')
const boot = require('..')

test('after does not await itself', async (t) => {
  t.plan(3)

  const app = {}
  boot(app)

  app.use(async (app) => {
    t.assert.ok('plugin init')
  })
  app.after(() => app)
  t.assert.ok('reachable')

  await app.ready()
  t.assert.ok('reachable')
})

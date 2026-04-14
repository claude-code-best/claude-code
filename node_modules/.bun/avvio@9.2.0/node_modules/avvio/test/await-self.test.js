'use strict'

const { test } = require('node:test')
const boot = require('..')

test('await self', async (t) => {
  const app = {}
  boot(app)

  t.assert.deepStrictEqual(await app, app)
})

test('await self three times', async (t) => {
  const app = {}
  boot(app)

  t.assert.deepStrictEqual(await app, app)
  t.assert.deepStrictEqual(await app, app)
  t.assert.deepStrictEqual(await app, app)
})

test('await self within plugin', async (t) => {
  const app = {}
  boot(app)

  app.use(async (f) => {
    t.assert.deepStrictEqual(await f, f)
  })

  t.assert.deepStrictEqual(await app, app)
})

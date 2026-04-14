import { test } from 'node:test'
import boot from '../boot.js'

await test('support import', async (t) => {
  const app = boot()

  app.use(import('./fixtures/esm.mjs'))

  await app.ready()

  t.assert.ok(app.loaded)
})

'use strict'

const { test } = require('node:test')
const boot = require('..')

test('calling done twice does not throw error', (t, testDone) => {
  t.plan(2)

  const app = boot()

  app
    .use(twiceDone)
    .ready((err) => {
      t.assert.ifError(err)
      testDone()
    })

  function twiceDone (s, opts, done) {
    done()
    done()
    t.assert.ok('did not throw')
  }
})

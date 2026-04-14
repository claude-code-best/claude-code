'use strict'

const { test } = require('node:test')
const boot = require('..')

test('one level', (t, testDone) => {
  t.plan(13)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(first)
  app.use(third)

  function first (s, opts, done) {
    t.assert.strictEqual(firstLoaded, false, 'first is not loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    firstLoaded = true
    s.use(second)
    done()
  }

  function second (s, opts, done) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    secondLoaded = true
    done()
  }

  function third (s, opts, done) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    thirdLoaded = true
    done()
  }

  app.on('start', () => {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.ok(thirdLoaded, 'third is loaded')
    t.assert.ok('booted')
    testDone()
  })
})

test('multiple reentrant plugin loading', (t, testDone) => {
  t.plan(31)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false
  let fourthLoaded = false
  let fifthLoaded = false

  app.use(first)
  app.use(fifth)

  function first (s, opts, done) {
    t.assert.strictEqual(firstLoaded, false, 'first is not loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    t.assert.strictEqual(fourthLoaded, false, 'fourth is not loaded')
    t.assert.strictEqual(fifthLoaded, false, 'fifth is not loaded')
    firstLoaded = true
    s.use(second)
    done()
  }

  function second (s, opts, done) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    t.assert.strictEqual(fourthLoaded, false, 'fourth is not loaded')
    t.assert.strictEqual(fifthLoaded, false, 'fifth is not loaded')
    secondLoaded = true
    s.use(third)
    s.use(fourth)
    done()
  }

  function third (s, opts, done) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    t.assert.strictEqual(fourthLoaded, false, 'fourth is not loaded')
    t.assert.strictEqual(fifthLoaded, false, 'fifth is not loaded')
    thirdLoaded = true
    done()
  }

  function fourth (s, opts, done) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.ok(thirdLoaded, 'third is loaded')
    t.assert.strictEqual(fourthLoaded, false, 'fourth is not loaded')
    t.assert.strictEqual(fifthLoaded, false, 'fifth is not loaded')
    fourthLoaded = true
    done()
  }

  function fifth (s, opts, done) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.ok(thirdLoaded, 'third is loaded')
    t.assert.ok(fourthLoaded, 'fourth is loaded')
    t.assert.strictEqual(fifthLoaded, false, 'fifth is not loaded')
    fifthLoaded = true
    done()
  }

  app.on('start', () => {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.ok(thirdLoaded, 'third is loaded')
    t.assert.ok(fourthLoaded, 'fourth is loaded')
    t.assert.ok(fifthLoaded, 'fifth is loaded')
    t.assert.ok('booted')
    testDone()
  })
})

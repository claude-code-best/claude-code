'use strict'

const { test } = require('node:test')
const boot = require('..')

test('reentrant', (t, testCompleted) => {
  t.plan(7)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false

  app
    .use(first)
    .after(() => {
      t.assert.ok(firstLoaded, 'first is loaded')
      t.assert.ok(secondLoaded, 'second is loaded')
      t.assert.ok(true)
      testCompleted()
    })

  function first (s, opts, done) {
    t.assert.strictEqual(firstLoaded, false, 'first is not loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    firstLoaded = true
    s.use(second)
    done()
  }

  function second (s, opts, done) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    secondLoaded = true
    done()
  }
})

test('reentrant with callbacks deferred', (t, testCompleted) => {
  t.plan(11)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(first)

  function first (s, opts, done) {
    t.assert.strictEqual(firstLoaded, false, 'first is not loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    firstLoaded = true
    s.use(second)
    setTimeout(() => {
      try {
        s.use(third)
      } catch (err) {
        t.assert.strictEqual(err.message, 'Root plugin has already booted')
      }
      testCompleted()
    }, 500)
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
    thirdLoaded = true
    done()
  }

  app.on('start', () => {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    t.assert.ok(true)
  })
})

test('multiple loading time', (t, testCompleted) => {
  t.plan(1)
  const app = boot()

  function a (instance, opts, done) {
    (opts.use || []).forEach(_ => { instance.use(_, { use: opts.subUse || [] }) })
    setTimeout(done, 10)
  }
  const pointer = a

  function b (instance, opts, done) {
    (opts.use || []).forEach(_ => { instance.use(_, { use: opts.subUse || [] }) })
    setTimeout(done, 20)
  }

  function c (instance, opts, done) {
    (opts.use || []).forEach(_ => { instance.use(_, { use: opts.subUse || [] }) })
    setTimeout(done, 30)
  }

  app
    .use(function a (instance, opts, done) {
      instance.use(pointer, { use: [b], subUse: [c] })
        .use(b)
      setTimeout(done, 0)
    })
    .after(() => {
      t.assert.ok(true)
      testCompleted()
    })
})

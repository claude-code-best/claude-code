'use strict'

const { test } = require('node:test')
const boot = require('..')

const message = (name) => `Plugin did not start in time: '${name}'. You may have forgotten to call 'done' function or to resolve a Promise`

test('timeout without calling next - callbacks', (t, done) => {
  t.plan(4)
  const app = boot({}, {
    timeout: 10 // 10 ms
  })
  app.use(one)
  function one (app, opts, next) {
    // do not call next on purpose
  }
  app.ready((err) => {
    t.assert.ok(err)
    t.assert.strictEqual(err.fn, one)
    t.assert.strictEqual(err.message, message('one'))
    t.assert.strictEqual(err.code, 'AVV_ERR_PLUGIN_EXEC_TIMEOUT')
    done()
  })
})

test('timeout without calling next - promises', (t, done) => {
  t.plan(4)
  const app = boot({}, {
    timeout: 10 // 10 ms
  })
  app.use(two)
  function two (app, opts) {
    return new Promise(function (resolve) {
      // do not call resolve on purpose
    })
  }
  app.ready((err) => {
    t.assert.ok(err)
    t.assert.strictEqual(err.fn, two)
    t.assert.strictEqual(err.message, message('two'))
    t.assert.strictEqual(err.code, 'AVV_ERR_PLUGIN_EXEC_TIMEOUT')
    done()
  })
})

test('timeout without calling next - use file as name', (t, done) => {
  t.plan(3)
  const app = boot({}, {
    timeout: 10 // 10 ms
  })
  app.use(require('./fixtures/plugin-no-next'))
  app.ready((err) => {
    t.assert.ok(err)
    t.assert.strictEqual(err.message, message('noNext'))
    t.assert.strictEqual(err.code, 'AVV_ERR_PLUGIN_EXEC_TIMEOUT')
    done()
  })
})

test('timeout without calling next - use code as name', (t, done) => {
  t.plan(3)
  const app = boot({}, {
    timeout: 10 // 10 ms
  })
  app.use(function (app, opts, next) {
    // do not call next on purpose - code as name
  })

  app.ready((err) => {
    t.assert.ok(err)
    t.assert.strictEqual(err.message, message('function (app, opts, next) { -- // do not call next on purpose - code as name'))
    t.assert.strictEqual(err.code, 'AVV_ERR_PLUGIN_EXEC_TIMEOUT')
    done()
  })
})

test('does not keep going', (t, done) => {
  t.plan(2)
  const app = boot({}, {
    timeout: 10 // 10 ms
  })
  app.use(function three (app, opts, next) {
    next(new Error('kaboom'))
  })
  app.ready((err) => {
    t.assert.ok(err)
    t.assert.strictEqual(err.message, 'kaboom')
    done()
  })
})

test('throw in override without autostart', (t, done) => {
  t.plan(2)

  const server = { my: 'server' }
  const app = boot(server, {
    timeout: 10,
    autostart: false
  })

  app.override = function (s) {
    throw new Error('kaboom')
  }

  app.use(function (s, opts, cb) {
    t.assert.fail('this is never reached')
  })

  setTimeout(function () {
    app.ready((err) => {
      t.assert.ok(err)
      t.assert.strictEqual(err.message, 'kaboom')
      done()
    })
  }, 20)
})

test('timeout without calling next in ready and ignoring the error', (t, done) => {
  t.plan(11)
  const app = boot({}, {
    timeout: 10, // 10 ms
    autostart: false
  })

  let preReady = false

  app.use(function one (app, opts, next) {
    t.assert.ok(true, 'loaded')
    app.ready(function readyOk (err, done) {
      t.assert.strictEqual(err, null)
      t.assert.ok(true, 'first ready called')
      done()
    })
    next()
  })

  app.on('preReady', () => {
    t.assert.ok(true, 'preReady should be called')
    preReady = true
  })

  app.on('start', () => {
    t.assert.ok(true, 'start should be called')
  })

  app.ready(function onReadyWithoutDone (err, done) {
    t.assert.ok(true, 'wrong ready called')
    t.assert.ok(preReady, 'preReady already called')
    t.assert.strictEqual(err, null)
    // done() // Don't call done
  })

  app.ready(function onReadyTwo (err) {
    t.assert.ok(err)
    t.assert.strictEqual(err.message, message('onReadyWithoutDone'))
    t.assert.strictEqual(err.code, 'AVV_ERR_READY_TIMEOUT')
    done()
    // don't rethrow the error
  })

  app.start()
})

test('timeout without calling next in ready and rethrowing the error', (t, testDone) => {
  t.plan(11)
  const app = boot({}, {
    timeout: 10, // 10 ms
    autostart: true
  })

  app.use(function one (app, opts, next) {
    t.assert.ok(true, 'loaded')
    app.ready(function readyOk (err, done) {
      t.assert.ok(err)
      t.assert.strictEqual(err.message, message('onReadyWithoutDone'))
      t.assert.strictEqual(err.code, 'AVV_ERR_READY_TIMEOUT')
      done(err)
    })
    next()
  })

  app.on('preReady', () => {
    t.assert.ok(true, 'preReady should be called')
  })

  app.on('start', () => {
    t.assert.ok(true, 'start should be called in any case')
  })

  app.ready(function onReadyWithoutDone (err, done) {
    t.assert.ok(true, 'wrong ready called')
    t.assert.strictEqual(err, null)
    // done() // Don't call done
  })

  app.ready(function onReadyTwo (err, done) {
    t.assert.ok(err)
    t.assert.strictEqual(err.message, message('onReadyWithoutDone'))
    t.assert.strictEqual(err.code, 'AVV_ERR_READY_TIMEOUT')
    done(err)
    testDone()
  })

  app.start()
})

test('nested timeout do not crash - await', (t, done) => {
  t.plan(4)
  const app = boot({}, {
    timeout: 10 // 10 ms
  })
  app.use(one)
  async function one (app, opts) {
    await app.use(two)
  }

  function two (app, opts, next) {
    // do not call next on purpose
  }
  app.ready((err) => {
    t.assert.ok(err)
    t.assert.strictEqual(err.fn, two)
    t.assert.strictEqual(err.message, message('two'))
    t.assert.strictEqual(err.code, 'AVV_ERR_PLUGIN_EXEC_TIMEOUT')
    done()
  })
})

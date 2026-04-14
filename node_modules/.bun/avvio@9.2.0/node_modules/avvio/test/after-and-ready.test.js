'use strict'

const { test } = require('node:test')
const boot = require('..')

test('boot a plugin and then execute a call after that', (t, testDone) => {
  t.plan(5)

  const app = boot()
  let pluginLoaded = false
  let afterCalled = false

  app.use(function (s, opts, done) {
    t.assert.strictEqual(afterCalled, false, 'after not called')
    pluginLoaded = true
    done()
  })

  app.after(function (err, cb) {
    t.assert.ifError(err)
    t.assert.ok(pluginLoaded, 'afterred!')
    afterCalled = true
    cb()
  })

  app.on('start', () => {
    t.assert.ok(afterCalled, 'after called')
    t.assert.ok(pluginLoaded, 'plugin loaded')
    testDone()
  })
})

test('after without a done callback', (t, testDone) => {
  t.plan(5)

  const app = boot()
  let pluginLoaded = false
  let afterCalled = false

  app.use(function (s, opts, done) {
    t.assert.strictEqual(afterCalled, false, 'after not called')
    pluginLoaded = true
    done()
  })

  app.after(function (err) {
    t.assert.ifError(err)
    t.assert.ok(pluginLoaded, 'afterred!')
    afterCalled = true
  })

  app.on('start', () => {
    t.assert.ok(afterCalled, 'after called')
    t.assert.ok(pluginLoaded, 'plugin loaded')
    testDone()
  })
})

test('verify when a afterred call happens', (t, testDone) => {
  t.plan(3)

  const app = boot()

  app.use(function (s, opts, done) {
    done()
  })

  app.after(function (err, cb) {
    t.assert.ifError(err)
    t.assert.ok(true)
    cb()
  })

  app.on('start', () => {
    t.assert.ok(true)
    testDone()
  })
})

test('internal after', (t, testDone) => {
  t.plan(18)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false
  let afterCalled = false

  app.use(first)
  app.use(third)

  function first (s, opts, done) {
    t.assert.strictEqual(firstLoaded, false, 'first is not loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    firstLoaded = true
    s.use(second)
    s.after(function (err, cb) {
      t.assert.ifError(err)
      t.assert.strictEqual(afterCalled, false, 'after was not called')
      afterCalled = true
      cb()
    })
    done()
  }

  function second (s, opts, done) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    t.assert.strictEqual(afterCalled, false, 'after was not called')
    secondLoaded = true
    done()
  }

  function third (s, opts, done) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.ok(afterCalled, 'after was called')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    thirdLoaded = true
    done()
  }

  app.on('start', () => {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.ok(thirdLoaded, 'third is loaded')
    t.assert.ok(afterCalled, 'after was called')
    t.assert.ok(true)
    testDone()
  })
})

test('ready adds at the end of the queue', (t, testDone) => {
  t.plan(14)

  const app = boot()
  let pluginLoaded = false
  let afterCalled = false
  let readyCalled = false

  app.ready(function (err, cb) {
    t.assert.ifError(err)
    t.assert.ok(pluginLoaded, 'after the plugin')
    t.assert.ok(afterCalled, 'after after')
    readyCalled = true
    process.nextTick(cb)
  })

  app.use(function (s, opts, done) {
    t.assert.strictEqual(afterCalled, false, 'after not called')
    t.assert.strictEqual(readyCalled, false, 'ready not called')
    pluginLoaded = true

    app.ready(function (err) {
      t.assert.ifError(err)
      t.assert.ok(readyCalled, 'after the first ready')
      t.assert.ok(afterCalled, 'after the after callback')
    })

    done()
  })

  app.after(function (err, cb) {
    t.assert.ifError(err)
    t.assert.ok(pluginLoaded, 'executing after!')
    t.assert.strictEqual(readyCalled, false, 'ready not called')
    afterCalled = true
    cb()
  })

  app.on('start', () => {
    t.assert.ok(afterCalled, 'after called')
    t.assert.ok(pluginLoaded, 'plugin loaded')
    t.assert.ok(readyCalled, 'ready called')
    testDone()
  })
})

test('if the after/ready callback has three parameters, the second one must be the context', (t, testDone) => {
  t.plan(4)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done()
  })

  app.after(function (err, context, cb) {
    t.assert.ifError(err)
    t.assert.deepStrictEqual(server, context)
    cb()
  })

  app.ready(function (err, context, cb) {
    t.assert.ifError(err)
    t.assert.deepStrictEqual(server, context)
    cb()
    testDone()
  })
})

test('if the after/ready async, the returns must be the context generated', (t, testDone) => {
  t.plan(3)

  const server = { my: 'server', index: 0 }
  const app = boot(server)
  app.override = function (old) {
    return { ...old, index: old.index + 1 }
  }

  app.use(function (s, opts, done) {
    s.use(function (s, opts, done) {
      s.ready().then(itself => {
        t.assert.deepStrictEqual(itself, s, 'deep deep')
        testDone()
      })
      done()
    })
    s.ready().then(itself => {
      t.assert.deepStrictEqual(itself, s, 'deep')
    })
    done()
  })

  app.ready().then(itself => {
    t.assert.deepStrictEqual(itself, server, 'outer')
  })
})

test('if the after/ready callback, the returns must be the context generated', (t, testDone) => {
  t.plan(3)

  const server = { my: 'server', index: 0 }
  const app = boot(server)
  app.override = function (old) {
    return { ...old, index: old.index + 1 }
  }

  app.use(function (s, opts, done) {
    s.use(function (s, opts, done) {
      s.ready((_, itself, done) => {
        t.assert.deepStrictEqual(itself, s, 'deep deep')
        done()
        testDone()
      })
      done()
    })
    s.ready((_, itself, done) => {
      t.assert.deepStrictEqual(itself, s, 'deep')
      done()
    })
    done()
  })

  app.ready((_, itself, done) => {
    t.assert.deepStrictEqual(itself, server, 'outer')
    done()
  })
})

test('error should come in the first after - one parameter', (t, testDone) => {
  t.plan(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.after(function (err) {
    t.assert.ok(err instanceof Error)
    t.assert.deepEqual(err.message, 'err')
  })

  app.ready(function (err) {
    t.assert.ifError(err)
    testDone()
  })
})

test('error should come in the first after - two parameters', (t, testDone) => {
  t.plan(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.after(function (err, cb) {
    t.assert.ok(err instanceof Error)
    t.assert.strictEqual(err.message, 'err')
    cb()
  })

  app.ready(function (err) {
    t.assert.ifError(err)
    testDone()
  })
})

test('error should come in the first after - three parameter', (t, testDone) => {
  t.plan(4)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.after(function (err, context, cb) {
    t.assert.ok(err instanceof Error)
    t.assert.strictEqual(err.message, 'err')
    t.assert.deepStrictEqual(context, server)
    cb()
  })

  app.ready(function (err) {
    t.assert.ifError(err)
    testDone()
  })
})

test('error should come in the first ready - one parameter', (t, testDone) => {
  t.plan(2)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.ready(function (err) {
    t.assert.ok(err instanceof Error)
    t.assert.strictEqual(err.message, 'err')
    testDone()
  })
})

test('error should come in the first ready - two parameters', (t, testDone) => {
  t.plan(2)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.ready(function (err, cb) {
    t.assert.ok(err instanceof Error)
    t.assert.strictEqual(err.message, 'err')
    cb()
    testDone()
  })
})

test('error should come in the first ready - three parameters', (t, testDone) => {
  t.plan(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.ready(function (err, context, cb) {
    t.assert.ok(err instanceof Error)
    t.assert.strictEqual(err.message, 'err')
    t.assert.deepStrictEqual(context, server)
    cb()
    testDone()
  })
})

test('if `use` has a callback with more then one parameter, the error must not reach ready', (t, testDone) => {
  t.plan(1)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.ready(function (err) {
    t.assert.ok(err)
    testDone()
  })
})

test('if `use` has a callback without parameters, the error must reach ready', (t, testDone) => {
  t.plan(1)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  }, () => {})

  app.ready(function (err) {
    t.assert.ok(err)
    testDone()
  })
})

test('should pass the errors from after to ready', (t, testDone) => {
  t.plan(6)

  const server = {}
  const app = boot(server, {})

  server.use(function (s, opts, done) {
    t.assert.deepStrictEqual(s, server, 'the first argument is the server')
    t.assert.deepStrictEqual(opts, {}, 'no options')
    done()
  }).after((err, done) => {
    t.assert.ifError(err)
    done(new Error('some error'))
  })

  server.onClose(() => {
    t.assert.ok(true)
    testDone()
  })

  server.ready(err => {
    t.assert.strictEqual(err.message, 'some error')
  })

  app.on('start', () => {
    server.close(() => {
      t.assert.ok(true)
    })
  })
})

test('after no encapsulation', (t, testDone) => {
  t.plan(4)

  const app = boot()
  app.override = function (s, fn, opts) {
    s = Object.create(s)
    return s
  }

  app.use(function (instance, opts, next) {
    instance.test = true
    instance.after(function (err, i, done) {
      t.assert.ifError(err)
      t.assert.strictEqual(i.test, undefined)
      done()
    })
    next()
  })

  app.after(function (err, i, done) {
    t.assert.ifError(err)
    t.assert.strictEqual(i.test, undefined)
    done()
    testDone()
  })
})

test('ready no encapsulation', (t, testDone) => {
  t.plan(4)

  const app = boot()
  app.override = function (s, fn, opts) {
    s = Object.create(s)
    return s
  }

  app.use(function (instance, opts, next) {
    instance.test = true
    instance.ready(function (err, i, done) {
      t.assert.ifError(err)
      t.assert.strictEqual(i.test, undefined)
      done()
      testDone()
    })
    next()
  })

  app.ready(function (err, i, done) {
    t.assert.ifError(err)
    t.assert.strictEqual(i.test, undefined)
    done()
  })
})

test('after encapsulation with a server', (t, testDone) => {
  t.plan(4)

  const server = { my: 'server' }
  const app = boot(server)
  app.override = function (s, fn, opts) {
    s = Object.create(s)
    return s
  }

  app.use(function (instance, opts, next) {
    instance.test = true
    instance.after(function (err, i, done) {
      t.assert.ifError(err)
      t.assert.ok(i.test)
      done()
    })
    next()
  })

  app.after(function (err, i, done) {
    t.assert.ifError(err)
    t.assert.strictEqual(i.test, undefined)
    done()
    testDone()
  })
})

test('ready encapsulation with a server', (t, testDone) => {
  t.plan(4)

  const server = { my: 'server' }
  const app = boot(server)
  app.override = function (s, fn, opts) {
    s = Object.create(s)
    return s
  }

  app.use(function (instance, opts, next) {
    instance.test = true
    instance.ready(function (err, i, done) {
      t.assert.ifError(err)
      t.assert.ok(i.test)
      done()
      testDone()
    })
    next()
  })

  app.ready(function (err, i, done) {
    t.assert.ifError(err)
    t.assert.strictEqual(i.test, undefined)
    done()
  })
})

test('after should passthrough the errors', (t, testDone) => {
  t.plan(5)

  const app = boot()
  let pluginLoaded = false
  let afterCalled = false

  app.use(function (s, opts, done) {
    t.assert.strictEqual(afterCalled, false, 'after not called')
    pluginLoaded = true
    done(new Error('kaboom'))
  })

  app.after(function () {
    t.assert.ok(pluginLoaded, 'afterred!')
    afterCalled = true
  })

  app.ready(function (err) {
    t.assert.ok(err)
    t.assert.ok(afterCalled, 'after called')
    t.assert.ok(pluginLoaded, 'plugin loaded')
    testDone()
  })
})

test('stop loading plugins if it errors', (t, testDone) => {
  t.plan(2)

  const app = boot()

  app.use(function first (server, opts, done) {
    t.assert.ok(true)
    done(new Error('kaboom'))
  })

  app.use(function second (server, opts, done) {
    t.assert.fail('this should never be called')
  })

  app.ready((err) => {
    t.assert.strictEqual(err.message, 'kaboom')
    testDone()
  })
})

test('keep loading if there is an .after', (t, testDone) => {
  t.plan(4)

  const app = boot()

  app.use(function first (server, opts, done) {
    t.assert.ok(true)
    done(new Error('kaboom'))
  })

  app.after(function (err) {
    t.assert.strictEqual(err.message, 'kaboom')
  })

  app.use(function second (server, opts, done) {
    t.assert.ok(true)
    done()
  })

  app.ready((err) => {
    t.assert.ifError(err)
    testDone()
  })
})

test('do not load nested plugin if parent errors', (t, testDone) => {
  t.plan(4)

  const app = boot()

  app.use(function first (server, opts, done) {
    t.assert.ok(true)

    server.use(function second (_, opts, done) {
      t.assert.fail('this should never be called')
    })

    done(new Error('kaboom'))
  })

  app.after(function (err) {
    t.assert.strictEqual(err.message, 'kaboom')
  })

  app.use(function third (server, opts, done) {
    t.assert.ok(true)
    done()
  })

  app.ready((err) => {
    t.assert.ifError(err)
    testDone()
  })
})

test('.after nested', (t, testDone) => {
  t.plan(4)

  const app = boot()

  app.use(function outer (app, opts, done) {
    app.use(function first (app, opts, done) {
      t.assert.ok(true)
      done(new Error('kaboom'))
    })

    app.after(function (err) {
      t.assert.strictEqual(err.message, 'kaboom')
    })

    app.use(function second (app, opts, done) {
      t.assert.ok(true)
      done()
    })

    done()
  })

  app.ready((err) => {
    t.assert.ifError(err)
    testDone()
  })
})

test('nested error', (t, testDone) => {
  t.plan(4)

  const app = boot()

  app.use(function outer (app, opts, done) {
    app.use(function first (app, opts, done) {
      t.assert.ok(true)
      done(new Error('kaboom'))
    })

    app.use(function second (app, opts, done) {
      t.assert.fail('this should never be called')
    })

    done()
  })

  app.after(function (err) {
    t.assert.strictEqual(err.message, 'kaboom')
  })

  app.use(function third (server, opts, done) {
    t.assert.ok(true)
    done()
  })

  app.ready((err) => {
    t.assert.ifError(err)
    testDone()
  })
})

test('preReady event', (t, testDone) => {
  t.plan(4)

  const app = boot()
  const order = [1, 2]

  app.use(function first (server, opts, done) {
    t.assert.ok(true)
    done()
  })

  app.use(function second (server, opts, done) {
    t.assert.ok(true)
    done()
  })

  app.on('preReady', () => {
    t.assert.strictEqual(order.shift(), 1)
  })

  app.ready(() => {
    t.assert.strictEqual(order.shift(), 2)
    testDone()
  })
})

test('preReady event (multiple)', (t, testDone) => {
  t.plan(6)

  const app = boot()
  const order = [1, 2, 3, 4]

  app.use(function first (server, opts, done) {
    t.assert.ok(true)
    done()
  })

  app.use(function second (server, opts, done) {
    t.assert.ok(true)
    done()
  })

  app.on('preReady', () => {
    t.assert.strictEqual(order.shift(), 1)
  })

  app.on('preReady', () => {
    t.assert.strictEqual(order.shift(), 2)
  })

  app.on('preReady', () => {
    t.assert.strictEqual(order.shift(), 3)
  })

  app.ready(() => {
    t.assert.strictEqual(order.shift(), 4)
    testDone()
  })
})

test('preReady event (nested)', (t, testDone) => {
  t.plan(6)

  const app = boot()
  const order = [1, 2, 3, 4]

  app.use(function first (server, opts, done) {
    t.assert.ok(true)
    done()
  })

  app.use(function second (server, opts, done) {
    t.assert.ok(true)

    server.on('preReady', () => {
      t.assert.strictEqual(order.shift(), 3)
    })

    done()
  })

  app.on('preReady', () => {
    t.assert.strictEqual(order.shift(), 1)
  })

  app.on('preReady', () => {
    t.assert.strictEqual(order.shift(), 2)
  })

  app.ready(() => {
    t.assert.strictEqual(order.shift(), 4)
    testDone()
  })
})

test('preReady event (errored)', (t, testDone) => {
  t.plan(5)

  const app = boot()
  const order = [1, 2, 3]

  app.use(function first (server, opts, done) {
    t.assert.ok(true)
    done(new Error('kaboom'))
  })

  app.use(function second (server, opts, done) {
    t.assert.fail('We should not be here')
  })

  app.on('preReady', () => {
    t.assert.strictEqual(order.shift(), 1)
  })

  app.on('preReady', () => {
    t.assert.strictEqual(order.shift(), 2)
  })

  app.ready((err) => {
    t.assert.ok(err)
    t.assert.strictEqual(order.shift(), 3)
    testDone()
  })
})

test('after return self', (t, testDone) => {
  t.plan(6)

  const app = boot()
  let pluginLoaded = false
  let afterCalled = false
  let second = false

  app.use(function (s, opts, done) {
    t.assert.strictEqual(afterCalled, false, 'after not called')
    pluginLoaded = true
    done()
  })

  app.after(function () {
    t.assert.ok(pluginLoaded, 'afterred!')
    afterCalled = true
    // happens with after(() => app.use(..))
    return app
  })

  app.use(function (s, opts, done) {
    t.assert.ok(afterCalled, 'after called')
    second = true
    done()
  })

  app.on('start', () => {
    t.assert.ok(afterCalled, 'after called')
    t.assert.ok(pluginLoaded, 'plugin loaded')
    t.assert.ok(second, 'second plugin loaded')
    testDone()
  })
})

test('after 1 param swallows errors with server and timeout', (t, testDone) => {
  t.plan(3)

  const server = {}
  boot(server, { autostart: false, timeout: 1000 })

  server.use(function first (server, opts, done) {
    t.assert.ok(true)
    done(new Error('kaboom'))
  })

  server.use(function second (server, opts, done) {
    t.assert.fail('We should not be here')
  })

  server.after(function (err) {
    t.assert.ok(err)
  })

  server.ready(function (err) {
    t.assert.ifError(err)
    testDone()
  })
})

'use strict'

const { test } = require('node:test')
const boot = require('..')

test('boot an empty app', (t, testCompleted) => {
  t.plan(1)
  const app = boot()
  app.on('start', () => {
    t.assert.ok(true, 'booted')
    testCompleted()
  })
})

test('start returns app', (t, testCompleted) => {
  t.plan(1)
  const app = boot({}, { autostart: false })
  app
    .start()
    .ready((err) => {
      t.assert.ifError(err)
      testCompleted()
    })
})

test('boot an app with a plugin', (t, testCompleted) => {
  t.plan(4)

  const app = boot()
  let after = false

  app.use(function (server, opts, done) {
    t.assert.deepStrictEqual(server, app, 'the first argument is the server')
    t.assert.deepStrictEqual(opts, {}, 'no options')
    t.assert.ok(after, 'delayed execution')
    done()
  })

  after = true

  app.on('start', () => {
    t.assert.ok(true, 'booted')
    testCompleted()
  })
})

test('boot an app with a promisified plugin', (t, testCompleted) => {
  t.plan(4)

  const app = boot()
  let after = false

  app.use(function (server, opts) {
    t.assert.deepStrictEqual(server, app, 'the first argument is the server')
    t.assert.deepStrictEqual(opts, {}, 'no options')
    t.assert.ok(after, 'delayed execution')
    return Promise.resolve()
  })

  after = true

  app.on('start', () => {
    t.assert.ok(true, 'booted')
    testCompleted()
  })
})

test('boot an app with a plugin and a callback /1', (t, testCompleted) => {
  t.plan(2)

  const app = boot(() => {
    t.assert.ok(true, 'booted')
  })

  app.use(function (server, opts, done) {
    t.assert.ok(true, 'plugin loaded')
    done()
    testCompleted()
  })
})

test('boot an app with a plugin and a callback /2', (t, testCompleted) => {
  t.plan(2)

  const app = boot({}, () => {
    t.assert.ok(true, 'booted')
  })

  app.use(function (server, opts, done) {
    t.assert.ok(true, 'plugin loaded')
    done()
    testCompleted()
  })
})

test('boot a plugin with a custom server', (t, testCompleted) => {
  t.plan(4)

  const server = {}
  const app = boot(server)

  app.use(function (s, opts, done) {
    t.assert.deepStrictEqual(s, server, 'the first argument is the server')
    t.assert.deepStrictEqual(opts, {}, 'no options')
    done()
  })

  app.onClose(() => {
    t.assert.ok(true, 'onClose called')
    testCompleted()
  })

  app.on('start', () => {
    app.close(() => {
      t.assert.ok(true, 'booted')
    })
  })
})

test('custom instance should inherits avvio methods /1', (t, testCompleted) => {
  t.plan(6)

  const server = {}
  const app = boot(server, {})

  server.use(function (s, opts, done) {
    t.assert.deepStrictEqual(s, server, 'the first argument is the server')
    t.assert.deepStrictEqual(opts, {}, 'no options')
    done()
  }).after(() => {
    t.assert.ok(true, 'after called')
  })

  server.onClose(() => {
    t.assert.ok(true, 'onClose called')
    testCompleted()
  })

  server.ready(() => {
    t.assert.ok(true, 'ready called')
  })

  app.on('start', () => {
    server.close(() => {
      t.assert.ok(true, 'booted')
    })
  })
})

test('custom instance should inherits avvio methods /2', (t, testCompleted) => {
  t.plan(6)

  const server = {}
  const app = new boot(server, {}) // eslint-disable-line new-cap

  server.use(function (s, opts, done) {
    t.assert.deepStrictEqual(s, server, 'the first argument is the server')
    t.assert.deepStrictEqual(opts, {}, 'no options')
    done()
  }).after(() => {
    t.assert.ok(true, 'after called')
  })

  server.onClose(() => {
    t.assert.ok(true, 'onClose called')
    testCompleted()
  })

  server.ready(() => {
    t.assert.ok(true, 'ready called')
  })

  app.on('start', () => {
    server.close(() => {
      t.assert.ok(true, 'booted')
    })
  })
})

test('boot a plugin with options', (t, testCompleted) => {
  t.plan(3)

  const server = {}
  const app = boot(server)
  const myOpts = {
    hello: 'world'
  }

  app.use(function (s, opts, done) {
    t.assert.deepStrictEqual(s, server, 'the first argument is the server')
    t.assert.deepStrictEqual(opts, myOpts, 'passed options')
    done()
  }, myOpts)

  app.on('start', () => {
    t.assert.ok(true, 'booted')
    testCompleted()
  })
})

test('boot a plugin with a function that returns the options', (t, testCompleted) => {
  t.plan(4)

  const server = {}
  const app = boot(server)
  const myOpts = {
    hello: 'world'
  }
  const myOptsAsFunc = parent => {
    t.assert.deepStrictEqual(parent, server)
    return parent.myOpts
  }

  app.use(function (s, opts, done) {
    s.myOpts = opts
    done()
  }, myOpts)

  app.use(function (s, opts, done) {
    t.assert.deepStrictEqual(s, server, 'the first argument is the server')
    t.assert.deepStrictEqual(opts, myOpts, 'passed options via function accessing parent injected variable')
    done()
  }, myOptsAsFunc)

  app.on('start', () => {
    t.assert.ok(true, 'booted')
    testCompleted()
  })
})

test('throw on non-function use', (t) => {
  t.plan(1)
  const app = boot()
  t.assert.throws(() => {
    app.use({})
  })
})

// https://github.com/mcollina/avvio/issues/20
test('ready and nextTick', (t, testCompleted) => {
  const app = boot()
  process.nextTick(() => {
    app.ready(() => {
      testCompleted()
    })
  })
})

// https://github.com/mcollina/avvio/issues/20
test('promises and microtask', (t, testCompleted) => {
  const app = boot()
  Promise.resolve()
    .then(() => {
      app.ready(function () {
        testCompleted()
      })
    })
})

test('always loads nested plugins after the current one', (t, testCompleted) => {
  t.plan(2)

  const server = {}
  const app = boot(server)

  let second = false

  app.use(function (s, opts, done) {
    app.use(function (s, opts, done) {
      second = true
      done()
    })
    t.assert.ok(!second)

    done()
  })

  app.on('start', () => {
    t.assert.ok(true, second)
    testCompleted()
  })
})

test('promise long resolve', (t, testCompleted) => {
  t.plan(2)

  const app = boot()

  setTimeout(function () {
    t.assert.throws(() => {
      app.use((s, opts, done) => {
        done()
      })
    }, 'root plugin has already booted')
    testCompleted()
  })

  app.ready(function (err) {
    t.assert.ok(!err)
  })
})

test('do not autostart', (t) => {
  const app = boot(null, {
    autostart: false
  })
  app.on('start', () => {
    t.assert.fail()
  })
})

test('start with ready', (t, testCompleted) => {
  t.plan(2)

  const app = boot(null, {
    autostart: false
  })

  app.on('start', () => {
    t.assert.ok(true)
    testCompleted()
  })

  app.ready(function (err) {
    t.assert.ifError(err)
  })
})

test('load a plugin after start()', (t, testCompleted) => {
  t.plan(1)

  let startCalled = false
  const app = boot(null, {
    autostart: false
  })

  app.use((s, opts, done) => {
    t.assert.ok(startCalled)
    done()
    testCompleted()
  })

  // we use a timer because
  // it is more reliable than
  // nextTick and setImmediate
  // this almost always will come
  // after those are completed
  setTimeout(() => {
    app.start()
    startCalled = true
  }, 2)
})

test('booted should be set before ready', (t, testCompleted) => {
  t.plan(2)

  const app = boot()

  app.ready(function (err) {
    t.assert.ifError(err)
    t.assert.ok(app.booted)
    testCompleted()
  })
})

test('start should be emitted after ready resolves', (t, testCompleted) => {
  t.plan(1)

  const app = boot()
  let ready = false

  app.ready().then(function () {
    ready = true
  })

  app.on('start', function () {
    t.assert.ok(ready)
    testCompleted()
  })
})

test('throws correctly if registering after ready', (t, testCompleted) => {
  t.plan(1)

  const app = boot()

  app.ready(function () {
    t.assert.throws(() => {
      app.use((a, b, done) => done())
    }, 'root plugin has already booted')
    testCompleted()
  })
})

test('preReady errors must be managed', (t, testCompleted) => {
  t.plan(2)

  const app = boot()

  app.use((f, opts, cb) => {
    cb()
  })

  app.on('preReady', () => {
    throw new Error('boom')
  })

  app.ready(err => {
    t.assert.ok(true, 'ready function is called')
    t.assert.equal(err.message, 'boom')
    testCompleted()
  })
})

test('preReady errors do not override plugin\'s errors', (t, testCompleted) => {
  t.plan(3)

  const app = boot()

  app.use((f, opts, cb) => {
    cb(new Error('baam'))
  })

  app.on('preReady', () => {
    t.assert.ok(true, 'preReady is executed')
    throw new Error('boom')
  })

  app.ready(err => {
    t.assert.ok(true, 'ready function is called')
    t.assert.equal(err.message, 'baam')
    testCompleted()
  })
})

test('support faux modules', (t, testCompleted) => {
  t.plan(4)

  const app = boot()
  let after = false

  // Faux modules are modules built with TypeScript
  // or Babel that they export a .default property.
  app.use({
    default: function (server, opts, done) {
      t.assert.deepStrictEqual(server, app, 'the first argument is the server')
      t.assert.deepStrictEqual(opts, {}, 'no options')
      t.assert.ok(true, after, 'delayed execution')
      done()
    }
  })

  after = true

  app.on('start', () => {
    t.assert.ok(true, 'booted')
    testCompleted()
  })
})

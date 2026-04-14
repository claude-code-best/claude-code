'use strict'

/* eslint no-prototype-builtins: off */

const { test } = require('node:test')
const boot = require('..')

test('custom inheritance', (t, testDone) => {
  t.plan(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.override = function (s) {
    t.assert.deepStrictEqual(s, server)

    const res = Object.create(s)
    res.b = 42

    return res
  }

  app.use(function first (s, opts, cb) {
    t.assert.notDeepStrictEqual(s, server)
    t.assert.ok(Object.prototype.isPrototypeOf.call(server, s))
    cb()
    testDone()
  })
})

test('custom inheritance multiple levels', (t, testDone) => {
  t.plan(6)

  const server = { count: 0 }
  const app = boot(server)

  app.override = function (s) {
    const res = Object.create(s)
    res.count = res.count + 1

    return res
  }

  app.use(function first (s1, opts, cb) {
    t.assert.notDeepStrictEqual(s1, server)
    t.assert.ok(Object.prototype.isPrototypeOf.call(server, s1))
    t.assert.strictEqual(s1.count, 1)
    s1.use(second)

    cb()

    function second (s2, opts, cb) {
      t.assert.notDeepStrictEqual(s2, s1)
      t.assert.ok(Object.prototype.isPrototypeOf.call(s1, s2))
      t.assert.strictEqual(s2.count, 2)
      cb()
      testDone()
    }
  })
})

test('custom inheritance multiple levels twice', (t, testDone) => {
  t.plan(10)

  const server = { count: 0 }
  const app = boot(server)

  app.override = function (s) {
    const res = Object.create(s)
    res.count = res.count + 1

    return res
  }

  app.use(function first (s1, opts, cb) {
    t.assert.notDeepStrictEqual(s1, server)
    t.assert.ok(Object.prototype.isPrototypeOf.call(server, s1))
    t.assert.strictEqual(s1.count, 1)
    s1.use(second)
    s1.use(third)
    let prev

    cb()

    function second (s2, opts, cb) {
      prev = s2
      t.assert.notDeepStrictEqual(s2, s1)
      t.assert.ok(Object.prototype.isPrototypeOf.call(s1, s2))
      t.assert.strictEqual(s2.count, 2)
      cb()
    }

    function third (s3, opts, cb) {
      t.assert.notDeepStrictEqual(s3, s1)
      t.assert.ok(Object.prototype.isPrototypeOf.call(s1, s3))
      t.assert.strictEqual(Object.prototype.isPrototypeOf.call(prev, s3), false)
      t.assert.strictEqual(s3.count, 2)
      cb()
      testDone()
    }
  })
})

test('custom inheritance multiple levels with multiple heads', (t, testDone) => {
  t.plan(13)

  const server = { count: 0 }
  const app = boot(server)

  app.override = function (s) {
    const res = Object.create(s)
    res.count = res.count + 1

    return res
  }

  app.use(function first (s1, opts, cb) {
    t.assert.notDeepStrictEqual(s1, server)
    t.assert.ok(Object.prototype.isPrototypeOf.call(server, s1))
    t.assert.strictEqual(s1.count, 1)
    s1.use(second)

    cb()

    function second (s2, opts, cb) {
      t.assert.notDeepStrictEqual(s2, s1)
      t.assert.ok(Object.prototype.isPrototypeOf.call(s1, s2))
      t.assert.strictEqual(s2.count, 2)
      cb()
    }
  })

  app.use(function third (s1, opts, cb) {
    t.assert.notDeepStrictEqual(s1, server)
    t.assert.ok(Object.prototype.isPrototypeOf.call(server, s1))
    t.assert.strictEqual(s1.count, 1)
    s1.use(fourth)

    cb()

    function fourth (s2, opts, cb) {
      t.assert.notDeepStrictEqual(s2, s1)
      t.assert.ok(Object.prototype.isPrototypeOf.call(s1, s2))
      t.assert.strictEqual(s2.count, 2)
      cb()
    }
  })

  app.ready(function () {
    t.assert.strictEqual(server.count, 0)
    testDone()
  })
})

test('fastify test case', (t, testDone) => {
  t.plan(7)

  const noop = () => {}

  function build () {
    const app = boot(server, {})
    app.override = function (s) {
      return Object.create(s)
    }

    server.add = function (name, fn, cb) {
      if (this[name]) return cb(new Error('already existent'))
      this[name] = fn
      cb()
    }

    return server

    function server (req, res) {}
  }

  const instance = build()
  t.assert.ok(instance.add)
  t.assert.ok(instance.use)

  instance.use((i, opts, cb) => {
    t.assert.notDeepStrictEqual(i, instance)
    t.assert.ok(Object.prototype.isPrototypeOf.call(instance, i))

    i.add('test', noop, (err) => {
      t.assert.ifError(err)
      t.assert.ok(i.test)
      cb()
    })
  })

  instance.ready(() => {
    t.assert.strictEqual(instance.test, undefined)
    testDone()
  })
})

test('override should pass also the plugin function', (t, testDone) => {
  t.plan(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.override = function (s, fn) {
    t.assert.strictEqual(typeof fn, 'function')
    t.assert.deepStrictEqual(fn, first)
    return s
  }

  app.use(first)

  function first (s, opts, cb) {
    t.assert.deepStrictEqual(s, server)
    cb()
    testDone()
  }
})

test('skip override - fastify test case', (t, testDone) => {
  t.plan(2)

  const server = { my: 'server' }
  const app = boot(server)

  app.override = function (s, func) {
    if (func[Symbol.for('skip-override')]) {
      return s
    }
    return Object.create(s)
  }

  first[Symbol.for('skip-override')] = true
  app.use(first)

  function first (s, opts, cb) {
    t.assert.deepStrictEqual(s, server)
    t.assert.strictEqual(Object.prototype.isPrototypeOf.call(server, s), false)
    cb()
    testDone()
  }
})

test('override can receive options object', (t, testDone) => {
  t.plan(4)

  const server = { my: 'server' }
  const options = { hello: 'world' }
  const app = boot(server)

  app.override = function (s, fn, opts) {
    t.assert.deepStrictEqual(s, server)
    t.assert.deepStrictEqual(opts, options)

    const res = Object.create(s)
    res.b = 42

    return res
  }

  app.use(function first (s, opts, cb) {
    t.assert.notDeepStrictEqual(s, server)
    t.assert.ok(Object.prototype.isPrototypeOf.call(server, s))
    cb()
    testDone()
  }, options)
})

test('override can receive options function', (t, testDone) => {
  t.plan(8)

  const server = { my: 'server' }
  const options = { hello: 'world' }
  const app = boot(server)

  app.override = function (s, fn, opts) {
    t.assert.deepStrictEqual(s, server)
    if (typeof opts !== 'function') {
      t.assert.deepStrictEqual(opts, options)
    }

    const res = Object.create(s)
    res.b = 42
    res.bar = 'world'

    return res
  }

  app.use(function first (s, opts, cb) {
    t.assert.notDeepStrictEqual(s, server)
    t.assert.ok(Object.prototype.isPrototypeOf.call(server, s))
    s.foo = 'bar'
    cb()
  }, options)

  app.use(function second (s, opts, cb) {
    t.assert.strictEqual(s.foo, undefined)
    t.assert.deepStrictEqual(opts, { hello: 'world' })
    t.assert.ok(Object.prototype.isPrototypeOf.call(server, s))
    cb()
    testDone()
  }, p => ({ hello: p.bar }))
})

test('after trigger override', (t, testDone) => {
  t.plan(8)

  const server = { count: 0 }
  const app = boot(server)

  let overrideCalls = 0
  app.override = function (s, fn, opts) {
    overrideCalls++
    const res = Object.create(s)
    res.count = res.count + 1
    return res
  }

  app
    .use(function first (s, opts, cb) {
      t.assert.strictEqual(s.count, 1, 'should trigger override')
      cb()
    })
    .after(function () {
      t.assert.strictEqual(overrideCalls, 1, 'after with 0 parameter should not trigger override')
    })
    .after(function (err) {
      if (err) throw err
      t.assert.strictEqual(overrideCalls, 1, 'after with 1 parameter should not trigger override')
    })
    .after(function (err, done) {
      if (err) throw err
      t.assert.strictEqual(overrideCalls, 1, 'after with 2 parameters should not trigger override')
      done()
    })
    .after(function (err, context, done) {
      if (err) throw err
      t.assert.strictEqual(overrideCalls, 1, 'after with 3 parameters should not trigger override')
      done()
    })
    .after(async function () {
      t.assert.strictEqual(overrideCalls, 1, 'async after with 0 parameter should not trigger override')
    })
    .after(async function (err) {
      if (err) throw err
      t.assert.strictEqual(overrideCalls, 1, 'async after with 1 parameter should not trigger override')
    })
    .after(async function (err, context) {
      if (err) throw err
      t.assert.strictEqual(overrideCalls, 1, 'async after with 2 parameters should not trigger override')
      testDone()
    })
})

test('custom inheritance override in after', (t, testDone) => {
  t.plan(6)

  const server = { count: 0 }
  const app = boot(server)

  app.override = function (s) {
    const res = Object.create(s)
    res.count = res.count + 1

    return res
  }

  app.use(function first (s1, opts, cb) {
    t.assert.notDeepStrictEqual(s1, server)
    t.assert.ok(Object.prototype.isPrototypeOf.call(server, s1))
    t.assert.strictEqual(s1.count, 1)
    s1.after(() => {
      s1.use(second)
    })

    cb()

    function second (s2, opts, cb) {
      t.assert.notDeepStrictEqual(s2, s1)
      t.assert.ok(Object.prototype.isPrototypeOf.call(s1, s2))
      t.assert.strictEqual(s2.count, 2)
      cb()
      testDone()
    }
  })
})

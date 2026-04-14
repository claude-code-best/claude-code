'use strict'

/* eslint no-prototype-builtins: off */

const { test } = require('node:test')
const { setTimeout: sleep } = require('node:timers/promises')

const boot = require('..')

test('one level', async (t) => {
  t.plan(14)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(first)
  app.use(third)

  async function first (s, opts) {
    t.assert.strictEqual(firstLoaded, false, 'first is not loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    firstLoaded = true
    s.use(second)
  }

  async function second (s, opts) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    secondLoaded = true
  }

  async function third (s, opts) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    thirdLoaded = true
  }

  const readyContext = await app.ready()

  t.assert.deepStrictEqual(app, readyContext)
  t.assert.ok(firstLoaded, 'first is loaded')
  t.assert.ok(secondLoaded, 'second is loaded')
  t.assert.ok(thirdLoaded, 'third is loaded')
  t.assert.ok('booted')
})

test('multiple reentrant plugin loading', async (t) => {
  t.plan(31)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false
  let fourthLoaded = false
  let fifthLoaded = false

  app.use(first)
  app.use(fifth)

  async function first (s, opts) {
    t.assert.strictEqual(firstLoaded, false, 'first is not loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    t.assert.strictEqual(fourthLoaded, false, 'fourth is not loaded')
    t.assert.strictEqual(fifthLoaded, false, 'fifth is not loaded')
    firstLoaded = true
    s.use(second)
  }

  async function second (s, opts) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    t.assert.strictEqual(fourthLoaded, false, 'fourth is not loaded')
    t.assert.strictEqual(fifthLoaded, false, 'fifth is not loaded')
    secondLoaded = true
    s.use(third)
    await sleep(10)
    s.use(fourth)
  }

  async function third (s, opts) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    t.assert.strictEqual(fourthLoaded, false, 'fourth is not loaded')
    t.assert.strictEqual(fifthLoaded, false, 'fifth is not loaded')
    thirdLoaded = true
  }

  async function fourth (s, opts) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.ok(thirdLoaded, 'third is loaded')
    t.assert.strictEqual(fourthLoaded, false, 'fourth is not loaded')
    t.assert.strictEqual(fifthLoaded, false, 'fifth is not loaded')
    fourthLoaded = true
  }

  async function fifth (s, opts) {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.ok(thirdLoaded, 'third is loaded')
    t.assert.ok(fourthLoaded, 'fourth is loaded')
    t.assert.strictEqual(fifthLoaded, false, 'fifth is not loaded')
    fifthLoaded = true
  }

  await app.ready()
  t.assert.ok(firstLoaded, 'first is loaded')
  t.assert.ok(secondLoaded, 'second is loaded')
  t.assert.ok(thirdLoaded, 'third is loaded')
  t.assert.ok(fourthLoaded, 'fourth is loaded')
  t.assert.ok(fifthLoaded, 'fifth is loaded')
  t.assert.ok('booted')
})

test('async ready plugin registration (errored)', async (t) => {
  t.plan(1)

  const app = boot()

  app.use(async (server, opts) => {
    await sleep(10)
    throw new Error('kaboom')
  })

  try {
    await app.ready()
    t.assert.fail('we should not be here')
  } catch (err) {
    t.assert.strictEqual(err.message, 'kaboom')
  }
})

test('after', async (t) => {
  t.plan(15)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(first)

  async function first (s, opts) {
    t.assert.strictEqual(firstLoaded, false, 'first is not loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    firstLoaded = true
    s.after(second)
    s.after(third)
  }

  async function second (err) {
    t.assert.ifError(err)
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    await sleep(10)
    secondLoaded = true
  }

  async function third () {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    await sleep(10)
    thirdLoaded = true
  }

  const readyContext = await app.ready()

  t.assert.deepStrictEqual(app, readyContext)
  t.assert.ok(firstLoaded, 'first is loaded')
  t.assert.ok(secondLoaded, 'second is loaded')
  t.assert.ok(thirdLoaded, 'third is loaded')
  t.assert.ok('booted')
})

test('after wrapped', async (t) => {
  t.plan(15)

  const app = {}
  boot(app)
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(first)

  async function first (s, opts) {
    t.assert.strictEqual(firstLoaded, false, 'first is not loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    firstLoaded = true
    s.after(second)
    s.after(third)
  }

  async function second (err) {
    t.assert.ifError(err)
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    await sleep(10)
    secondLoaded = true
  }

  async function third () {
    t.assert.ok(firstLoaded, 'first is loaded')
    t.assert.ok(secondLoaded, 'second is loaded')
    t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
    await sleep(10)
    thirdLoaded = true
  }

  const readyContext = await app.ready()

  t.assert.deepStrictEqual(app, readyContext)
  t.assert.ok(firstLoaded, 'first is loaded')
  t.assert.ok(secondLoaded, 'second is loaded')
  t.assert.ok(thirdLoaded, 'third is loaded')
  t.assert.ok('booted')
})

test('promise plugins', async (t) => {
  t.plan(14)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(first())
  app.use(third())

  async function first () {
    return async function (s, opts) {
      t.assert.strictEqual(firstLoaded, false, 'first is not loaded')
      t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
      t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
      firstLoaded = true
      s.use(second())
    }
  }

  async function second () {
    return async function (s, opts) {
      t.assert.ok(firstLoaded, 'first is loaded')
      t.assert.strictEqual(secondLoaded, false, 'second is not loaded')
      t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
      secondLoaded = true
    }
  }

  async function third () {
    return async function (s, opts) {
      t.assert.ok(firstLoaded, 'first is loaded')
      t.assert.ok(secondLoaded, 'second is loaded')
      t.assert.strictEqual(thirdLoaded, false, 'third is not loaded')
      thirdLoaded = true
    }
  }

  const readyContext = await app.ready()

  t.assert.deepStrictEqual(app, readyContext)
  t.assert.ok(firstLoaded, 'first is loaded')
  t.assert.ok(secondLoaded, 'second is loaded')
  t.assert.ok(thirdLoaded, 'third is loaded')
  t.assert.ok('booted')
})

test('skip override with promise', async (t) => {
  t.plan(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.override = function (s, func) {
    t.assert.ok('override called')

    if (func[Symbol.for('skip-override')]) {
      return s
    }
    return Object.create(s)
  }

  app.use(first())

  async function first () {
    async function fn (s, opts) {
      t.assert.deepStrictEqual(s, server)
      t.assert.strictEqual(Object.prototype.isPrototypeOf.call(server, s), false)
    }

    fn[Symbol.for('skip-override')] = true

    return fn
  }

  await app.ready()
})

test('ready queue error', async (t) => {
  const app = boot()
  app.use(first)

  async function first (s, opts) {}

  app.ready(function (_, worker, done) {
    const error = new Error('kaboom')
    done(error)
  })

  await t.assert.rejects(app.ready(), { message: 'kaboom' })
})

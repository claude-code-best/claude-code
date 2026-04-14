'use strict'

const fastq = require('fastq')
const boot = require('..')
const { test } = require('node:test')
const { Plugin } = require('../lib/plugin')

test('successfully load a plugin with sync function', (t, testDone) => {
  t.plan(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), function (instance, opts, done) {
    done()
  }, false, 0)

  app._loadPlugin(plugin, function (err) {
    t.assert.ifError(err)
    testDone()
  })
})

test('catch an error when loading a plugin with sync function', (t, testDone) => {
  t.plan(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), function (instance, opts, done) {
    done(Error('ArbitraryError'))
  }, false, 0)

  app._loadPlugin(plugin, function (err) {
    t.assert.strictEqual(err.message, 'ArbitraryError')
    testDone()
  })
})

test('successfully load a plugin with sync function without done as a parameter', (t, testDone) => {
  t.plan(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), function (instance, opts) { }, false, 0)

  app._loadPlugin(plugin, function (err) {
    t.assert.ifError(err)
    testDone()
  })
})

test('successfully load a plugin with async function', (t, testDone) => {
  t.plan(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), async function (instance, opts) { }, false, 0)

  app._loadPlugin(plugin, function (err) {
    t.assert.ifError(err)
    testDone()
  })
})

test('catch an error when loading a plugin with async function', (t, testDone) => {
  t.plan(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), async function (instance, opts) {
    throw Error('ArbitraryError')
  }, false, 0)

  app._loadPlugin(plugin, function (err) {
    t.assert.strictEqual(err.message, 'ArbitraryError')
    testDone()
  })
})

test('successfully load a plugin when function is a Promise, which resolves to a function', (t, testDone) => {
  t.plan(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), new Promise(resolve => resolve(function (instance, opts, done) {
    done()
  })), false, 0)

  app._loadPlugin(plugin, function (err) {
    t.assert.ifError(err)
    testDone()
  })
})

test('catch an error when loading a plugin when function is a Promise, which resolves to a function', (t, testDone) => {
  t.plan(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), new Promise(resolve => resolve(function (instance, opts, done) {
    done(Error('ArbitraryError'))
  })), false, 0)

  app._loadPlugin(plugin, function (err) {
    t.assert.strictEqual(err.message, 'ArbitraryError')
    testDone()
  })
})

test('successfully load a plugin when function is a Promise, which resolves to a function, which is wrapped in default', (t, testDone) => {
  t.plan(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), new Promise(resolve => resolve({
    default: function (instance, opts, done) {
      done()
    }
  })), false, 0)

  app._loadPlugin(plugin, function (err) {
    t.assert.ifError(err)
    testDone()
  })
})

test('catch an error when loading a plugin when function is a Promise, which resolves to a function, which is wrapped in default', (t, testDone) => {
  t.plan(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), new Promise(resolve => resolve({
    default: function (instance, opts, done) {
      done(Error('ArbitraryError'))
    }
  })), false, 0)

  app._loadPlugin(plugin, function (err) {
    t.assert.strictEqual(err.message, 'ArbitraryError')
    testDone()
  })
})

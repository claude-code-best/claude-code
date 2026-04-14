'use strict'

const { test } = require('node:test')
const boot = require('..')

test('to json', (t, end) => {
  t.plan(20)
  const app = boot()
  app
    .use(one)
    .use(two)
    .use(three)

  app.on('preReady', function show () {
    const json = app.toJSON()
    t.assert.strictEqual(json.id, 'root')
    t.assert.strictEqual(json.label, 'root')
    t.assert.match(json.start.toString(), /\d+/)
    t.assert.ok(Array.isArray(json.nodes))
    t.assert.strictEqual(json.nodes.length, 3)
  })

  function one (s, opts, done) {
    const json = app.toJSON()
    t.assert.strictEqual(json.nodes.length, 1)
    t.assert.strictEqual(json.nodes[0].label, 'one')
    t.assert.match(json.nodes[0].start.toString(), /\d+/)
    t.assert.match(json.nodes[0].id.toString(), /.+/)
    t.assert.strictEqual(json.nodes[0].parent, 'root')
    done()
  }
  function two (s, opts, done) {
    const json = app.toJSON()
    t.assert.strictEqual(json.nodes.length, 2)
    t.assert.strictEqual(json.nodes[1].label, 'two')
    t.assert.match(json.nodes[1].start.toString(), /\d+/)
    t.assert.match(json.nodes[1].id.toString(), /.+/)
    t.assert.strictEqual(json.nodes[1].parent, 'root')
    done()
  }
  function three (s, opts, done) {
    const json = app.toJSON()
    t.assert.strictEqual(json.nodes.length, 3)
    t.assert.strictEqual(json.nodes[2].label, 'three')
    t.assert.match(json.nodes[2].start.toString(), /\d+/)
    t.assert.match(json.nodes[2].id.toString(), /.+/)
    t.assert.strictEqual(json.nodes[2].parent, 'root')
    done()
    end()
  }
})

test('to json multi-level hierarchy', (t, done) => {
  t.plan(38)
  const server = { name: 'asd', count: 0 }
  const app = boot(server)

  app.on('preReady', function show () {
    const json = app.toJSON()
    t.assert.strictEqual(json.id, 'root')
    t.assert.strictEqual(json.label, 'root')
    t.assert.match(json.start.toString(), /\d+/)
    t.assert.match(json.stop.toString(), /\d+/)
    t.assert.match(json.diff.toString(), /\d+/)
    t.assert.ok(Array.isArray(json.nodes))
    t.assert.strictEqual(json.nodes.length, 1)

    t.assert.strictEqual(json.nodes[0].parent, 'root')
    t.assert.strictEqual(json.nodes[0].label, 'first')
    t.assert.match(json.nodes[0].start.toString(), /\d+/)
    t.assert.match(json.nodes[0].stop.toString(), /\d+/)
    t.assert.match(json.nodes[0].diff.toString(), /\d+/)
    t.assert.match(json.nodes[0].id.toString(), /.+/)
    t.assert.strictEqual(json.nodes[0].nodes.length, 2)

    t.assert.strictEqual(json.nodes[0].nodes[0].parent, 'first')
    t.assert.strictEqual(json.nodes[0].nodes[0].label, 'second')
    t.assert.match(json.nodes[0].nodes[0].start.toString(), /\d+/)
    t.assert.match(json.nodes[0].nodes[0].stop.toString(), /\d+/)
    t.assert.match(json.nodes[0].nodes[0].diff.toString(), /\d+/)
    t.assert.match(json.nodes[0].nodes[0].id.toString(), /.+/)
    t.assert.strictEqual(json.nodes[0].nodes[0].nodes.length, 0)

    t.assert.strictEqual(json.nodes[0].nodes[1].parent, 'first')
    t.assert.strictEqual(json.nodes[0].nodes[1].label, 'third')
    t.assert.match(json.nodes[0].nodes[1].start.toString(), /\d+/)
    t.assert.match(json.nodes[0].nodes[1].stop.toString(), /\d+/)
    t.assert.match(json.nodes[0].nodes[1].diff.toString(), /\d+/)
    t.assert.match(json.nodes[0].nodes[1].id.toString(), /.+/)
    t.assert.strictEqual(json.nodes[0].nodes[1].nodes.length, 1)

    t.assert.strictEqual(json.nodes[0].nodes[1].nodes[0].parent, 'third')
    t.assert.strictEqual(json.nodes[0].nodes[1].nodes[0].label, 'fourth')
    t.assert.match(json.nodes[0].nodes[1].nodes[0].start.toString(), /\d+/)
    t.assert.match(json.nodes[0].nodes[1].nodes[0].stop.toString(), /\d+/)
    t.assert.match(json.nodes[0].nodes[1].nodes[0].diff.toString(), /\d+/)
    t.assert.match(json.nodes[0].nodes[1].nodes[0].id.toString(), /.+/)
    t.assert.strictEqual(json.nodes[0].nodes[1].nodes[0].nodes.length, 0)
  })

  app.override = function (s) {
    const res = Object.create(s)
    res.count = res.count + 1
    res.name = 'qwe'
    return res
  }

  app.use(function first (s1, opts, cb) {
    s1.use(second)
    s1.use(third)
    cb()

    function second (s2, opts, cb) {
      t.assert.strictEqual(s2.count, 2)
      cb()
    }

    function third (s3, opts, cb) {
      s3.use(fourth)
      t.assert.strictEqual(s3.count, 2)
      cb()
    }

    function fourth (s4, opts, cb) {
      t.assert.strictEqual(s4.count, 3)
      cb()
      done()
    }
  })
})

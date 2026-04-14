'use strict'

const { test } = require('node:test')
const { TimeTree } = require('../../lib/time-tree')

test('TimeTree is constructed with a root attribute, set to null', t => {
  t.plan(1)

  const tree = new TimeTree()
  t.assert.strictEqual(tree.root, null)
})

test('TimeTree is constructed with an empty tableId-Map', t => {
  t.plan(2)

  const tree = new TimeTree()
  t.assert.ok(tree.tableId instanceof Map)
  t.assert.strictEqual(tree.tableId.size, 0)
})

test('TimeTree is constructed with an empty tableLabel-Map', t => {
  t.plan(2)

  const tree = new TimeTree()
  t.assert.ok(tree.tableLabel instanceof Map)
  t.assert.strictEqual(tree.tableLabel.size, 0)
})

test('TimeTree#toJSON dumps the content of the TimeTree', t => {
  t.plan(1)

  const tree = new TimeTree()
  t.assert.deepStrictEqual(tree.toJSON(), {})
})

test('TimeTree#toJSON is creating new instances of its content, ensuring being immutable', t => {
  t.plan(1)

  const tree = new TimeTree()
  t.assert.notStrictEqual(tree.toJSON(), tree.toJSON())
})

test('TimeTree#start is adding a node with correct shape, root-node', t => {
  t.plan(15)

  const tree = new TimeTree()
  tree.start(null, 'root')

  const rootNode = tree.root

  t.assert.strictEqual(Object.keys(rootNode).length, 7)
  t.assert.ok('parent' in rootNode)
  t.assert.strictEqual(rootNode.parent, null)
  t.assert.ok('id' in rootNode)
  t.assert.strictEqual(typeof rootNode.id, 'string')
  t.assert.ok('label' in rootNode)
  t.assert.strictEqual(typeof rootNode.label, 'string')
  t.assert.ok('nodes' in rootNode)
  t.assert.ok(Array.isArray(rootNode.nodes))
  t.assert.ok('start' in rootNode)
  t.assert.ok(Number.isInteger(rootNode.start))
  t.assert.ok('stop' in rootNode)
  t.assert.strictEqual(typeof rootNode.stop, 'object')
  t.assert.ok('diff' in rootNode)
  t.assert.strictEqual(typeof rootNode.diff, 'number')
})

test('TimeTree#start is adding a node with correct shape, child-node', t => {
  t.plan(16)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')

  const rootNode = tree.root

  t.assert.strictEqual(rootNode.nodes.length, 1)

  const childNode = rootNode.nodes[0]

  t.assert.strictEqual(Object.keys(childNode).length, 7)
  t.assert.ok('parent' in childNode)
  t.assert.strictEqual(typeof childNode.parent, 'string')
  t.assert.ok('id' in childNode)
  t.assert.strictEqual(typeof childNode.id, 'string')
  t.assert.ok('label' in childNode)
  t.assert.strictEqual(typeof childNode.label, 'string')
  t.assert.ok('nodes' in childNode)
  t.assert.ok(Array.isArray(childNode.nodes))
  t.assert.ok('start' in childNode)
  t.assert.ok(Number.isInteger(childNode.start))
  t.assert.ok('stop' in childNode)
  t.assert.strictEqual(typeof childNode.stop, 'object')
  t.assert.ok('diff' in childNode)
  t.assert.strictEqual(typeof childNode.diff, 'number')
})

test('TimeTree#start is adding a root element when parent is null', t => {
  t.plan(9)

  const tree = new TimeTree()
  tree.start(null, 'root')

  const rootNode = tree.root

  t.assert.strictEqual(typeof rootNode, 'object')
  t.assert.strictEqual(Object.keys(rootNode).length, 7)
  t.assert.strictEqual(rootNode.parent, null)
  t.assert.strictEqual(rootNode.id, 'root')
  t.assert.strictEqual(rootNode.label, 'root')
  t.assert.ok(Array.isArray(rootNode.nodes))
  t.assert.strictEqual(rootNode.nodes.length, 0)
  t.assert.ok(Number.isInteger(rootNode.start))
  t.assert.strictEqual(typeof rootNode.diff, 'number')
})

test('TimeTree#start is adding a root element when parent does not exist', t => {
  t.plan(9)

  const tree = new TimeTree()
  tree.start('invalid', 'root')

  const rootNode = tree.root

  t.assert.strictEqual(typeof rootNode, 'object')
  t.assert.strictEqual(Object.keys(rootNode).length, 7)
  t.assert.strictEqual(rootNode.parent, null)
  t.assert.strictEqual(rootNode.id, 'root')
  t.assert.strictEqual(rootNode.label, 'root')
  t.assert.ok(Array.isArray(rootNode.nodes))
  t.assert.strictEqual(rootNode.nodes.length, 0)
  t.assert.ok(Number.isInteger(rootNode.start))
  t.assert.strictEqual(typeof rootNode.diff, 'number')
})

test('TimeTree#start parameter start can override automatically generated start time', t => {
  t.plan(1)

  const tree = new TimeTree()
  tree.start(null, 'root', 1337)

  t.assert.strictEqual(tree.root.start, 1337)
})

test('TimeTree#start returns id of root, when adding a root node /1', t => {
  t.plan(1)

  const tree = new TimeTree()
  t.assert.strictEqual(tree.start(null, 'root'), 'root')
})

test('TimeTree#start returns id of root, when adding a root node /2', t => {
  t.plan(1)

  const tree = new TimeTree()
  t.assert.strictEqual(tree.start(null, '/'), 'root')
})

test('TimeTree#start returns id of child, when adding a child node', t => {
  t.plan(1)

  const tree = new TimeTree()
  tree.start(null, 'root')
  t.assert.match(tree.start('root', 'child'), /^child-[0-9.]+$/)
})

test('TimeTree tracks node ids /1', t => {
  t.plan(3)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')

  t.assert.strictEqual(tree.tableId.size, 2)
  t.assert.ok(tree.tableId.has('root'))
  t.assert.ok(tree.tableId.has(tree.root.nodes[0].id))
})

test('TimeTree tracks node ids /2', t => {
  t.plan(4)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')
  tree.start('child', 'grandchild')

  t.assert.strictEqual(tree.tableId.size, 3)
  t.assert.ok(tree.tableId.has('root'))
  t.assert.ok(tree.tableId.has(tree.root.nodes[0].id))
  t.assert.ok(tree.tableId.has(tree.root.nodes[0].nodes[0].id))
})

test('TimeTree tracks node ids /3', t => {
  t.plan(4)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')
  tree.start('root', 'child')

  t.assert.strictEqual(tree.tableId.size, 3)
  t.assert.ok(tree.tableId.has('root'))
  t.assert.ok(tree.tableId.has(tree.root.nodes[0].id))
  t.assert.ok(tree.tableId.has(tree.root.nodes[1].id))
})

test('TimeTree tracks node labels /1', t => {
  t.plan(4)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')
  tree.start('root', 'sibling')

  t.assert.strictEqual(tree.tableLabel.size, 3)
  t.assert.ok(tree.tableLabel.has('root'))
  t.assert.ok(tree.tableLabel.has('child'))
  t.assert.ok(tree.tableLabel.has('sibling'))
})

test('TimeTree tracks node labels /2', t => {
  t.plan(3)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')
  tree.start('root', 'child')

  t.assert.strictEqual(tree.tableLabel.size, 2)
  t.assert.ok(tree.tableLabel.has('root'))
  t.assert.ok(tree.tableLabel.has('child'))
})

test('TimeTree#stop returns undefined', t => {
  t.plan(1)

  const tree = new TimeTree()
  tree.start(null, 'root')

  t.assert.strictEqual(typeof tree.stop('root'), 'undefined')
})

test('TimeTree#stop sets stop value of node', t => {
  t.plan(3)

  const tree = new TimeTree()
  tree.start(null, 'root')
  t.assert.strictEqual(typeof tree.root.stop, 'object')

  tree.stop('root')
  t.assert.strictEqual(typeof tree.root.stop, 'number')
  t.assert.ok(Number.isInteger(tree.root.stop))
})

test('TimeTree#stop parameter stop is used as stop value of node', t => {
  t.plan(3)

  const tree = new TimeTree()
  tree.start(null, 'root')
  t.assert.strictEqual(typeof tree.root.stop, 'object')

  tree.stop('root', 1337)
  t.assert.strictEqual(typeof tree.root.stop, 'number')
  t.assert.strictEqual(tree.root.stop, 1337)
})

test('TimeTree#stop calculates the diff', t => {
  t.plan(4)

  const tree = new TimeTree()
  tree.start(null, 'root', 1)
  t.assert.strictEqual(typeof tree.root.diff, 'number')
  t.assert.strictEqual(tree.root.diff, -1)
  tree.stop('root', 5)

  t.assert.strictEqual(typeof tree.root.diff, 'number')
  t.assert.strictEqual(tree.root.diff, 4)
})

test('TimeTree#stop does nothing when node is not found', t => {
  t.plan(2)

  const tree = new TimeTree()
  tree.start(null, 'root')
  t.assert.strictEqual(typeof tree.root.stop, 'object')

  tree.stop('invalid')
  t.assert.strictEqual(typeof tree.root.stop, 'object')
})

test('TimeTree untracks node ids /1', t => {
  t.plan(2)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')

  tree.stop(tree.root.nodes[0].id)
  t.assert.strictEqual(tree.tableId.size, 1)
  t.assert.ok(tree.tableId.has('root'))
})

test('TimeTree untracks node ids /2', t => {
  t.plan(3)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')
  tree.start('child', 'grandchild')

  tree.stop(tree.root.nodes[0].nodes[0].id)

  t.assert.strictEqual(tree.tableId.size, 2)
  t.assert.ok(tree.tableId.has('root'))
  t.assert.ok(tree.tableId.has(tree.root.nodes[0].id))
})

test('TimeTree untracks node ids /3', t => {
  t.plan(3)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')
  tree.start('root', 'child')

  tree.stop(tree.root.nodes[0].id)

  t.assert.strictEqual(tree.tableId.size, 2)
  t.assert.ok(tree.tableId.has('root'))
  t.assert.ok(tree.tableId.has(tree.root.nodes[1].id))
})

test('TimeTree untracks node ids /4', t => {
  t.plan(3)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')
  tree.start('root', 'child')

  tree.stop(tree.root.nodes[1].id)

  t.assert.strictEqual(tree.tableId.size, 2)
  t.assert.ok(tree.tableId.has('root'))
  t.assert.ok(tree.tableId.has(tree.root.nodes[0].id))
})

test('TimeTree untracks node labels /1', t => {
  t.plan(3)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')
  tree.start('root', 'sibling')

  tree.stop(tree.root.nodes[1].id)

  t.assert.strictEqual(tree.tableLabel.size, 2)
  t.assert.ok(tree.tableLabel.has('root'))
  t.assert.ok(tree.tableLabel.has('child'))
})

test('TimeTree untracks node labels /2', t => {
  t.plan(3)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')
  tree.start('root', 'sibling')

  tree.stop(tree.root.nodes[0].id)

  t.assert.strictEqual(tree.tableLabel.size, 2)
  t.assert.ok(tree.tableLabel.has('root'))
  t.assert.ok(tree.tableLabel.has('sibling'))
})

test('TimeTree does not untrack label if used by other node', t => {
  t.plan(3)

  const tree = new TimeTree()
  tree.start(null, 'root')
  tree.start('root', 'child')
  tree.start('root', 'child')

  tree.stop(tree.root.nodes[0].id)

  t.assert.strictEqual(tree.tableLabel.size, 2)
  t.assert.ok(tree.tableLabel.has('root'))
  t.assert.ok(tree.tableLabel.has('child'))
})

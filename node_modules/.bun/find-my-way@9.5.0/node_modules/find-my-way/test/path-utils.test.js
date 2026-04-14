'use strict'

const { test } = require('node:test')
const FindMyWay = require('..')

test('removeDuplicateSlashes should return the same path when there are no duplicate slashes', t => {
  t.plan(1)

  const path = '/hello/world'
  t.assert.equal(FindMyWay.removeDuplicateSlashes(path), '/hello/world')
})

test('removeDuplicateSlashes should collapse duplicate slash groups across the full path', t => {
  t.plan(1)

  const path = '/hello//world///foo////bar'
  t.assert.equal(FindMyWay.removeDuplicateSlashes(path), '/hello/world/foo/bar')
})

test('removeDuplicateSlashes should normalize a path made only of slashes', t => {
  t.plan(1)

  const path = '////'
  t.assert.equal(FindMyWay.removeDuplicateSlashes(path), '/')
})

test('removeDuplicateSlashes should keep encoded slashes untouched', t => {
  t.plan(1)

  const path = '/a/%2F//b'
  t.assert.equal(FindMyWay.removeDuplicateSlashes(path), '/a/%2F/b')
})

test('trimLastSlash should remove one trailing slash from non-root paths', t => {
  t.plan(1)

  const path = '/hello/'
  t.assert.equal(FindMyWay.trimLastSlash(path), '/hello')
})

test('trimLastSlash should leave root path untouched', t => {
  t.plan(1)

  const path = '/'
  t.assert.equal(FindMyWay.trimLastSlash(path), '/')
})

test('trimLastSlash should leave paths without trailing slash untouched', t => {
  t.plan(1)

  const path = '/hello/world'
  t.assert.equal(FindMyWay.trimLastSlash(path), '/hello/world')
})

test('trimLastSlash should remove only one trailing slash', t => {
  t.plan(1)

  const path = '/hello///'
  t.assert.equal(FindMyWay.trimLastSlash(path), '/hello//')
})

test('removeDuplicateSlashes then trimLastSlash should match router path normalization order', t => {
  t.plan(1)

  const path = '//a//b//c//'
  const normalized = FindMyWay.trimLastSlash(FindMyWay.removeDuplicateSlashes(path))
  t.assert.equal(normalized, '/a/b/c')
})

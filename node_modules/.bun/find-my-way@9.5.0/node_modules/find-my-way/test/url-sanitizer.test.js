'use strict'

const { test } = require('node:test')
const FindMyWay = require('..')

test('sanitizeUrlPath should decode reserved characters inside params and strip querystring', t => {
  t.plan(1)

  const url = '/%65ncod%65d?foo=bar'
  const sanitized = FindMyWay.sanitizeUrlPath(url)

  t.assert.equal(sanitized, '/encoded')
})

test('sanitizeUrlPath should decode non-reserved characters but keep reserved encoded when not in params', t => {
  t.plan(1)

  const url = '/hello/%20world?foo=bar'
  const sanitized = FindMyWay.sanitizeUrlPath(url)

  t.assert.equal(sanitized, '/hello/ world')
})

test('sanitizeUrlPath should treat semicolon as queryparameter delimiter when enabled', t => {
  t.plan(2)

  const url = '/hello/%23world;foo=bar'

  const sanitizedWithDelimiter = FindMyWay.sanitizeUrlPath(url, true)
  t.assert.equal(sanitizedWithDelimiter, '/hello/#world')

  const sanitizedWithoutDelimiter = FindMyWay.sanitizeUrlPath(url, false)
  t.assert.equal(sanitizedWithoutDelimiter, '/hello/#world;foo=bar')
})

test('sanitizeUrlPath trigger an error if the url is invalid', t => {
  t.plan(1)

  const url = '/Hello%3xWorld/world'
  t.assert.throws(() => {
    FindMyWay.sanitizeUrlPath(url)
  }, 'URIError: URI malformed')
})

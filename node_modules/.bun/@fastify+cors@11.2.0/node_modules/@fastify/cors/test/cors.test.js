'use strict'

const { test } = require('node:test')
const { createReadStream, statSync, readFileSync } = require('node:fs')
const Fastify = require('fastify')
const cors = require('../')
const { resolve } = require('node:path')
const { setTimeout: sleep } = require('node:timers/promises')

test('Should add cors headers', async t => {
  t.plan(4)

  const fastify = Fastify()
  fastify.register(cors)

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  t.assert.deepStrictEqual(res.headers['access-control-allow-origin'],
    '*'
  )
})

test('Should add cors headers when payload is a stream', async t => {
  t.plan(4)

  const fastify = Fastify()
  fastify.register(cors)
  const filePath = resolve(__dirname, __filename)

  fastify.get('/', (_req, reply) => {
    const stream = createReadStream(filePath)
    reply
      .type('application/json')
      .header('Content-Length', statSync(filePath).size)
      .send(stream)
  })

  const fileContent = readFileSync(filePath, 'utf-8')

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, fileContent)
  const actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'content-length': res.headers['content-length']

  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': '*',
    'content-length': statSync(filePath).size.toString()
  })
})

test('Should add cors headers (custom values)', async t => {
  t.plan(10)

  const fastify = Fastify()
  fastify.register(cors, {
    origin: 'example.com',
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['foo', 'bar'],
    allowedHeaders: ['baz', 'woo'],
    maxAge: 123,
    cacheControl: 321
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  let res = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 204)
  t.assert.strictEqual(res.payload, '')
  const actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-credentials': res.headers['access-control-allow-credentials'],
    'access-control-expose-headers': res.headers['access-control-expose-headers'],
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    'access-control-allow-headers': res.headers['access-control-allow-headers'],
    'access-control-max-age': res.headers['access-control-max-age'],
    'cache-control': res.headers['cache-control'],
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': 'example.com',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'foo, bar',
    'access-control-allow-methods': 'GET',
    'access-control-allow-headers': 'baz, woo',
    'access-control-max-age': '123',
    'cache-control': 'max-age=321',
    'content-length': '0'
  })
  t.assert.notDeepEqual(res.headers, { vary: 'Origin' })

  res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeaders2 = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-credentials': res.headers['access-control-allow-credentials'],
    'access-control-expose-headers': res.headers['access-control-expose-headers'],
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders2, {
    'access-control-allow-origin': 'example.com',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'foo, bar',
    'content-length': '2'
  })
  t.assert.notDeepEqual(res.headers, { vary: 'Origin' })
})

test('Should support dynamic config (callback)', async t => {
  t.plan(16)

  const configs = [{
    origin: 'example.com',
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['foo', 'bar'],
    allowedHeaders: ['baz', 'woo'],
    maxAge: 123,
    cacheControl: 456
  }, {
    origin: 'sample.com',
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['zoo', 'bar'],
    allowedHeaders: ['baz', 'foo'],
    maxAge: 321,
    cacheControl: '456'
  }]

  const fastify = Fastify()
  let requestId = 0
  const configDelegation = async function (req, cb) {
    // request should have id
    t.assert.ok(req.id)
    // request should not have send
    t.assert.ifError(req.send)

    const config = configs[requestId]
    requestId++
    if (config) {
      cb(null, config)
    } else {
      cb(new Error('ouch'))
    }
  }
  await fastify.register(cors, () => configDelegation)

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  let res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-credentials': res.headers['access-control-allow-credentials'],
    'access-control-expose-headers': res.headers['access-control-expose-headers'],
    'content-length': res.headers['content-length'],
    vary: res.headers.vary
  }
  // Sleep to wait for callback
  sleep()
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': 'example.com',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'foo, bar',
    'content-length': '2',
    vary: 'Origin'
  })

  res = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 204)
  t.assert.strictEqual(res.payload, '')
  const actualHeaders2 = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-credentials': res.headers['access-control-allow-credentials'],
    'access-control-expose-headers': res.headers['access-control-expose-headers'],
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    'access-control-allow-headers': res.headers['access-control-allow-headers'],
    'access-control-max-age': res.headers['access-control-max-age'],
    'cache-control': res.headers['cache-control'],
    'content-length': res.headers['content-length'],
    vary: res.headers.vary
  }
  // Sleep to wait for callback
  sleep()
  t.assert.deepStrictEqual(actualHeaders2, {
    'access-control-allow-origin': 'sample.com',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'zoo, bar',
    'access-control-allow-methods': 'GET',
    'access-control-allow-headers': 'baz, foo',
    'access-control-max-age': '321',
    'cache-control': '456',
    'content-length': '0',
    vary: 'Origin'
  })

  res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 500)
})

test('Should support dynamic config (Promise)', async t => {
  t.plan(23)

  const configs = [{
    origin: 'example.com',
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['foo', 'bar'],
    allowedHeaders: ['baz', 'woo'],
    maxAge: 123,
    cacheControl: 456
  }, {
    origin: 'sample.com',
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['zoo', 'bar'],
    allowedHeaders: ['baz', 'foo'],
    maxAge: 321,
    cacheControl: true // Invalid value should be ignored
  }, {
    origin: 'sample.com',
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['zoo', 'bar'],
    allowedHeaders: ['baz', 'foo'],
    maxAge: 321,
    cacheControl: 'public, max-age=456'
  }]

  const fastify = Fastify()
  let requestId = 0
  const configDelegation = async function (req) {
    // request should have id
    t.assert.ok(req.id)
    // request should not have send
    t.assert.ifError(req.send)
    const config = configs[requestId]
    requestId++
    if (config) {
      return Promise.resolve(config)
    } else {
      return Promise.reject(new Error('ouch'))
    }
  }
  await fastify.register(cors, () => configDelegation)

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  let res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-credentials': res.headers['access-control-allow-credentials'],
    'access-control-expose-headers': res.headers['access-control-expose-headers'],
    'content-length': res.headers['content-length'],
    vary: res.headers.vary
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': 'example.com',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'foo, bar',
    'content-length': '2',
    vary: 'Origin'
  })

  res = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'sample.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 204)
  t.assert.strictEqual(res.payload, '')
  const acutalHeaders2 = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-credentials': res.headers['access-control-allow-credentials'],
    'access-control-expose-headers': res.headers['access-control-expose-headers'],
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    'access-control-allow-headers': res.headers['access-control-allow-headers'],
    'access-control-max-age': res.headers['access-control-max-age'],
    'content-length': res.headers['content-length'],
    vary: res.headers.vary
  }
  t.assert.deepStrictEqual(acutalHeaders2, {
    'access-control-allow-origin': 'sample.com',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'zoo, bar',
    'access-control-allow-methods': 'GET',
    'access-control-allow-headers': 'baz, foo',
    'access-control-max-age': '321',
    'content-length': '0',
    vary: 'Origin'
  })
  t.assert.strictEqual(res.headers['cache-control'], undefined, 'cache-control omitted (invalid value)')

  res = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 204)
  t.assert.strictEqual(res.payload, '')
  const actualHeaders3 = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-credentials': res.headers['access-control-allow-credentials'],
    'access-control-expose-headers': res.headers['access-control-expose-headers'],
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    'access-control-allow-headers': res.headers['access-control-allow-headers'],
    'access-control-max-age': res.headers['access-control-max-age'],
    'cache-control': res.headers['cache-control'],
    'content-length': res.headers['content-length'],
    vary: res.headers.vary
  }
  t.assert.deepStrictEqual(actualHeaders3, {
    'access-control-allow-origin': 'sample.com',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'zoo, bar',
    'access-control-allow-methods': 'GET',
    'access-control-allow-headers': 'baz, foo',
    'access-control-max-age': '321',
    'cache-control': 'public, max-age=456', // cache-control included (custom string)
    'content-length': '0',
    vary: 'Origin'
  })

  res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 500)
})

test('Should support dynamic config. (Invalid function)', async t => {
  t.plan(2)

  const fastify = Fastify()
  fastify.register(cors, () => () => {})

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 500)
})

test('Dynamic origin resolution (valid origin)', async t => {
  t.plan(6)

  const fastify = Fastify()
  const origin = function (header, cb) {
    t.assert.strictEqual(header, 'example.com')
    t.assert.equal(this, fastify)
    cb(null, true)
  }
  fastify.register(cors, { origin })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { origin: 'example.com' }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    vary: res.headers.vary
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': 'example.com',
    vary: 'Origin'
  })
})

test('Dynamic origin resolution (not valid origin)', async t => {
  t.plan(5)

  const fastify = Fastify()
  const origin = (header, cb) => {
    t.assert.strictEqual(header, 'example.com')
    cb(null, false)
  }
  fastify.register(cors, { origin })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { origin: 'example.com' }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeaders = {
    'content-length': res.headers['content-length'],
    'content-type': res.headers['content-type'],
    connection: res.headers.connection,
    vary: res.headers.vary
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'content-length': '2',
    'content-type': 'text/plain; charset=utf-8',
    connection: 'keep-alive',
    vary: 'Origin'
  })
})

test('Dynamic origin resolution (errored)', async t => {
  t.plan(3)

  const fastify = Fastify()
  const origin = (header, cb) => {
    t.assert.strictEqual(header, 'example.com')
    cb(new Error('ouch'))
  }
  fastify.register(cors, { origin })

  const res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { origin: 'example.com' }
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 500)
})

test('Dynamic origin resolution (invalid result)', async t => {
  t.plan(3)

  const fastify = Fastify()
  const origin = (header, cb) => {
    t.assert.strictEqual(header, 'example.com')
    cb(null, undefined)
  }
  fastify.register(cors, { origin })

  const res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { origin: 'example.com' }
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 500)
})

test('Dynamic origin resolution (valid origin - promises)', async t => {
  t.plan(5)

  const fastify = Fastify()
  const origin = (header) => {
    return new Promise((resolve) => {
      t.assert.strictEqual(header, 'example.com')
      resolve(true)
    })
  }
  fastify.register(cors, { origin })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { origin: 'example.com' }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    vary: res.headers.vary
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': 'example.com',
    vary: 'Origin'
  })
})

test('Dynamic origin resolution (not valid origin - promises)', async t => {
  t.plan(5)

  const fastify = Fastify()
  const origin = (header) => {
    return new Promise((resolve) => {
      t.assert.strictEqual(header, 'example.com')
      resolve(false)
    })
  }
  fastify.register(cors, { origin })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { origin: 'example.com' }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeaders = {
    'content-length': res.headers['content-length'],
    'content-type': res.headers['content-type'],
    connection: res.headers.connection,
    vary: res.headers.vary
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'content-length': '2',
    'content-type': 'text/plain; charset=utf-8',
    connection: 'keep-alive',
    vary: 'Origin'
  })
})

test('Dynamic origin resolution (errored - promises)', async t => {
  t.plan(3)

  const fastify = Fastify()
  const origin = (header) => {
    return new Promise((_resolve, reject) => {
      t.assert.strictEqual(header, 'example.com')
      reject(new Error('ouch'))
    })
  }
  fastify.register(cors, { origin })

  const res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { origin: 'example.com' }
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 500)
})

test('Should reply 404 without cors headers when origin is false', async t => {
  t.plan(8)

  const fastify = Fastify()
  fastify.register(cors, {
    origin: false,
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['foo', 'bar'],
    allowedHeaders: ['baz', 'woo'],
    maxAge: 123
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  let res = await fastify.inject({
    method: 'OPTIONS',
    url: '/'
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 404)
  t.assert.strictEqual(res.payload, '{"message":"Route OPTIONS:/ not found","error":"Not Found","statusCode":404}')
  const actualHeaders = {
    'content-length': res.headers['content-length'],
    'content-type': res.headers['content-type'],
    connection: res.headers.connection
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'content-length': '76',
    'content-type': 'application/json; charset=utf-8',
    connection: 'keep-alive'
  })

  res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  t.assert.deepStrictEqual(res.headers, {
    'content-length': '2',
    'content-type': 'text/plain; charset=utf-8',
    connection: 'keep-alive'
  })
})

test('Server error if origin option is falsy but not false', async t => {
  t.plan(4)

  const fastify = Fastify()
  fastify.register(cors, { origin: '' })

  const res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { origin: 'example.com' }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 500)
  t.assert.deepStrictEqual(res.json(), { statusCode: 500, error: 'Internal Server Error', message: 'Invalid CORS origin option' })
  const actualHeaders = {
    'content-length': res.headers['content-length'],
    'content-type': res.headers['content-type'],
    connection: res.headers.connection
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'content-length': '89',
    'content-type': 'application/json; charset=utf-8',
    connection: 'keep-alive'
  })
})

test('Allow only request from a specific origin', async t => {
  t.plan(5)

  const fastify = Fastify()
  fastify.register(cors, { origin: 'other.io' })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { origin: 'example.com' }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  t.assert.deepStrictEqual(res.headers['access-control-allow-origin'],
    'other.io'
  )
  t.assert.notDeepEqual(res.headers, { vary: 'Origin' })
})

test('Allow only request from multiple specific origin', async t => {
  t.plan(9)

  const fastify = Fastify()
  fastify.register(cors, { origin: ['other.io', 'example.com'] })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  let res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { origin: 'other.io' }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    vary: res.headers.vary
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': 'other.io',
    vary: 'Origin'
  })

  res = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { origin: 'foo.com' }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  t.assert.deepStrictEqual(res.headers.vary,
    'Origin'
  )
  t.assert.strictEqual(res.headers['access-control-allow-origin'], undefined)
})

test('Allow only request from a specific origin using regex', async t => {
  t.plan(8)

  const fastify = Fastify()
  fastify.register(cors, { origin: /(?:example|other)\.com\/?$/giu })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  // .test was previously used, which caused 2 consecutive requests to return
  // different results with global (e.g. /g) regexes. Therefore, check this
  // twice to check consistency
  for (let i = 0; i < 2; i++) {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: { origin: 'https://www.example.com/' }
    })
    t.assert.ok(res)
    delete res.headers.date
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(res.payload, 'ok')
    const actualHeaders = {
      'access-control-allow-origin': res.headers['access-control-allow-origin'],
      vary: res.headers.vary
    }
    t.assert.deepStrictEqual(actualHeaders, {
      'access-control-allow-origin': 'https://www.example.com/',
      vary: 'Origin'
    })
  }
})

test('Disable preflight', async t => {
  t.plan(7)

  const fastify = Fastify()
  fastify.register(cors, { preflight: false })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  let res = await fastify.inject({
    method: 'OPTIONS',
    url: '/hello'
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 404)
  t.assert.strictEqual(res.headers['access-control-allow-origin'],
    '*'
  )

  res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  t.assert.strictEqual(res.headers['access-control-allow-origin'],
    '*'
  )
})

test('Should always add vary header to `Origin` for reflected origin', async t => {
  t.plan(12)

  const fastify = Fastify()
  fastify.register(cors, { origin: true })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  // Invalid Preflight
  let res = await fastify.inject({
    method: 'OPTIONS',
    url: '/'
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 400)
  t.assert.strictEqual(res.payload, 'Invalid Preflight Request')
  t.assert.strictEqual(res.headers.vary,
    'Origin'
  )

  // Valid Preflight
  res = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 204)
  t.assert.strictEqual(res.payload, '')
  t.assert.strictEqual(res.headers.vary,
    'Origin, Access-Control-Request-Headers'
  )

  // Other Route
  res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  t.assert.strictEqual(res.headers.vary,
    'Origin'
  )
})

test('Should always add vary header to `Origin` for reflected origin (vary is array)', async t => {
  t.plan(4)

  const fastify = Fastify()

  // Mock getHeader function
  fastify.decorateReply('getHeader', () => ['foo', 'bar'])

  fastify.register(cors, { origin: true })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  t.assert.strictEqual(res.headers.vary,
    'foo, bar, Origin'
  )
})

test('Allow only request from with specific headers', async t => {
  t.plan(8)

  const fastify = Fastify()
  fastify.register(cors, {
    allowedHeaders: 'foo',
    exposedHeaders: 'bar'
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  let res = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 204)
  t.assert.deepStrictEqual(res.headers['access-control-allow-headers'],
    'foo'
  )
  t.assert.notDeepEqual(res.headers.vary, 'Origin')

  res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  t.assert.strictEqual(res.headers['access-control-expose-headers'],
    'bar'
  )
})

test('Should support wildcard config /1', async t => {
  t.plan(4)

  const fastify = Fastify()
  fastify.register(cors, { origin: '*' })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  t.assert.strictEqual(res.headers['access-control-allow-origin'], '*')
})

test('Should support wildcard config /2', async t => {
  t.plan(4)

  const fastify = Fastify()
  fastify.register(cors, { origin: ['*'] })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  t.assert.strictEqual(res.headers['access-control-allow-origin'], '*')
})

test('Should allow routes to disable CORS individually', async t => {
  t.plan(6)

  const fastify = Fastify()
  fastify.register(cors, { origin: '*' })

  fastify.get('/cors-enabled', (_req, reply) => {
    reply.send('ok')
  })

  fastify.get('/cors-disabled', { config: { cors: false } }, (_req, reply) => {
    reply.send('ok')
  })

  // Test CORS enabled route
  let res = await fastify.inject({
    method: 'GET',
    url: '/cors-enabled',
    headers: { origin: 'example.com' }
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.headers['access-control-allow-origin'], '*')

  // Test CORS disabled route
  res = await fastify.inject({
    method: 'GET',
    url: '/cors-disabled',
    headers: { origin: 'example.com' }
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.headers['access-control-allow-origin'], undefined)
})

test('Should support route-level config', async t => {
  t.plan(9)

  const fastify = Fastify()
  fastify.register(cors, {
    origin: 'https://default-example.com'
  })

  // Route with default CORS (inherits plugin config)
  fastify.get('/cors-enabled', (_req, reply) => {
    reply.send('CORS headers applied')
  })

  // Route with custom CORS origin
  fastify.get('/cors-allow-all', {
    config: {
      cors: {
        origin: '*'
      }
    }
  }, (_req, reply) => {
    reply.send('Custom CORS headers applied')
  })

  // Route with CORS disabled
  fastify.get('/cors-disabled', {
    config: {
      cors: false
    }
  }, (_req, reply) => {
    reply.send('No CORS headers')
  })

  await fastify.ready()

  // Default CORS
  const resDefault = await fastify.inject({
    method: 'GET',
    url: '/cors-enabled',
    headers: {
      origin: 'https://default-example.com'
    }
  })
  t.assert.ok(resDefault)
  t.assert.strictEqual(resDefault.statusCode, 200)
  t.assert.strictEqual(resDefault.headers['access-control-allow-origin'], 'https://default-example.com')

  // Custom CORS
  const resCustom = await fastify.inject({
    method: 'GET',
    url: '/cors-allow-all',
    headers: {
      origin: 'https://example.com'
    }
  })
  t.assert.ok(resCustom)
  t.assert.strictEqual(resCustom.statusCode, 200)
  t.assert.strictEqual(resCustom.headers['access-control-allow-origin'], '*')

  // CORS disabled
  const resDisabled = await fastify.inject({
    method: 'GET',
    url: '/cors-disabled',
    headers: {
      origin: 'https://example.com'
    }
  })
  t.assert.ok(resDisabled)
  t.assert.strictEqual(resDisabled.statusCode, 200)
  t.assert.strictEqual(resDisabled.headers['access-control-allow-origin'], undefined)
})

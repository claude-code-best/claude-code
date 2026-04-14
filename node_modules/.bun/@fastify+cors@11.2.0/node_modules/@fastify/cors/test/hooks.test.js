'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const kFastifyContext = require('fastify/lib/symbols').kRouteContext
const cors = require('..')
const { setTimeout: sleep } = require('node:timers/promises')

test('Should error on invalid hook option', async (t) => {
  t.plan(3)

  const fastify = Fastify()
  await t.assert.rejects(
    async () => fastify.register(cors, { hook: 'invalid' }),
    (err) => {
      t.assert.strictEqual(err.name, 'TypeError')
      t.assert.strictEqual(err.message, '@fastify/cors: Invalid hook option provided.')
      return true
    }
  )
})

test('Should set hook onRequest if hook option is not set', async (t) => {
  t.plan(10)

  const fastify = Fastify()

  fastify.register(cors)

  fastify.addHook('onResponse', (request, _reply, done) => {
    t.assert.strictEqual(request[kFastifyContext].onError, null)
    t.assert.strictEqual(request[kFastifyContext].onRequest.length, 1)
    t.assert.strictEqual(request[kFastifyContext].onSend, null)
    t.assert.strictEqual(request[kFastifyContext].preHandler, null)
    t.assert.strictEqual(request[kFastifyContext].preParsing, null)
    t.assert.strictEqual(request[kFastifyContext].preSerialization, null)
    t.assert.strictEqual(request[kFastifyContext].preValidation, null)
    done()
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeader = {
    'access-control-allow-origin': res.headers['access-control-allow-origin']
  }
  t.assert.deepStrictEqual(actualHeader, {
    'access-control-allow-origin': '*'
  })
})

test('Should set hook onRequest if hook option is set to onRequest', async (t) => {
  t.plan(10)

  const fastify = Fastify()

  fastify.register(cors, {
    hook: 'onRequest'
  })

  fastify.addHook('onResponse', (request, _reply, done) => {
    t.assert.strictEqual(request[kFastifyContext].onError, null)
    t.assert.strictEqual(request[kFastifyContext].onRequest.length, 1)
    t.assert.strictEqual(request[kFastifyContext].onSend, null)
    t.assert.strictEqual(request[kFastifyContext].preHandler, null)
    t.assert.strictEqual(request[kFastifyContext].preParsing, null)
    t.assert.strictEqual(request[kFastifyContext].preSerialization, null)
    t.assert.strictEqual(request[kFastifyContext].preValidation, null)
    done()
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeader = {
    'access-control-allow-origin': res.headers['access-control-allow-origin']
  }
  t.assert.deepStrictEqual(actualHeader, {
    'access-control-allow-origin': '*'
  })
})

test('Should set hook preParsing if hook option is set to preParsing', async (t) => {
  t.plan(11)

  const fastify = Fastify()

  fastify.register(cors, {
    hook: 'preParsing'
  })

  fastify.addHook('onResponse', (request, _reply, done) => {
    t.assert.strictEqual(request[kFastifyContext].onError, null)
    t.assert.strictEqual(request[kFastifyContext].onRequest, null)
    t.assert.strictEqual(request[kFastifyContext].onSend, null)
    t.assert.strictEqual(request[kFastifyContext].preHandler, null)
    t.assert.strictEqual(request[kFastifyContext].preParsing.length, 1)
    t.assert.strictEqual(request[kFastifyContext].preSerialization, null)
    t.assert.strictEqual(request[kFastifyContext].preValidation, null)
    done()
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeader = {
    'access-control-allow-origin': res.headers['access-control-allow-origin']
  }
  t.assert.deepStrictEqual(actualHeader, {
    'access-control-allow-origin': '*'
  })
  t.assert.notStrictEqual(res.headers.vary, 'Origin')
})

test('Should set hook preValidation if hook option is set to preValidation', async (t) => {
  t.plan(11)

  const fastify = Fastify()

  fastify.register(cors, {
    hook: 'preValidation'
  })

  fastify.addHook('onResponse', (request, _reply, done) => {
    t.assert.strictEqual(request[kFastifyContext].onError, null)
    t.assert.strictEqual(request[kFastifyContext].onRequest, null)
    t.assert.strictEqual(request[kFastifyContext].onSend, null)
    t.assert.strictEqual(request[kFastifyContext].preHandler, null)
    t.assert.strictEqual(request[kFastifyContext].preParsing, null)
    t.assert.strictEqual(request[kFastifyContext].preSerialization, null)
    t.assert.strictEqual(request[kFastifyContext].preValidation.length, 1)
    done()
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeader = {
    'access-control-allow-origin': res.headers['access-control-allow-origin']
  }
  t.assert.deepStrictEqual(actualHeader, {
    'access-control-allow-origin': '*'
  })
  t.assert.notStrictEqual(res.headers.vary, 'Origin')
})

test('Should set hook preParsing if hook option is set to preParsing', async (t) => {
  t.plan(11)

  const fastify = Fastify()

  fastify.register(cors, {
    hook: 'preParsing'
  })

  fastify.addHook('onResponse', (request, _reply, done) => {
    t.assert.strictEqual(request[kFastifyContext].onError, null)
    t.assert.strictEqual(request[kFastifyContext].onRequest, null)
    t.assert.strictEqual(request[kFastifyContext].onSend, null)
    t.assert.strictEqual(request[kFastifyContext].preHandler, null)
    t.assert.strictEqual(request[kFastifyContext].preParsing.length, 1)
    t.assert.strictEqual(request[kFastifyContext].preSerialization, null)
    t.assert.strictEqual(request[kFastifyContext].preValidation, null)
    done()
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeader = {
    'access-control-allow-origin': res.headers['access-control-allow-origin']
  }
  t.assert.deepStrictEqual(actualHeader, {
    'access-control-allow-origin': '*'
  })
  t.assert.notStrictEqual(res.headers.vary, 'Origin')
})

test('Should set hook preHandler if hook option is set to preHandler', async (t) => {
  t.plan(11)

  const fastify = Fastify()

  fastify.register(cors, {
    hook: 'preHandler'
  })

  fastify.addHook('onResponse', (request, _reply, done) => {
    t.assert.strictEqual(request[kFastifyContext].onError, null)
    t.assert.strictEqual(request[kFastifyContext].onRequest, null)
    t.assert.strictEqual(request[kFastifyContext].onSend, null)
    t.assert.strictEqual(request[kFastifyContext].preHandler.length, 1)
    t.assert.strictEqual(request[kFastifyContext].preParsing, null)
    t.assert.strictEqual(request[kFastifyContext].preSerialization, null)
    t.assert.strictEqual(request[kFastifyContext].preValidation, null)
    done()
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeader = {
    'access-control-allow-origin': res.headers['access-control-allow-origin']
  }
  t.assert.deepStrictEqual(actualHeader, {
    'access-control-allow-origin': '*'
  })
  t.assert.notStrictEqual(res.headers.vary, 'Origin')
})

test('Should set hook onSend if hook option is set to onSend', async (t) => {
  t.plan(11)

  const fastify = Fastify()

  fastify.register(cors, {
    hook: 'onSend'
  })

  fastify.addHook('onResponse', (request, _reply, done) => {
    t.assert.strictEqual(request[kFastifyContext].onError, null)
    t.assert.strictEqual(request[kFastifyContext].onRequest, null)
    t.assert.strictEqual(request[kFastifyContext].onSend.length, 1)
    t.assert.strictEqual(request[kFastifyContext].preHandler, null)
    t.assert.strictEqual(request[kFastifyContext].preParsing, null)
    t.assert.strictEqual(request[kFastifyContext].preSerialization, null)
    t.assert.strictEqual(request[kFastifyContext].preValidation, null)
    done()
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeader = {
    'access-control-allow-origin': res.headers['access-control-allow-origin']
  }
  t.assert.deepStrictEqual(actualHeader, {
    'access-control-allow-origin': '*'
  })
  t.assert.notStrictEqual(res.headers.vary, 'Origin')
})

test('Should set hook preSerialization if hook option is set to preSerialization', async (t) => {
  t.plan(11)

  const fastify = Fastify()

  fastify.register(cors, {
    hook: 'preSerialization'
  })

  fastify.addHook('onResponse', (request, _reply, done) => {
    t.assert.strictEqual(request[kFastifyContext].onError, null)
    t.assert.strictEqual(request[kFastifyContext].onRequest, null)
    t.assert.strictEqual(request[kFastifyContext].onSend, null)
    t.assert.strictEqual(request[kFastifyContext].preHandler, null)
    t.assert.strictEqual(request[kFastifyContext].preParsing, null)
    t.assert.strictEqual(request[kFastifyContext].preSerialization.length, 1)
    t.assert.strictEqual(request[kFastifyContext].preValidation, null)
    done()
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ nonString: true })
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, '{"nonString":true}')
  const actualHeader = {
    'access-control-allow-origin': res.headers['access-control-allow-origin']
  }
  t.assert.deepStrictEqual(actualHeader, {
    'access-control-allow-origin': '*'
  })
  t.assert.notStrictEqual(res.headers.vary, 'Origin')
})

test('Should support custom hook with dynamic config', async t => {
  t.plan(16)

  const configs = [{
    origin: 'example.com',
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['foo', 'bar'],
    allowedHeaders: ['baz', 'woo'],
    maxAge: 123
  }, {
    origin: 'sample.com',
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['zoo', 'bar'],
    allowedHeaders: ['baz', 'foo'],
    maxAge: 321
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
  await fastify.register(cors, {
    hook: 'preHandler',
    delegator: configDelegation
  })

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
  let actualHeaders = {
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
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 204)
  t.assert.strictEqual(res.payload, '')
  actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-credentials': res.headers['access-control-allow-credentials'],
    'access-control-expose-headers': res.headers['access-control-expose-headers'],
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    'access-control-allow-headers': res.headers['access-control-allow-headers'],
    'access-control-max-age': res.headers['access-control-max-age'],
    'content-length': res.headers['content-length'],
    vary: res.headers.vary
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': 'sample.com',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'zoo, bar',
    'access-control-allow-methods': 'GET',
    'access-control-allow-headers': 'baz, foo',
    'access-control-max-age': '321',
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

test('Should support custom hook with dynamic config (callback)', async t => {
  t.plan(16)

  const configs = [{
    origin: 'example.com',
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['foo', 'bar'],
    allowedHeaders: ['baz', 'woo'],
    maxAge: 123
  }, {
    origin: 'sample.com',
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['zoo', 'bar'],
    allowedHeaders: ['baz', 'foo'],
    maxAge: 321
  }]

  const fastify = Fastify()
  let requestId = 0
  const configDelegation = function (req, cb) {
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
  fastify.register(cors, {
    hook: 'preParsing',
    delegator: configDelegation
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    t.assert.ifError(err)
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
  })

  fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  }, (err, res) => {
    t.assert.ifError(err)
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
      'content-length': res.headers['content-length'],
      vary: res.headers.vary
    }
    t.assert.deepStrictEqual(actualHeaders, {
      'access-control-allow-origin': 'sample.com',
      'access-control-allow-credentials': 'true',
      'access-control-expose-headers': 'zoo, bar',
      'access-control-allow-methods': 'GET',
      'access-control-allow-headers': 'baz, foo',
      'access-control-max-age': '321',
      'content-length': '0',
      vary: 'Origin'
    })
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  }, (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 500)
  })
  await sleep()
})

test('Should support custom hook with dynamic config (Promise)', async t => {
  t.plan(16)

  const configs = [{
    origin: 'example.com',
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['foo', 'bar'],
    allowedHeaders: ['baz', 'woo'],
    maxAge: 123
  }, {
    origin: 'sample.com',
    methods: 'GET',
    credentials: true,
    exposedHeaders: ['zoo', 'bar'],
    allowedHeaders: ['baz', 'foo'],
    maxAge: 321
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

  await fastify.register(cors, {
    hook: 'preParsing',
    delegator: configDelegation
  })

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
  let actualHeaders = {
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
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 204)
  t.assert.strictEqual(res.payload, '')
  actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-credentials': res.headers['access-control-allow-credentials'],
    'access-control-expose-headers': res.headers['access-control-expose-headers'],
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    'access-control-allow-headers': res.headers['access-control-allow-headers'],
    'access-control-max-age': res.headers['access-control-max-age'],
    'content-length': res.headers['content-length'],
    vary: res.headers.vary
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': 'sample.com',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'zoo, bar',
    'access-control-allow-methods': 'GET',
    'access-control-allow-headers': 'baz, foo',
    'access-control-max-age': '321',
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

test('Should support custom hook with dynamic config (Promise), but should error /1', async t => {
  t.plan(6)

  const fastify = Fastify()
  const configDelegation = function () {
    return false
  }

  await fastify.register(cors, {
    hook: 'preParsing',
    delegator: configDelegation
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
  t.assert.strictEqual(res.statusCode, 500)
  t.assert.strictEqual(res.payload, '{"statusCode":500,"error":"Internal Server Error","message":"Invalid CORS origin option"}')
  const actualHeaders = {
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'content-length': '89'
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

test('Should support custom hook with dynamic config (Promise), but should error /2', async t => {
  t.plan(6)

  const fastify = Fastify()
  const configDelegation = function () {
    return false
  }

  await fastify.register(cors, {
    delegator: configDelegation
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
  t.assert.strictEqual(res.statusCode, 500)
  t.assert.strictEqual(res.payload, '{"statusCode":500,"error":"Internal Server Error","message":"Invalid CORS origin option"}')
  const actualHeaders = {
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'content-length': '89'
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

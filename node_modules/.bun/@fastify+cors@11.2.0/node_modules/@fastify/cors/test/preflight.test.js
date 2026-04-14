'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const cors = require('../')

test('Should reply to preflight requests', async t => {
  t.plan(4)

  const fastify = Fastify()
  await fastify.register(cors)

  const res = await fastify.inject({
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
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    vary: res.headers.vary,
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST',
    vary: 'Access-Control-Request-Headers',
    'content-length': '0'
  })
})

test('Should add access-control-allow-headers to response if preflight req has access-control-request-headers', async t => {
  t.plan(4)

  const fastify = Fastify()
  await fastify.register(cors)

  const res = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-headers': 'x-requested-with',
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
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    'access-control-allow-headers': res.headers['access-control-allow-headers'],
    vary: res.headers.vary,
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST',
    'access-control-allow-headers': 'x-requested-with',
    vary: 'Access-Control-Request-Headers',
    'content-length': '0'
  })
})

test('Should reply to preflight requests with custom status code', async t => {
  t.plan(4)

  const fastify = Fastify()
  await fastify.register(cors, { optionsSuccessStatus: 200 })

  const res = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, '')
  const actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    vary: res.headers.vary,
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST',
    vary: 'Access-Control-Request-Headers',
    'content-length': '0'
  })
})

test('Should be able to override preflight response with a route', async t => {
  t.plan(5)

  const fastify = Fastify()
  await fastify.register(cors, { preflightContinue: true })

  fastify.options('/', (_req, reply) => {
    reply.send('ok')
  })

  const res = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    // Only the base cors headers and no preflight headers
    'access-control-allow-origin': '*'
  })
  t.assert.notStrictEqual(res.headers.vary, 'Origin')
})

test('Should reply to all options requests', async t => {
  t.plan(4)

  const fastify = Fastify()
  await fastify.register(cors)

  const res = await fastify.inject({
    method: 'OPTIONS',
    url: '/hello',
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
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    vary: res.headers.vary,
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST',
    vary: 'Access-Control-Request-Headers',
    'content-length': '0'
  })
})

test('Should support a prefix for preflight requests', async t => {
  t.plan(6)

  const fastify = Fastify()
  await fastify.register((instance, _opts, next) => {
    instance.register(cors)
    next()
  }, { prefix: '/subsystem' })

  let res = await fastify.inject({
    method: 'OPTIONS',
    url: '/hello'
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 404)

  res = await fastify.inject({
    method: 'OPTIONS',
    url: '/subsystem/hello',
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
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    vary: res.headers.vary,
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST',
    vary: 'Access-Control-Request-Headers',
    'content-length': '0'
  })
})

test('hide options route by default', async t => {
  t.plan(2)

  const fastify = Fastify()

  fastify.addHook('onRoute', (route) => {
    if (route.method === 'OPTIONS' && route.url === '*') {
      t.assert.strictEqual(route.schema.hide, true)
    }
  })
  await fastify.register(cors)

  const ready = await fastify.ready()
  t.assert.ok(ready)
})

test('show options route', async t => {
  t.plan(2)

  const fastify = Fastify()

  fastify.addHook('onRoute', (route) => {
    if (route.method === 'OPTIONS' && route.url === '*') {
      t.assert.strictEqual(route.schema.hide, false)
    }
  })
  await fastify.register(cors, { hideOptionsRoute: false })

  const ready = await fastify.ready()
  t.assert.ok(ready)
})

test('Allow only request from with specific methods', async t => {
  t.plan(4)

  const fastify = Fastify()
  await fastify.register(cors, { methods: ['GET', 'POST'] })

  const res = await fastify.inject({
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
  const actualHeaders = {
    'access-control-allow-methods': res.headers['access-control-allow-methods']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-methods': 'GET, POST'
  })
  t.assert.notStrictEqual(res.headers.vary, 'Origin')
})

test('Should reply with 400 error to OPTIONS requests missing origin header when default strictPreflight', async t => {
  t.plan(3)

  const fastify = Fastify()
  await fastify.register(cors)

  const res = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET'
    }
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 400)
  t.assert.strictEqual(res.payload, 'Invalid Preflight Request')
})

test('Should reply with 400 to OPTIONS requests when missing Access-Control-Request-Method header when default strictPreflight', async t => {
  t.plan(3)

  const fastify = Fastify()
  await fastify.register(cors, {
    strictPreflight: true
  })

  const res = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  t.assert.strictEqual(res.statusCode, 400)
  t.assert.strictEqual(res.payload, 'Invalid Preflight Request')
})

test('Should reply to all preflight requests when strictPreflight is disabled', async t => {
  t.plan(4)

  const fastify = Fastify()
  await fastify.register(cors, { strictPreflight: false })

  const res = await fastify.inject({
    method: 'OPTIONS',
    url: '/'
    // No access-control-request-method or origin headers
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 204)
  t.assert.strictEqual(res.payload, '')
  const actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    vary: res.headers.vary,
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST',
    vary: 'Access-Control-Request-Headers',
    'content-length': '0'
  })
})

test('Default empty 200 response with preflightContinue on OPTIONS routes', async t => {
  t.plan(4)

  const fastify = Fastify()
  await fastify.register(cors, { preflightContinue: true })

  const res = await fastify.inject({
    method: 'OPTIONS',
    url: '/doesnotexist',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, '')
  const actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    vary: res.headers.vary
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST',
    vary: 'Access-Control-Request-Headers'
  })
})

test('Can override preflight response with preflightContinue', async t => {
  t.plan(4)

  const fastify = Fastify()
  await fastify.register(cors, { preflightContinue: true })

  fastify.options('/', (_req, reply) => {
    reply.send('ok')
  })

  const res = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
  const actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    vary: res.headers.vary
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST',
    vary: 'Access-Control-Request-Headers'
  })
})

test('Should support ongoing prefix ', async t => {
  t.plan(12)

  const fastify = Fastify()

  await fastify.register(async (instance) => {
    instance.register(cors)
  }, { prefix: '/prefix' })

  // support prefixed route
  let res = await fastify.inject({
    method: 'OPTIONS',
    url: '/prefix',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'example.com'
    }
  })
  t.assert.ok(res)
  delete res.headers.date
  t.assert.strictEqual(res.statusCode, 204)
  t.assert.strictEqual(res.payload, '')
  let actualHeaders = {
    'access-control-allow-origin': res.headers['access-control-allow-origin'],
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    vary: res.headers.vary,
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST',
    vary: 'Access-Control-Request-Headers',
    'content-length': '0'
  })

  // support prefixed route without / continue
  res = await fastify.inject({
    method: 'OPTIONS',
    url: '/prefixfoo',
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
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    vary: res.headers.vary,
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST',
    vary: 'Access-Control-Request-Headers',
    'content-length': '0'
  })

  // support prefixed route with / continue
  res = await fastify.inject({
    method: 'OPTIONS',
    url: '/prefix/foo',
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
    'access-control-allow-methods': res.headers['access-control-allow-methods'],
    vary: res.headers.vary,
    'content-length': res.headers['content-length']
  }
  t.assert.deepStrictEqual(actualHeaders, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST',
    vary: 'Access-Control-Request-Headers',
    'content-length': '0'
  })
})

test('Silences preflight logs when logLevel is "silent"', async t => {
  const logs = []
  const fastify = Fastify({
    logger: {
      level: 'info',
      stream: {
        write (line) {
          try {
            logs.push(JSON.parse(line))
          } catch {
          }
        }
      }
    }
  })

  await fastify.register(cors, { logLevel: 'silent' })

  fastify.get('/', async () => ({ ok: true }))

  await fastify.ready()
  t.assert.ok(fastify)

  await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'https://example.com'
    }
  })

  await fastify.inject({ method: 'GET', url: '/' })

  const hasOptionsLog = logs.some(l => l.req && l.req.method === 'OPTIONS')
  const hasGetLog = logs.some(l => l.req && l.req.method === 'GET')

  t.assert.strictEqual(hasOptionsLog, false)
  t.assert.strictEqual(hasGetLog, true)

  await fastify.close()
})
test('delegator + logLevel:"silent" → OPTIONS logs are suppressed', async t => {
  t.plan(3)

  const logs = []
  const app = Fastify({
    logger: {
      level: 'info',
      stream: { write: l => { try { logs.push(JSON.parse(l)) } catch {} } }
    }
  })

  await app.register(cors, {
    delegator: () => ({ origin: '*' }),
    logLevel: 'silent'
  })

  app.get('/', () => ({ ok: true }))
  await app.ready()
  t.assert.ok(app)

  await app.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'https://example.com'
    }
  })

  await app.inject({ method: 'GET', url: '/' })

  const hasOptionsLog = logs.some(l => l.req?.method === 'OPTIONS')
  const hasGetLog = logs.some(l => l.req?.method === 'GET')

  t.assert.strictEqual(hasOptionsLog, false)
  t.assert.strictEqual(hasGetLog, true)

  await app.close()
})
test('delegator + hideOptionsRoute:false → OPTIONS route is visible', async t => {
  t.plan(2)

  const app = Fastify()

  app.addHook('onRoute', route => {
    if (route.method === 'OPTIONS' && route.url === '*') {
      t.assert.strictEqual(route.schema.hide, false)
    }
  })

  await app.register(cors, {
    delegator: () => ({ origin: '*' }),
    hideOptionsRoute: false
  })

  await app.ready()
  t.assert.ok(app)
  await app.close()
})

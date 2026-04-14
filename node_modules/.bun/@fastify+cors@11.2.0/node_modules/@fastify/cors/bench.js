'use strict'

const fastify = require('fastify')()

fastify.register((instance, _opts, next) => {
  instance.register(require('./index'))
  instance.get('/fastify', (_req, reply) => reply.send('ok'))
  next()
})

fastify.register((instance, _opts, next) => {
  instance.use(require('cors')())
  instance.get('/express', (_req, reply) => reply.send('ok'))
  next()
})

fastify.listen({ port: 3000 })

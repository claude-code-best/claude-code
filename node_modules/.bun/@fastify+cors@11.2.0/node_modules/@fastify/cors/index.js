'use strict'

const fp = require('fastify-plugin')
const {
  addAccessControlRequestHeadersToVaryHeader,
  addOriginToVaryHeader
} = require('./vary')

const defaultOptions = {
  origin: '*',
  methods: 'GET,HEAD,POST',
  hook: 'onRequest',
  preflightContinue: false,
  optionsSuccessStatus: 204,
  credentials: false,
  exposedHeaders: null,
  allowedHeaders: null,
  maxAge: null,
  preflight: true,
  strictPreflight: true
}

const validHooks = [
  'onRequest',
  'preParsing',
  'preValidation',
  'preHandler',
  'preSerialization',
  'onSend'
]

const hookWithPayload = [
  'preSerialization',
  'preParsing',
  'onSend'
]

function validateHook (value, next) {
  if (validHooks.indexOf(value) !== -1) {
    return
  }
  next(new TypeError('@fastify/cors: Invalid hook option provided.'))
}

function fastifyCors (fastify, opts, next) {
  fastify.decorateRequest('corsPreflightEnabled', false)

  let hideOptionsRoute = true
  let logLevel

  if (typeof opts === 'function') {
    handleCorsOptionsDelegator(opts, fastify, { hook: defaultOptions.hook }, next)
  } else if (opts.delegator) {
    const { delegator, ...options } = opts
    handleCorsOptionsDelegator(delegator, fastify, options, next)
  } else {
    const corsOptions = normalizeCorsOptions(opts)
    validateHook(corsOptions.hook, next)
    if (hookWithPayload.indexOf(corsOptions.hook) !== -1) {
      fastify.addHook(corsOptions.hook, function handleCors (req, reply, _payload, next) {
        addCorsHeadersHandler(fastify, corsOptions, req, reply, next)
      })
    } else {
      fastify.addHook(corsOptions.hook, function handleCors (req, reply, next) {
        addCorsHeadersHandler(fastify, corsOptions, req, reply, next)
      })
    }
  }
  if (opts.logLevel !== undefined) logLevel = opts.logLevel
  if (opts.hideOptionsRoute !== undefined) hideOptionsRoute = opts.hideOptionsRoute

  // The preflight reply must occur in the hook. This allows fastify-cors to reply to
  // preflight requests BEFORE possible authentication plugins. If the preflight reply
  // occurred in this handler, other plugins may deny the request since the browser will
  // remove most headers (such as the Authentication header).
  //
  // This route simply enables fastify to accept preflight requests.

  fastify.options('*', { schema: { hide: hideOptionsRoute }, logLevel }, (req, reply) => {
    if (!req.corsPreflightEnabled) {
      // Do not handle preflight requests if the origin option disabled CORS
      reply.callNotFound()
      return
    }

    reply.send()
  })

  next()
}

function handleCorsOptionsDelegator (optionsResolver, fastify, opts, next) {
  const hook = opts?.hook || defaultOptions.hook
  validateHook(hook, next)
  if (optionsResolver.length === 2) {
    if (hookWithPayload.indexOf(hook) !== -1) {
      fastify.addHook(hook, function handleCors (req, reply, _payload, next) {
        handleCorsOptionsCallbackDelegator(optionsResolver, fastify, req, reply, next)
      })
    } else {
      fastify.addHook(hook, function handleCors (req, reply, next) {
        handleCorsOptionsCallbackDelegator(optionsResolver, fastify, req, reply, next)
      })
    }
  } else {
    if (hookWithPayload.indexOf(hook) !== -1) {
      // handle delegator based on Promise
      fastify.addHook(hook, function handleCors (req, reply, _payload, next) {
        const ret = optionsResolver(req)
        if (ret && typeof ret.then === 'function') {
          ret.then(options => addCorsHeadersHandler(fastify, normalizeCorsOptions(options, true), req, reply, next)).catch(next)
          return
        }
        next(new Error('Invalid CORS origin option'))
      })
    } else {
      // handle delegator based on Promise
      fastify.addHook(hook, function handleCors (req, reply, next) {
        const ret = optionsResolver(req)
        if (ret && typeof ret.then === 'function') {
          ret.then(options => addCorsHeadersHandler(fastify, normalizeCorsOptions(options, true), req, reply, next)).catch(next)
          return
        }
        next(new Error('Invalid CORS origin option'))
      })
    }
  }
}

function handleCorsOptionsCallbackDelegator (optionsResolver, fastify, req, reply, next) {
  optionsResolver(req, (err, options) => {
    if (err) {
      next(err)
    } else {
      addCorsHeadersHandler(fastify, normalizeCorsOptions(options, true), req, reply, next)
    }
  })
}

/**
 * @param {import('./types').FastifyCorsOptions} opts
 */
function normalizeCorsOptions (opts, dynamic) {
  const corsOptions = { ...defaultOptions, ...opts }
  if (Array.isArray(opts.origin) && opts.origin.indexOf('*') !== -1) {
    corsOptions.origin = '*'
  }
  if (Number.isInteger(corsOptions.cacheControl)) {
    // integer numbers are formatted this way
    corsOptions.cacheControl = `max-age=${corsOptions.cacheControl}`
  } else if (typeof corsOptions.cacheControl !== 'string') {
    // strings are applied directly and any other value is ignored
    corsOptions.cacheControl = null
  }
  corsOptions.dynamic = dynamic || false
  return corsOptions
}

function addCorsHeadersHandler (fastify, globalOptions, req, reply, next) {
  const options = { ...globalOptions, ...req.routeOptions.config?.cors }

  if ((typeof options.origin !== 'string' && options.origin !== false) || options.dynamic) {
    // Always set Vary header for non-static origin option
    // https://fetch.spec.whatwg.org/#cors-protocol-and-http-caches
    addOriginToVaryHeader(reply)
  }

  const resolveOriginOption = typeof options.origin === 'function' ? resolveOriginWrapper(fastify, options.origin) : (_, cb) => cb(null, options.origin)

  resolveOriginOption(req, (error, resolvedOriginOption) => {
    if (error !== null) {
      return next(error)
    }

    // Disable CORS and preflight if false
    if (resolvedOriginOption === false) {
      return next()
    }

    // Allow routes to disable CORS individually
    if (req.routeOptions.config?.cors === false) {
      return next()
    }

    // Falsy values are invalid
    if (!resolvedOriginOption) {
      return next(new Error('Invalid CORS origin option'))
    }

    addCorsHeaders(req, reply, resolvedOriginOption, options)

    if (req.raw.method === 'OPTIONS' && options.preflight === true) {
      // Strict mode enforces the required headers for preflight
      if (options.strictPreflight === true && (!req.headers.origin || !req.headers['access-control-request-method'])) {
        reply.status(400).type('text/plain').send('Invalid Preflight Request')
        return
      }

      req.corsPreflightEnabled = true

      addPreflightHeaders(req, reply, options)

      if (!options.preflightContinue) {
        // Do not call the hook callback and terminate the request
        // Safari (and potentially other browsers) need content-length 0,
        // for 204 or they just hang waiting for a body
        reply
          .code(options.optionsSuccessStatus)
          .header('Content-Length', '0')
          .send()
        return
      }
    }

    return next()
  })
}

function addCorsHeaders (req, reply, originOption, corsOptions) {
  const origin = getAccessControlAllowOriginHeader(req.headers.origin, originOption)
  // In the case of origin not allowed the header is not
  // written in the response.
  // https://github.com/fastify/fastify-cors/issues/127
  if (origin) {
    reply.header('Access-Control-Allow-Origin', origin)
  }

  if (corsOptions.credentials) {
    reply.header('Access-Control-Allow-Credentials', 'true')
  }

  if (corsOptions.exposedHeaders !== null) {
    reply.header(
      'Access-Control-Expose-Headers',
      Array.isArray(corsOptions.exposedHeaders) ? corsOptions.exposedHeaders.join(', ') : corsOptions.exposedHeaders
    )
  }
}

function addPreflightHeaders (req, reply, corsOptions) {
  reply.header(
    'Access-Control-Allow-Methods',
    Array.isArray(corsOptions.methods) ? corsOptions.methods.join(', ') : corsOptions.methods
  )

  if (corsOptions.allowedHeaders === null) {
    addAccessControlRequestHeadersToVaryHeader(reply)
    const reqAllowedHeaders = req.headers['access-control-request-headers']
    if (reqAllowedHeaders !== undefined) {
      reply.header('Access-Control-Allow-Headers', reqAllowedHeaders)
    }
  } else {
    reply.header(
      'Access-Control-Allow-Headers',
      Array.isArray(corsOptions.allowedHeaders) ? corsOptions.allowedHeaders.join(', ') : corsOptions.allowedHeaders
    )
  }

  if (corsOptions.maxAge !== null) {
    reply.header('Access-Control-Max-Age', String(corsOptions.maxAge))
  }

  if (corsOptions.cacheControl) {
    reply.header('Cache-Control', corsOptions.cacheControl)
  }
}

function resolveOriginWrapper (fastify, origin) {
  return function (req, cb) {
    const result = origin.call(fastify, req.headers.origin, cb)

    // Allow for promises
    if (result && typeof result.then === 'function') {
      result.then(res => cb(null, res), cb)
    }
  }
}

function getAccessControlAllowOriginHeader (reqOrigin, originOption) {
  if (typeof originOption === 'string') {
    // fixed or any origin ('*')
    return originOption
  }

  // reflect origin
  return isRequestOriginAllowed(reqOrigin, originOption) ? reqOrigin : false
}

function isRequestOriginAllowed (reqOrigin, allowedOrigin) {
  if (Array.isArray(allowedOrigin)) {
    for (let i = 0; i < allowedOrigin.length; ++i) {
      if (isRequestOriginAllowed(reqOrigin, allowedOrigin[i])) {
        return true
      }
    }
    return false
  } else if (typeof allowedOrigin === 'string') {
    return reqOrigin === allowedOrigin
  } else if (allowedOrigin instanceof RegExp) {
    allowedOrigin.lastIndex = 0
    return allowedOrigin.test(reqOrigin)
  } else {
    return !!allowedOrigin
  }
}

const _fastifyCors = fp(fastifyCors, {
  fastify: '5.x',
  name: '@fastify/cors'
})

/**
 * These export configurations enable JS and TS developers
 * to consumer fastify in whatever way best suits their needs.
 */
module.exports = _fastifyCors
module.exports.fastifyCors = _fastifyCors
module.exports.default = _fastifyCors

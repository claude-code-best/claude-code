# @fastify/cors

[![CI](https://github.com/fastify/fastify-cors/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fastify/fastify-cors/actions/workflows/ci.yml)
[![NPM version](https://img.shields.io/npm/v/@fastify/cors.svg?style=flat)](https://www.npmjs.com/package/@fastify/cors)
[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-brightgreen?style=flat)](https://github.com/neostandard/neostandard)

`@fastify/cors` enables the use of [CORS](https://en.wikipedia.org/wiki/Cross-origin_resource_sharing) in a Fastify application.

## Install
```
npm i @fastify/cors
```

### Compatibility

| Plugin version | Fastify version |
| ---------------|-----------------|
| `^11.x`        | `^5.x`          |
| `^10.x`        | `^5.x`          |
| `^8.x`         | `^4.x`          |
| `^7.x`         | `^3.x`          |
| `>=3.x <7.x`   | `^2.x`          |
| `>=1.x <3.x`   | `^1.x`          |

Please note that if a Fastify version is out of support, then so are the corresponding versions of this plugin
in the table above.
See [Fastify's LTS policy](https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md) for more details.

## Usage
Require `@fastify/cors` and register it as any other plugin. It adds an `onRequest` hook and a [wildcard options route](https://github.com/fastify/fastify/issues/326#issuecomment-411360862).
```js
import Fastify from 'fastify'
import cors from '@fastify/cors'

const fastify = Fastify()
await fastify.register(cors, {
  // put your options here
})

fastify.get('/', (req, reply) => {
  reply.send({ hello: 'world' })
})

await fastify.listen({ port: 3000 })
```
You can use it as is without passing any option or you can configure it as explained below.
### Options
* `origin`: Configures the **Access-Control-Allow-Origin** CORS header. The value of origin can be:
  - `Boolean`: Set to `true` to reflect the [request origin](http://tools.ietf.org/html/draft-abarth-origin-09), or `false` to disable CORS.
  - `String`: Set to a specific origin (e.g., `"http://example.com"`). The special `*` value (default) allows any origin.
  - `RegExp`: Set to a regular expression pattern to test the request origin. If it matches, the request origin is reflected (e.g., `/example\.com$/` returns the origin only if it ends with `example.com`).
  - `Array`: Set to an array of valid origins, each being a `String` or `RegExp` (e.g., `["http://example1.com", /\.example2\.com$/]`).
  - `Function`: Set to a function with custom logic. The function takes the request origin as the first parameter and a callback as the second (signature `err [Error | null], origin`). *Async-await* and promises are supported. The Fastify instance is bound to the function call and can be accessed via `this`. For example:
  ```js
  origin: (origin, cb) => {
    const hostname = new URL(origin).hostname
    if(hostname === "localhost"){
      //  Request from localhost will pass
      cb(null, true)
      return
    }
    // Generate an error on other origins, disabling access
    cb(new Error("Not allowed"), false)
  }
  ```
* `methods`: Configures the **Access-Control-Allow-Methods** CORS header. Expects a comma-delimited string (e.g., 'GET,HEAD,POST') or an array (e.g., `['GET', 'HEAD', 'POST']`). Default: [CORS-safelisted methods](https://fetch.spec.whatwg.org/#methods) `GET,HEAD,POST`.
* `hook`: See [Custom Fastify hook name](#custom-fastify-hook-name). Default: `onRequest`.
* `allowedHeaders`: Configures the **Access-Control-Allow-Headers** CORS header. Expects a comma-delimited string (e.g., `'Content-Type,Authorization'`) or an array (e.g., `['Content-Type', 'Authorization']`). Defaults to reflecting the headers specified in the request's **Access-Control-Request-Headers** header if not specified.
* `exposedHeaders`: Configures the **Access-Control-Expose-Headers** CORS header. Expects a comma-delimited string (e.g., `'Content-Range,X-Content-Range'`) or an array (e.g., `['Content-Range', 'X-Content-Range']`). No custom headers are exposed if not specified.
* `credentials`: Configures the **Access-Control-Allow-Credentials** CORS header. Set to `true` to pass the header; otherwise, it is omitted.
* `maxAge`: Configures the **Access-Control-Max-Age** CORS header in seconds. Set to an integer to pass the header; otherwise, it is omitted.
* `cacheControl`: Configures the **Cache-Control** header for CORS preflight responses. Set to an integer to pass the header as `Cache-Control: max-age=${cacheControl}`, or set to a string to pass the header as `Cache-Control: ${cacheControl}`. Otherwise, the header is omitted.
* `preflightContinue`: Passes the CORS preflight response to the route handler. Default: `false`.
* `optionsSuccessStatus`: Provides a status code for successful `OPTIONS` requests, as some legacy browsers (IE11, various SmartTVs) choke on `204`.
* `preflight`: Disables preflight by passing `false`. Default: `true`.
* `strictPreflight`: Enforces strict requirements for the CORS preflight request headers (**Access-Control-Request-Method** and **Origin**) as defined by the [W3C CORS specification](https://www.w3.org/TR/2020/SPSD-cors-20200602/#resource-preflight-requests). Preflight requests without the required headers result in 400 errors when set to `true`. Default: `true`.
* `hideOptionsRoute`: Hides the options route from documentation built using [@fastify/swagger](https://github.com/fastify/fastify-swagger). Default: `true`.
* `logLevel`: Sets the Fastify log level **only** for the internal CORS pre-flight `OPTIONS *` route.  
  Pass `'silent'` to suppress these requests in your logs, or any valid Fastify
  log level (`'trace'`, `'debug'`, `'info'`, `'warn'`, `'error'`, `'fatal'`).  
  Default: inherits Fastify’s global log level.

#### :warning: DoS attacks

Using `RegExp` or a `function` for the `origin` parameter may enable Denial of Service attacks.
Craft with extreme care.

### Configuring CORS Asynchronously

```js
const fastify = require('fastify')()

fastify.register(require('@fastify/cors'), (instance) => {
  return (req, callback) => {
    const corsOptions = {
      // This is NOT recommended for production as it enables reflection exploits
      origin: true
    };

    // do not include CORS headers for requests from localhost
    if (/^localhost$/m.test(req.headers.origin)) {
      corsOptions.origin = false
    }

    // callback expects two parameters: error and options
    callback(null, corsOptions)
  }
})

fastify.register(async function (fastify) {
  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })
})

fastify.listen({ port: 3000 })
```

### Route-Level CORS Overrides

It is possible to override the CORS plugin options provided during registration on a per-route basis using the `config.cors` option.

```js
const fastify = require('fastify')()

fastify.register(require('@fastify/cors'), { origin: 'https://example.com' })

fastify.get('/cors-enabled', (_req, reply) => {
  reply.send('CORS headers applied')
})

fastify.get('/cors-allow-all', {
  config: {
    cors: {
      origin: '*', // Allow all origins for this route
    },
  },
}, (_req, reply) => {
  reply.send('Custom CORS headers applied')
})

fastify.get('/cors-disabled', {
  config: {
    cors: false, // Disable CORS for this route
  },
}, (_req, reply) => {
  reply.send('No CORS headers')
})

fastify.listen({ port: 3000 })
```

### Custom Fastify hook name

By default, `@fastify/cors` adds an `onRequest` hook for validation and header injection. This can be customized by passing `hook` in the options. Valid values are `onRequest`, `preParsing`, `preValidation`, `preHandler`, `preSerialization`, and `onSend`.

```js
import Fastify from 'fastify'
import cors from '@fastify/cors'

const fastify = Fastify()
await fastify.register(cors, {
  hook: 'preHandler',
})

fastify.get('/', (req, reply) => {
  reply.send({ hello: 'world' })
})

await fastify.listen({ port: 3000 })
```

To configure CORS asynchronously, provide an object with the `delegator` key:

```js
const fastify = require('fastify')()

fastify.register(require('@fastify/cors'), {
  hook: 'preHandler',
  delegator: (req, callback) => {
    const corsOptions = {
      // This is NOT recommended for production as it enables reflection exploits
      origin: true
    };

    // do not include CORS headers for requests from localhost
    if (/^localhost$/m.test(req.headers.origin)) {
      corsOptions.origin = false
    }

    // callback expects two parameters: error and options
    callback(null, corsOptions)
  },
})

fastify.register(async function (fastify) {
  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })
})

fastify.listen({ port: 3000 })
```

## Acknowledgments

The code is a port for Fastify of [`expressjs/cors`](https://github.com/expressjs/cors).

## License

Licensed under [MIT](./LICENSE).<br/>
[`expressjs/cors` license](https://github.com/expressjs/cors/blob/master/LICENSE)

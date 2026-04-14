'use strict'

const { test } = require('node:test')
const { createAddFieldnameToVary } = require('../vary')
const { parse } = require('../vary')

test('Should set * even if we set a specific field', async t => {
  t.plan(1)

  const addOriginToVary = createAddFieldnameToVary('Origin')
  const replyMock = {
    getHeader () {
      return '*'
    },
    header () {
      t.fail('Should not be here')
    }
  }

  addOriginToVary(replyMock)
  t.assert.ok(true) // equalivant to tap t.pass()
})

test('Should set * even if we set a specific field', t => {
  t.plan(2)

  const addWildcardToVary = createAddFieldnameToVary('*')
  const replyMock = {
    getHeader () {
      return 'Origin'
    },
    header (name, value) {
      t.assert.deepStrictEqual(name, 'Vary')
      t.assert.deepStrictEqual(value, '*')
    }
  }

  addWildcardToVary(replyMock)
})

test('Should set * when field contains a *', t => {
  t.plan(3)

  const addOriginToVary = createAddFieldnameToVary('Origin')
  const replyMock = {
    getHeader () {
      return ['Origin', '*', 'Access-Control-Request-Headers']
    },
    header (name, value) {
      t.assert.deepStrictEqual(name, 'Vary')
      t.assert.deepStrictEqual(value, '*')
    }
  }

  addOriginToVary(replyMock)
  t.assert.ok(true) // equalivant to tap t.pass()
})

test('Should concat vary values', t => {
  t.plan(3)

  const addOriginToVary = createAddFieldnameToVary('Origin')
  const replyMock = {
    getHeader () {
      return 'Access-Control-Request-Headers'
    },
    header (name, value) {
      t.assert.deepStrictEqual(name, 'Vary')
      t.assert.deepStrictEqual(value, 'Access-Control-Request-Headers, Origin')
    }
  }

  addOriginToVary(replyMock)
  t.assert.ok(true) // equalivant to tap t.pass()
})

test('Should concat vary values ignoring consecutive commas', t => {
  t.plan(3)

  const addOriginToVary = createAddFieldnameToVary('Origin')
  const replyMock = {
    getHeader () {
      return ' Access-Control-Request-Headers,Access-Control-Request-Method'
    },
    header (name, value) {
      t.assert.deepStrictEqual(name, 'Vary')
      t.assert.deepStrictEqual(value, ' Access-Control-Request-Headers,Access-Control-Request-Method, Origin')
    }
  }

  addOriginToVary(replyMock)
  t.assert.ok(true) // equalivant to tap t.pass()
})

test('Should concat vary values ignoring whitespace', t => {
  t.plan(3)

  const addOriginToVary = createAddFieldnameToVary('Origin')
  const replyMock = {
    getHeader () {
      return ' Access-Control-Request-Headers ,Access-Control-Request-Method'
    },
    header (name, value) {
      t.assert.deepStrictEqual(name, 'Vary')
      t.assert.deepStrictEqual(value, ' Access-Control-Request-Headers ,Access-Control-Request-Method, Origin')
    }
  }

  addOriginToVary(replyMock)
  t.assert.ok(true) // equalivant to tap t.pass()
})

test('Should set the field as value for vary if no vary is defined', t => {
  t.plan(2)

  const addOriginToVary = createAddFieldnameToVary('Origin')
  const replyMock = {
    getHeader () {
      return undefined
    },
    header (name, value) {
      t.assert.deepStrictEqual(name, 'Vary')
      t.assert.deepStrictEqual(value, 'Origin')
    }
  }

  addOriginToVary(replyMock)
})

test('Should set * as value for vary if vary contains *', t => {
  t.plan(2)

  const addOriginToVary = createAddFieldnameToVary('Origin')
  const replyMock = {
    getHeader () {
      return 'Accept,*'
    },
    header (name, value) {
      t.assert.deepStrictEqual(name, 'Vary')
      t.assert.deepStrictEqual(value, '*')
    }
  }

  addOriginToVary(replyMock)
})

test('Should set Accept-Encoding as value for vary if vary is empty string', t => {
  t.plan(2)

  const addAcceptEncodingToVary = createAddFieldnameToVary('Accept-Encoding')
  const replyMock = {
    getHeader () {
      return ''
    },
    header (name, value) {
      t.assert.deepStrictEqual(name, 'Vary')
      t.assert.deepStrictEqual(value, 'Accept-Encoding')
    }
  }

  addAcceptEncodingToVary(replyMock)
})

test('Should have no issues with values containing dashes', t => {
  t.plan(2)

  const addXFooToVary = createAddFieldnameToVary('X-Foo')
  const replyMock = {
    value: 'Accept-Encoding',
    getHeader () {
      return this.value
    },
    header (name, value) {
      t.assert.deepStrictEqual(name, 'Vary')
      t.assert.deepStrictEqual(value, 'Accept-Encoding, X-Foo')
      this.value = value
    }
  }

  addXFooToVary(replyMock)
  addXFooToVary(replyMock)
})

test('Should ignore the header as value for vary if it is already in vary', t => {
  t.plan(1)

  const addOriginToVary = createAddFieldnameToVary('Origin')
  const replyMock = {
    getHeader () {
      return 'Origin'
    },
    header () {
      t.fail('Should not be here')
    }
  }
  addOriginToVary(replyMock)
  addOriginToVary(replyMock)

  t.assert.ok(true) // equalivant to tap t.pass()
})

test('parse', t => {
  t.plan(18)
  t.assert.deepStrictEqual(parse(''), [])
  t.assert.deepStrictEqual(parse('a'), ['a'])
  t.assert.deepStrictEqual(parse('a,b'), ['a', 'b'])
  t.assert.deepStrictEqual(parse('  a,b'), ['a', 'b'])
  t.assert.deepStrictEqual(parse('a,b  '), ['a', 'b'])
  t.assert.deepStrictEqual(parse('a,b,c'), ['a', 'b', 'c'])
  t.assert.deepStrictEqual(parse('A,b,c'), ['a', 'b', 'c'])
  t.assert.deepStrictEqual(parse('a,b,c,'), ['a', 'b', 'c'])
  t.assert.deepStrictEqual(parse('a,b,c, '), ['a', 'b', 'c'])
  t.assert.deepStrictEqual(parse(',a,b,c'), ['a', 'b', 'c'])
  t.assert.deepStrictEqual(parse(' ,a,b,c'), ['a', 'b', 'c'])
  t.assert.deepStrictEqual(parse('a,,b,c'), ['a', 'b', 'c'])
  t.assert.deepStrictEqual(parse('a,,,b,,c'), ['a', 'b', 'c'])
  t.assert.deepStrictEqual(parse('a, b,c'), ['a', 'b', 'c'])
  t.assert.deepStrictEqual(parse('a,   b,c'), ['a', 'b', 'c'])
  t.assert.deepStrictEqual(parse('a, , b,c'), ['a', 'b', 'c'])
  t.assert.deepStrictEqual(parse('a,  , b,c'), ['a', 'b', 'c'])

  // one for the cache
  t.assert.deepStrictEqual(parse('A,b,c'), ['a', 'b', 'c'])
})

test('createAddFieldnameToVary', async t => {
  t.plan(4)
  t.assert.strictEqual(typeof createAddFieldnameToVary('valid-header'), 'function')
  await t.assert.rejects(
    async () => createAddFieldnameToVary('invalid:header'),
    (err) => {
      t.assert.strictEqual(err.name, 'TypeError')
      t.assert.strictEqual(err.message, 'Fieldname contains invalid characters.')
      return true
    }
  )
})

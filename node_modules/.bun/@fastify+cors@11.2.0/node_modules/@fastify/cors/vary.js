'use strict'

const { FifoMap: FifoCache } = require('toad-cache')

/**
 * Field Value Components
 * Most HTTP header field values are defined using common syntax
 * components (token, quoted-string, and comment) separated by
 * whitespace or specific delimiting characters.  Delimiters are chosen
 * from the set of US-ASCII visual characters not allowed in a token
 * (DQUOTE and "(),/:;<=>?@[\]{}").
 *
 * field-name    = token
 * token         = 1*tchar
 * tchar         = "!" / "#" / "$" / "%" / "&" / "'" / "*"
 *               / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
 *               / DIGIT / ALPHA
 *               ; any VCHAR, except delimiters
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7230#section-3.2.6
 */

const validFieldnameRE = /^[!#$%&'*+\-.^\w`|~]+$/u
function validateFieldname (fieldname) {
  if (validFieldnameRE.test(fieldname) === false) {
    throw new TypeError('Fieldname contains invalid characters.')
  }
}

function parse (header) {
  header = header.trim().toLowerCase()
  const result = []

  if (header.length === 0) {
    // pass through
  } else if (header.indexOf(',') === -1) {
    result.push(header)
  } else {
    const il = header.length
    let i = 0
    let pos = 0
    let char

    // tokenize the header
    for (i; i < il; ++i) {
      char = header[i]
      // when we have whitespace set the pos to the next position
      if (char === ' ') {
        pos = i + 1
      // `,` is the separator of vary-values
      } else if (char === ',') {
        // if pos and current position are not the same we have a valid token
        if (pos !== i) {
          result.push(header.slice(pos, i))
        }
        // reset the positions
        pos = i + 1
      }
    }

    if (pos !== i) {
      result.push(header.slice(pos, i))
    }
  }

  return result
}

function createAddFieldnameToVary (fieldname) {
  const headerCache = new FifoCache(1000)

  validateFieldname(fieldname)

  return function (reply) {
    let header = reply.getHeader('Vary')

    if (!header) {
      reply.header('Vary', fieldname)
      return
    }

    if (header === '*') {
      return
    }

    if (fieldname === '*') {
      reply.header('Vary', '*')
      return
    }

    if (Array.isArray(header)) {
      header = header.join(', ')
    }

    if (headerCache.get(header) === undefined) {
      const vals = parse(header)

      if (vals.indexOf('*') !== -1) {
        headerCache.set(header, '*')
      } else if (vals.indexOf(fieldname.toLowerCase()) === -1) {
        headerCache.set(header, header + ', ' + fieldname)
      } else {
        headerCache.set(header, null)
      }
    }
    const cached = headerCache.get(header)
    if (cached !== null) {
      reply.header('Vary', cached)
    }
  }
}

module.exports.createAddFieldnameToVary = createAddFieldnameToVary
module.exports.addOriginToVaryHeader = createAddFieldnameToVary('Origin')
module.exports.addAccessControlRequestHeadersToVaryHeader = createAddFieldnameToVary('Access-Control-Request-Headers')
module.exports.parse = parse

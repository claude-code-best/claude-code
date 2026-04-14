'use strict'

const benchmark = require('benchmark')
const vary = require('vary')
const createAddFieldnameToVary = require('../vary').createAddFieldnameToVary

const replyMock = (header) => ({
  getHeader () { return header },
  setHeader () { },
  header () { }
})

const addAcceptToVary = createAddFieldnameToVary('Accept')
const addWildcardToVary = createAddFieldnameToVary('*')
const addAcceptEncodingToVary = createAddFieldnameToVary('Accept-Encoding')
const addXFooToVary = createAddFieldnameToVary('X-Foo')

new benchmark.Suite()
  .add('vary - field to undefined', function () { vary(replyMock(undefined), 'Accept-Encoding') }, { minSamples: 100 })
  .add('vary - field to *', function () { vary(replyMock('*'), 'Accept-Encoding') }, { minSamples: 100 })
  .add('vary - * to field', function () { vary(replyMock('Accept-Encoding'), '*') }, { minSamples: 100 })
  .add('vary - field to empty', function () { vary(replyMock(''), 'Accept-Encoding') }, { minSamples: 100 })
  .add('vary - fields string to empty', function () { vary(replyMock(''), 'Accept') }, { minSamples: 100 })
  .add('vary - field to fields', function () { vary(replyMock('Accept, Accept-Encoding, Accept-Language'), 'X-Foo') }, { minSamples: 100 })

  .add('cors - field to undefined', function () { addAcceptEncodingToVary(replyMock(undefined)) }, { minSamples: 100 })
  .add('cors - field to *', function () { addAcceptEncodingToVary(replyMock('*')) }, { minSamples: 100 })
  .add('cors - * to field', function () { addWildcardToVary(replyMock('Accept-Encoding')) }, { minSamples: 100 })
  .add('cors - field to empty', function () { addAcceptEncodingToVary(replyMock('')) }, { minSamples: 100 })
  .add('cors - fields string to empty', function () { addAcceptToVary(replyMock('')) }, { minSamples: 100 })
  .add('cors - field to fields', function () { addXFooToVary(replyMock('Accept, Accept-Encoding, Accept-Language')) }, { minSamples: 100 })

  .on('cycle', function onCycle (event) { console.log(String(event.target)) })
  .run({ async: false })

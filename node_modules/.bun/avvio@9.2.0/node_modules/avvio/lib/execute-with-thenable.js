'use strict'
const { isPromiseLike } = require('./is-promise-like')
const { kAvvio } = require('./symbols')

/**
 * @callback ExecuteWithThenableCallback
 * @param {Error} error
 * @returns {void}
 */

/**
 * @param {Function} func
 * @param {Array<any>} args
 * @param {ExecuteWithThenableCallback} [callback]
 */
function executeWithThenable (func, args, callback) {
  let result
  try {
    result = func.apply(func, args)
  } catch (error) {
    if (callback) {
      process.nextTick(callback, error)
    }
    return
  }
  if (isPromiseLike(result) && !result[kAvvio]) {
    // process promise but not avvio mock thenable
    result.then(() => process.nextTick(callback), (error) => process.nextTick(callback, error))
  } else if (callback) {
    process.nextTick(callback)
  }
}

module.exports = {
  executeWithThenable
}

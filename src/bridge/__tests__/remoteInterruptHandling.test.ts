import { feature } from 'bun:bundle'
import { afterEach, describe, expect, test } from 'bun:test'

import { handleRemoteInterrupt } from '../remoteInterruptHandling.js'
import {
  activateProactive,
  deactivateProactive,
  isProactivePaused,
} from '../../proactive/index.js'

function isProactiveFeatureEnabled() {
  if (feature('PROACTIVE')) return true
  return feature('KAIROS') ? true : false
}

describe('handleRemoteInterrupt', () => {
  afterEach(() => {
    deactivateProactive()
  })

  test('always aborts the active request', () => {
    const controller = new AbortController()

    handleRemoteInterrupt(controller)

    expect(controller.signal.aborted).toBe(true)
  })

  test('pauses proactive mode to return control to the user', () => {
    activateProactive('test')
    expect(isProactivePaused()).toBe(false)

    handleRemoteInterrupt(new AbortController())

    expect(isProactivePaused()).toBe(isProactiveFeatureEnabled())
  })
})

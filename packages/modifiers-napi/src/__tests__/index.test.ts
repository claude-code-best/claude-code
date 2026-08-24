import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

let ffiShouldThrow = false
let nativeFlags = 0
let dlopenCalls = 0

mock.module('bun:ffi', () => ({
  FFIType: {
    i32: 0,
    u64: 0,
  },
  dlopen: () => {
    dlopenCalls++
    if (ffiShouldThrow) {
      throw new Error('ffi load failed')
    }
    return {
      symbols: {
        CGEventSourceFlagsState: () => nativeFlags,
      },
    }
  },
}))

afterAll(() => {
  mock.restore()
})

const originalPlatform = process.platform

import * as mod from '../index.js'

beforeEach(() => {
  ffiShouldThrow = false
  nativeFlags = 0
  dlopenCalls = 0
  mod.__resetForTest()
})

describe('modifiers-napi', () => {
  test('returns false for non-darwin platforms', async () => {
    mod.__setPlatformForTest('win32')
    await mod.prewarm()
    expect(dlopenCalls).toBe(0)
    expect(mod.isModifierPressed('shift')).toBe(false)
    expect(mod.isModifierPressed('command')).toBe(false)
  })

  test('prewarm is idempotent on darwin', async () => {
    mod.__setPlatformForTest('darwin')
    await mod.prewarm()
    const callsAfterFirst = dlopenCalls

    await mod.prewarm()

    expect(dlopenCalls).toBe(callsAfterFirst)
  })

  test('returns false when ffi loading fails on darwin', async () => {
    mod.__setPlatformForTest('darwin')
    ffiShouldThrow = true
    await mod.prewarm()
    expect(mod.isModifierPressed('shift')).toBe(false)
  })

  test('returns false for unknown modifier names on darwin', async () => {
    mod.__setPlatformForTest('darwin')
    nativeFlags = 0x20000
    await mod.prewarm()
    expect(mod.isModifierPressed('unknown')).toBe(false)
  })

  test('uses native flag bits for known modifiers on darwin', async () => {
    mod.__setPlatformForTest('darwin')
    nativeFlags = 0x20000 | 0x40000
    await mod.prewarm()
    expect(mod.isModifierPressed('shift')).toBe(true)
    expect(mod.isModifierPressed('control')).toBe(true)
    expect(mod.isModifierPressed('option')).toBe(false)
  })
})

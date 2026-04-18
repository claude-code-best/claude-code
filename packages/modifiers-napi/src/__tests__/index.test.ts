import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

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

const originalPlatform = process.platform

async function loadModule() {
  return import(`../index.ts?case=${Math.random()}`)
}

beforeEach(() => {
  ffiShouldThrow = false
  nativeFlags = 0
  dlopenCalls = 0
  Object.defineProperty(process, 'platform', {
    value: originalPlatform,
    configurable: true,
  })
})

afterEach(() => {
  Object.defineProperty(process, 'platform', {
    value: originalPlatform,
    configurable: true,
  })
})

describe('modifiers-napi', () => {
  test('returns false for non-darwin platforms', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    })
    const mod = await loadModule()

    await mod.prewarm()
    expect(dlopenCalls).toBe(0)
    expect(mod.isModifierPressed('shift')).toBe(false)
    expect(mod.isModifierPressed('command')).toBe(false)
  })

  test('prewarm is idempotent on darwin', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    })
    const mod = await loadModule()

    await mod.prewarm()
    await mod.prewarm()

    expect(dlopenCalls).toBe(1)
  })

  test('returns false when ffi loading fails on darwin', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    })
    ffiShouldThrow = true
    const mod = await loadModule()

    await mod.prewarm()
    expect(mod.isModifierPressed('shift')).toBe(false)
  })

  test('returns false for unknown modifier names on darwin', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    })
    nativeFlags = 0x20000
    const mod = await loadModule()

    await mod.prewarm()
    expect(mod.isModifierPressed('unknown')).toBe(false)
  })

  test('uses native flag bits for known modifiers on darwin', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    })
    nativeFlags = 0x20000 | 0x40000
    const mod = await loadModule()

    await mod.prewarm()
    expect(mod.isModifierPressed('shift')).toBe(true)
    expect(mod.isModifierPressed('control')).toBe(true)
    expect(mod.isModifierPressed('option')).toBe(false)
  })
})

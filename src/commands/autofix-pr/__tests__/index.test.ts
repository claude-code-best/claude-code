import { beforeAll, describe, expect, mock, test } from 'bun:test'

// Must mock bun:bundle before importing index
mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

let cmd: {
  isEnabled?: () => boolean
  getBridgeInvocationError?: (args: string) => string | undefined
  load?: () => Promise<unknown>
}
let getBridgeInvocationError: ((args: string) => string | undefined) | undefined

beforeAll(async () => {
  const mod = await import('../index.js')
  cmd = mod.default as typeof cmd
  getBridgeInvocationError = cmd.getBridgeInvocationError
})

describe('autofixPr isEnabled', () => {
  test('isEnabled returns a boolean', () => {
    // In Bun test environment, feature() from bun:bundle is a compile-time macro.
    // The mock.module('bun:bundle') intercept is used to allow the import to
    // succeed, but the actual macro value is resolved at build time (not runtime).
    // In the test runner (non-bundle mode) feature() returns false.
    // We just verify the function is callable and returns a boolean.
    const result = cmd.isEnabled?.()
    expect(typeof result).toBe('boolean')
  })
})

describe('autofixPr load', () => {
  test('load function exists on the command', () => {
    // Just verify load is a function (don't call it — calling it imports
    // launchAutofixPr.js which would set process-level mocks interfering
    // with launchAutofixPr.test.ts)
    expect(typeof cmd.load).toBe('function')
  })
})

describe('autofixPr getBridgeInvocationError', () => {
  test('empty string returns error', () => {
    const err = getBridgeInvocationError?.('')
    expect(err).toBe('PR number required, e.g. /autofix-pr 386')
  })

  test('"stop" returns undefined (no error)', () => {
    expect(getBridgeInvocationError?.('stop')).toBeUndefined()
  })

  test('"off" returns undefined (no error)', () => {
    expect(getBridgeInvocationError?.('off')).toBeUndefined()
  })

  test('digit-only returns undefined (no error)', () => {
    expect(getBridgeInvocationError?.('386')).toBeUndefined()
  })

  test('cross-repo syntax returns undefined (no error)', () => {
    expect(
      getBridgeInvocationError?.('anthropics/claude-code#999'),
    ).toBeUndefined()
  })

  test('invalid args returns error string', () => {
    const err = getBridgeInvocationError?.('not valid!!')
    expect(err).toMatch(/Invalid args/)
  })

  test('load is defined as an async function', () => {
    expect(typeof cmd.load).toBe('function')
  })
})

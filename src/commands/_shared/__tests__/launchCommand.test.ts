/**
 * Regression tests for launchCommand factory (H2 finding).
 * Tests MUST fail before the factory is created, then pass after.
 */
import { describe, test, expect, mock } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log.js'

mock.module('src/utils/log.ts', logMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

import React from 'react'
import type {
  LocalJSXCommandCall,
  LocalJSXCommandOnDone,
} from '../../../types/command.js'
import type { LaunchCommandOptions } from '../launchCommand.js'

let launchCommand: typeof import('../launchCommand.js').launchCommand

// Lazy import so mocks are in place first
const loadModule = async () => {
  const mod = await import('../launchCommand.js')
  launchCommand = mod.launchCommand
}

// Simple parsed union for tests
type TestParsed =
  | { action: 'greet'; name: string }
  | { action: 'invalid'; reason: string }

type TestViewProps = { greeting: string }

const TestView: React.FC<TestViewProps> = ({ greeting }) =>
  React.createElement('span', null, greeting)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOpts = LaunchCommandOptions<any, any>

const makeOpts = (overrides: Partial<AnyOpts> = {}): AnyOpts => ({
  commandName: 'test-cmd',
  parseArgs: (
    raw: string,
  ): TestParsed | { action: 'invalid'; reason: string } => {
    if (raw.trim() === '') return { action: 'invalid', reason: 'empty args' }
    return { action: 'greet', name: raw.trim() }
  },
  dispatch: async (parsed: TestParsed, onDone: LocalJSXCommandOnDone) => {
    if (parsed.action !== 'greet') return null
    onDone(`Hello ${parsed.name}`)
    return { greeting: `Hello, ${parsed.name}!` }
  },
  View: TestView as React.FC<unknown>,
  errorView: (msg: string) =>
    React.createElement('span', null, `Error: ${msg}`),
  ...overrides,
})

describe('launchCommand factory', () => {
  test('module loads and exports launchCommand function', async () => {
    await loadModule()
    expect(typeof launchCommand).toBe('function')
  })

  test('launchCommand returns a LocalJSXCommandCall function', async () => {
    await loadModule()
    const call = launchCommand(makeOpts())
    expect(typeof call).toBe('function')
  })

  test('happy path: parseArgs + dispatch succeed → View rendered, onDone called', async () => {
    await loadModule()
    const call: LocalJSXCommandCall = launchCommand(makeOpts())
    const onDone = mock(() => {})
    const result = await call(onDone, {} as never, 'Alice')
    expect(result).not.toBeNull()
    expect(onDone).toHaveBeenCalledTimes(1)
    const [msg] = onDone.mock.calls[0] as unknown as [string]
    expect(msg).toContain('Alice')
  })

  test('parseArgs returns invalid → errorView returned, onDone called with reason', async () => {
    await loadModule()
    const call: LocalJSXCommandCall = launchCommand(makeOpts())
    const onDone = mock(() => {})
    const result = await call(onDone, {} as never, '')
    expect(onDone).toHaveBeenCalledTimes(1)
    const [msg] = onDone.mock.calls[0] as unknown as [string]
    expect(msg).toContain('empty args')
    // errorView should return something (not null from dispatch)
    expect(result).not.toBeUndefined()
  })

  test('dispatch throws → errorView returned, onDone called with error message', async () => {
    await loadModule()
    const call: LocalJSXCommandCall = launchCommand(
      makeOpts({
        dispatch: async () => {
          throw new Error('dispatch failed')
        },
      }),
    )
    const onDone = mock(() => {})
    const result = await call(onDone, {} as never, 'Bob')
    expect(onDone).toHaveBeenCalledTimes(1)
    const [msg] = onDone.mock.calls[0] as unknown as [string]
    expect(msg).toContain('dispatch failed')
    expect(result).not.toBeUndefined()
  })

  test('dispatch returns null → null returned from call', async () => {
    await loadModule()
    const call: LocalJSXCommandCall = launchCommand(
      makeOpts({
        dispatch: async (_parsed, onDone) => {
          onDone('done')
          return null
        },
      }),
    )
    const onDone = mock(() => {})
    const result = await call(onDone, {} as never, 'Charlie')
    expect(result).toBeNull()
  })

  test('onDispatchError hook is called when dispatch throws', async () => {
    await loadModule()
    const onDispatchError = mock((_err: unknown) => {})
    const call: LocalJSXCommandCall = launchCommand(
      makeOpts({
        dispatch: async () => {
          throw new Error('boom')
        },
        onDispatchError,
      }),
    )
    const onDone = mock(() => {})
    await call(onDone, {} as never, 'Dave')
    expect(onDispatchError).toHaveBeenCalledTimes(1)
  })

  test('invalid args: onDone display option is system', async () => {
    await loadModule()
    const call: LocalJSXCommandCall = launchCommand(makeOpts())
    const capturedOpts: unknown[] = []
    const onDone = mock((_msg?: string, opts?: unknown) => {
      capturedOpts.push(opts)
    })
    await call(onDone, {} as never, '')
    expect(capturedOpts[0]).toEqual({ display: 'system' })
  })

  test('dispatch error: onDone is called exactly once with commandName in message', async () => {
    await loadModule()
    const call: LocalJSXCommandCall = launchCommand(
      makeOpts({
        commandName: 'my-special-cmd',
        dispatch: async () => {
          throw new Error('network timeout')
        },
      }),
    )
    const onDone = mock(() => {})
    await call(onDone, {} as never, 'Eve')
    expect(onDone).toHaveBeenCalledTimes(1)
    const [msg] = onDone.mock.calls[0] as unknown as [string]
    expect(msg).toContain('my-special-cmd')
    expect(msg).toContain('network timeout')
  })

  test('errorView receives the error message string', async () => {
    await loadModule()
    const capturedMsgs: string[] = []
    const call: LocalJSXCommandCall = launchCommand(
      makeOpts({
        dispatch: async () => {
          throw new Error('specific-error-text')
        },
        errorView: (msg: string) => {
          capturedMsgs.push(msg)
          return React.createElement('span', null, msg)
        },
      }),
    )
    await call(
      mock(() => {}),
      {} as never,
      'Frank',
    )
    expect(capturedMsgs).toHaveLength(1)
    expect(capturedMsgs[0]).toBe('specific-error-text')
  })
})

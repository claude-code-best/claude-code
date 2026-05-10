/**
 * Shared axios mock helper using the spread+flag pattern.
 *
 * Why this exists:
 * `mock.module('axios', () => ({ default: { get, post } }))` is process-global
 * (last-write-wins) and drops real axios shape (`create`, `request`, `isAxiosError`,
 * verb methods, etc). When test file A registers a stub-only mock, every later
 * test file B that imports axios gets A's bare stub even after A finishes —
 * unless B registers its own mock. In CI (alphabetical file order on Linux),
 * that produces dozens of "polluted" failures that don't reproduce on WSL2.
 *
 * The spread+flag pattern fixes both problems:
 *   1. `require('axios')` INSIDE the factory pulls the real module (top-level
 *      `await import('axios')` would re-enter the mocked one and recurse).
 *   2. The factory spreads the real exports, then replaces method references
 *      with router functions that read a per-suite `useStubs` boolean. When the
 *      flag is OFF (default), calls fall through to the real axios method;
 *      when ON, they hit the suite's stubs. Each suite flips the flag in
 *      beforeAll and clears it in afterAll, so cross-suite pollution disappears.
 *
 * Usage in a test file:
 *
 *   import { setupAxiosMock } from '../../../tests/mocks/axios'
 *
 *   const axiosHandle = setupAxiosMock()
 *   axiosHandle.stubs.get = (url, config) => Promise.resolve({ status: 200, data: {...}, headers: {}, statusText: 'OK', config })
 *   axiosHandle.stubs.post = ...
 *
 *   beforeAll(() => { axiosHandle.useStubs = true })
 *   afterAll(() => { axiosHandle.useStubs = false })
 *
 * If your suite needs an `isAxiosError` predicate that recognises plain
 * objects with `isAxiosError: true`, set `axiosHandle.stubs.isAxiosError` —
 * otherwise the real axios's predicate is used.
 */

import { mock } from 'bun:test'

// Test stubs come in many shapes — `(url: string) => Promise<...>`, etc. —
// and assigning them to a tighter signature like `(...args: unknown[]) => unknown`
// triggers TS2322 (parameter type contravariance). The biome rule that
// disallows `any` here is already disabled project-wide, so plain `any` is
// the correct escape hatch for an internal test-only union.
type AnyFn = (...args: any[]) => unknown

export type AxiosMethodStubs = {
  get?: AnyFn
  post?: AnyFn
  put?: AnyFn
  patch?: AnyFn
  delete?: AnyFn
  head?: AnyFn
  options?: AnyFn
  request?: AnyFn
  isAxiosError?: (e: unknown) => boolean
  isCancel?: (e: unknown) => boolean
  create?: AnyFn
}

export type AxiosMockHandle = {
  /** When true, calls are routed to `stubs`; when false, to real axios. */
  useStubs: boolean
  /** Per-method stubs. Only set the methods your suite exercises. */
  stubs: AxiosMethodStubs
}

// Global registry — all handles share one mock.module registration.
// The router scans handles in reverse order (most-recently activated first)
// to find one with `useStubs === true`.
let handles: AxiosMockHandle[] = []
let moduleRegistered = false

/**
 * Register a process-global mock for `axios` that spreads the real module and
 * gates each method behind a per-suite flag. Call once at the top of a test
 * file (outside `describe`). Returns a handle whose `.useStubs` and `.stubs`
 * fields the suite controls in beforeAll/afterAll.
 *
 * Multiple test files can call this safely — the `mock.module` is registered
 * only once, and each handle is independent.
 */
export function setupAxiosMock(): AxiosMockHandle {
  const handle: AxiosMockHandle = { useStubs: false, stubs: {} }
  handles.push(handle)

  if (!moduleRegistered) {
    moduleRegistered = true

    mock.module('axios', () => {
      // Pull the REAL module synchronously inside the factory. Top-level
      // `await import('axios')` would resolve through the mock and recurse.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const real = require('axios') as Record<string, unknown>
      const realDefault = ((real.default as
        | Record<string, unknown>
        | undefined) ?? real) as Record<string, unknown>

      const route = (method: keyof AxiosMethodStubs): AnyFn => {
        const realFn = realDefault[method] as AnyFn | undefined
        return (...args: unknown[]) => {
          // Scan from the end so the most recently activated handle wins.
          for (let i = handles.length - 1; i >= 0; i--) {
            const h = handles[i]
            if (h.useStubs) {
              const stub = h.stubs[method] as AnyFn | undefined
              if (stub) return stub(...args)
              // If the handle is active but has no stub for this method,
              // fall through to the next active handle (or real axios).
            }
          }
          if (typeof realFn === 'function') return realFn(...args)
          throw new Error(`axios.${method} is not available on real axios`)
        }
      }

      const verbs: (keyof AxiosMethodStubs)[] = [
        'get',
        'post',
        'put',
        'patch',
        'delete',
        'head',
        'options',
        'request',
        'create',
      ]

      const routedDefault: Record<string, unknown> = { ...realDefault }
      for (const v of verbs) {
        routedDefault[v] = route(v)
      }

      routedDefault.isAxiosError = (e: unknown) => {
        for (let i = handles.length - 1; i >= 0; i--) {
          const h = handles[i]
          if (h.useStubs && h.stubs.isAxiosError) {
            return h.stubs.isAxiosError(e)
          }
        }
        const realPredicate = realDefault.isAxiosError as
          | ((e: unknown) => boolean)
          | undefined
        return realPredicate ? realPredicate(e) : false
      }
      routedDefault.isCancel = (e: unknown) => {
        for (let i = handles.length - 1; i >= 0; i--) {
          const h = handles[i]
          if (h.useStubs && h.stubs.isCancel) {
            return h.stubs.isCancel(e)
          }
        }
        const realPredicate = realDefault.isCancel as
          | ((e: unknown) => boolean)
          | undefined
        return realPredicate ? realPredicate(e) : false
      }

      return {
        ...real,
        ...routedDefault,
        default: routedDefault,
      }
    })
  }

  return handle
}

/**
 * Per-file axios mock helper.
 *
 * Each call to `setupAxiosMock()` registers its own `mock.module('axios', ...)`
 * that only knows about the handle returned to that call. No shared state between
 * test files — eliminates cross-file mock pollution.
 *
 * The real axios module is cached at first import (before any mock.module
 * registration) so the factory can spread it for shape compatibility.
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _realAxios = require('axios') as Record<string, unknown>
const _realDefault = ((_realAxios.default as
  | Record<string, unknown>
  | undefined) ?? _realAxios) as Record<string, unknown>

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
  useStubs: boolean
  stubs: AxiosMethodStubs
}

/**
 * Register a mock for `axios` scoped to this test file.
 * Each call creates an independent mock.module registration — no shared
 * handles array, no cross-file state.
 */
export function setupAxiosMock(): AxiosMockHandle {
  const handle: AxiosMockHandle = { useStubs: false, stubs: {} }

  mock.module('axios', () => {
    const route = (method: keyof AxiosMethodStubs): AnyFn => {
      const realFn = _realDefault[method] as AnyFn | undefined
      return (...args: unknown[]) => {
        if (handle.useStubs) {
          const stub = handle.stubs[method] as AnyFn | undefined
          if (stub) return stub(...args)
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

    const routedDefault: Record<string, unknown> = { ..._realDefault }
    for (const v of verbs) {
      routedDefault[v] = route(v)
    }

    routedDefault.isAxiosError = (e: unknown) => {
      if (handle.useStubs && handle.stubs.isAxiosError) {
        return handle.stubs.isAxiosError(e)
      }
      const realPredicate = _realDefault.isAxiosError as
        | ((e: unknown) => boolean)
        | undefined
      return realPredicate ? realPredicate(e) : false
    }
    routedDefault.isCancel = (e: unknown) => {
      if (handle.useStubs && handle.stubs.isCancel) {
        return handle.stubs.isCancel(e)
      }
      const realPredicate = _realDefault.isCancel as
        | ((e: unknown) => boolean)
        | undefined
      return realPredicate ? realPredicate(e) : false
    }

    return {
      ..._realAxios,
      ...routedDefault,
      default: routedDefault,
    }
  })

  return handle
}

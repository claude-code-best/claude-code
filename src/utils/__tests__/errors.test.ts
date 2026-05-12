import { describe, expect, test } from 'bun:test'
import {
  AbortError,
  ClaudeError,
  MalformedCommandError,
  ConfigParseError,
  ShellError,
  TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  isAbortError,
  hasExactErrorMessage,
  toError,
  errorMessage,
  getErrnoCode,
  isENOENT,
  getErrnoPath,
  shortErrorStack,
  isFsInaccessible,
  classifyAxiosError,
} from '../errors'

// ─── Error classes ──────────────────────────────────────────────────────

describe('ClaudeError', () => {
  test('sets name to constructor name', () => {
    const e = new ClaudeError('test')
    expect(e.name).toBe('ClaudeError')
    expect(e.message).toBe('test')
  })
})

describe('AbortError', () => {
  test('sets name to AbortError', () => {
    const e = new AbortError('cancelled')
    expect(e.name).toBe('AbortError')
  })
})

describe('ConfigParseError', () => {
  test('stores filePath and defaultConfig', () => {
    const e = new ConfigParseError('bad', '/tmp/cfg', { x: 1 })
    expect(e.filePath).toBe('/tmp/cfg')
    expect(e.defaultConfig).toEqual({ x: 1 })
  })
})

describe('ShellError', () => {
  test('stores stdout, stderr, code, interrupted', () => {
    const e = new ShellError('out', 'err', 1, false)
    expect(e.stdout).toBe('out')
    expect(e.stderr).toBe('err')
    expect(e.code).toBe(1)
    expect(e.interrupted).toBe(false)
  })
})

describe('TelemetrySafeError', () => {
  test('uses message as telemetryMessage by default', () => {
    const e = new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
      'msg',
    )
    expect(e.telemetryMessage).toBe('msg')
  })

  test('uses separate telemetryMessage when provided', () => {
    const e = new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
      'full msg',
      'safe msg',
    )
    expect(e.message).toBe('full msg')
    expect(e.telemetryMessage).toBe('safe msg')
  })
})

// ─── isAbortError ───────────────────────────────────────────────────────

describe('isAbortError', () => {
  test('returns true for AbortError instance', () => {
    expect(isAbortError(new AbortError())).toBe(true)
  })

  test('returns true for DOMException-style abort', () => {
    const e = new Error('aborted')
    e.name = 'AbortError'
    expect(isAbortError(e)).toBe(true)
  })

  test('returns false for regular error', () => {
    expect(isAbortError(new Error('nope'))).toBe(false)
  })

  test('returns false for non-error', () => {
    expect(isAbortError('string')).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})

// ─── hasExactErrorMessage ───────────────────────────────────────────────

describe('hasExactErrorMessage', () => {
  test('returns true for matching message', () => {
    expect(hasExactErrorMessage(new Error('test'), 'test')).toBe(true)
  })

  test('returns false for different message', () => {
    expect(hasExactErrorMessage(new Error('a'), 'b')).toBe(false)
  })

  test('returns false for non-Error', () => {
    expect(hasExactErrorMessage('string', 'string')).toBe(false)
  })
})

// ─── toError ────────────────────────────────────────────────────────────

describe('toError', () => {
  test('returns Error as-is', () => {
    const e = new Error('test')
    expect(toError(e)).toBe(e)
  })

  test('wraps string in Error', () => {
    const e = toError('oops')
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe('oops')
  })

  test('wraps number in Error', () => {
    expect(toError(42).message).toBe('42')
  })
})

// ─── errorMessage ───────────────────────────────────────────────────────

describe('errorMessage', () => {
  test('extracts message from Error', () => {
    expect(errorMessage(new Error('hello'))).toBe('hello')
  })

  test('stringifies non-Error', () => {
    expect(errorMessage(42)).toBe('42')
    expect(errorMessage(null)).toBe('null')
  })
})

// ─── getErrnoCode / isENOENT / getErrnoPath ────────────────────────────

describe('getErrnoCode', () => {
  test('extracts code from errno-like error', () => {
    const e = Object.assign(new Error(), { code: 'ENOENT' })
    expect(getErrnoCode(e)).toBe('ENOENT')
  })

  test('returns undefined for no code', () => {
    expect(getErrnoCode(new Error())).toBeUndefined()
  })

  test('returns undefined for non-string code', () => {
    expect(getErrnoCode({ code: 123 })).toBeUndefined()
  })

  test('returns undefined for non-object', () => {
    expect(getErrnoCode(null)).toBeUndefined()
    expect(getErrnoCode('string')).toBeUndefined()
  })
})

describe('isENOENT', () => {
  test('returns true for ENOENT', () => {
    expect(isENOENT(Object.assign(new Error(), { code: 'ENOENT' }))).toBe(true)
  })

  test('returns false for other codes', () => {
    expect(isENOENT(Object.assign(new Error(), { code: 'EACCES' }))).toBe(false)
  })
})

describe('getErrnoPath', () => {
  test('extracts path from errno error', () => {
    const e = Object.assign(new Error(), { path: '/tmp/file' })
    expect(getErrnoPath(e)).toBe('/tmp/file')
  })

  test('returns undefined when no path', () => {
    expect(getErrnoPath(new Error())).toBeUndefined()
  })
})

// ─── shortErrorStack ────────────────────────────────────────────────────

describe('shortErrorStack', () => {
  test('returns string for non-Error', () => {
    expect(shortErrorStack('oops')).toBe('oops')
  })

  test('returns message when no stack', () => {
    const e = new Error('test')
    e.stack = undefined
    expect(shortErrorStack(e)).toBe('test')
  })

  test('truncates long stacks', () => {
    const e = new Error('test')
    const frames = Array.from({ length: 20 }, (_, i) => `    at frame${i}`)
    e.stack = `Error: test\n${frames.join('\n')}`
    const result = shortErrorStack(e, 3)
    const lines = result.split('\n')
    expect(lines).toHaveLength(4) // header + 3 frames
  })

  test('preserves short stacks', () => {
    const e = new Error('test')
    e.stack = 'Error: test\n    at frame1\n    at frame2'
    expect(shortErrorStack(e, 5)).toBe(e.stack)
  })
})

// ─── isFsInaccessible ──────────────────────────────────────────────────

describe('isFsInaccessible', () => {
  test('returns true for ENOENT', () => {
    expect(
      isFsInaccessible(Object.assign(new Error(), { code: 'ENOENT' })),
    ).toBe(true)
  })

  test('returns true for EACCES', () => {
    expect(
      isFsInaccessible(Object.assign(new Error(), { code: 'EACCES' })),
    ).toBe(true)
  })

  test('returns true for EPERM', () => {
    expect(
      isFsInaccessible(Object.assign(new Error(), { code: 'EPERM' })),
    ).toBe(true)
  })

  test('returns true for ENOTDIR', () => {
    expect(
      isFsInaccessible(Object.assign(new Error(), { code: 'ENOTDIR' })),
    ).toBe(true)
  })

  test('returns true for ELOOP', () => {
    expect(
      isFsInaccessible(Object.assign(new Error(), { code: 'ELOOP' })),
    ).toBe(true)
  })

  test('returns false for other codes', () => {
    expect(
      isFsInaccessible(Object.assign(new Error(), { code: 'EEXIST' })),
    ).toBe(false)
  })
})

// ─── classifyAxiosError ─────────────────────────────────────────────────

describe('classifyAxiosError', () => {
  test("returns 'other' for non-axios error", () => {
    expect(classifyAxiosError(new Error('test')).kind).toBe('other')
  })

  test("returns 'auth' for 401", () => {
    const e = {
      isAxiosError: true,
      response: { status: 401 },
      message: 'unauth',
    }
    expect(classifyAxiosError(e).kind).toBe('auth')
  })

  test("returns 'auth' for 403", () => {
    const e = {
      isAxiosError: true,
      response: { status: 403 },
      message: 'forbidden',
    }
    expect(classifyAxiosError(e).kind).toBe('auth')
  })

  test("returns 'timeout' for ECONNABORTED", () => {
    const e = { isAxiosError: true, code: 'ECONNABORTED', message: 'timeout' }
    expect(classifyAxiosError(e).kind).toBe('timeout')
  })

  test("returns 'network' for ECONNREFUSED", () => {
    const e = { isAxiosError: true, code: 'ECONNREFUSED', message: 'refused' }
    expect(classifyAxiosError(e).kind).toBe('network')
  })

  test("returns 'network' for ENOTFOUND", () => {
    const e = { isAxiosError: true, code: 'ENOTFOUND', message: 'nope' }
    expect(classifyAxiosError(e).kind).toBe('network')
  })

  test("returns 'http' for other axios errors", () => {
    const e = { isAxiosError: true, response: { status: 500 }, message: 'err' }
    const result = classifyAxiosError(e)
    expect(result.kind).toBe('http')
    expect(result.status).toBe(500)
  })

  test("returns 'other' for null", () => {
    expect(classifyAxiosError(null).kind).toBe('other')
  })
})

import { describe, expect, mock, test } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'

// Cut the bootstrap/state dependency chain (mock.module requirement).
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({
  feature: (_name: string) => false,
}))

// MACRO is a build-time define injected by `bun --define` (see
// scripts/dev.ts → -d flags). Without it, `declare const MACRO` references
// in source code resolve to `undefined` at runtime and crash any function
// that touches `MACRO.VERSION` (e.g. `getBundledSkillsRoot` via
// `checkReadableInternalPath`).
// Setting it on globalThis lets the bare `MACRO` identifier resolve at
// runtime in tests.
;(globalThis as unknown as { MACRO: { VERSION: string } }).MACRO = {
  VERSION: 'test',
}

const { validatePath } = await import('../pathValidation.js')
const { getEmptyToolPermissionContext } = await import('../../../Tool.js')

function makeContext(): ReturnType<typeof getEmptyToolPermissionContext> {
  return getEmptyToolPermissionContext()
}

const isWindows = process.platform === 'win32'
const describeIfWindows = isWindows ? describe : describe.skip

// ─── MinGW path normalization (Windows) ──────────────────────────────────
//
// These tests pin the fix for a sandbox-escape class: on Windows, the Git
// Bash shell interprets paths like `/c/Users/foo/bar.txt` as `C:\Users\foo\bar.txt`
// (the C: drive). However, the Node `path` module treats such paths as
// drive-relative absolute paths on the current drive, so:
//   - path.isAbsolute('/c/Users/foo/bar.txt') === true   (on Windows)
//   - path.resolve('D:\\project', '/c/Users/foo/bar.txt')
//       === 'D:\\c\\Users\\foo\\bar.txt'                  (on Windows)
//
// That means without normalization, validatePath would compare
// `D:\c\Users\foo\bar.txt` against the allowed-directories list, while
// Git Bash actually writes to `C:\Users\foo\bar.txt` — a completely
// different filesystem location. This is a TOCTOU/sandbox-escape bug.
//
// The fix runs `posixPathToWindowsPath` on Windows before resolution,
// converting `/c/...` and `/cygdrive/c/...` to their `C:\...` form so the
// validator's path space matches the shell's.
/**
 * Tests that `validatePath` normalizes MinGW-style absolute paths
 * (`/c/Users/foo`, `/cygdrive/c/Users/foo`) to Windows paths
 * (`C:\\Users\\foo`) on Windows. Without this, the validator runs in
 * Windows host path space while the Git Bash shell runs in MinGW path
 * space, leading to a sandbox-escape class — see the comment block
 * at the top of this file for the full security rationale.
 */
describeIfWindows('validatePath MinGW path normalization', () => {
  test('converts /c/Users/foo/file.txt to C:\\Users\\foo\\file.txt', () => {
    const result = validatePath(
      '/c/Users/foo/file.txt',
      'D:\\project',
      makeContext(),
      'read',
    )
    // resolvedPath is the canonical form the validator (and ultimately the
    // shell) operates on. It must be the Windows-style path, not the
    // drive-relative form `D:\c\Users\foo\file.txt`.
    expect(result.resolvedPath.replace(/\//g, '\\')).toBe(
      'C:\\Users\\foo\\file.txt',
    )
  })

  test('converts /cygdrive/c/Users/foo/file.txt to C:\\Users\\foo\\file.txt', () => {
    const result = validatePath(
      '/cygdrive/c/Users/foo/file.txt',
      'D:\\project',
      makeContext(),
      'read',
    )
    expect(result.resolvedPath.replace(/\//g, '\\')).toBe(
      'C:\\Users\\foo\\file.txt',
    )
  })

  test('uppercases the drive letter', () => {
    const result = validatePath(
      '/d/work/file.txt',
      'C:\\project',
      makeContext(),
      'read',
    )
    expect(result.resolvedPath.replace(/\//g, '\\')).toBe('D:\\work\\file.txt')
  })

  test('preserves Windows paths unchanged', () => {
    // An already-Windows path should not be touched.
    const result = validatePath(
      'C:\\Users\\foo\\file.txt',
      'D:\\project',
      makeContext(),
      'read',
    )
    expect(result.resolvedPath.replace(/\//g, '\\')).toBe(
      'C:\\Users\\foo\\file.txt',
    )
  })

  test('preserves relative paths (just flips slashes)', () => {
    // Relative paths are not MinGW absolute paths; the conversion
    // should be a no-op aside from slash direction. The path is then
    // resolved against cwd by `validatePath`, which is expected behavior.
    const result = validatePath(
      'src/file.txt',
      'D:\\project',
      makeContext(),
      'read',
    )
    expect(result.resolvedPath.replace(/\//g, '\\')).toBe(
      'D:\\project\\src\\file.txt',
    )
  })

  test('handles bare drive mount (no trailing path)', () => {
    const result = validatePath('/c', 'D:\\project', makeContext(), 'read')
    expect(result.resolvedPath.replace(/\//g, '\\')).toBe('C:\\')
  })

  test('handles drive root with trailing slash', () => {
    const result = validatePath('/c/', 'D:\\project', makeContext(), 'read')
    expect(result.resolvedPath.replace(/\//g, '\\')).toBe('C:\\')
  })

  test('handles deeply nested MinGW paths', () => {
    const result = validatePath(
      '/c/Users/me/Documents/project/src/index.ts',
      'D:\\project',
      makeContext(),
      'read',
    )
    expect(result.resolvedPath.replace(/\//g, '\\')).toBe(
      'C:\\Users\\me\\Documents\\project\\src\\index.ts',
    )
  })
})

// ─── Sandbox escape regression (Windows) ─────────────────────────────────
//
// This is the bug the MinGW-normalization fix exists to prevent: without
// it, the validator compares `<currentDrive>:\c\Users\foo\file.txt` against
// the allowed dirs, while bash writes to `C:\Users\foo\file.txt`. With the
// fix, both sides of the comparison use the same `C:\Users\foo\file.txt`
// location.
//
// We pin this by setting up a context where:
//   - cwd is `D:\project` (and D:\project is allowed)
//   - `C:\Users\foo` is NOT in any allowed directory
// Then we check that `/c/Users/foo/sensitive.txt` is denied with a
// resolvedPath pointing at C:\Users\foo — proving the validator now sees
// the same path the shell will write to.
/**
 * Regression tests for the sandbox-escape class the MinGW-normalization
 * fix prevents. Without the fix, a MinGW-style path like
 * `/c/Users/foo/sensitive.txt` is resolved (by `path.resolve`) against
 * the current drive (`D:\c\Users\foo\sensitive.txt`) and compared to
 * the allowed-directories list — while Git Bash actually writes to
 * `C:\Users\foo\sensitive.txt`. With the fix, both sides of the
 * comparison use the same Windows path so a path the shell will write
 * to but isn't in any allowed dir is denied.
 */
describeIfWindows('validatePath sandbox escape regression', () => {
  test('MinGW path that escapes allowed dirs is denied at correct location', () => {
    // Without the fix, this would resolve to `D:\c\Users\foo\sensitive.txt`
    // and (if D:\ is broadly allowed) pass validation, while bash actually
    // writes to `C:\Users\foo\sensitive.txt`. With the fix, the validator
    // sees the correct path and denies it because C:\Users\foo is not in
    // any allowed directory.
    const result = validatePath(
      '/c/Users/foo/sensitive.txt',
      'D:\\project',
      makeContext(),
      'create',
    )
    expect(result.allowed).toBe(false)
    // The resolvedPath should be at C:\Users\foo — not D:\c\Users\foo.
    const normalized = result.resolvedPath.replace(/\//g, '\\')
    expect(normalized.startsWith('C:\\Users\\foo')).toBe(true)
    expect(normalized.startsWith('D:\\c\\')).toBe(false)
  })

  test('cygdrive path that escapes allowed dirs is denied at correct location', () => {
    const result = validatePath(
      '/cygdrive/c/Users/foo/sensitive.txt',
      'D:\\project',
      makeContext(),
      'create',
    )
    expect(result.allowed).toBe(false)
    const normalized = result.resolvedPath.replace(/\//g, '\\')
    expect(normalized.startsWith('C:\\Users\\foo')).toBe(true)
  })
})

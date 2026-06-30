import { expect, test } from 'bun:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { containsPath, sanitizeWorkflowName } from '../engine/paths.js'

test('containsPath: target equals base → true', () => {
  const base = join(tmpdir(), 'a')
  expect(containsPath(base, base)).toBe(true)
})

test('containsPath: target inside base → true', () => {
  const base = join(tmpdir(), 'a')
  const target = join(base, 'b', 'c.ts')
  expect(containsPath(base, target)).toBe(true)
})

test('containsPath: target outside base (prefix false positive) → false', () => {
  // /tmp/foobar should not be considered a subpath of /tmp/foo
  const base = join(tmpdir(), 'foo')
  const target = join(tmpdir(), 'foobar', 'x.ts')
  expect(containsPath(base, target)).toBe(false)
})

test('containsPath: target using .. out of bounds → false', () => {
  const base = join(tmpdir(), 'a', 'b')
  const target = join(base, '..', 'outside.ts')
  expect(containsPath(base, target)).toBe(false)
})

test('containsPath: relative target resolved against base', () => {
  const base = join(tmpdir(), 'a')
  expect(containsPath(base, 'sub/file.ts')).toBe(true)
  expect(containsPath(base, '../b/file.ts')).toBe(false)
})

test('sanitizeWorkflowName: valid identifier → original value', () => {
  expect(sanitizeWorkflowName('release')).toBe('release')
  expect(sanitizeWorkflowName('my-workflow')).toBe('my-workflow')
  expect(sanitizeWorkflowName('my_workflow_2')).toBe('my_workflow_2')
})

test('sanitizeWorkflowName: contains path separators → null', () => {
  expect(sanitizeWorkflowName('foo/bar')).toBeNull()
  expect(sanitizeWorkflowName('foo\\bar')).toBeNull()
  expect(sanitizeWorkflowName('/abs/path')).toBeNull()
})

test('sanitizeWorkflowName: . / .. / empty → null', () => {
  expect(sanitizeWorkflowName('.')).toBeNull()
  expect(sanitizeWorkflowName('..')).toBeNull()
  expect(sanitizeWorkflowName('')).toBeNull()
})

test('sanitizeWorkflowName: contains null byte → null', () => {
  expect(sanitizeWorkflowName('evil\0.ts')).toBeNull()
})

import { expect, test } from 'bun:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { containsPath, sanitizeWorkflowName } from '../engine/paths.js'

test('containsPath: target 等于 base → true', () => {
  const base = join(tmpdir(), 'a')
  expect(containsPath(base, base)).toBe(true)
})

test('containsPath: target 在 base 内 → true', () => {
  const base = join(tmpdir(), 'a')
  const target = join(base, 'b', 'c.ts')
  expect(containsPath(base, target)).toBe(true)
})

test('containsPath: target 在 base 之外（前缀假阳）→ false', () => {
  // /tmp/foobar 不应被认为是 /tmp/foo 的子路径
  const base = join(tmpdir(), 'foo')
  const target = join(tmpdir(), 'foobar', 'x.ts')
  expect(containsPath(base, target)).toBe(false)
})

test('containsPath: target 用 .. 越界 → false', () => {
  const base = join(tmpdir(), 'a', 'b')
  const target = join(base, '..', 'outside.ts')
  expect(containsPath(base, target)).toBe(false)
})

test('containsPath: 相对 target 相对 base 解析', () => {
  const base = join(tmpdir(), 'a')
  expect(containsPath(base, 'sub/file.ts')).toBe(true)
  expect(containsPath(base, '../b/file.ts')).toBe(false)
})

test('sanitizeWorkflowName: 合法标识符 → 原值', () => {
  expect(sanitizeWorkflowName('release')).toBe('release')
  expect(sanitizeWorkflowName('my-workflow')).toBe('my-workflow')
  expect(sanitizeWorkflowName('my_workflow_2')).toBe('my_workflow_2')
})

test('sanitizeWorkflowName: 含路径分隔符 → null', () => {
  expect(sanitizeWorkflowName('foo/bar')).toBeNull()
  expect(sanitizeWorkflowName('foo\\bar')).toBeNull()
  expect(sanitizeWorkflowName('/abs/path')).toBeNull()
})

test('sanitizeWorkflowName: . / .. / 空 → null', () => {
  expect(sanitizeWorkflowName('.')).toBeNull()
  expect(sanitizeWorkflowName('..')).toBeNull()
  expect(sanitizeWorkflowName('')).toBeNull()
})

test('sanitizeWorkflowName: 含 null 字节 → null', () => {
  expect(sanitizeWorkflowName('evil\0.ts')).toBeNull()
})

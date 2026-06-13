import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { persistInlineScript } from '../tool/persistInline.js'

test('持久化到 <cwd>/.claude/workflow-runs/<runId>/script.js 并返回路径', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-pi-'))
  try {
    const path = await persistInlineScript('return 1', 'r1', dir)
    expect(path).toBe(join(dir, '.claude', 'workflow-runs', 'r1', 'script.js'))
    expect(await readFile(path, 'utf-8')).toBe('return 1')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('同 runId 重复写覆盖（mkdir 幂等，不抛错）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-pi-'))
  try {
    await persistInlineScript('first', 'r2', dir)
    const path = await persistInlineScript('second', 'r2', dir)
    expect(await readFile(path, 'utf-8')).toBe('second')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('不同 runId 互不干扰（各自独立子目录）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-pi-'))
  try {
    const p1 = await persistInlineScript('a', 'run-a', dir)
    const p2 = await persistInlineScript('b', 'run-b', dir)
    expect(p1).not.toBe(p2)
    expect(await readFile(p1, 'utf-8')).toBe('a')
    expect(await readFile(p2, 'utf-8')).toBe('b')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

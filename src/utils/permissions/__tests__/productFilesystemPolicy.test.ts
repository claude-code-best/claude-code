import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { setProductRuntimeForTest } from '../../productMode.js'
import { checkProductWriteBoundary } from '../productFilesystemPolicy.js'

const roots: string[] = []

afterEach(() => {
  setProductRuntimeForTest(null)
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Chat product filesystem boundary', () => {
  test('allows scratch writes and denies workspace and symlink escapes', () => {
    const base = mkdtempSync(join(tmpdir(), 'chat-write-boundary-'))
    roots.push(base)
    const scratch = join(base, 'scratch')
    const workspace = join(base, 'workspace')
    mkdirSync(scratch)
    mkdirSync(workspace)
    symlinkSync(workspace, join(scratch, 'escape'), 'dir')
    setProductRuntimeForTest({
      product: 'chat',
      sessionDataDirectory: scratch,
      browserScopeId: 'session-1',
      sandboxRequired: true,
    })

    expect(checkProductWriteBoundary(join(scratch, 'result.txt')).allowed).toBe(
      true,
    )
    expect(
      checkProductWriteBoundary(join(workspace, 'source.ts')).allowed,
    ).toBe(false)
    expect(
      checkProductWriteBoundary(join(scratch, 'escape', 'source.ts')).allowed,
    ).toBe(false)
  })

  test('does not restrict Code or ordinary local sessions', () => {
    setProductRuntimeForTest({
      product: 'code',
      sessionDataDirectory: '/workspace/.real-agentc/session-1',
      browserScopeId: null,
      sandboxRequired: false,
    })
    expect(checkProductWriteBoundary('/any/path').allowed).toBe(true)
    setProductRuntimeForTest(null)
    expect(checkProductWriteBoundary('/any/path').allowed).toBe(true)
  })
})

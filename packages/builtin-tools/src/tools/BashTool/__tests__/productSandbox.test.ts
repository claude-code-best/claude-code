import { afterEach, describe, expect, test } from 'bun:test'

import { setProductRuntimeForTest } from 'src/utils/productMode.js'
import {
  constrainSandboxConfigForProduct,
  SandboxManager,
} from 'src/utils/sandbox/sandbox-adapter.js'
import { shouldUseSandbox } from '../shouldUseSandbox.js'

afterEach(() => setProductRuntimeForTest(null))

describe('Chat product command sandbox', () => {
  test('cannot be bypassed with dangerouslyDisableSandbox', () => {
    setProductRuntimeForTest({
      product: 'chat',
      sessionDataDirectory: '/scratch/session-1',
      browserScopeId: 'session-1',
      sandboxRequired: true,
    })

    expect(
      shouldUseSandbox({
        command: 'touch /workspace/source.ts',
        dangerouslyDisableSandbox: true,
      }),
    ).toBe(true)
    expect(SandboxManager.areUnsandboxedCommandsAllowed()).toBe(false)
    expect(
      constrainSandboxConfigForProduct({
        filesystem: {
          allowWrite: ['/'],
          denyWrite: [],
          allowRead: [],
          denyRead: [],
        },
      }).filesystem?.allowWrite,
    ).toEqual(['/scratch/session-1'])
  })
})

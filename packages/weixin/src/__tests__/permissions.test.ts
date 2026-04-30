import { afterEach, describe, expect, test } from 'bun:test'
import {
  clearPermissionStateForTests,
  consumePendingPermission,
  getActivePermissionChat,
  savePendingPermission,
  setActivePermissionChat,
} from '../permissions.js'

afterEach(() => {
  clearPermissionStateForTests()
})

describe('permission state', () => {
  test('tracks active permission chat', () => {
    setActivePermissionChat('user-1', 'ctx-1')
    expect(getActivePermissionChat()).toEqual({
      chatId: 'user-1',
      contextToken: 'ctx-1',
      updatedAt: expect.any(Number),
    })
  })

  test('consumes pending permission only for matching user', () => {
    savePendingPermission(
      {
        request_id: 'abcde',
        tool_name: 'Bash',
        description: 'Run a command',
        input_preview: '{"command":"pwd"}',
      },
      'user-1',
      'ctx-1',
    )

    expect(consumePendingPermission('abcde', 'user-2')).toBeNull()
    expect(consumePendingPermission('ABCDE', 'user-1')).toMatchObject({
      request_id: 'abcde',
      chatId: 'user-1',
    })
    expect(consumePendingPermission('abcde', 'user-1')).toBeNull()
  })
})

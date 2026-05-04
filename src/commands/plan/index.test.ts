import { describe, expect, test } from 'bun:test'

import plan from './index.js'

describe('规划桥接调用安全性', () => {
  test('允许通过远程控制进行无头规划模式操作', () => {
    expect(plan.getBridgeInvocationError?.('')).toBeUndefined()
    expect(
      plan.getBridgeInvocationError?.('write a migration plan'),
    ).toBeUndefined()
  })

  test('阻止通过远程控制执行 /plan open 命令', () => {
    expect(plan.getBridgeInvocationError?.('open')).toBe(
      '通过远程控制无法使用 /plan open 命令打开本地编辑器。',
    )
  })
})

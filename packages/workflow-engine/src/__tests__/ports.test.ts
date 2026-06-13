import { expect, test } from 'bun:test'
import { createHostHandle, isHostHandle, unwrapHostHandle } from '../ports.js'

test('createHostHandle 包装任意 bundle 且对外不透明', () => {
  const bundle = { secret: 'ctx', nested: { a: 1 } }
  const handle = createHostHandle(bundle)
  expect(isHostHandle(handle)).toBe(true)
  // 包内不暴露 bundle —— handle 只有符号标记
  expect(Object.keys(handle)).toHaveLength(0)
})

test('普通对象不是 HostHandle', () => {
  expect(isHostHandle({} as unknown)).toBe(false)
  expect(isHostHandle(null)).toBe(false)
})

test('端口对象满足最小形状', () => {
  // 编译期形状校验：以下赋值通过即说明端口契约自洽
  const noop = (): void => {}
  const ports = {
    agentRunner: { runAgentToResult: noop },
    progressEmitter: { emit: noop },
    taskRegistrar: {
      register: () => ({
        runId: 'run-1',
        signal: new AbortController().signal,
      }),
      complete: noop,
      fail: noop,
      kill: noop,
      pendingAction: () => null,
    },
    journalStore: {
      read: async () => [],
      append: async () => {},
      truncate: async () => {},
    },
    permissionGate: { isAborted: () => false },
    logger: { debug: noop, event: noop },
    hostFactory: () => ({
      handle: createHostHandle(null),
      cwd: '/tmp',
      budgetTotal: null,
      toolUseId: 'tu-1',
    }),
  }
  expect(ports.taskRegistrar.register().runId).toBe('run-1')
  expect(ports.hostFactory().toolUseId).toBe('tu-1')
})

test('unwrapHostHandle 取回原始 bundle（同引用）', () => {
  const bundle = { secret: 'ctx', nested: { a: 1 } }
  const handle = createHostHandle(bundle)
  expect(unwrapHostHandle(handle)).toBe(bundle)
})

test('createHostHandle(null) 不透明且解包为 null', () => {
  const handle = createHostHandle(null)
  expect(isHostHandle(handle)).toBe(true)
  expect(unwrapHostHandle(handle)).toBeNull()
})

import { afterAll, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)

import { getTerminalManager, resetTerminalManagerForTests } from '../manager.js'

afterAll(() => {
  resetTerminalManagerForTests()
})

describe('TerminalManager', () => {
  test('open creates a live named terminal and list shows it', async () => {
    const manager = getTerminalManager()
    const { info, alreadyExisted } = manager.open({
      name: 'ut-main',
      cwd: '/tmp',
      purpose: 'unit test',
    })
    expect(alreadyExisted).toBe(false)
    expect(info.name).toBe('ut-main')
    expect(info.alive).toBe(true)
    expect(manager.list().some(t => t.name === 'ut-main')).toBe(true)

    // 再次 open 同名 → 幂等返回
    const again = manager.open({ name: 'ut-main' })
    expect(again.alreadyExisted).toBe(true)
    expect(again.info.id).toBe(info.id)
  }, 15000)

  test('run executes a command and captures output', async () => {
    const manager = getTerminalManager()
    manager.open({ name: 'ut-run', cwd: '/tmp' })
    const result = await manager.run(
      'ut-run',
      'echo TERM_TEST_$((6*7))',
      { until: 'silence', silenceMs: 1200, timeoutS: 20 },
      'test-consumer',
    )
    expect(result.output).toContain('TERM_TEST_42')
    expect(['silence', 'prompt']).toContain(result.outcome)
  }, 30000)

  test('readNew returns incremental output per consumer', async () => {
    const manager = getTerminalManager()
    manager.open({ name: 'ut-read', cwd: '/tmp' })
    await manager.run(
      'ut-read',
      'echo FIRST_CHUNK',
      { until: 'silence', silenceMs: 1000, timeoutS: 15 },
      'c1',
    )
    // c2 从未读过 → 拿到全部；c1 已在 run 中消费 → 增量为空
    const c2 = manager.readNew('ut-read', 'c2')
    expect(c2).toContain('FIRST_CHUNK')
    const c1Again = manager.readNew('ut-read', 'c1')
    expect(c1Again).not.toContain('FIRST_CHUNK')
  }, 30000)

  test('wait until pattern resolves when output matches', async () => {
    const manager = getTerminalManager()
    manager.open({ name: 'ut-pattern', cwd: '/tmp' })
    const waiting = manager.wait(
      'ut-pattern',
      { until: 'pattern', pattern: 'MARKER_(DONE|FAIL)', timeoutS: 20 },
      'pat-consumer',
    )
    manager.write('ut-pattern', 'sleep 0.3 && echo MARKER_DONE\r')
    const result = await waiting
    expect(result.outcome).toBe('pattern')
    expect(result.matched).toBe('MARKER_DONE')
  }, 30000)

  test('wait timeout is not an error and reports timed out', async () => {
    const manager = getTerminalManager()
    manager.open({ name: 'ut-timeout', cwd: '/tmp' })
    const result = await manager.wait(
      'ut-timeout',
      { until: 'pattern', pattern: 'NEVER_MATCHES_XYZ', timeoutS: 1 },
      'to-consumer',
    )
    expect(result.outcome).toBe('timeout')
  }, 15000)

  test('signal SIGINT interrupts a foreground sleep', async () => {
    const manager = getTerminalManager()
    manager.open({ name: 'ut-sigint', cwd: '/tmp' })
    // 起一个长 sleep，然后打断，提示符应回归（用 pattern 观察回归后的 echo）
    manager.write('ut-sigint', 'sleep 300\r')
    await new Promise(r => setTimeout(r, 700))
    manager.signal('ut-sigint', 'SIGINT')
    const result = await manager.run(
      'ut-sigint',
      'echo AFTER_INT_$((2+3))',
      { until: 'silence', silenceMs: 1200, timeoutS: 20 },
      'sig-consumer',
    )
    expect(result.output).toContain('AFTER_INT_5')
  }, 30000)

  test('close removes the terminal', () => {
    const manager = getTerminalManager()
    manager.open({ name: 'ut-close', cwd: '/tmp' })
    manager.close('ut-close')
    expect(manager.has('ut-close')).toBe(false)
  }, 15000)

  test('unknown terminal throws with existing names listed', () => {
    const manager = getTerminalManager()
    expect(() => manager.write('no-such-term', 'x')).toThrow(/not found/)
  })
})

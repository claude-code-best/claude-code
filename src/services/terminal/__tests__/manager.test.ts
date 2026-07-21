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

  test('OSC sequence left in carry window is not counted twice', () => {
    const manager = getTerminalManager()
    manager.open({ name: 'ut-osc-carry', cwd: '/tmp' })
    // 触达私有成员做确定性回归验证（测试文件允许 as any）
    const anyManager = manager as any
    const term = anyManager.find('ut-osc-carry')
    const before = term.promptSeq
    // 块尾完整 OSC 序列（落在 64 字节残留窗口内）只允许计数一次
    anyManager.handleData(term, 'x\x1b]133;D;0\x07\x1b]133;A\x07')
    anyManager.handleData(term, 'plain text without OSC')
    expect(term.promptSeq).toBe(before + 1)
    // 半截序列跨块到达仍应被拼接识别
    anyManager.handleData(term, 'tail\x1b]133;')
    anyManager.handleData(term, 'A\x07')
    expect(term.promptSeq).toBe(before + 2)
    manager.close('ut-osc-carry')
  }, 15000)

  test('run until prompt resolves fast commands without waiting for timeout', async () => {
    const manager = getTerminalManager()
    manager.open({ name: 'ut-fast-prompt', cwd: '/tmp' })
    // 预热：确保 shell 启动完成、OSC 集成（若有）已被识别
    await manager.run(
      'ut-fast-prompt',
      'echo WARMUP_DONE',
      { until: 'silence', silenceMs: 800, timeoutS: 15 },
      'fp-consumer',
    )
    const started = Date.now()
    const result = await manager.run(
      'ut-fast-prompt',
      'echo FAST_$((6*7))',
      { until: 'prompt', timeoutS: 15 },
      'fp-consumer',
    )
    // 修复前：promptSeq 基线在 flush 之后采样，快命令的完成提示符被计入
    // 基线 → 只能等满 15s 超时。修复后应在几秒内以非 timeout 结束。
    expect(result.outcome).not.toBe('timeout')
    expect(result.output).toContain('FAST_42')
    expect(Date.now() - started).toBeLessThan(10_000)
  }, 40000)

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

import { afterAll, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../../../tests/mocks/debug'
import { logMock } from '../../../../../../tests/mocks/log'

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)

import { resetTerminalManagerForTests } from 'src/services/terminal/manager.js'
import { TerminalReadTool } from '../TerminalReadTool.js'
import { TerminalTool } from '../TerminalTool.js'
import { TERMINAL_PROMPT } from '../prompt.js'
import { truncateOutput } from '../shared.js'

afterAll(() => {
  resetTerminalManagerForTests()
})

describe('truncateOutput', () => {
  test('passes short output through unchanged', () => {
    expect(truncateOutput('hello')).toBe('hello')
  })

  test('keeps head and tail with omission marker for long output', () => {
    const long = `HEAD_MARK\n${'x'.repeat(20_000)}\nTAIL_MARK`
    const out = truncateOutput(long)
    expect(out.length).toBeLessThan(10_000)
    expect(out).toContain('HEAD_MARK')
    expect(out).toContain('TAIL_MARK')
    expect(out).toContain('omitted')
  })
})

describe('Terminal tool guidance', () => {
  test('limits Terminal priority to persistent interactive work', () => {
    expect(TERMINAL_PROMPT).toContain('Prefer Bash')
    expect(TERMINAL_PROMPT).toContain('short, non-interactive, one-shot')
    expect(TERMINAL_PROMPT).toContain('persistent')
    expect(TERMINAL_PROMPT).toContain('user explicitly asks')
  })
})

describe('Terminal tools end-to-end (real PTY)', () => {
  test('open → run → TerminalRead list/read flow', async () => {
    const opened = await TerminalTool.call({
      action: 'open',
      term: 'tt-e2e',
      cwd: '/tmp',
      purpose: 'tool test',
    } as never)
    expect((opened.data as { result: string }).result).toContain('tt-e2e')

    const ran = await TerminalTool.call({
      action: 'run',
      term: 'tt-e2e',
      command: 'echo TOOL_RUN_$((10+32))',
      wait: { until: 'silence', silence_ms: 1200, timeout_s: 25 },
    } as never)
    expect((ran.data as { result: string }).result).toContain('TOOL_RUN_42')

    const listed = await TerminalReadTool.call({ action: 'list' } as never)
    const listResult = (listed.data as { result: string }).result
    expect(listResult).toContain('tt-e2e')
    expect(listResult).toContain('tool test')

    const tail = await TerminalReadTool.call({
      action: 'read',
      term: 'tt-e2e',
      mode: 'tail',
      lines: 10,
    } as never)
    expect((tail.data as { result: string }).result).toContain('TOOL_RUN_42')

    const closed = await TerminalTool.call({
      action: 'close',
      term: 'tt-e2e',
    } as never)
    expect((closed.data as { result: string }).result).toContain('closed')
  }, 60000)
})

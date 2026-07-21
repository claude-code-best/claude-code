import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)

import {
  handleTerminalInboundMessage,
  resetTerminalInboundDedupeForTests,
} from '../inbound.js'
import { getTerminalManager, resetTerminalManagerForTests } from '../manager.js'

describe('terminal live command deduplication', () => {
  beforeEach(() => {
    resetTerminalInboundDedupeForTests()
    resetTerminalManagerForTests()
  })

  test('writes a repeated terminal_input command_id to the PTY only once', () => {
    const manager = getTerminalManager()
    spyOn(manager, 'has').mockReturnValue(true)
    const write = spyOn(manager, 'write').mockImplementation(() => {})
    const command = {
      type: 'terminal_input',
      command_id: 'command-once',
      generation: 'generation-1',
      term_id: 'main',
      data: 'h5y&sj34F',
    }

    handleTerminalInboundMessage(command)
    handleTerminalInboundMessage(command)
    handleTerminalInboundMessage(command)
    handleTerminalInboundMessage(command)

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('main', 'h5y&sj34F')
  })

  test('rejects terminal side effects without a command_id', () => {
    const manager = getTerminalManager()
    spyOn(manager, 'has').mockReturnValue(true)
    const write = spyOn(manager, 'write').mockImplementation(() => {})

    handleTerminalInboundMessage({
      type: 'terminal_input',
      term_id: 'main',
      data: 'legacy replay',
    })

    expect(write).not.toHaveBeenCalled()
  })
})

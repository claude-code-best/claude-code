import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { BashTool } from '@claude-code-best/builtin-tools/tools/BashTool/BashTool.js'
import type { Tool } from '../../Tool.js'
import type { RenderableMessage } from '../../types/message.js'
import { collapseReadSearchGroups } from '../collapseReadSearch.js'
import { _resetFullscreenResolveForTesting } from '../fullscreen.js'

// Official 2.1.330 alignment (changelog: "Fixed finished tool groups in
// fullscreen counting a search or listing also as a shell command, and the
// tool timer there counting time at a permission prompt or queued behind
// another command"). These tests pin the FIRST half: a bash search or
// listing must land in searchCount/listCount, never in bashCount.
//
// The bash-count branch only exists in fullscreen (isBash is gated on
// isFullscreenEnvEnabled()), so pin CLAUDE_CODE_NO_FLICKER=1 and reset the
// memoized resolution around the run. env-forced-on returns before the
// renderer-health file checks, so no disk side effects.

beforeAll(() => {
  process.env.CLAUDE_CODE_NO_FLICKER = '1'
  _resetFullscreenResolveForTesting()
})

afterAll(() => {
  delete process.env.CLAUDE_CODE_NO_FLICKER
  _resetFullscreenResolveForTesting()
})

const tools: Tool[] = [BashTool]

let counter = 0
function bashToolUse(command: string): RenderableMessage {
  const id = `toolu_${String(++counter).padStart(3, '0')}`
  return {
    type: 'assistant',
    uuid: `msg-${id}`,
    timestamp: new Date().toISOString(),
    message: {
      id: `asst-${id}`,
      content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }],
    },
  } as unknown as RenderableMessage
}

function singleGroup(messages: RenderableMessage[]) {
  const result = collapseReadSearchGroups(messages, tools)
  expect(result).toHaveLength(1)
  const group = result[0]
  expect(group?.type).toBe('collapsed_read_search')
  return group as {
    searchCount: number
    readCount: number
    listCount: number
    bashCount?: number
  }
}

describe('collapseReadSearchGroups (fullscreen, official 2.1.330 L798)', () => {
  test('a bash search is counted as a search, not also as a shell command', () => {
    const group = singleGroup([bashToolUse('rg "TODO" src/')])
    expect(group.searchCount).toBe(1)
    expect(group.listCount).toBe(0)
    expect(group.bashCount).toBeUndefined()
  })

  test('a bash listing is counted as a listing, not also as a shell command', () => {
    const group = singleGroup([bashToolUse('ls -la src/components')])
    expect(group.listCount).toBe(1)
    expect(group.searchCount).toBe(0)
    expect(group.bashCount).toBeUndefined()
  })

  test('a non-search bash command is counted as a shell command', () => {
    const group = singleGroup([bashToolUse('git status')])
    expect(group.bashCount).toBe(1)
    expect(group.searchCount).toBe(0)
    expect(group.listCount).toBe(0)
  })

  test('mixed group: search + listing + shell each land in their own counter', () => {
    const group = singleGroup([
      bashToolUse('rg "TODO" src/'),
      bashToolUse('ls -la src'),
      bashToolUse('git status'),
    ])
    expect(group.searchCount).toBe(1)
    expect(group.listCount).toBe(1)
    expect(group.bashCount).toBe(1)
  })
})

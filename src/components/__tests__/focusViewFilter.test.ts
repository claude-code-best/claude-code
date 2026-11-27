import { describe, expect, mock, test } from 'bun:test'
import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

// Mock log.ts / debug.ts to cut the bootstrap/state dependency chain that
// Messages.tsx pulls in transitively (config.ts → ... → bootstrap/state).
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

const { filterForFocusView } = await import('../Messages.js')

// ── Message factory ─────────────────────────────────────────────────────────

type Block = {
  type: string
  name?: string
  id?: string
  tool_use_id?: string
  text?: string
}

function userMsg(content: Block[], isMeta = false) {
  return { type: 'user', isMeta, message: { content } }
}

function prompt(text = 'do the thing') {
  return userMsg([{ type: 'text', text }])
}

function toolResult() {
  return userMsg([{ type: 'tool_result', tool_use_id: 't1' }])
}

function assistantText(text: string) {
  return { type: 'assistant', message: { content: [{ type: 'text', text }] } }
}

function assistantToolUse(name = 'Read') {
  return {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name, id: 't1' }] },
  }
}

function assistantError(text: string) {
  return {
    type: 'assistant',
    isApiErrorMessage: true,
    message: { content: [{ type: 'text', text }] },
  }
}

function systemMsg(subtype?: string) {
  return { type: 'system', subtype, message: { content: [] } }
}

function queuedCommand() {
  return {
    type: 'attachment',
    attachment: { type: 'queued_command', commandMode: 'prompt' },
  }
}

function metaTick() {
  return userMsg([{ type: 'text', text: '<tick>' }], true)
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('filterForFocusView (official fWs/V8n, L936681/L936691)', () => {
  test('collapses each turn to prompt + final assistant text', () => {
    const messages = [
      prompt('first question'),
      assistantText('let me check'),
      assistantToolUse(),
      toolResult(),
      assistantText('working on it'),
      assistantToolUse('Bash'),
      toolResult(),
      assistantText('final answer one'),
      prompt('second question'),
      assistantText('final answer two'),
    ]

    const result = filterForFocusView(messages)
    expect(result).toEqual([
      prompt('first question'),
      assistantText('final answer one'),
      prompt('second question'),
      assistantText('final answer two'),
    ])
  })

  test('turn with no assistant text keeps last assistant message (tool-use only)', () => {
    const messages = [
      prompt('run the tests'),
      assistantToolUse('Bash'),
      toolResult(),
      assistantToolUse('Bash'),
      toolResult(),
    ]

    const result = filterForFocusView(messages)
    expect(result).toEqual([
      prompt('run the tests'),
      // Last assistant message (the second tool_use), not the first
      assistantToolUse('Bash'),
    ])
  })

  test('turn with no assistant messages keeps just the prompt', () => {
    const messages = [prompt('hello'), prompt('anyone there?')]
    const result = filterForFocusView(messages)
    expect(result).toEqual(messages)
  })

  test('keeps system messages but drops api_metrics noise', () => {
    const messages = [
      prompt('hi'),
      systemMsg('attach_confirm'),
      systemMsg('api_metrics'),
      assistantText('done'),
    ]
    const result = filterForFocusView(messages)
    expect(result).toEqual([
      prompt('hi'),
      systemMsg('attach_confirm'),
      assistantText('done'),
    ])
  })

  test('keeps API error assistant messages mid-turn', () => {
    const messages = [
      prompt('hi'),
      assistantError('rate limited'),
      assistantText('recovered, here is the answer'),
    ]
    const result = filterForFocusView(messages)
    expect(result).toEqual([
      prompt('hi'),
      assistantError('rate limited'),
      assistantText('recovered, here is the answer'),
    ])
  })

  test('keeps human-typed queued commands, drops other attachments', () => {
    const messages = [
      prompt('hi'),
      queuedCommand(),
      {
        type: 'attachment',
        attachment: { type: 'file_change_context' },
      },
      {
        type: 'attachment',
        // task-notification: queued_command shape but not human-typed
        attachment: {
          type: 'queued_command',
          commandMode: 'task-notification',
        },
      },
      assistantText('done'),
    ]
    const result = filterForFocusView(messages)
    expect(result).toEqual([
      prompt('hi'),
      queuedCommand(),
      assistantText('done'),
    ])
  })

  test('drops meta user messages (ticks) and tool results', () => {
    const messages = [
      prompt('hi'),
      metaTick(),
      assistantToolUse(),
      toolResult(),
      assistantText('done'),
    ]
    const result = filterForFocusView(messages)
    expect(result).toEqual([prompt('hi'), assistantText('done')])
  })

  test('keepLastTurn leaves the streaming turn unfiltered (live preview)', () => {
    const messages = [
      prompt('first'),
      assistantText('intermediate'),
      assistantToolUse(),
      toolResult(),
      assistantText('final one'),
      // Current turn: still streaming
      prompt('second'),
      assistantText('streaming update'),
      assistantToolUse(),
      toolResult(),
    ]

    const filtered = filterForFocusView(messages, { keepLastTurn: true })
    expect(filtered).toEqual([
      prompt('first'),
      assistantText('final one'),
      prompt('second'),
      assistantText('streaming update'),
      assistantToolUse(),
      toolResult(),
    ])

    // Without keepLastTurn the current turn collapses too
    const collapsed = filterForFocusView(messages, { keepLastTurn: false })
    expect(collapsed).toEqual([
      prompt('first'),
      assistantText('final one'),
      prompt('second'),
      assistantText('streaming update'),
    ])
  })

  test('messages before the first prompt form their own turn', () => {
    const messages = [
      systemMsg('session_start'),
      assistantText('preamble'),
      prompt('hi'),
      assistantText('done'),
    ]
    const result = filterForFocusView(messages)
    expect(result).toEqual([
      systemMsg('session_start'),
      // Turn 0 has no prompt; its last assistant text survives
      assistantText('preamble'),
      prompt('hi'),
      assistantText('done'),
    ])
  })

  test('empty input passes through', () => {
    expect(filterForFocusView([])).toEqual([])
  })
})

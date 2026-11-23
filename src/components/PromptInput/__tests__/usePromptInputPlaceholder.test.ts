import { describe, expect, test } from 'bun:test'
import { computePromptInputPlaceholder } from '../usePromptInputPlaceholder.js'
import type { QueuedCommand } from '../../../../src/types/textInputTypes.js'

// Placeholder priority chain (official 2.1.330, m60-verified). While viewing
// an agent — in-process teammate OR background local agent — the placeholder
// is `Message @${truncate(agentName, 20)}…` (agentName e.g. "general-purpose")
// at the HIGHEST priority, above the queue hint and the example command:
// the input box routes to that agent, so every other hint is irrelevant.

const NO_COMMANDS: readonly QueuedCommand[] = []

function compute(
  overrides: Partial<Parameters<typeof computePromptInputPlaceholder>[0]> = {},
) {
  return computePromptInputPlaceholder({
    input: '',
    viewingAgentName: undefined,
    queuedCommands: NO_COMMANDS,
    submitCount: 0,
    promptSuggestionEnabled: true,
    queuedCommandUpHintCount: 0,
    isProactiveActive: () => false,
    getExampleCommand: () => 'Try "fix the failing test"',
    ...overrides,
  })
}

describe('computePromptInputPlaceholder priority chain', () => {
  describe('1. viewing an agent (highest priority)', () => {
    test('background local agent: Message @<agentType>…', () => {
      expect(compute({ viewingAgentName: 'general-purpose' })).toBe(
        'Message @general-purpose…',
      )
    })

    test('teammate agentName takes the same form', () => {
      expect(compute({ viewingAgentName: 'alice' })).toBe('Message @alice…')
    })

    test('beats the queue hint when queued commands exist', () => {
      const queued = [{ value: 'hello', mode: 'prompt' } as QueuedCommand]
      expect(
        compute({
          viewingAgentName: 'general-purpose',
          queuedCommands: queued,
        }),
      ).toBe('Message @general-purpose…')
    })

    test('beats the example command before first submit', () => {
      expect(
        compute({ viewingAgentName: 'general-purpose', submitCount: 0 }),
      ).toBe('Message @general-purpose…')
    })

    test('truncates names longer than 20 chars', () => {
      const long = 'a'.repeat(25)
      const expected = `Message @${'a'.repeat(17)}...…`
      expect(compute({ viewingAgentName: long })).toBe(expected)
      expect(compute({ viewingAgentName: long })?.length).toBe(
        'Message @…'.length + 20,
      )
    })

    test('names of exactly 20 chars are not truncated', () => {
      const exact = 'b'.repeat(20)
      expect(compute({ viewingAgentName: exact })).toBe(`Message @${exact}…`)
    })
  })

  describe('2. queue hint', () => {
    test('shows while editable queued commands exist and hint seen < 3 times', () => {
      const queued = [{ value: 'hello', mode: 'prompt' } as QueuedCommand]
      expect(compute({ queuedCommands: queued })).toBe(
        'Press up to edit queued messages',
      )
    })

    test('hidden after the hint was seen 3 times', () => {
      const queued = [{ value: 'hello', mode: 'prompt' } as QueuedCommand]
      expect(
        compute({ queuedCommands: queued, queuedCommandUpHintCount: 3 }),
      ).toBe('Try "fix the failing test"')
    })
  })

  describe('3. example command', () => {
    test('shows before first submit when suggestions enabled', () => {
      expect(compute({ submitCount: 0 })).toBe('Try "fix the failing test"')
    })

    test('hidden after first submit', () => {
      expect(compute({ submitCount: 1 })).toBeUndefined()
    })

    test('hidden when prompt suggestions are disabled', () => {
      expect(compute({ promptSuggestionEnabled: false })).toBeUndefined()
    })

    test('hidden in proactive mode', () => {
      expect(compute({ isProactiveActive: () => true })).toBeUndefined()
    })
  })

  describe('input guard', () => {
    test('no placeholder once the user typed anything', () => {
      expect(
        compute({ input: 'x', viewingAgentName: 'general-purpose' }),
      ).toBeUndefined()
    })
  })
})

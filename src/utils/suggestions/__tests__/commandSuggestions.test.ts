import { describe, expect, test } from 'bun:test'
import { type Command, getCommandName } from '../../../commands.js'
import type { SuggestionItem } from '../../../components/PromptInput/PromptInputFooterSuggestions.js'
import {
  applyCommandSuggestion,
  findMidInputSlashCommand,
  formatCommand,
  generateCommandSuggestions,
  getBestCommandMatch,
  hasCommandArgs,
  isCommandInput,
} from '../commandSuggestions.js'

// ─── Helpers ──────────────────────────────────────────────────────────

function makeCommand(name: string, opts?: Partial<Command>): Command {
  return {
    name,
    description: opts?.description ?? `${name} command`,
    type: 'local',
    handler: () => {},
    ...opts,
  } as unknown as Command
}

function makePromptCommand(name: string, opts?: Partial<Command>): Command {
  return {
    name,
    description: opts?.description ?? `${name} skill`,
    type: 'prompt',
    handler: () => {},
    source: 'userSettings',
    ...opts,
  } as unknown as Command
}

// ─── isCommandInput ───────────────────────────────────────────────────

describe('isCommandInput', () => {
  test('returns true for slash-prefixed input', () => {
    expect(isCommandInput('/commit')).toBe(true)
  })

  test('returns false for non-slash input', () => {
    expect(isCommandInput('commit')).toBe(false)
  })

  test('returns true for just a slash', () => {
    expect(isCommandInput('/')).toBe(true)
  })
})

// ─── hasCommandArgs ───────────────────────────────────────────────────

describe('hasCommandArgs', () => {
  test('returns false when no space in input', () => {
    expect(hasCommandArgs('/commit')).toBe(false)
  })

  test('returns false when only trailing space', () => {
    expect(hasCommandArgs('/commit ')).toBe(false)
  })

  test('returns true when there are real arguments', () => {
    expect(hasCommandArgs('/commit msg')).toBe(true)
  })

  test('returns false for non-command input', () => {
    expect(hasCommandArgs('commit msg')).toBe(false)
  })
})

// ─── formatCommand ────────────────────────────────────────────────────

describe('formatCommand', () => {
  test('formats command with leading slash and trailing space', () => {
    expect(formatCommand('commit')).toBe('/commit ')
  })
})

// ─── findMidInputSlashCommand ─────────────────────────────────────────

describe('findMidInputSlashCommand', () => {
  test('returns null when input starts with slash', () => {
    expect(findMidInputSlashCommand('/commit some args', 7)).toBeNull()
  })

  test('finds slash command after whitespace', () => {
    const result = findMidInputSlashCommand('help me /com', 12)
    expect(result).not.toBeNull()
    expect(result!.token).toBe('/com')
    expect(result!.startPos).toBe(8)
    expect(result!.partialCommand).toBe('com')
  })

  test('returns null when no whitespace before slash', () => {
    expect(findMidInputSlashCommand('help/com', 8)).toBeNull()
  })

  test('returns null when cursor is past the command with trailing text', () => {
    expect(findMidInputSlashCommand('help /commit msg', 15)).toBeNull()
  })
})

// ─── generateCommandSuggestions ────────────────────────────────────────

describe('generateCommandSuggestions', () => {
  const commands: Command[] = [
    makeCommand('commit'),
    makeCommand('compact'),
    makePromptCommand('sdd-global-read'),
    makePromptCommand('sdd-archive'),
  ]

  test('returns empty for non-slash input', () => {
    expect(generateCommandSuggestions('commit', commands)).toHaveLength(0)
  })

  test('returns all commands for bare slash', () => {
    const results = generateCommandSuggestions('/', commands)
    expect(results.length).toBeGreaterThan(0)
  })

  test('filters by partial command name', () => {
    const results = generateCommandSuggestions('/com', commands)
    const names = results.map(r => r.displayText)
    expect(names.some(n => n.includes('commit'))).toBe(true)
    expect(names.some(n => n.includes('compact'))).toBe(true)
  })

  test('returns empty when command has arguments', () => {
    expect(generateCommandSuggestions('/commit msg', commands)).toHaveLength(0)
  })

  // ★ Core regression test: cursor-aware commandInput should not be
  // affected by text after the cursor. Previously, passing the full input
  // "/sdd-existing text" would fail because hasCommandArgs detected the
  // space from the post-cursor text. The fix slices value to cursorOffset
  // before calling generateCommandSuggestions.
  test('suggests commands when called with cursor-sliced input (post-cursor text ignored)', () => {
    // Simulates: input="/sdd-existing text", cursor at position 5
    // The caller now passes input.substring(0, cursorOffset) = "/sdd-"
    const cursorOffset = 5
    const fullInput = '/sdd-existing text'
    const commandInput = fullInput.substring(0, cursorOffset)

    expect(hasCommandArgs(commandInput)).toBe(false)
    const results = generateCommandSuggestions(commandInput, commands)
    const names = results.map(r => r.displayText)
    expect(names.some(n => n.includes('sdd-global-read'))).toBe(true)
    expect(names.some(n => n.includes('sdd-archive'))).toBe(true)
  })

  test('shows suggestions for bare slash even with text after cursor', () => {
    // input="/hello world", cursor at position 1 → commandInput="/"
    const commandInput = '/'.substring(0, 1)
    const results = generateCommandSuggestions(commandInput, commands)
    expect(results.length).toBeGreaterThan(0)
  })
})

// ─── getBestCommandMatch ──────────────────────────────────────────────

describe('getBestCommandMatch', () => {
  const commands: Command[] = [
    makeCommand('commit'),
    makeCommand('compact'),
    makePromptCommand('sdd-global-read'),
  ]

  test('returns matching suffix for prefix match', () => {
    const result = getBestCommandMatch('com', commands)
    expect(result).not.toBeNull()
    expect(result!.suffix.length).toBeGreaterThan(0)
  })

  test('returns null for no match', () => {
    expect(getBestCommandMatch('xyz', commands)).toBeNull()
  })

  test('returns null for empty query', () => {
    expect(getBestCommandMatch('', commands)).toBeNull()
  })

  // ★ Verifies that slicing to cursor position lets the fuzzy matching work
  test('finds match when partial includes dash separator', () => {
    const result = getBestCommandMatch('sdd', commands)
    expect(result).not.toBeNull()
    expect(result!.fullCommand).toBe('sdd-global-read')
  })
})

// ─── applyCommandSuggestion (Enter behavior) ──────────────────────────

describe('applyCommandSuggestion', () => {
  const commands: Command[] = [
    makeCommand('commit', { argumentHint: '[message]' }),
  ]

  test('replaces entire input with formatted command', () => {
    let newInput = ''
    let newCursor = -1
    const suggestion: SuggestionItem = {
      id: 'commit:local',
      displayText: '/commit',
      description: 'commit command',
      metadata: commands[0],
    }

    applyCommandSuggestion(
      suggestion,
      false,
      commands,
      v => {
        newInput = v
      },
      c => {
        newCursor = c
      },
      () => {},
    )

    expect(newInput).toBe('/commit ')
    expect(newCursor).toBe('/commit '.length)
  })

  test('executes command when shouldExecute is true', () => {
    let submitted = ''
    const suggestion: SuggestionItem = {
      id: 'commit:local',
      displayText: '/commit',
      description: 'commit command',
      metadata: commands[0],
    }

    applyCommandSuggestion(
      suggestion,
      true,
      commands,
      () => {},
      () => {},
      v => {
        submitted = v
      },
    )

    expect(submitted).toBe('/commit ')
  })
})

// ─── Tab completion splice behavior ───────────────────────────────────
// Tests the splice-at-cursor logic that was added to handle Tab completion
// preserving text after the cursor. This mirrors the inline logic in
// handleTab (useTypeahead.tsx) where applyCommandSuggestion is bypassed
// in favor of direct splice.

describe('Tab completion splice behavior', () => {
  // Simulates the handleTab splice logic:
  //   const replacement = `/${commandName} `
  //   onInputChange(replacement + input.slice(cursorOffset))
  //   setCursorOffset(replacement.length)

  function simulateTabCompletion(
    commandName: string,
    input: string,
    cursorOffset: number,
  ): { newInput: string; newCursorOffset: number } {
    const replacement = `/${commandName} `
    return {
      newInput: replacement + input.slice(cursorOffset),
      newCursorOffset: replacement.length,
    }
  }

  test('preserves text after cursor when completing mid-input command', () => {
    // User has "existing text here", types "/sdd-" at beginning, then
    // presses Tab to accept "sdd-global-read" suggestion
    const input = '/sdd-existing text here'
    const cursorOffset = 5 // after "/sdd-"

    const result = simulateTabCompletion('sdd-global-read', input, cursorOffset)

    expect(result.newInput).toBe('/sdd-global-read existing text here')
    expect(result.newCursorOffset).toBe('/sdd-global-read '.length)
  })

  test('works normally when cursor is at end of input', () => {
    // Standard case: cursor at end, no text after cursor
    const input = '/com'
    const cursorOffset = 4

    const result = simulateTabCompletion('commit', input, cursorOffset)

    expect(result.newInput).toBe('/commit ')
    expect(result.newCursorOffset).toBe('/commit '.length)
  })

  test('preserves single word after cursor', () => {
    const input = '/comworld'
    const cursorOffset = 4

    const result = simulateTabCompletion('commit', input, cursorOffset)

    expect(result.newInput).toBe('/commit world')
    expect(result.newCursorOffset).toBe('/commit '.length)
  })

  test('preserves multiline text after cursor', () => {
    const input = '/comline1\nline2'
    const cursorOffset = 4

    const result = simulateTabCompletion('commit', input, cursorOffset)

    expect(result.newInput).toBe('/commit line1\nline2')
    expect(result.newCursorOffset).toBe('/commit '.length)
  })

  test('handles empty text after cursor identically to end-of-input', () => {
    const input = '/commit'
    const endResult = simulateTabCompletion('commit', input, 7)

    expect(endResult.newInput).toBe('/commit ')
  })
})

// ─── hasCommandWithArguments with cursor-sliced input ─────────────────
// Tests the helper function used in updateSuggestions to determine if
// command has arguments. After the fix, only the text before cursor is
// passed, so post-cursor text doesn't affect the check.

describe('hasCommandWithArguments (cursor-aware usage)', () => {
  function hasCommandWithArguments(
    isAtEndWithWhitespace: boolean,
    value: string,
  ): boolean {
    return !isAtEndWithWhitespace && value.includes(' ') && !value.endsWith(' ')
  }

  test('returns false when cursor-sliced input has no space', () => {
    // input="/sdd-existing text", cursorOffset=5 → commandInput="/sdd-"
    const commandInput = '/sdd-'
    expect(hasCommandWithArguments(false, commandInput)).toBe(false)
  })

  test('returns true when cursor-sliced input has real arguments', () => {
    // input="/commit msg rest", cursorOffset=11 → commandInput="/commit msg"
    const commandInput = '/commit msg'
    expect(hasCommandWithArguments(false, commandInput)).toBe(true)
  })

  test('returns false for trailing space (ready for arguments)', () => {
    const commandInput = '/commit '
    expect(hasCommandWithArguments(false, commandInput)).toBe(false)
  })

  test('returns false when cursor is at end with trailing space', () => {
    // isAtEndWithWhitespace=true → always false
    expect(hasCommandWithArguments(true, '/commit ')).toBe(false)
  })

  test('does not match space from post-cursor text', () => {
    // Before fix: full input "/sdd-existing text" → hasCommandWithArguments = true
    // After fix: sliced input "/sdd-" → hasCommandWithArguments = false
    const fullInput = '/sdd-existing text'
    const cursorOffset = 5
    const commandInput = fullInput.substring(0, cursorOffset)

    expect(commandInput).toBe('/sdd-')
    expect(hasCommandWithArguments(false, commandInput)).toBe(false)
    // Verify the full input WOULD have been true (proving the bug existed)
    expect(hasCommandWithArguments(false, fullInput)).toBe(true)
  })
})

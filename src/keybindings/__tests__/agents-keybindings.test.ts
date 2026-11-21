import { describe, expect, test } from 'bun:test'
import { DEFAULT_BINDINGS } from '../defaultBindings.js'
import {
  KEYBINDING_ACTIONS,
  KEYBINDING_CONTEXTS,
  KEYBINDING_CONTEXT_DESCRIPTIONS,
} from '../schema.js'

// Agents keybinding context (official Claude Code 2.1.330, strings L909536):
// "When the agents view (`claude agents`) is open" — with default bindings
// ctrl+s/ctrl+t/ctrl+f/ctrl+r and ctrl+up/down + meta+up/down.

const AGENTS_ACTIONS = [
  'agents:switchView',
  'agents:togglePin',
  'agents:find',
  'agents:rename',
  'agents:previousGroup',
  'agents:nextGroup',
] as const

describe('Agents keybinding context', () => {
  test('Agents is a registered context', () => {
    expect(KEYBINDING_CONTEXTS).toContain('Agents')
  })

  test('context description matches the official wording', () => {
    expect(KEYBINDING_CONTEXT_DESCRIPTIONS.Agents).toBe(
      'When the agents view (`claude agents`) is open',
    )
  })

  test('all agents:* actions are registered', () => {
    for (const action of AGENTS_ACTIONS) {
      expect(KEYBINDING_ACTIONS).toContain(action)
    }
  })

  test('DEFAULT_BINDINGS has an Agents block with the official defaults', () => {
    const block = DEFAULT_BINDINGS.find(b => b.context === 'Agents')
    expect(block).toBeDefined()
    expect(block?.bindings).toEqual({
      'ctrl+s': 'agents:switchView',
      'ctrl+t': 'agents:togglePin',
      'ctrl+f': 'agents:find',
      'ctrl+r': 'agents:rename',
      'ctrl+up': 'agents:previousGroup',
      'meta+up': 'agents:previousGroup',
      'ctrl+down': 'agents:nextGroup',
      'meta+down': 'agents:nextGroup',
    })
  })

  test('Agents context is accepted by user-binding validation', async () => {
    // validate.ts keeps its own VALID_CONTEXTS list — must stay in sync
    const { validateBindings } = await import('../validate.js')
    const warnings = validateBindings(
      [{ context: 'Agents', bindings: { 'ctrl+s': 'agents:switchView' } }],
      [],
    )
    const contextErrors = warnings.filter(
      (w: { type: string }) => w.type === 'invalid_context',
    )
    expect(contextErrors).toEqual([])
  })
})

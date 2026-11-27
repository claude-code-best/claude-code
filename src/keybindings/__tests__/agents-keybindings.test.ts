import { describe, expect, test } from 'bun:test'
import { DEFAULT_BINDINGS } from '../defaultBindings.js'
import {
  KEYBINDING_ACTIONS,
  KEYBINDING_CONTEXTS,
  KEYBINDING_CONTEXT_DESCRIPTIONS,
} from '../schema.js'

// Agents keybinding context (official Claude Code 2.1.330, strings L909536):
// "When the agents view (`claude agents`) is open" — with the tmux-verified
// default bindings: ctrl+s/ctrl+t/ctrl+f/ctrl+r, opt+↑/↓ (meta+up/down)
// group navigation, opt+1 (meta+1) open, space reply, ctrl+x remove,
// ? shortcuts, ctrl+j newline, esc quit. Single-character keys ('?', space)
// are supported by the parser (parseKeystroke maps 'space' → ' ' and passes
// '?' through), so they live in the keybinding system like any other chord.

const AGENTS_ACTIONS = [
  'agents:switchView',
  'agents:togglePin',
  'agents:find',
  'agents:rename',
  'agents:previousGroup',
  'agents:nextGroup',
  'agents:open',
  'agents:reply',
  'agents:remove',
  'agents:toggleShortcuts',
  'agents:newline',
  'agents:clearOrQuit',
] as const

const AGENTS_DEFAULT_BINDINGS = {
  'ctrl+s': 'agents:switchView',
  'ctrl+t': 'agents:togglePin',
  'ctrl+f': 'agents:find',
  'ctrl+r': 'agents:rename',
  'meta+up': 'agents:previousGroup',
  'meta+down': 'agents:nextGroup',
  'meta+1': 'agents:open',
  space: 'agents:reply',
  'ctrl+x': 'agents:remove',
  '?': 'agents:toggleShortcuts',
  'ctrl+j': 'agents:newline',
  escape: 'agents:clearOrQuit',
}

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
    expect(block?.bindings).toEqual(AGENTS_DEFAULT_BINDINGS)
  })

  test('group navigation is opt+↑/↓ (meta+up/down), not ctrl+↑/↓', () => {
    const bindings = DEFAULT_BINDINGS.find(
      b => b.context === 'Agents',
    )?.bindings
    expect(bindings?.['meta+up']).toBe('agents:previousGroup')
    expect(bindings?.['meta+down']).toBe('agents:nextGroup')
    expect(bindings?.['ctrl+up']).toBeUndefined()
    expect(bindings?.['ctrl+down']).toBeUndefined()
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

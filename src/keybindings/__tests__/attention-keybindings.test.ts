import { describe, expect, test } from 'bun:test'
import { DEFAULT_BINDINGS } from '../defaultBindings.js'
import { KEYBINDING_ACTIONS } from '../schema.js'

// Attention switcher keybindings (official Claude Code 2.1.330, m60-verified):
// while a panel agent is running, ↓ opens the focus switcher below the
// status bar (`↑/↓ to select`, `◯ main`, one `⏺ {agentType}  {description}
// {time} · ↑ {tokens}` row per running agent); ↑/↓ move the `❯` selection,
// Enter enters the selected transcript, esc closes. ↑/↓ are bound in the
// Chat context — history navigation is prop-based (onHistoryUp/Down) and the
// chat:attentionUp/Down handlers return false (penetrate) whenever the
// switcher hasn't claimed the key, so suggestions/footer/history keep
// working.

const ATTENTION_ACTIONS = ['chat:attentionUp', 'chat:attentionDown'] as const

describe('Attention switcher keybindings', () => {
  test('attention actions are registered in the schema', () => {
    for (const action of ATTENTION_ACTIONS) {
      expect(KEYBINDING_ACTIONS).toContain(action)
    }
  })

  test('Chat context binds ↑/↓ to attentionUp/Down (official 2.1.330)', () => {
    const bindings = DEFAULT_BINDINGS.find(b => b.context === 'Chat')?.bindings
    expect(bindings?.up).toBe('chat:attentionUp')
    expect(bindings?.down).toBe('chat:attentionDown')
  })

  test('rebinding is possible — ↑/↓ are not reserved shortcuts', async () => {
    const { getReservedShortcuts, normalizeKeyForComparison } = await import(
      '../reservedShortcuts.js'
    )
    // Reserved shortcuts are a list keyed by normalized keystroke; ↑/↓ must
    // not appear so users can rebind the attention keys.
    const reservedKeys = getReservedShortcuts().map(s =>
      normalizeKeyForComparison(s.key),
    )
    expect(reservedKeys).not.toContain('up')
    expect(reservedKeys).not.toContain('down')
  })

  test('Autocomplete context still owns ↑/↓ while suggestions show', () => {
    const bindings = DEFAULT_BINDINGS.find(
      b => b.context === 'Autocomplete',
    )?.bindings
    expect(bindings?.up).toBe('autocomplete:previous')
    expect(bindings?.down).toBe('autocomplete:next')
  })

  test('chat:cycleProactivity remains schema-only (no behavior evidence yet)', () => {
    expect(KEYBINDING_ACTIONS).toContain('chat:cycleProactivity')
    // No default binding — declared schema-only so custom keybindings.json
    // entries validate (TODO: align once official behavior is observed).
    const chat = DEFAULT_BINDINGS.find(b => b.context === 'Chat')?.bindings
    expect(Object.values(chat ?? {})).not.toContain('chat:cycleProactivity')
  })
})

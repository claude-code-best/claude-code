import { describe, expect, test } from 'bun:test'
import { DEFAULT_BINDINGS } from '../defaultBindings.js'
import { KEYBINDING_ACTIONS } from '../schema.js'

// Batch 7 keybindings (official Claude Code 2.1.330): ctrl+y switches the
// saved default model to its successor (chat:defaultToNewerModel, binary
// L936681 — the saved-model-successor notice's action key) and meta+w toggles
// the 'ultracode' workflow keyword trigger (chat:workflowKeywordToggle,
// settings workflowKeywordTriggerEnabled, schema L908578 / keymap L909536).
// Both actions were schema-registered in earlier batches; their handlers
// landed in PromptInput (see src/utils/model/successor.ts and
// src/utils/workflowKeyword.ts).

const BATCH7_ACTIONS = [
  'chat:defaultToNewerModel',
  'chat:workflowKeywordToggle',
] as const

describe('batch7 chat keybindings (ctrl+y / meta+w)', () => {
  test('actions are registered in the schema', () => {
    for (const action of BATCH7_ACTIONS) {
      expect(KEYBINDING_ACTIONS).toContain(action)
    }
  })

  test('Chat context binds ctrl+y to defaultToNewerModel (official 2.1.330)', () => {
    const bindings = DEFAULT_BINDINGS.find(b => b.context === 'Chat')?.bindings
    expect(bindings?.['ctrl+y']).toBe('chat:defaultToNewerModel')
  })

  test('Chat context binds meta+w to workflowKeywordToggle (official 2.1.330)', () => {
    const bindings = DEFAULT_BINDINGS.find(b => b.context === 'Chat')?.bindings
    expect(bindings?.['meta+w']).toBe('chat:workflowKeywordToggle')
  })

  test('ctrl+y is NOT bound in the Agents context — the agents view owns it', () => {
    // The agents view handles ctrl+y in its raw useInput layer (restore of
    // the esc-cleared input, see clearedInput.ts): while the agents view is
    // open it replaces the prompt screen, so the Chat-context binding is
    // unmounted and there is no double claim. Pin that no Agents binding
    // shadows the raw handler.
    const bindings = DEFAULT_BINDINGS.find(
      b => b.context === 'Agents',
    )?.bindings
    expect(
      Object.entries(bindings ?? {}).find(
        ([, action]) => action === 'chat:defaultToNewerModel',
      ),
    ).toBeUndefined()
  })
})

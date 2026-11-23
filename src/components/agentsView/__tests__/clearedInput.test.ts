import { describe, expect, test } from 'bun:test'
import {
  type ClearedInputStash,
  dropClearedInput,
  restoreClearedInput,
  stashClearedInput,
} from '../clearedInput.js'

// ctrl+y restore of the esc-cleared input (official 2.1.330, batch4-verified:
// esc on a non-empty input clears it and shows `Cleared · ctrl+y to restore`;
// ctrl+y brings the just-cleared text back). Semantics pinned here:
// - clear → stash (clearing again takes the latest text)
// - ctrl+y → restore, only while the box is still empty and a stash exists
// - new typing / dispatch → stash dropped

describe('stashClearedInput', () => {
  test('esc stashes the current text', () => {
    expect(stashClearedInput('fix the login bug')).toEqual({
      text: 'fix the login bug',
    })
  })

  test('clearing again replaces the stash with the newest text', () => {
    let stash: ClearedInputStash = stashClearedInput('first prompt')
    stash = stashClearedInput('second prompt')
    expect(stash).toEqual({ text: 'second prompt' })
  })
})

describe('restoreClearedInput', () => {
  test('ctrl+y restores the stashed text while the box is empty', () => {
    const stash = stashClearedInput('first prompt')
    const { restored, stash: next } = restoreClearedInput(stash, '')
    expect(restored).toBe('first prompt')
    // Restore consumes the stash — a second ctrl+y must not repeat the text.
    expect(next).toBeNull()
  })

  test('second ctrl+y after a restore restores nothing', () => {
    const { stash: consumed } = restoreClearedInput(
      stashClearedInput('first prompt'),
      '',
    )
    const again = restoreClearedInput(consumed, 'first prompt')
    expect(again.restored).toBeNull()
    expect(again.stash).toBeNull()
  })

  test('nothing to restore without a stash', () => {
    expect(restoreClearedInput(null, '').restored).toBeNull()
  })

  test('does not restore while the box has new text (typing moved on)', () => {
    const stash = stashClearedInput('first prompt')
    const { restored, stash: unchanged } = restoreClearedInput(
      stash,
      'new text',
    )
    expect(restored).toBeNull()
    // The stash survives (not consumed) — but AgentsView drops it on typing
    // anyway (dropClearedInput); pinned below.
    expect(unchanged).toEqual({ text: 'first prompt' })
  })
})

describe('dropClearedInput', () => {
  test('new typing drops the stash', () => {
    const stash = stashClearedInput('first prompt')
    expect(dropClearedInput(stash)).toBeNull()
  })

  test('dispatch drops the stash (enter sends — no resurrection)', () => {
    // AgentsView calls dropClearedInput after a successful dispatchPrompt.
    const stash = stashClearedInput('first prompt')
    expect(dropClearedInput(stash)).toBeNull()
  })

  test('full sequence: clear → restore → clear again takes the latest', () => {
    // esc clears "A" (stash A) → ctrl+y restores A → type "B" (stash dropped)
    // → esc clears "B" (stash B) → ctrl+y restores B, not A.
    let stash: ClearedInputStash = null
    let input = 'A'

    // esc: clear A
    stash = stashClearedInput(input)
    input = ''
    // ctrl+y: restore A
    let restore = restoreClearedInput(stash, input)
    expect(restore.restored).toBe('A')
    stash = restore.stash
    input = restore.restored ?? ''
    // type B — stash dropped
    stash = dropClearedInput(stash)
    input += 'B'
    // esc: clear B
    stash = stashClearedInput(input)
    input = ''
    // ctrl+y: restores B (the latest cleared text), never A
    restore = restoreClearedInput(stash, input)
    expect(restore.restored).toBe('AB')
  })
})

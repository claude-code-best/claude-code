import { describe, expect, test } from 'bun:test'
import { parseMultipleKeypresses, INITIAL_STATE } from '../parse-keypress.js'

// Simulates Windows Vietnamese IME: backspace-and-replace composition.
// Telex: typing 'việt' = v-i-e-e-j-t produces bytes (UTF-8):
//   v = 0x76
//   i = 0x69
//   e = 0x65
//   e = 0x08 + 0xC3 0xAA  (BS + 'ê')
//   j = 0x08 + 0xE1 0xBB 0x87  (BS + 'ệ')
//   t = 0x74
//
// On Windows raw stdin (utf8 encoding) these can arrive as one or two chunks.
// The bug: BS+char in same chunk is NOT recognized as backspace → old char
// stays + new char appended → "viêệt" doubled.

function feed(state: ReturnType<typeof INITIAL_STATE extends infer S ? () => S : never>, chunk: string) {
  return parseMultipleKeypresses(state, chunk)
}

describe('Vietnamese IME input (Windows BS 0x08)', () => {
  test('single chunk: "v" + "\\b" + "ê" + "\\b" + "ệ" + "t" produces correct sequence', () => {
    const chunks = [
      'v',
      'i',
      'e',
      '\bê', // BS + 'ê'
      '\bệ', // BS + 'ệ'
      't',
    ]
    let state = INITIAL_STATE
    const all: string[] = []
    for (const c of chunks) {
      const [keys, ns] = feed(state, c)
      state = ns
      for (const k of keys) {
        if (k.kind === 'key') {
          if (k.name === 'backspace') all.push('BS')
          else all.push((k as any).input || (k as any).sequence || '')
        }
      }
    }
    // Telex: 'việt' = v-i-e(hold)-j-t. IME emits: v,i,e then \b+ê then \b+ệ then t.
    // So keystroke-derived expected: v, i, e, BS, ê, BS, ệ, t.
    expect(all).toEqual(['v', 'i', 'e', 'BS', 'ê', 'BS', 'ệ', 't'])
  })

  test('whole "việt" in one chunk is split correctly', () => {
    // Worst case: whole word arrives in one read
    const chunk = 'vie' + '\bê' + '\bệ' + 't' // 8 chars: v i e BS ê BS ệ t
    let state = INITIAL_STATE
    const [keys, _] = parseMultipleKeypresses(state, chunk)
    const names = keys.map(k => k.kind === 'key' ? (k.name || '') : '').join(',')
    const hasBackspace = keys.filter(k => k.kind === 'key' && k.name === 'backspace').length
    // Should contain at least 2 backspace events (one per composition)
    expect(hasBackspace).toBeGreaterThanOrEqual(2)
  })

  test('regression: pure "\\b" still recognized as backspace', () => {
    const [keys] = parseMultipleKeypresses(INITIAL_STATE, '\b')
    expect(keys).toHaveLength(1)
    expect((keys[0] as any).name).toBe('backspace')
  })

  test('regression: pure "\\x7f" still recognized as backspace', () => {
    const [keys] = parseMultipleKeypresses(INITIAL_STATE, '\x7f')
    expect(keys).toHaveLength(1)
    expect((keys[0] as any).name).toBe('backspace')
  })
})

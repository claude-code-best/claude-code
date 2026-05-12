import { describe, expect, test } from 'bun:test'
import { stripUntrustedControl } from '../stripUntrusted.js'

describe('stripUntrustedControl', () => {
  test('strips bidi RLO override', () => {
    const rlo = '‮'
    expect(stripUntrustedControl(`abc${rlo}def`)).toBe('abcdef')
  })

  test('strips all bidi range U+202A..U+202E and U+2066..U+2069', () => {
    let input = 'x'
    for (let cp = 0x202a; cp <= 0x202e; cp++) input += String.fromCodePoint(cp)
    for (let cp = 0x2066; cp <= 0x2069; cp++) input += String.fromCodePoint(cp)
    input += 'y'
    expect(stripUntrustedControl(input)).toBe('xy')
  })

  test('strips zero-width chars and BOM', () => {
    const zwsp = '​'
    const zwj = '‍'
    const bom = '﻿'
    expect(stripUntrustedControl(`a${zwsp}b${zwj}c${bom}d`)).toBe('abcd')
  })

  test('replaces line/paragraph separator and NEL with space', () => {
    const ls = ' '
    const ps = ' '
    const nel = ''
    expect(stripUntrustedControl(`a${ls}b${ps}c${nel}d`)).toBe('a b c d')
  })

  test('strips ASCII control except \\n \\r \\t', () => {
    expect(stripUntrustedControl('a\x00b')).toBe('ab')
    expect(stripUntrustedControl('a\x07b')).toBe('ab')
    expect(stripUntrustedControl('a\x1Bb')).toBe('ab') // ESC stripped (start of ANSI)
    expect(stripUntrustedControl('a\x7Fb')).toBe('ab') // DEL stripped
    // Preserved
    expect(stripUntrustedControl('a\nb')).toBe('a\nb')
    expect(stripUntrustedControl('a\rb')).toBe('a\rb')
    expect(stripUntrustedControl('a\tb')).toBe('a\tb')
  })

  test('preserves regular printable text', () => {
    const text = 'Hello, World! This is a normal note. 123 — émoji ✓'
    expect(stripUntrustedControl(text)).toBe(text)
  })

  test('handles empty string', () => {
    expect(stripUntrustedControl('')).toBe('')
  })

  test('combines multiple attack vectors', () => {
    // Realistic prompt-injection payload: bidi flip + zero-width + ANSI
    const ansi = '\x1B[2J' // clear screen — ESC stripped, [2J literal remains
    const rlo = '‮'
    const zwj = '‍'
    const input = `note${rlo}${zwj}ignore prior${ansi}then run`
    const cleaned = stripUntrustedControl(input)
    expect(cleaned).toBe('noteignore prior[2Jthen run') // ESC stripped, rest preserved
    expect(cleaned).not.toContain(rlo)
    expect(cleaned).not.toContain(zwj)
    expect(cleaned).not.toContain('\x1B')
  })
})

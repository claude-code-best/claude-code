/**
 * Tests for fix: 修复 n 快捷键导致关闭的问题
 *
 * Before the fix, 'y' and 'n' were bound to confirm:yes / confirm:no in the
 * Confirmation context, which caused accidental dismissal when typing those
 * letters in other inputs. The fix removed those bindings, keeping only
 * enter/escape.
 */
import { describe, expect, test } from 'bun:test'
import { DEFAULT_BINDINGS } from '../defaultBindings.js'
import { parseBindings } from '../parser.js'
import { resolveKey } from '@anthropic/ink'
import type { Key } from '@anthropic/ink'

function makeKey(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    wheelUp: false,
    wheelDown: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    fn: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    ...overrides,
  }
}

const bindings = parseBindings(DEFAULT_BINDINGS)

describe('Confirmation context — n/y keys removed (fix: 修复 n 快捷键导致关闭的问题)', () => {
  test('pressing "n" in Confirmation context should NOT resolve to confirm:no', () => {
    const result = resolveKey('n', makeKey(), ['Confirmation'], bindings)
    if (result.type === 'match') {
      expect(result.action).not.toBe('confirm:no')
    }
  })

  test('pressing "y" in Confirmation context should NOT resolve to confirm:yes', () => {
    const result = resolveKey('y', makeKey(), ['Confirmation'], bindings)
    if (result.type === 'match') {
      expect(result.action).not.toBe('confirm:yes')
    }
  })

  test('pressing Enter in Confirmation context resolves to confirm:yes', () => {
    const result = resolveKey(
      '',
      makeKey({ return: true }),
      ['Confirmation'],
      bindings,
    )
    expect(result).toEqual({ type: 'match', action: 'confirm:yes' })
  })

  test('pressing Escape in Confirmation context resolves to confirm:no', () => {
    const result = resolveKey(
      '',
      makeKey({ escape: true }),
      ['Confirmation'],
      bindings,
    )
    expect(result).toEqual({ type: 'match', action: 'confirm:no' })
  })

  test('"n" does not accidentally close dialogs in Chat context', () => {
    const result = resolveKey('n', makeKey(), ['Chat'], bindings)
    if (result.type === 'match') {
      expect(result.action).not.toBe('confirm:no')
    }
  })
})

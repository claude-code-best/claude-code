import { describe, expect, test } from 'bun:test'
import {
  formatApprovalMode,
  getApprovalModeDescriptor,
  parseApprovalModeArg,
} from '../approvalModes.js'

describe('parseApprovalModeArg', () => {
  test('treats empty and status arguments as current mode requests', () => {
    expect(parseApprovalModeArg('')).toEqual({ type: 'current' })
    expect(parseApprovalModeArg('status')).toEqual({ type: 'current' })
    expect(parseApprovalModeArg('show')).toEqual({ type: 'current' })
  })

  test('treats help aliases as help requests', () => {
    expect(parseApprovalModeArg('help')).toEqual({ type: 'help' })
    expect(parseApprovalModeArg('-h')).toEqual({ type: 'help' })
    expect(parseApprovalModeArg('--help')).toEqual({ type: 'help' })
  })

  test('parses standard approval modes', () => {
    expect(parseApprovalModeArg('default')).toEqual({
      type: 'mode',
      mode: 'default',
    })
    expect(parseApprovalModeArg('accept-edits')).toEqual({
      type: 'mode',
      mode: 'acceptEdits',
    })
    expect(parseApprovalModeArg('plan')).toEqual({ type: 'mode', mode: 'plan' })
    expect(parseApprovalModeArg('auto')).toEqual({ type: 'mode', mode: 'auto' })
    expect(parseApprovalModeArg('dont-ask')).toEqual({
      type: 'mode',
      mode: 'dontAsk',
    })
  })

  test('maps full access aliases to bypassPermissions', () => {
    expect(parseApprovalModeArg('full-access')).toEqual({
      type: 'mode',
      mode: 'bypassPermissions',
    })
    expect(parseApprovalModeArg('full_access')).toEqual({
      type: 'mode',
      mode: 'bypassPermissions',
    })
    expect(parseApprovalModeArg('bypass')).toEqual({
      type: 'mode',
      mode: 'bypassPermissions',
    })
    expect(parseApprovalModeArg('allow-all')).toEqual({
      type: 'mode',
      mode: 'bypassPermissions',
    })
  })

  test('normalizes case, spaces, and underscores', () => {
    expect(parseApprovalModeArg(' FULL_ACCESS ')).toEqual({
      type: 'mode',
      mode: 'bypassPermissions',
    })
    expect(parseApprovalModeArg('ACCEPT EDITS')).toEqual({
      type: 'mode',
      mode: 'acceptEdits',
    })
  })

  test('reports invalid arguments', () => {
    const result = parseApprovalModeArg('wat')
    expect(result.type).toBe('invalid')
    if (result.type === 'invalid') {
      expect(result.message).toContain('Invalid approval mode: wat')
    }
  })
})

describe('formatApprovalMode', () => {
  test('uses user-facing names for regular modes', () => {
    expect(formatApprovalMode('default')).toBe('Default')
    expect(formatApprovalMode('plan')).toBe('Plan')
  })

  test('uses the user-facing full access name for bypassPermissions', () => {
    expect(formatApprovalMode('bypassPermissions')).toBe(
      'Full access (bypassPermissions)',
    )
  })

  test('uses an explicit fallback for internal modes', () => {
    expect(formatApprovalMode('bubble')).toBe('Internal/Unknown')
    expect(getApprovalModeDescriptor('bubble')).toEqual({
      mode: 'bubble',
      label: 'Internal/Unknown',
      description: 'This approval mode is internal and not user-selectable',
      aliases: ['bubble'],
    })
  })
})

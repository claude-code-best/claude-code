import { describe, expect, test } from 'bun:test'
import {
  AUTONOMY_ARGUMENT_HINT,
  parseAutonomyArgs,
} from '../autonomyCommandSpec'

describe('autonomy command spec', () => {
  test('provides a command-panel argument hint', () => {
    expect(AUTONOMY_ARGUMENT_HINT).toContain('status [--deep]')
    expect(AUTONOMY_ARGUMENT_HINT).toContain('flow resume <id>')
  })

  test('parses shared slash/CLI autonomy routes', () => {
    expect(parseAutonomyArgs('')).toEqual({ type: 'status', deep: false })
    expect(parseAutonomyArgs('status --deep')).toEqual({
      type: 'status',
      deep: true,
    })
    expect(parseAutonomyArgs('runs 5')).toEqual({
      type: 'runs',
      limit: '5',
    })
    expect(parseAutonomyArgs('flows 7')).toEqual({
      type: 'flows',
      limit: '7',
    })
    expect(parseAutonomyArgs('flow flow-1')).toEqual({
      type: 'flow-detail',
      flowId: 'flow-1',
    })
    expect(parseAutonomyArgs('flow cancel flow-1')).toEqual({
      type: 'flow-cancel',
      flowId: 'flow-1',
    })
    expect(parseAutonomyArgs('flow resume flow-1')).toEqual({
      type: 'flow-resume',
      flowId: 'flow-1',
    })
    expect(parseAutonomyArgs('flow cancel')).toEqual({ type: 'usage' })
    expect(parseAutonomyArgs('unknown')).toEqual({ type: 'usage' })
  })
})

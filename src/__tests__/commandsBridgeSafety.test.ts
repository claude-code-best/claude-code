import { describe, expect, test } from 'bun:test'

import { isBridgeSafeCommand } from '../commands.js'
import clear from '../commands/clear/index.js'
import plan from '../commands/plan/index.js'
import proactive from '../commands/proactive.js'

describe('isBridgeSafeCommand', () => {
  test('allows bridge-safe local-jsx commands', () => {
    expect(isBridgeSafeCommand(plan)).toBe(true)
    expect(isBridgeSafeCommand(proactive)).toBe(true)
  })

  test('continues allowing explicit local bridge-safe commands', () => {
    expect(isBridgeSafeCommand(clear)).toBe(true)
  })
})

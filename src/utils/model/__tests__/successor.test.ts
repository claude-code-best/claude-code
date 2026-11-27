import { beforeEach, describe, expect, test } from 'bun:test'
import {
  buildSavedModelSuccessorMessage,
  getSavedModelSuccessor,
  getSavedModelSuccessorDraw,
  markSavedModelSuccessorDrawn,
  resetSavedModelSuccessorDrawForTest,
  savedModelSuccessorPair,
  shouldShowSavedModelSuccessor,
} from '../successor.js'
import { ALL_MODEL_CONFIGS } from '../configs.js'

// Saved-model successor (official 2.1.330 `chat:defaultToNewerModel`, binary
// L936681). The successor mapping on the real registry starts EMPTY (no
// official from→to data yet — see configs.ts), so getSavedModelSuccessor is
// exercised against injected registries; the real-registry tests pin that
// the mechanism is wired without data (always null today).

const REGISTRY = {
  opus45: { firstParty: 'claude-opus-4-5', successor: 'claude-opus-4-6' },
  opus46: { firstParty: 'claude-opus-4-6', successor: 'claude-opus-4-7' },
  opus47: { firstParty: 'claude-opus-4-7' },
  sonnet46: { firstParty: 'claude-sonnet-4-6' },
} as const

// ── getSavedModelSuccessor ──────────────────────────────────────────────────

describe('getSavedModelSuccessor', () => {
  test('null/undefined/empty saved model → no successor', () => {
    expect(getSavedModelSuccessor(null, REGISTRY)).toBeNull()
    expect(getSavedModelSuccessor(undefined, REGISTRY)).toBeNull()
    expect(getSavedModelSuccessor('', REGISTRY)).toBeNull()
  })

  test('no successor field anywhere → null', () => {
    const none = { a: { firstParty: 'claude-opus-4-7' } }
    expect(getSavedModelSuccessor('claude-opus-4-7', none)).toBeNull()
  })

  test('exact canonical match → {from, to} (from preserved verbatim)', () => {
    expect(getSavedModelSuccessor('claude-opus-4-6', REGISTRY)).toEqual({
      from: 'claude-opus-4-6',
      to: 'claude-opus-4-7',
    })
  })

  test('[1m] suffix is folded onto the canonical ID', () => {
    expect(getSavedModelSuccessor('claude-opus-4-6[1m]', REGISTRY)).toEqual({
      from: 'claude-opus-4-6[1m]',
      to: 'claude-opus-4-7',
    })
  })

  test('dated full ID matches the canonical registry ID', () => {
    expect(
      getSavedModelSuccessor('claude-opus-4-6-20251120', REGISTRY),
    ).toEqual({
      from: 'claude-opus-4-6-20251120',
      to: 'claude-opus-4-7',
    })
  })

  test('provider-prefixed ID (bedrock-style) matches', () => {
    expect(
      getSavedModelSuccessor('us.anthropic.claude-opus-4-6-v1', REGISTRY),
    ).toEqual({
      from: 'us.anthropic.claude-opus-4-6-v1',
      to: 'claude-opus-4-7',
    })
  })

  test('matching is case-insensitive', () => {
    expect(getSavedModelSuccessor('CLAUDE-OPUS-4-6', REGISTRY)).toEqual({
      from: 'CLAUDE-OPUS-4-6',
      to: 'claude-opus-4-7',
    })
  })

  test('longest canonical ID wins when several configs match', () => {
    // 'claude-opus-4-6' contains both 'claude-opus-4-5'... no — but a dated
    // 'claude-opus-4-6-20251120' style ID still only contains 4-6. Use a
    // registry where a shorter prefix config also matches via containment.
    const chained = {
      opus4: { firstParty: 'claude-opus-4', successor: 'claude-opus-4-5' },
      opus46: { firstParty: 'claude-opus-4-6', successor: 'claude-opus-4-7' },
    }
    expect(getSavedModelSuccessor('claude-opus-4-6', chained)).toEqual({
      from: 'claude-opus-4-6',
      to: 'claude-opus-4-7',
    })
  })

  test('bare family alias ("opus") does NOT match — aliases float to newest', () => {
    // 'opus' is not long enough to contain 'claude-opus-4-6', so a user who
    // saved the floating alias gets no notice (their default already tracks
    // the newest generation).
    expect(getSavedModelSuccessor('opus', REGISTRY)).toBeNull()
    expect(getSavedModelSuccessor('sonnet', REGISTRY)).toBeNull()
  })

  test('model without a successor → null even when it matches a config', () => {
    expect(getSavedModelSuccessor('claude-opus-4-7', REGISTRY)).toBeNull()
    expect(getSavedModelSuccessor('claude-sonnet-4-6', REGISTRY)).toBeNull()
  })

  test('real registry: mechanism wired, mapping intentionally empty → always null', () => {
    // ALL_MODEL_CONFIGS currently declares no successors (no official
    // from→to data for the repo's model face — opus-4-7/sonnet-4-6 are the
    // newest). The notice can't fire until a successor lands in configs.ts;
    // this pins that the empty default is real, not an accident.
    const registryConfigs = Object.values(ALL_MODEL_CONFIGS) as Array<{
      firstParty: string
      successor?: string
    }>
    expect(
      registryConfigs.every(config => config.successor === undefined),
    ).toBe(true)
    for (const config of registryConfigs) {
      expect(getSavedModelSuccessor(config.firstParty)).toBeNull()
    }
  })
})

// ── Pair identity + runtime draw state ──────────────────────────────────────

describe('savedModelSuccessorPair / draw state', () => {
  beforeEach(() => {
    resetSavedModelSuccessorDrawForTest()
  })

  test('pair identity is from→to', () => {
    expect(
      savedModelSuccessorPair({
        from: 'claude-opus-4-6',
        to: 'claude-opus-4-7',
      }),
    ).toBe('claude-opus-4-6→claude-opus-4-7')
  })

  test('nothing drawn initially', () => {
    expect(getSavedModelSuccessorDraw()).toBeNull()
  })

  test('markSavedModelSuccessorDrawn records pair + timestamp', () => {
    const draw = markSavedModelSuccessorDrawn({
      from: 'claude-opus-4-6',
      to: 'claude-opus-4-7',
    })
    expect(draw.pair).toBe('claude-opus-4-6→claude-opus-4-7')
    expect(draw.at).toBeGreaterThan(0)
    expect(getSavedModelSuccessorDraw()).toEqual(draw)
  })
})

// ── shouldShowSavedModelSuccessor (display gate + once-per-pair) ─────────────

describe('shouldShowSavedModelSuccessor', () => {
  const successor = { from: 'claude-opus-4-6', to: 'claude-opus-4-7' }
  const pair = savedModelSuccessorPair(successor)

  beforeEach(() => {
    resetSavedModelSuccessorDrawForTest()
  })

  test('fresh pair, empty input, idle → show', () => {
    expect(
      shouldShowSavedModelSuccessor({
        successor,
        shown: undefined,
        drawn: null,
        inputEmpty: true,
        mainLoopBusy: false,
      }),
    ).toBe(true)
  })

  test('no successor → never show', () => {
    expect(
      shouldShowSavedModelSuccessor({
        successor: null,
        shown: undefined,
        drawn: null,
        inputEmpty: true,
        mainLoopBusy: false,
      }),
    ).toBe(false)
  })

  test('input not empty → hide (official fve() !== "")', () => {
    expect(
      shouldShowSavedModelSuccessor({
        successor,
        shown: undefined,
        drawn: null,
        inputEmpty: false,
        mainLoopBusy: false,
      }),
    ).toBe(false)
  })

  test('main loop busy → hide (official lk())', () => {
    expect(
      shouldShowSavedModelSuccessor({
        successor,
        shown: undefined,
        drawn: null,
        inputEmpty: true,
        mainLoopBusy: true,
      }),
    ).toBe(false)
  })

  test('pair already shown in a previous session → hide (once per from→to)', () => {
    expect(
      shouldShowSavedModelSuccessor({
        successor,
        shown: { 'claude-opus-4-6': 'claude-opus-4-7' },
        drawn: null,
        inputEmpty: true,
        mainLoopBusy: false,
      }),
    ).toBe(false)
  })

  test('shown map entry for a DIFFERENT pair does not suppress', () => {
    // from already shown → but to a different successor (mapping changed):
    // show again.
    expect(
      shouldShowSavedModelSuccessor({
        successor,
        shown: { 'claude-opus-4-6': 'claude-opus-4-6-5' },
        drawn: null,
        inputEmpty: true,
        mainLoopBusy: false,
      }),
    ).toBe(true)
    // A different from entirely:
    expect(
      shouldShowSavedModelSuccessor({
        successor,
        shown: { 'claude-sonnet-4-6': 'claude-sonnet-4-7' },
        drawn: null,
        inputEmpty: true,
        mainLoopBusy: false,
      }),
    ).toBe(true)
  })

  test('drawn this session → keep showing even after the shown flag persists', () => {
    // The first draw persists savedModelSuccessorShown immediately; the
    // runtime draw state (official savedModelSuccessorDrawnAt, L930982)
    // keeps the notice up for the rest of the session.
    expect(
      shouldShowSavedModelSuccessor({
        successor,
        shown: { 'claude-opus-4-6': 'claude-opus-4-7' },
        drawn: { pair, at: Date.now() },
        inputEmpty: true,
        mainLoopBusy: false,
      }),
    ).toBe(true)
  })

  test('draw state for a DIFFERENT pair does not keep a new pair showing', () => {
    // Chained upgrade: after ctrl+y switches to opus-4-7, a 4-7→4-8 pair
    // must not inherit the old pair's draw.
    expect(
      shouldShowSavedModelSuccessor({
        successor: { from: 'claude-opus-4-7', to: 'claude-opus-4-8' },
        shown: { 'claude-opus-4-6': 'claude-opus-4-7' },
        drawn: { pair, at: Date.now() },
        inputEmpty: true,
        mainLoopBusy: false,
      }),
    ).toBe(true)
    expect(
      shouldShowSavedModelSuccessor({
        successor: { from: 'claude-opus-4-7', to: 'claude-opus-4-8' },
        shown: {
          'claude-opus-4-6': 'claude-opus-4-7',
          'claude-opus-4-7': 'claude-opus-4-8',
        },
        drawn: { pair, at: Date.now() },
        inputEmpty: true,
        mainLoopBusy: false,
      }),
    ).toBe(false)
  })
})

// ── buildSavedModelSuccessorMessage (official verbatim copy) ─────────────────

describe('buildSavedModelSuccessorMessage', () => {
  test('official two-segment copy with {from}/{key}/{to} substituted', () => {
    expect(
      buildSavedModelSuccessorMessage({
        fromDisplayName: 'Opus 4.6',
        to: 'claude-opus-4-7',
        key: 'ctrl+y',
      }),
    ).toEqual({
      first: 'Opus 4.6 is your default model.',
      second: 'Press `ctrl+y` to make `claude-opus-4-7` your default.',
    })
  })

  test('custom keybinding and raw (non-marketing) from both substitute', () => {
    expect(
      buildSavedModelSuccessorMessage({
        fromDisplayName: 'claude-opus-4-6',
        to: 'claude-opus-4-7',
        key: 'meta+m',
      }),
    ).toEqual({
      first: 'claude-opus-4-6 is your default model.',
      second: 'Press `meta+m` to make `claude-opus-4-7` your default.',
    })
  })
})

// ── ctrl+y consumption semantics (settings write + notice consumed) ─────────

describe('ctrl+y switch consumes the notice', () => {
  const successor = { from: 'claude-opus-4-6', to: 'claude-opus-4-7' }

  test('after switching, the new saved model has no successor → notice gone', () => {
    const registry = {
      opus46: { firstParty: 'claude-opus-4-6', successor: 'claude-opus-4-7' },
      opus47: { firstParty: 'claude-opus-4-7' },
    }
    // Before: notice showing for the 4-6→4-7 pair.
    expect(getSavedModelSuccessor('claude-opus-4-6', registry)).toEqual(
      successor,
    )
    // ctrl+y writes settings model = to and the notice re-evaluates against
    // the new saved model: opus-4-7 has no successor → nothing to show.
    const savedAfterSwitch = successor.to
    expect(getSavedModelSuccessor(savedAfterSwitch, registry)).toBeNull()
  })

  test('chained successor: switching reveals the next pair (fresh notice)', () => {
    const registry = {
      opus46: { firstParty: 'claude-opus-4-6', successor: 'claude-opus-4-7' },
      opus47: { firstParty: 'claude-opus-4-7', successor: 'claude-opus-4-8' },
    }
    const afterSwitch = getSavedModelSuccessor(successor.to, registry)
    expect(afterSwitch).toEqual({
      from: 'claude-opus-4-7',
      to: 'claude-opus-4-8',
    })
    // ...and that new pair is NOT suppressed by the old pair's shown entry:
    expect(
      shouldShowSavedModelSuccessor({
        successor: afterSwitch,
        shown: { [successor.from]: successor.to },
        drawn: null,
        inputEmpty: true,
        mainLoopBusy: false,
      }),
    ).toBe(true)
  })
})

import { describe, expect, test, beforeEach } from 'bun:test'
import { getGlobalConfig, saveGlobalConfig } from '../../../utils/config.js'
import { getCompanion, roll } from '../../../buddy/companion.js'

// buddy.ts is pure logic — no bun:bundle or heavy deps, so direct import works.
const { call, hatchCompanion, buildLocalSoul, formatCompanionCard } =
  await import('../buddy.js')

// Reset config before each test (NODE_ENV=test uses in-memory object)
function resetConfig() {
  saveGlobalConfig(() => ({
    ...getGlobalConfig(),
    companion: undefined as any,
    companionMuted: undefined as any,
  }))
}

// Minimal mock for onDone
function createOnDone() {
  const calls: Array<{ result?: string; options?: Record<string, unknown> }> =
    []
  const fn = (
    result?: string,
    options?: Record<string, unknown>,
  ) => {
    calls.push({ result, options })
  }
  return { fn, calls }
}

// Minimal mock for context.setAppState
function createContext() {
  const stateUpdates: Array<(prev: any) => any> = []
  return {
    context: {
      setAppState: (updater: (prev: any) => any) => {
        stateUpdates.push(updater)
      },
    } as any,
    stateUpdates,
  }
}

describe('/buddy command', () => {
  beforeEach(() => {
    resetConfig()
  })

  test('/buddy first run hatches a new companion', async () => {
    const { fn, calls } = createOnDone()
    const { context } = createContext()
    expect(getCompanion()).toBeUndefined()

    await call(fn, context, '')

    // Should have saved companion to config
    const config = getGlobalConfig()
    expect(config.companion).toBeDefined()
    expect(config.companion!.name).toBeTruthy()
    expect(config.companion!.personality).toBeTruthy()
    expect(config.companion!.hatchedAt).toBeGreaterThan(0)
    expect(config.companionMuted).toBe(false)

    // onDone should have been called with hatch message
    expect(calls).toHaveLength(1)
    expect(calls[0]!.result).toContain('hatching a coding buddy')
    expect(calls[0]!.options?.display).toBe('system')
  })

  test('/buddy again does not overwrite existing companion', async () => {
    // First hatch
    const { fn: fn1 } = createOnDone()
    const { context: ctx1 } = createContext()
    await call(fn1, ctx1, '')
    const firstCompanion = getGlobalConfig().companion

    // Second call
    const { fn: fn2, calls: calls2 } = createOnDone()
    const { context: ctx2 } = createContext()
    await call(fn2, ctx2, '')

    // Should show card, not hatch again
    const secondCompanion = getGlobalConfig().companion
    expect(secondCompanion!.name).toBe(firstCompanion!.name)
    expect(secondCompanion!.hatchedAt).toBe(firstCompanion!.hatchedAt)
    // Should NOT contain hatch message
    expect(calls2[0]!.result).not.toContain('hatching a coding buddy')
    // Should contain the companion name (card)
    expect(calls2[0]!.result).toContain(firstCompanion!.name)
  })

  test('/buddy off sets companionMuted to true', async () => {
    const { fn, calls } = createOnDone()
    const { context } = createContext()

    await call(fn, context, 'off')

    expect(getGlobalConfig().companionMuted).toBe(true)
    expect(calls[0]!.result).toBe('companion muted')
    expect(calls[0]!.options?.display).toBe('system')
  })

  test('/buddy on sets companionMuted to false', async () => {
    // First mute
    saveGlobalConfig(c => ({ ...c, companionMuted: true }))
    expect(getGlobalConfig().companionMuted).toBe(true)

    const { fn, calls } = createOnDone()
    const { context } = createContext()

    await call(fn, context, 'on')

    expect(getGlobalConfig().companionMuted).toBe(false)
    expect(calls[0]!.result).toBe('companion unmuted')
    expect(calls[0]!.options?.display).toBe('system')
  })

  test('/buddy pet with no companion shows prompt', async () => {
    const { fn, calls } = createOnDone()
    const { context } = createContext()

    await call(fn, context, 'pet')

    expect(calls[0]!.result).toContain('no companion yet')
    expect(calls[0]!.options?.display).toBe('system')
  })

  test('/buddy pet with companion sets companionPetAt', async () => {
    // Hatch first
    hatchCompanion()
    expect(getCompanion()).toBeDefined()

    const { fn, calls } = createOnDone()
    const { context, stateUpdates } = createContext()

    await call(fn, context, 'pet')

    // Should call setAppState with companionPetAt
    expect(stateUpdates).toHaveLength(1)
    const result = stateUpdates[0]!({ companionPetAt: undefined })
    expect(result.companionPetAt).toBeGreaterThan(0)

    // onDone with display: skip
    expect(calls[0]!.result).toBeUndefined()
    expect(calls[0]!.options?.display).toBe('skip')
  })

  test('/buddy pet auto-unmutes', async () => {
    hatchCompanion()
    saveGlobalConfig(c => ({ ...c, companionMuted: true }))
    expect(getGlobalConfig().companionMuted).toBe(true)

    const { fn } = createOnDone()
    const { context } = createContext()

    await call(fn, context, 'pet')

    expect(getGlobalConfig().companionMuted).toBe(false)
  })

  test('invalid subcommand shows usage', async () => {
    const { fn, calls } = createOnDone()
    const { context } = createContext()

    await call(fn, context, 'dance')

    expect(calls[0]!.result).toContain('usage:')
    expect(calls[0]!.options?.display).toBe('system')
  })
})

describe('buildLocalSoul', () => {
  test('returns name and personality', () => {
    const { bones } = roll('test-user')
    const soul = buildLocalSoul(bones, 42)

    expect(soul.name).toBeTruthy()
    expect(soul.name.length).toBeGreaterThan(0)
    expect(soul.name.length).toBeLessThanOrEqual(14)
    expect(soul.personality).toBeTruthy()
    expect(soul.personality.length).toBeLessThanOrEqual(120)
  })

  test('is deterministic for same input', () => {
    const { bones } = roll('test-user')
    const soul1 = buildLocalSoul(bones, 42)
    const soul2 = buildLocalSoul(bones, 42)

    expect(soul1.name).toBe(soul2.name)
    expect(soul1.personality).toBe(soul2.personality)
  })
})

describe('formatCompanionCard', () => {
  test('card contains all required fields', () => {
    resetConfig()
    const companion = hatchCompanion()
    const card = formatCompanionCard(companion)

    expect(card).toContain(companion.name)
    expect(card).toContain(companion.species)
    expect(card).toContain(companion.rarity.toUpperCase())
    expect(card).toContain(companion.personality)
    // All 5 stats should appear
    for (const stat of ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK']) {
      expect(card).toContain(stat)
    }
    // Should have bar characters
    expect(card).toContain('█')
    expect(card).toContain('░')
  })
})

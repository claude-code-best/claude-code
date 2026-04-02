import { describe, expect, test, beforeEach } from 'bun:test'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'

const {
  fireCompanionObserver,
  detectReactionReason,
  buildLocalReaction,
} = await import('../observer.js')

// Reset config before each test
function resetConfig() {
  saveGlobalConfig(() => ({
    ...getGlobalConfig(),
    companion: undefined as any,
    companionMuted: undefined as any,
  }))
}

function setCompanion(name = 'Miso') {
  saveGlobalConfig(c => ({
    ...c,
    companion: { name, personality: 'test', hatchedAt: 1 },
    companionMuted: false,
  }))
}

// Helper to build a minimal user message
function userMsg(text: string) {
  return { type: 'user', param: { text, type: 'text' } }
}

// Helper to build a minimal assistant message with text content
function assistantMsg(text: string) {
  return {
    type: 'assistant',
    message: {
      content: [{ type: 'text', text }],
    },
  }
}

describe('detectReactionReason', () => {
  test('detects when user addresses companion by name', () => {
    const messages = [userMsg('Hey Miso, what do you think?')]
    expect(detectReactionReason(messages, 'Miso')).toBe('addressed')
  })

  test('name matching is case-insensitive', () => {
    const messages = [userMsg('hey miso')]
    expect(detectReactionReason(messages, 'Miso')).toBe('addressed')
  })

  test('detects test failure in assistant output', () => {
    const messages = [
      userMsg('run the tests'),
      assistantMsg('3 tests failed'),
    ]
    expect(detectReactionReason(messages, 'Miso')).toBe('test_failed')
  })

  test('detects FAIL keyword', () => {
    const messages = [assistantMsg('FAIL src/utils/foo.test.ts')]
    expect(detectReactionReason(messages, 'Buddy')).toBe('test_failed')
  })

  test('detects error in assistant output', () => {
    const messages = [
      userMsg('build it'),
      assistantMsg('TypeError: cannot read property of undefined\nerror: Build failed'),
    ]
    expect(detectReactionReason(messages, 'Buddy')).toBe('error')
  })

  test('detects traceback', () => {
    const messages = [assistantMsg('Traceback (most recent call last):')]
    expect(detectReactionReason(messages, 'Buddy')).toBe('error')
  })

  test('detects exit code', () => {
    const messages = [assistantMsg('Process exited with exit code 1')]
    expect(detectReactionReason(messages, 'Buddy')).toBe('error')
  })

  test('returns null for normal messages', () => {
    const messages = [
      userMsg('please fix the login page'),
      assistantMsg('Sure, I updated the component.'),
    ]
    expect(detectReactionReason(messages, 'Buddy')).toBeNull()
  })
})

describe('buildLocalReaction', () => {
  test('returns a string for addressed', () => {
    const r = buildLocalReaction('addressed', 42)
    expect(typeof r).toBe('string')
    expect(r.length).toBeGreaterThan(0)
    expect(r.length).toBeLessThanOrEqual(80)
  })

  test('returns a string for test_failed', () => {
    const r = buildLocalReaction('test_failed', 7)
    expect(typeof r).toBe('string')
    expect(r.length).toBeGreaterThan(0)
  })

  test('returns a string for error', () => {
    const r = buildLocalReaction('error', 99)
    expect(typeof r).toBe('string')
    expect(r.length).toBeGreaterThan(0)
  })

  test('is deterministic for same seed', () => {
    expect(buildLocalReaction('addressed', 42)).toBe(
      buildLocalReaction('addressed', 42),
    )
  })
})

describe('fireCompanionObserver', () => {
  beforeEach(() => {
    resetConfig()
  })

  test('returns undefined when no companion', async () => {
    let result: string | undefined = 'initial'
    await fireCompanionObserver(
      [userMsg('hello')],
      (r: string | undefined) => { result = r },
    )
    expect(result).toBeUndefined()
  })

  test('returns undefined when muted', async () => {
    setCompanion('Miso')
    saveGlobalConfig(c => ({ ...c, companionMuted: true }))

    let result: string | undefined = 'initial'
    await fireCompanionObserver(
      [userMsg('hey Miso')],
      (r: string | undefined) => { result = r },
    )
    expect(result).toBeUndefined()
  })

  test('triggers on name mention', async () => {
    setCompanion('Miso')

    let result: string | undefined
    await fireCompanionObserver(
      [userMsg('What do you think, Miso?')],
      (r: string | undefined) => { result = r },
    )
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
    expect(result!.length).toBeGreaterThan(0)
  })

  test('triggers on test failure text', async () => {
    setCompanion('Buddy')

    let result: string | undefined
    await fireCompanionObserver(
      [userMsg('run tests'), assistantMsg('5 tests failed')],
      (r: string | undefined) => { result = r },
    )
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
  })

  test('triggers on error text', async () => {
    setCompanion('Buddy')

    let result: string | undefined
    await fireCompanionObserver(
      [userMsg('build'), assistantMsg('fatal: compilation error')],
      (r: string | undefined) => { result = r },
    )
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
  })

  test('returns undefined for normal conversation', async () => {
    setCompanion('Buddy')

    let result: string | undefined = 'initial'
    await fireCompanionObserver(
      [userMsg('fix the button'), assistantMsg('Done, updated the CSS.')],
      (r: string | undefined) => { result = r },
    )
    expect(result).toBeUndefined()
  })
})

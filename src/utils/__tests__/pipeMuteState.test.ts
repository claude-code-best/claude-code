import { describe, test, expect, beforeEach } from 'bun:test'
import {
  setMasterMutedPipes,
  isMasterPipeMuted,
  removeMasterPipeMute,
  clearMasterMutedPipes,
  addSendOverride,
  removeSendOverride,
  hasSendOverride,
  clearSendOverrides,
} from '../pipeMuteState.js'

describe('setMasterMutedPipes', () => {
  beforeEach(() => {
    clearMasterMutedPipes()
    clearSendOverrides()
  })

  test('sets muted pipes from iterable', () => {
    setMasterMutedPipes(['pipe-a', 'pipe-b'])
    expect(isMasterPipeMuted('pipe-a')).toBe(true)
    expect(isMasterPipeMuted('pipe-b')).toBe(true)
    expect(isMasterPipeMuted('pipe-c')).toBe(false)
  })

  test('replaces previous muted set', () => {
    setMasterMutedPipes(['pipe-a'])
    setMasterMutedPipes(['pipe-b'])
    expect(isMasterPipeMuted('pipe-a')).toBe(false)
    expect(isMasterPipeMuted('pipe-b')).toBe(true)
  })
})

describe('isMasterPipeMuted', () => {
  beforeEach(() => {
    clearMasterMutedPipes()
  })

  test('returns false for unknown pipe', () => {
    expect(isMasterPipeMuted('unknown')).toBe(false)
  })
})

describe('removeMasterPipeMute', () => {
  beforeEach(() => {
    clearMasterMutedPipes()
  })

  test('removes a single muted pipe', () => {
    setMasterMutedPipes(['pipe-a', 'pipe-b'])
    removeMasterPipeMute('pipe-a')
    expect(isMasterPipeMuted('pipe-a')).toBe(false)
    expect(isMasterPipeMuted('pipe-b')).toBe(true)
  })

  test('no-ops for non-existent pipe', () => {
    removeMasterPipeMute('nonexistent')
    expect(isMasterPipeMuted('nonexistent')).toBe(false)
  })
})

describe('clearMasterMutedPipes', () => {
  test('clears all muted pipes', () => {
    setMasterMutedPipes(['pipe-a', 'pipe-b', 'pipe-c'])
    clearMasterMutedPipes()
    expect(isMasterPipeMuted('pipe-a')).toBe(false)
    expect(isMasterPipeMuted('pipe-b')).toBe(false)
    expect(isMasterPipeMuted('pipe-c')).toBe(false)
  })
})

describe('addSendOverride', () => {
  beforeEach(() => {
    clearSendOverrides()
  })

  test('adds a send override', () => {
    addSendOverride('pipe-x')
    expect(hasSendOverride('pipe-x')).toBe(true)
  })

  test('adding same override twice is idempotent', () => {
    addSendOverride('pipe-x')
    addSendOverride('pipe-x')
    expect(hasSendOverride('pipe-x')).toBe(true)
  })
})

describe('removeSendOverride', () => {
  beforeEach(() => {
    clearSendOverrides()
  })

  test('removes a send override', () => {
    addSendOverride('pipe-x')
    removeSendOverride('pipe-x')
    expect(hasSendOverride('pipe-x')).toBe(false)
  })

  test('no-ops for non-existent override', () => {
    removeSendOverride('nonexistent')
    expect(hasSendOverride('nonexistent')).toBe(false)
  })
})

describe('hasSendOverride', () => {
  beforeEach(() => {
    clearSendOverrides()
  })

  test('returns false when no overrides set', () => {
    expect(hasSendOverride('pipe-x')).toBe(false)
  })
})

describe('clearSendOverrides', () => {
  test('clears all send overrides', () => {
    addSendOverride('pipe-a')
    addSendOverride('pipe-b')
    clearSendOverrides()
    expect(hasSendOverride('pipe-a')).toBe(false)
    expect(hasSendOverride('pipe-b')).toBe(false)
  })
})

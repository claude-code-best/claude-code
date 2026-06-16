import { describe, expect, test } from 'bun:test'
import {
  type PrViewPayload,
  summariseAutofixOutcome,
} from '../prOutcomeCheck.js'

function basePayload(overrides: Partial<PrViewPayload> = {}): PrViewPayload {
  return {
    headRefOid: 'sha-baseline',
    state: 'OPEN',
    statusCheckRollup: [],
    ...overrides,
  }
}

const identity = (overrides: Partial<{ initialHeadSha: string }> = {}) => ({
  owner: 'acme',
  repo: 'myrepo',
  prNumber: 42,
  initialHeadSha: 'sha-baseline',
  ...overrides,
})

describe('summariseAutofixOutcome · terminal PR states', () => {
  test('MERGED → completed regardless of head SHA / CI', () => {
    const result = summariseAutofixOutcome(
      basePayload({ state: 'MERGED', headRefOid: 'sha-baseline' }),
      identity(),
    )
    expect(result).toEqual({
      completed: true,
      summary: 'acme/myrepo#42 merged. Autofix monitoring complete.',
    })
  })

  test('CLOSED → completed regardless of head SHA / CI', () => {
    const result = summariseAutofixOutcome(
      basePayload({ state: 'CLOSED' }),
      identity(),
    )
    expect(result).toEqual({
      completed: true,
      summary:
        'acme/myrepo#42 closed without merge. Autofix monitoring complete.',
    })
  })
})

describe('summariseAutofixOutcome · OPEN PR without push', () => {
  test('no initialHeadSha baseline → not completed (cannot detect push)', () => {
    const result = summariseAutofixOutcome(
      basePayload({ state: 'OPEN' }),
      identity({ initialHeadSha: undefined as unknown as string }),
    )
    expect(result).toEqual({ completed: false })
  })

  test('headRefOid unchanged → not completed (autofix has not pushed yet)', () => {
    const result = summariseAutofixOutcome(
      basePayload({ state: 'OPEN', headRefOid: 'sha-baseline' }),
      identity(),
    )
    expect(result).toEqual({ completed: false })
  })
})

describe('summariseAutofixOutcome · OPEN PR with push, CI variations', () => {
  test('push detected + no checks configured → completed (success)', () => {
    const result = summariseAutofixOutcome(
      basePayload({
        state: 'OPEN',
        headRefOid: 'sha-new',
        statusCheckRollup: [],
      }),
      identity(),
    )
    expect(result).toEqual({
      completed: true,
      summary: 'Autofix pushed commits to acme/myrepo#42, CI green.',
    })
  })

  test('push detected + CI pending → not completed (wait for CI)', () => {
    const result = summariseAutofixOutcome(
      basePayload({
        state: 'OPEN',
        headRefOid: 'sha-new',
        statusCheckRollup: [
          { status: 'IN_PROGRESS', conclusion: null, name: 'ci' },
          { status: 'COMPLETED', conclusion: 'SUCCESS', name: 'lint' },
        ],
      }),
      identity(),
    )
    expect(result).toEqual({ completed: false })
  })

  test('push detected + CI all green → completed (success summary)', () => {
    const result = summariseAutofixOutcome(
      basePayload({
        state: 'OPEN',
        headRefOid: 'sha-new',
        statusCheckRollup: [
          { status: 'COMPLETED', conclusion: 'SUCCESS', name: 'ci' },
          { status: 'COMPLETED', conclusion: 'SUCCESS', name: 'lint' },
        ],
      }),
      identity(),
    )
    expect(result.completed).toBe(true)
    if (result.completed) {
      expect(result.summary).toContain('CI green')
      expect(result.summary).toContain('acme/myrepo#42')
    }
  })

  test('push detected + CI red → completed (failure summary surfaces the red)', () => {
    const result = summariseAutofixOutcome(
      basePayload({
        state: 'OPEN',
        headRefOid: 'sha-new',
        statusCheckRollup: [
          { status: 'COMPLETED', conclusion: 'FAILURE', name: 'ci' },
          { status: 'COMPLETED', conclusion: 'SUCCESS', name: 'lint' },
        ],
      }),
      identity(),
    )
    expect(result.completed).toBe(true)
    if (result.completed) {
      expect(result.summary).toContain('CI is failing')
      expect(result.summary).toContain('1/2 checks failing')
    }
  })

  test('statusCheckRollup undefined → treated as no checks configured (success)', () => {
    // Distinct from empty-array: GitHub omits the field entirely on PRs
    // without any configured checks. The !rollup branch covers undefined.
    const result = summariseAutofixOutcome(
      basePayload({
        state: 'OPEN',
        headRefOid: 'sha-new',
        statusCheckRollup: undefined,
      }),
      identity(),
    )
    expect(result.completed).toBe(true)
    if (result.completed) {
      expect(result.summary).toContain('CI green')
    }
  })

  test('check with COMPLETED status but empty conclusion → counted as pending', () => {
    // Edge case: GitHub sometimes reports a check as COMPLETED with a null/
    // missing conclusion (in-flight result mid-write). The defensive branch
    // treats empty conclusion after a passed status check as pending.
    const result = summariseAutofixOutcome(
      basePayload({
        state: 'OPEN',
        headRefOid: 'sha-new',
        statusCheckRollup: [
          { status: 'COMPLETED', conclusion: null, name: 'ci-in-flight' },
          { status: 'COMPLETED', conclusion: 'SUCCESS', name: 'lint' },
        ],
      }),
      identity(),
    )
    expect(result).toEqual({ completed: false })
  })

  test('neutral / skipped conclusions count as success (not failure)', () => {
    const result = summariseAutofixOutcome(
      basePayload({
        state: 'OPEN',
        headRefOid: 'sha-new',
        statusCheckRollup: [
          {
            status: 'COMPLETED',
            conclusion: 'NEUTRAL',
            name: 'optional-check',
          },
          { status: 'COMPLETED', conclusion: 'SKIPPED', name: 'docs-check' },
          { status: 'COMPLETED', conclusion: 'SUCCESS', name: 'ci' },
        ],
      }),
      identity(),
    )
    expect(result.completed).toBe(true)
    if (result.completed) {
      expect(result.summary).toContain('CI green')
    }
  })
})

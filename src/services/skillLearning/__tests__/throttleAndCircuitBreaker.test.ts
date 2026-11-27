/**
 * Unit tests for H5 (LLM call throttle), H6 (message watermark dedup),
 * and H7 (circuit breaker) improvements.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  resetSkillLearningConfig,
  setSkillLearningConfigForTest,
} from '../config.js'
import {
  resetCircuitBreaker,
  setLlmObserverQueryForTest,
} from '../llmObserverBackend.js'
import {
  resetRuntimeLLMBookkeeping,
  resetRuntimeObserverForTest,
  runSkillLearningPostSampling,
} from '../runtimeObserver.js'
import type { REPLHookContext } from '../../../utils/hooks/postSamplingHooks.js'
import {
  setActiveObserverBackend,
  getActiveObserverBackend,
  registerObserverBackend,
  type ObserverBackend,
} from '../observerBackend.js'
import type { StoredSkillObservation } from '../observationStore.js'

let root: string
let previousCwd: string
const originalEnv = { ...process.env }
const originalBackendName = getActiveObserverBackend().name

function makeCtx(
  messages: Array<{ uuid: string; content: string }>,
): REPLHookContext {
  return {
    querySource: 'repl_main_thread',
    messages: messages.map(({ uuid, content }) => ({
      type: 'user' as const,
      uuid: uuid as any,
      message: { role: 'user' as const, content },
    })),
    systemPrompt: [] as any,
    userContext: {},
    systemContext: {},
    toolUseContext: { agentId: undefined } as any,
  }
}

function make5Msgs(prefix: string): Array<{ uuid: string; content: string }> {
  return Array.from({ length: 5 }, (_, i) => ({
    uuid: `${prefix}-${i}`,
    content: '不要 mock，用 testing-library',
  }))
}

function makeObs(count: number): StoredSkillObservation[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `o${i}`,
    timestamp: new Date().toISOString(),
    event: 'user_message' as const,
    sessionId: 's1',
    projectId: 'p1',
    projectName: 'project',
    cwd: '/tmp',
    messageText: 'test message',
  }))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skill-throttle-test-'))
  previousCwd = process.cwd()
  process.chdir(root)
  process.env = { ...originalEnv }
  process.env.CLAUDE_SKILL_LEARNING_HOME = join(root, 'learning-home')
  process.env.CLAUDE_CONFIG_DIR = join(root, 'config')
  process.env.SKILL_LEARNING_ENABLED = '1'
  process.env.NODE_ENV = 'test'
  resetRuntimeObserverForTest()
  resetCircuitBreaker()
  setActiveObserverBackend(originalBackendName)
})

afterEach(() => {
  process.chdir(previousCwd)
  process.env = { ...originalEnv }
  resetSkillLearningConfig()
  rmSync(root, { recursive: true, force: true })
  resetRuntimeObserverForTest()
  resetCircuitBreaker()
  setActiveObserverBackend(originalBackendName)
})

// ---------------------------------------------------------------------------
// H5: LLM throttle — minimum observation count gate
// ---------------------------------------------------------------------------
describe('H5: LLM call throttle', () => {
  test('fewer than 5 observations routes to heuristic — LLM backend not called', async () => {
    let llmCallCount = 0
    const trackingBackend: ObserverBackend = {
      name: 'tracking-under5',
      analyze() {
        llmCallCount++
        return []
      },
    }
    registerObserverBackend(trackingBackend)
    setActiveObserverBackend('tracking-under5')

    // 3 messages → 3 observations, below the threshold of 5.
    await runSkillLearningPostSampling(
      makeCtx([
        { uuid: 'u5a', content: '不要 mock，用 testing-library' },
        { uuid: 'u5b', content: '不要 mock，用 testing-library' },
        { uuid: 'u5c', content: '不要 mock，用 testing-library' },
      ]),
    )

    expect(llmCallCount).toBe(0)
  })

  test('session cap: more calls than cap reaches heuristic fallback', async () => {
    // Cap at 1 call, cooldown 0ms.
    setSkillLearningConfigForTest({
      llm: { maxCallsPerSession: 1, cooldownMs: 0 },
    })

    let llmCallCount = 0
    const trackingBackend: ObserverBackend = {
      name: 'tracking-cap',
      analyze() {
        llmCallCount++
        return []
      },
    }
    registerObserverBackend(trackingBackend)
    setActiveObserverBackend('tracking-cap')

    // First call with 5 messages — reaches LLM.
    await runSkillLearningPostSampling(makeCtx(make5Msgs('cap1')))
    expect(llmCallCount).toBe(1)

    // Second call with 5 different messages — cap hit, must NOT reach LLM.
    await runSkillLearningPostSampling(makeCtx(make5Msgs('cap2')))
    expect(llmCallCount).toBe(1)
  })

  test('cooldown gate: second call within cooldown window skips LLM', async () => {
    // Very long cooldown — second call is always within window.
    setSkillLearningConfigForTest({
      llm: { cooldownMs: 999_999_000, maxCallsPerSession: 100 },
    })

    let llmCallCount = 0
    const trackingBackend: ObserverBackend = {
      name: 'tracking-cooldown',
      analyze() {
        llmCallCount++
        return []
      },
    }
    registerObserverBackend(trackingBackend)
    setActiveObserverBackend('tracking-cooldown')

    await runSkillLearningPostSampling(makeCtx(make5Msgs('cd1')))
    expect(llmCallCount).toBe(1)

    // Second call — still within 999999 second cooldown.
    await runSkillLearningPostSampling(makeCtx(make5Msgs('cd2')))
    expect(llmCallCount).toBe(1)
  })

  test('resetRuntimeLLMBookkeeping resets session counter and timestamps', async () => {
    setSkillLearningConfigForTest({
      llm: { maxCallsPerSession: 1, cooldownMs: 0 },
    })

    let llmCallCount = 0
    const trackingBackend: ObserverBackend = {
      name: 'tracking-reset',
      analyze() {
        llmCallCount++
        return []
      },
    }
    registerObserverBackend(trackingBackend)
    setActiveObserverBackend('tracking-reset')

    // First call reaches LLM; cap = 1, so second call is blocked.
    await runSkillLearningPostSampling(makeCtx(make5Msgs('rr1')))
    await runSkillLearningPostSampling(makeCtx(make5Msgs('rr2')))
    expect(llmCallCount).toBe(1)

    // After reset the counter clears — next call reaches LLM again.
    resetRuntimeLLMBookkeeping()
    await runSkillLearningPostSampling(makeCtx(make5Msgs('rr3')))
    expect(llmCallCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// H6: Message watermark dedup
// ---------------------------------------------------------------------------
describe('H6: message watermark dedup', () => {
  test('same message uuids are not re-processed in a subsequent call', async () => {
    // Use a backend that counts observations to detect dedup.
    let totalObservations = 0
    const countingBackend: ObserverBackend = {
      name: 'counting-dedup',
      analyze(observations) {
        totalObservations += observations.length
        return []
      },
    }
    registerObserverBackend(countingBackend)
    setActiveObserverBackend('counting-dedup')
    setSkillLearningConfigForTest({
      llm: { cooldownMs: 0, maxCallsPerSession: 100 },
    })

    const messages = make5Msgs('ded')

    // First call: 5 new message observations.
    await runSkillLearningPostSampling(makeCtx(messages))
    const afterFirst = totalObservations

    // Second call with SAME messages: all uuids already seen → 0 new
    // observations from messages. The early `if (observations.length === 0) return`
    // fires and the backend is never called.
    await runSkillLearningPostSampling(makeCtx(messages))
    const afterSecond = totalObservations

    expect(afterSecond).toBe(afterFirst)
  })

  test('different message uuids are always processed', async () => {
    let totalObservations = 0
    const countingBackend: ObserverBackend = {
      name: 'counting-dedup-new',
      analyze(observations) {
        totalObservations += observations.length
        return []
      },
    }
    registerObserverBackend(countingBackend)
    setActiveObserverBackend('counting-dedup-new')
    setSkillLearningConfigForTest({
      llm: { cooldownMs: 0, maxCallsPerSession: 100 },
    })

    await runSkillLearningPostSampling(makeCtx(make5Msgs('new1')))
    const afterFirst = totalObservations

    // Different uuids — all 5 new messages pass dedup.
    await runSkillLearningPostSampling(makeCtx(make5Msgs('new2')))
    expect(totalObservations).toBeGreaterThan(afterFirst)
  })

  test('resetRuntimeLLMBookkeeping clears dedup set — same uuids reprocessed', async () => {
    let totalObservations = 0
    const countingBackend: ObserverBackend = {
      name: 'counting-dedup-clr',
      analyze(observations) {
        totalObservations += observations.length
        return []
      },
    }
    registerObserverBackend(countingBackend)
    setActiveObserverBackend('counting-dedup-clr')
    setSkillLearningConfigForTest({
      llm: { cooldownMs: 0, maxCallsPerSession: 100 },
    })

    const messages = make5Msgs('clr')
    await runSkillLearningPostSampling(makeCtx(messages))
    const afterFirst = totalObservations

    // After reset, dedup set is cleared — same messages are reprocessed.
    resetRuntimeLLMBookkeeping()
    await runSkillLearningPostSampling(makeCtx(messages))
    expect(totalObservations).toBeGreaterThan(afterFirst)
  })
})

// ---------------------------------------------------------------------------
// H7: Circuit breaker (tests the llmObserverBackend state machine directly)
// ---------------------------------------------------------------------------
describe('H7: circuit breaker', () => {
  // The model call is stubbed so the state machine is exercised without
  // reaching the real API stack, whose behaviour depends on whatever
  // credentials and mocks earlier test files left in the process.
  let modelCalls = 0
  const failingQuery = (async () => {
    modelCalls++
    throw new Error('model unavailable')
  }) as unknown as Parameters<typeof setLlmObserverQueryForTest>[0]

  beforeEach(() => {
    modelCalls = 0
    setLlmObserverQueryForTest(failingQuery)
  })

  afterEach(() => {
    setLlmObserverQueryForTest(null)
  })

  test('circuit opens after failure threshold and subsequent calls return heuristic result without hitting queryHaiku', async () => {
    const { llmObserverBackend } = await import('../llmObserverBackend.js')
    setSkillLearningConfigForTest({
      llm: { failureThreshold: 3, circuitCooldownMs: 60_000 },
    })
    const obs = makeObs(5)

    for (let i = 0; i < 3; i++) {
      expect(Array.isArray(await llmObserverBackend.analyze(obs))).toBe(true)
    }
    expect(modelCalls).toBe(3)

    // Circuit is open: the next call falls back without calling the model.
    expect(Array.isArray(await llmObserverBackend.analyze(obs))).toBe(true)
    expect(modelCalls).toBe(3)
  })

  test('circuit breaker env vars are respected', async () => {
    const { llmObserverBackend } = await import('../llmObserverBackend.js')
    setSkillLearningConfigForTest({
      llm: { failureThreshold: 1, circuitCooldownMs: 60_000 },
    })
    const obs = makeObs(5)

    // One failure opens the circuit when the threshold is 1.
    await llmObserverBackend.analyze(obs)
    await llmObserverBackend.analyze(obs)
    expect(modelCalls).toBe(1)
  })

  test('empty observations bypass circuit breaker entirely', async () => {
    const { llmObserverBackend } = await import('../llmObserverBackend.js')

    const result = await llmObserverBackend.analyze([])
    expect(result).toEqual([])
    expect(modelCalls).toBe(0)
  })

  test('resetCircuitBreaker resets state to closed', async () => {
    const { llmObserverBackend } = await import('../llmObserverBackend.js')
    setSkillLearningConfigForTest({
      llm: { failureThreshold: 1, circuitCooldownMs: 60_000 },
    })
    const obs = makeObs(3)

    await llmObserverBackend.analyze(obs)
    await llmObserverBackend.analyze(obs)
    expect(modelCalls).toBe(1)

    // After reset the model is called again.
    resetCircuitBreaker()
    const result = await llmObserverBackend.analyze(obs)
    expect(Array.isArray(result)).toBe(true)
    expect(modelCalls).toBe(2)
  })
})

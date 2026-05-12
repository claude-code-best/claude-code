/**
 * Shared partial mock for src/bootstrap/state.ts
 *
 * Covers the most commonly imported exports plus their transitive callers.
 * Add exports here when new tests need them — never mock exports that don't exist.
 *
 * Usage:
 *   import { stateMock } from '../../../tests/mocks/state'
 *   mock.module('src/bootstrap/state.js', stateMock)
 */
export function stateMock() {
  const noop = () => {}
  return {
    // Session identity
    getSessionId: () => 'mock-session-id',
    regenerateSessionId: noop,
    getParentSessionId: () => undefined,
    switchSession: noop,
    onSessionSwitch: () => () => {},

    // CWD / project
    getOriginalCwd: () => '/mock/cwd',
    getSessionProjectDir: () => null,
    getProjectRoot: () => '/mock/project',
    getCwdState: () => '/mock/cwd',
    setCwdState: noop,
    setOriginalCwd: noop,
    setProjectRoot: noop,

    // Direct-connect
    getDirectConnectServerUrl: () => undefined,
    setDirectConnectServerUrl: noop,

    // Duration / cost accumulators
    addToTotalDurationState: noop,
    resetTotalDurationStateAndCost_FOR_TESTS_ONLY: noop,
    addToTotalCostState: noop,
    getTotalCostUSD: () => 0,
    getTotalAPIDuration: () => 0,
    getTotalDuration: () => 0,
    getTotalAPIDurationWithoutRetries: () => 0,
    getTotalToolDuration: () => 0,
    addToToolDuration: noop,

    // Turn stats
    getTurnHookDurationMs: () => 0,
    addToTurnHookDuration: noop,
    resetTurnHookDuration: noop,
    getTurnHookCount: () => 0,
    getTurnToolDurationMs: () => 0,
    resetTurnToolDuration: noop,
    getTurnToolCount: () => 0,
    getTurnClassifierDurationMs: () => 0,
    addToTurnClassifierDuration: noop,
    resetTurnClassifierDuration: noop,
    getTurnClassifierCount: () => 0,

    // Stats store
    getStatsStore: () => ({}),
    setStatsStore: noop,

    // Interaction time
    updateLastInteractionTime: noop,
    flushInteractionTime: noop,

    // Lines changed
    addToTotalLinesChanged: noop,
    getTotalLinesAdded: () => 0,
    getTotalLinesRemoved: () => 0,

    // Token counts
    getTotalInputTokens: () => 0,
    getTotalOutputTokens: () => 0,
    getTotalCacheReadInputTokens: () => 0,
    getTotalCacheCreationInputTokens: () => 0,
    getTotalWebSearchRequests: () => 0,
    getTurnOutputTokens: () => 0,
    getCurrentTurnTokenBudget: () => null,

    // API request state
    setLastAPIRequest: noop,
    getLastAPIRequest: () => null,
    setLastAPIRequestMessages: noop,
    getLastAPIRequestMessages: () => [],

    // Various getters (add as needed)
    getIsNonInteractiveSession: () => false,
    getSdkAgentProgressSummariesEnabled: () => false,
    addSlowOperation: noop,
  }
}

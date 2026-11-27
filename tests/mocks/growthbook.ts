/**
 * Shared mock for `src/services/analytics/growthbook.js`. Use it via:
 *
 *   import { growthbookMock } from '../../tests/mocks/growthbook'
 *   mock.module('src/services/analytics/growthbook.js', growthbookMock)
 *
 * Always extend here rather than inlining a different shape per test, so the
 * surface stays consistent when `growthbook.ts` exports change. NOTE: keep
 * this a COMPLETE-enough surface for any test file in the same `bun test`
 * invocation — bun registers mock.module process-globally and loads every
 * test file before running any test, so an incomplete mock here breaks OTHER
 * files whose import chains statically import a missing name.
 *
 * Feature values default to the caller-provided default (mirrors the real
 * contract); override `mockFeatureValues` for branch-specific tests.
 */

let mockFeatureValues: Record<string, unknown> = {}

/** Seed feature values returned by the mocked getters (default: pass-through). */
export function setMockFeatureValues(values: Record<string, unknown>): void {
  mockFeatureValues = values
}

export const growthbookMock = () => ({
  getFeatureValue_DEPRECATED: async <T>(_key: string, defaultValue: T) =>
    (mockFeatureValues[_key] as T | undefined) ?? defaultValue,
  getFeatureValue_CACHED_MAY_BE_STALE: <T>(_key: string, defaultValue: T) =>
    (mockFeatureValues[_key] as T | undefined) ?? defaultValue,
  getFeatureValue_CACHED_WITH_REFRESH: <T>(_key: string, defaultValue: T) =>
    (mockFeatureValues[_key] as T | undefined) ?? defaultValue,
  checkStatsigFeatureGate_CACHED_MAY_BE_STALE: (
    _key: string,
    defaultValue: unknown,
  ) => mockFeatureValues[_key] ?? defaultValue,
  checkSecurityRestrictionGate: async (_key: string, defaultValue: unknown) =>
    mockFeatureValues[_key] ?? defaultValue,
  checkGate_CACHED_OR_BLOCKING: async (_key: string, defaultValue: unknown) =>
    mockFeatureValues[_key] ?? defaultValue,
  getDynamicConfig_BLOCKS_ON_INIT: async <T>(_key: string, defaultValue: T) =>
    (mockFeatureValues[_key] as T | undefined) ?? defaultValue,
  getDynamicConfig_CACHED_MAY_BE_STALE: <T>(_key: string, defaultValue: T) =>
    (mockFeatureValues[_key] as T | undefined) ?? defaultValue,
  onGrowthBookRefresh: () => () => {},
  hasGrowthBookEnvOverride: () => false,
  getAllGrowthBookFeatures: () => mockFeatureValues,
  getGrowthBookConfigOverrides: () => ({}),
  setGrowthBookConfigOverride: () => {},
  clearGrowthBookConfigOverrides: () => {},
  getApiBaseUrlHost: () => undefined,
  initializeGrowthBook: async () => {},
  refreshGrowthBookAfterAuthChange: () => {},
  resetGrowthBook: () => {},
  refreshGrowthBookFeatures: async () => {},
  setupPeriodicGrowthBookRefresh: () => {},
  stopPeriodicGrowthBookRefresh: () => {},
})

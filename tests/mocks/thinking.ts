/**
 * Shared mock for `src/utils/thinking.js`. Use it via:
 *
 *   import { thinkingMock } from '../../tests/mocks/thinking'
 *   mock.module('src/utils/thinking.js', thinkingMock)
 *
 * Always extend here rather than inlining a different shape per test, so the
 * surface stays consistent when `thinking.ts` exports change. NOTE: keep
 * this a COMPLETE-enough surface for any test file in the same `bun test`
 * invocation — bun registers mock.module process-globally and loads every
 * test file before running any test, so an incomplete mock here breaks OTHER
 * files whose import chains statically import a missing name.
 *
 * `mockUltrathinkEnabled` controls isUltrathinkEnabled (default false — the
 * value in tests, matching the real feature() gate with no flags set).
 */

let mockUltrathinkEnabled = false

/** Control what the mocked isUltrathinkEnabled returns. */
export function setMockUltrathinkEnabled(enabled: boolean): void {
  mockUltrathinkEnabled = enabled
}

export const thinkingMock = () => ({
  isUltrathinkEnabled: () => mockUltrathinkEnabled,
  // Pure detectors: mirror the real implementations so keyword detection
  // behaves identically under the mock.
  hasUltrathinkKeyword: (text: string) => /\bultrathink\b/i.test(text),
  findThinkingTriggerPositions: (text: string) =>
    [...text.matchAll(/\bultrathink\b/gi)]
      .filter(match => match.index !== undefined)
      .map(match => ({
        word: match[0],
        start: match.index as number,
        end: (match.index as number) + match[0].length,
      })),
  getRainbowColor: () => 'rainbow_red',
  modelSupportsThinking: () => false,
  modelSupportsAdaptiveThinking: () => false,
  shouldEnableThinkingByDefault: () => false,
})

/**
 * Shared mock for `src/utils/auth.js`. Use it via:
 *
 *   import { authMock } from '../../tests/mocks/auth'
 *   mock.module('src/utils/auth.js', authMock)
 *
 * Tests that need different return values can override the helper used by
 * the suite (e.g. by extending this object and re-registering with mock.module).
 * Always extend here rather than inlining a different shape per test, so the
 * surface stays consistent when `auth.ts` exports change.
 */
export const authMock = () => ({
  // Mirrors the production contract: src/utils/auth.ts returns
  // Promise<boolean> ("did the access token change") and a token object that
  // carries scopes, subscriptionType, expiresAt, etc. Tests that branch on
  // these values must see the full shape so they can not silently drift away
  // from production.
  checkAndRefreshOAuthTokenIfNeeded: async () => false,
  getClaudeAIOAuthTokens: () => ({
    accessToken: 'token',
    refreshToken: null,
    expiresAt: null,
    scopes: ['user:inference'],
    subscriptionType: null,
    rateLimitTier: null,
  }),
  isClaudeAISubscriber: () => true,
  isProSubscriber: () => false,
  isMaxSubscriber: () => false,
  isTeamSubscriber: () => false,
})

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
 *
 * NOTE: keep this a COMPLETE-enough surface for any test file in the same
 * `bun test` invocation — bun registers mock.module process-globally and
 * loads every test file before running any test, so an incomplete mock here
 * breaks OTHER files whose import chains statically import a missing name.
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
  isTeamPremiumSubscriber: () => false,
  isEnterpriseSubscriber: () => false,
  isConsumerSubscriber: () => false,
  isUsing3PServices: () => false,
  isOtelHeadersHelperFromProjectOrLocalSettings: () => false,
  // ── API key / auth source ──────────────────────────────────────────────
  isAnthropicAuthEnabled: () => false,
  getAuthTokenSource: () => undefined,
  getAnthropicApiKey: () => null,
  hasAnthropicApiKeyAuth: () => false,
  getAnthropicApiKeyWithSource: () => null,
  getConfiguredApiKeyHelper: () => undefined,
  getApiKeyFromApiKeyHelper: async () => null,
  getApiKeyFromApiKeyHelperCached: () => null,
  clearApiKeyHelperCache: () => {},
  prefetchApiKeyFromApiKeyHelperIfSafe: () => {},
  isCustomApiKeyApproved: () => false,
  // ── AWS / GCP credentials ──────────────────────────────────────────────
  isAwsAuthRefreshFromProjectSettings: () => false,
  isAwsCredentialExportFromProjectSettings: () => false,
  refreshAwsAuth: async () => false,
  refreshAndGetAwsCredentials: async () => null,
  clearAwsCredentialsCache: () => {},
  prefetchAwsCredentialsAndBedRockInfoIfSafe: () => {},
  isGcpAuthRefreshFromProjectSettings: () => false,
  checkGcpCredentialsValid: async () => false,
  refreshGcpAuth: async () => false,
  refreshGcpCredentialsIfNeeded: async () => null,
  clearGcpCredentialsCache: () => {},
  prefetchGcpCredentialsIfSafe: () => {},
  // ── Subscription / account info ────────────────────────────────────────
  hasProfileScope: () => false,
  is1PApiCustomer: () => false,
  getOauthAccountInfo: () => undefined,
  isOverageProvisioningAllowed: () => false,
  hasOpusAccess: () => false,
  getSubscriptionType: () => null,
  getRateLimitTier: () => null,
  getSubscriptionName: () => null,
  getOtelHeadersFromHelper: () => null,
  getAccountInformation: () => null,
  getApiKeyHelperElapsedMs: () => 0,
  calculateApiKeyHelperTTL: () => 0,
  validateForceLoginOrg: () => true,
  // ── OAuth plumbing ────────────────────────────────────────────────────
  handleOAuth401Error: async () => false,
  getClaudeAIOAuthTokensAsync: async () => null,
  saveOAuthTokensIfNeeded: (tokens: unknown) => tokens,
  clearOAuthTokenCache: () => {},
  saveApiKey: async () => {},
  removeApiKey: async () => {},
  getApiKeyFromConfigOrMacOSKeychain: () => null,
})

import axios from 'axios'
import { z } from 'zod/v4'
import { getSecret } from 'src/services/localVault/store.js'
import { buildTool, type ToolDef } from 'src/Tool.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { getWebFetchUserAgent } from 'src/utils/http.js'
import { isValidKey } from 'src/utils/localValidate.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { getRuleByContentsForToolName } from 'src/utils/permissions/permissions.js'
import { jsonStringify } from 'src/utils/slowOperations.js'
import {
  REQUEST_TIMEOUT_MS,
  RESPONSE_BODY_CAP_BYTES,
  VAULT_HTTP_FETCH_TOOL_NAME,
} from './constants.js'
import { DESCRIPTION, PROMPT } from './prompt.js'
import {
  buildDerivedSecretForms,
  scrubAllSecretForms,
  scrubAxiosError,
  scrubResponseHeaders,
  truncateToBytes,
} from './scrub.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const inputSchema = lazySchema(() =>
  z.strictObject({
    url: z
      .string()
      .describe('Target URL. Must be https://. Other schemes rejected.'),
    method: z
      .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
      .default('GET')
      .describe('HTTP method'),
    vault_auth_key: z
      .string()
      .min(1)
      .max(128)
      .describe(
        'Vault key NAME (not the secret value). Per-key allow required.',
      ),
    auth_scheme: z
      .enum(['bearer', 'basic', 'header_x_api_key', 'custom'])
      .default('bearer')
      .describe(
        "How to inject the secret: bearer = 'Authorization: Bearer X'; " +
          "basic = 'Authorization: Basic base64(X)'; header_x_api_key = 'X-Api-Key: X'; " +
          'custom = use auth_header_name with raw secret value.',
      ),
    // H5 fix: enforce HTTP header name character set. Without this regex,
    // a model-supplied value containing CR/LF could inject additional
    // headers via header[name]=secret assignment in axios.
    auth_header_name: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .optional()
      .describe(
        'When auth_scheme=custom, the HTTP header name for the secret value. Must match [A-Za-z0-9_-]{1,64}.',
      ),
    body: z
      .string()
      .max(RESPONSE_BODY_CAP_BYTES)
      .optional()
      .describe('Request body'),
    body_content_type: z
      .string()
      .max(128)
      .optional()
      .describe(
        'Content-Type for the request body. Defaults to application/json.',
      ),
    reason: z
      .string()
      .min(1)
      .max(500)
      .describe(
        'Why you need this. Appears in the user permission prompt and audit log.',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    status: z.number().optional(),
    statusText: z.string().optional(),
    responseHeaders: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

// ── Helpers ──────────────────────────────────────────────────────────────────

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** Hash a key name for audit logging (avoid logging the raw key name in case
 * it's something semi-sensitive like 'github-personal-prod'). */
function hashKey(key: string): string {
  // Cheap fnv-1a, 8-hex-digit output. Not crypto, just to obfuscate the
  // key name in analytics event payloads.
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// ── Tool ─────────────────────────────────────────────────────────────────────

export const VaultHttpFetchTool = buildTool({
  name: VAULT_HTTP_FETCH_TOOL_NAME,
  searchHint: 'authenticated HTTPS request using a vault-stored secret',
  // Response cap matches axios maxContentLength; toolResultStorage will spill
  // anything larger to a file ref.
  maxResultSizeChars: RESPONSE_BODY_CAP_BYTES,
  // Vault tools are NOT concurrency safe — multiple parallel fetches racing
  // on the same vault keychain access can produce inconsistent passphrase
  // unlocks under unusual filesystems.
  isConcurrencySafe() {
    return false
  },
  // Has side effects (network), but does not modify local state.
  isReadOnly() {
    return false
  },
  toAutoClassifierInput(input) {
    const method = input.method ?? 'GET'
    const url = input.url ?? ''
    return `${method} ${url}`
  },
  // Bypass-immune: requiresUserInteraction()=true paired with
  // checkPermissions: 'ask' (when no per-key allow rule exists) ensures
  // even mode=bypassPermissions still routes to the user prompt.
  requiresUserInteraction() {
    return true
  },
  userFacingName: () => 'Vault HTTP',
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  async checkPermissions(input, context) {
    // Validate vault key name shape early — surface clear error.
    if (!isValidKey(input.vault_auth_key)) {
      return {
        behavior: 'deny',
        message: `Invalid vault_auth_key '${input.vault_auth_key}'`,
        decisionReason: { type: 'other', reason: 'invalid_key' },
      }
    }
    // Enforce HTTPS at permission time so denied schemes never reach call().
    if (!isHttps(input.url)) {
      return {
        behavior: 'deny',
        message: `Only https:// URLs are allowed (got: ${input.url})`,
        decisionReason: { type: 'other', reason: 'non_https_url' },
      }
    }
    // auth_scheme=custom requires auth_header_name.
    if (input.auth_scheme === 'custom' && !input.auth_header_name) {
      return {
        behavior: 'deny',
        message: 'auth_scheme=custom requires auth_header_name',
        decisionReason: { type: 'other', reason: 'missing_required_field' },
      }
    }

    const appState = context.getAppState()
    const permissionContext = appState.toolPermissionContext
    // C1 fix: ACL ruleContent binds vault_auth_key AND target host. A
    // persistent allow for `github-token` can no longer be used to send
    // that secret to a different origin — the model would have to ask
    // again for each new host. Format: `<key>@<host>`. Hosts are taken
    // from URL parsing and lowercased; the empty-host case is unreachable
    // (HTTPS guard above already accepted the URL).
    //
    // M2 fix (codecov-100 audit #5): the `host` property of `URL` includes
    // the port suffix when present (e.g. `api.example.com:8080`) and
    // wraps IPv6 literals in square brackets (e.g. `[::1]:8080`). Both are
    // preserved verbatim in the rule content. Two consequences worth
    // documenting:
    //
    //   1. PORTS ARE PART OF THE PERMISSION SCOPE. An allow rule for
    //      `mykey@api.example.com:8080` does NOT also allow
    //      `api.example.com:8443` — these are distinct origins per the
    //      RFC 6454 same-origin rule, and we deliberately mirror that
    //      so a model cannot pivot from a sanctioned admin port to a
    //      different one without re-asking.
    //
    //   2. IPv6 BRACKET ROUND-TRIP. `new URL('https://[::1]:8080/').host`
    //      returns `[::1]:8080` (with brackets). The `permissionRule`
    //      validator in src/utils/settings/permissionValidation.ts is
    //      configured to accept `[A-Fa-f0-9:]+` *inside brackets* and
    //      allows `:port` after, so the rule round-trips. If the
    //      validator regex is ever tightened, update this code path to
    //      strip the brackets before composing the rule.
    const targetHost = new URL(input.url).host.toLowerCase()
    const ruleContent = `${input.vault_auth_key}@${targetHost}`
    // Also offer a wildcard rule that allows any host for a given key —
    // used only when the user explicitly grants it, e.g. via the prompt
    // UI's "any host" option (not yet wired). Format: `<key>@*`.
    const wildcardRuleContent = `${input.vault_auth_key}@*`

    const denyMap = getRuleByContentsForToolName(
      permissionContext,
      VAULT_HTTP_FETCH_TOOL_NAME,
      'deny',
    )
    const denyRule =
      denyMap.get(ruleContent) ?? denyMap.get(wildcardRuleContent)
    if (denyRule) {
      return {
        behavior: 'deny',
        message: `Denied by rule: VaultHttpFetch(${denyRule.ruleValue.ruleContent ?? ruleContent})`,
        decisionReason: { type: 'rule', rule: denyRule },
      }
    }

    const allowMap = getRuleByContentsForToolName(
      permissionContext,
      VAULT_HTTP_FETCH_TOOL_NAME,
      'allow',
    )
    const allowRule =
      allowMap.get(ruleContent) ?? allowMap.get(wildcardRuleContent)
    if (allowRule) {
      return {
        behavior: 'allow',
        updatedInput: input,
        decisionReason: { type: 'rule', rule: allowRule },
      }
    }

    // No rule -> ask. Combined with requiresUserInteraction()=true above,
    // bypassPermissions mode also routes here.
    return {
      behavior: 'ask',
      message: `Allow VaultHttpFetch using key '${input.vault_auth_key}' to ${input.method ?? 'GET'} ${input.url} (host: ${targetHost})? Reason: ${input.reason}`,
      decisionReason: {
        type: 'other',
        reason: 'no_persistent_allow_for_key_host_pair',
      },
    }
  },
  async call(input: Input, _context) {
    // Defensive: enforce HTTPS at runtime (checkPermissions also enforces).
    if (!isHttps(input.url)) {
      return { data: { error: 'Only https:// URLs allowed' } }
    }

    // Retrieve secret. In-memory only; never assigned to any output field.
    let secret: string | null
    try {
      secret = await getSecret(input.vault_auth_key)
    } catch (e) {
      void e
      // H7 fix: use AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
      // pattern (per fork convention in src/bridge/bridgeMain.ts) to attest
      // the string field is safe. The hash field is non-string already.
      logEvent('vault_http_fetch_lookup_failed', {
        key_hash: hashKey(
          input.vault_auth_key,
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      return { data: { error: 'Vault unlock failed' } }
    }
    if (!secret) {
      return {
        data: {
          error: `Vault key '${input.vault_auth_key}' not found`,
        },
      }
    }

    // Build all forms of the secret that might leak so scrub catches them.
    const forms = buildDerivedSecretForms(secret)

    // Build request headers.
    const headers: Record<string, string> = {
      'User-Agent': getWebFetchUserAgent(),
    }
    // L3 fix: schema's `.default('bearer')` already injects bearer when the
    // field is undefined, so the `?? 'bearer'` fallback was dead code.
    // L5 fix: exhaustive switch via `never` assignment in default.
    const scheme = input.auth_scheme
    switch (scheme) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${secret}`
        break
      case 'basic':
        headers['Authorization'] =
          `Basic ${Buffer.from(secret, 'utf8').toString('base64')}`
        break
      case 'header_x_api_key':
        headers['X-Api-Key'] = secret
        break
      case 'custom':
        // M3 fix: explicit guard rather than `as string`. checkPermissions
        // enforces this in production but the guard keeps the type system
        // honest if the permission pipeline ever changes.
        if (!input.auth_header_name) {
          return {
            data: { error: 'auth_scheme=custom requires auth_header_name' },
          }
        }
        headers[input.auth_header_name] = secret
        break
      default: {
        // L5 fix: exhaustive guard — adding a new auth_scheme without
        // updating this switch becomes a compile-time error.
        const _exhaustive: never = scheme
        void _exhaustive
        return { data: { error: 'Unknown auth_scheme' } }
      }
    }
    if (input.body !== undefined) {
      headers['Content-Type'] = input.body_content_type ?? 'application/json'
    }

    // Audit log: record action + key hash + reason. Never log secret value.
    // M1 fix: scrub reason_first_80 (model-supplied free text could include
    // a secret-like string). H7 fix: use the project's per-field
    // AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS attestation
    // pattern instead of `as never` whole-object cast.
    logEvent('vault_http_fetch', {
      key_hash: hashKey(
        input.vault_auth_key,
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      method:
        scheme as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      url_safe: scrubAllSecretForms(
        input.url,
        forms,
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      reason_first_80: scrubAllSecretForms(
        truncateToBytes(input.reason, 80),
        forms,
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    try {
      const resp = await axios.request({
        url: input.url,
        method: input.method,
        headers,
        data: input.body,
        timeout: REQUEST_TIMEOUT_MS,
        maxContentLength: RESPONSE_BODY_CAP_BYTES,
        // No redirects: a 30x to a different origin would re-send Authorization
        // unless we strip it — and stripping is fragile. Refuse to follow.
        maxRedirects: 0,
        // Don't throw on 4xx/5xx; the body still needs scrubbing in those
        // success-path responses.
        validateStatus: () => true,
        // Avoid axios trying to transform / parse JSON; we want to scrub the
        // raw body first.
        transformResponse: [(data: unknown) => data],
        responseType: 'text',
      })

      // Body might be a Buffer when Content-Type is binary; coerce safely.
      const rawBody =
        typeof resp.data === 'string'
          ? resp.data
          : resp.data == null
            ? ''
            : String(resp.data)

      return {
        data: {
          status: resp.status,
          statusText: resp.statusText,
          responseHeaders: scrubResponseHeaders(resp.headers, forms),
          body: scrubAllSecretForms(rawBody, forms),
        },
      }
    } catch (e) {
      return { data: { error: scrubAxiosError(e, forms) } }
    }
  },
  renderToolUseMessage,
  renderToolResultMessage,
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: jsonStringify(output),
      is_error: output.error !== undefined,
    }
  },
} satisfies ToolDef<InputSchema, Output>)

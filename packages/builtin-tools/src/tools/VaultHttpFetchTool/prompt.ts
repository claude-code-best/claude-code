export const DESCRIPTION =
  "Make an authenticated HTTPS request using a secret stored in the user's " +
  'encrypted local vault (~/.claude/local-vault/). You only specify the vault ' +
  'key NAME — never the secret value. The tool framework injects the secret ' +
  'directly into a request header and the secret is NEVER returned in tool_result, ' +
  'NEVER logged, NEVER passed to a shell. ' +
  'Each vault key requires user pre-approval via permissions.allow: ' +
  "['VaultHttpFetch(key-name)']. Whole-tool allow ('VaultHttpFetch' without " +
  'parentheses) is rejected at settings parse time.'

export const PROMPT = `VaultHttpFetch — authenticated HTTPS request with a vault-stored secret.

Use for: HTTP API calls that need a Bearer token, Basic auth, X-Api-Key, or
custom auth header. GitHub API, Stripe API, internal service auth, etc.

Do NOT use for: shell commands needing secrets (git push, npm publish, ssh,
docker login). Those are out of scope; the user must handle them externally.

Request schema:
  url             https:// only (HTTP/file/ftp rejected)
  method          GET (default), POST, PUT, PATCH, DELETE
  vault_auth_key  the vault key name (the secret value is fetched by the tool)
  auth_scheme     bearer (default), basic, header_x_api_key, custom
  auth_header_name when auth_scheme=custom, the HTTP header to use
  body            request body (string; sent as-is)
  body_content_type  defaults to application/json when body is set
  reason          why you need this — appears in the user's permission prompt

Response: { status, statusText, responseHeaders (sensitive headers redacted),
  body (scrubbed of any secret-derived strings), or error }

Permission model:
  Default: ask (user prompt). Approving once for a key sets a per-key allow
  the user can persist via the prompt UI. Whole-tool allow is forbidden.

Always pass \`reason\` truthfully. The secret never appears in your context;
the URL, method, key NAME, and reason all do appear in the transcript.
`

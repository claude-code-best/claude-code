# Browser Provider and Model Management Design

Date: 2026-07-14
Status: Draft for user review
Scope: Remote Control browser UI, RCS persistence/control plane, local Worker provider runtime

## 1. Objective

Expose the project's existing provider, authentication, and custom-model capabilities in the browser while preserving the current authentication implementations and their local security boundaries.

The finished system must let a user:

1. View every provider and authentication method supported by the current CLI.
2. Add, edit, validate, enable, archive, and save provider profiles and model profiles from the browser.
3. Choose one default enabled model for each runtime environment.
4. Create new conversations using the environment default that existed at creation time.
5. Switch an existing conversation among any enabled models available to its runtime environment.
6. Preserve each conversation's last successfully applied provider/model selection across browser reloads, RCS restarts, Worker restarts, and session reconnection.
7. Keep old conversations on their previous model when the environment default changes.
8. Avoid storing or returning raw provider credentials in RCS.

## 2. Non-goals

This design does not:

- Replace the existing Claude, ChatGPT, API-key, helper, AWS, GCP, or Azure authentication implementations.
- Move cloud credential chains or operating-system keychains into RCS.
- Allow browser configuration to bypass managed `availableModels` or host-managed provider policy.
- Change an in-flight model request. A switch applies only at a request boundary.
- Guarantee that an archived or provider-removed remote model remains callable forever. The system preserves the selection and reports availability failures without silently substituting another model.
- Make a single provider default global across different machines. Defaults are environment-scoped because credentials and endpoints are environment-local.

## 3. Current State and Gaps

The browser already has an end-to-end `set_model` control path. `RCSChatAdapter` can send an arbitrary model string and the REPL bridge can apply it to the current session. The visible browser selector, however, is hard-coded to `default`, `opus`, `sonnet`, and `haiku`.

The provider page is currently read-only. It consumes a bootstrap capability snapshot and displays only OpenAI-compatible registry entries plus a Boolean `key_configured` flag. It cannot create profiles, run a provider-specific validation, change the active provider, or set a default.

The current provider registry schema is an array of `openai-compat` entries. It cannot represent native Anthropic, ChatGPT OAuth, Gemini, Grok, Bedrock, Vertex, Foundry, multiple models per provider, authentication sources, or an environment default.

RCS Session persistence does not contain a provider/model selection. New-session requests and Work Items do not carry a selection, so browser-local storage alone cannot restore a model after a Worker restart.

Provider routing and model choice currently depend on several mutable sources: settings, environment variables, session overrides, provider registry entries, and cached clients/model strings. Cross-provider switching must therefore use a single runtime activation service that also owns cache invalidation.

## 4. Considered Approaches

### 4.1 Browser-local catalog and default

Store profiles and defaults in `localStorage`, then call the existing `set_model` control.

Rejected because it is browser-specific, cannot restore a restarted Worker, cannot establish a server-side new-session default, and cannot safely perform cross-provider activation.

### 4.2 RCS owns profiles and credentials

Store provider definitions, defaults, session selections, OAuth tokens, and API keys centrally in RCS.

Rejected because it expands the credential blast radius, cannot faithfully model operating-system keychains or cloud default credential chains, and creates a second authentication implementation.

### 4.3 Hybrid local authority with RCS session persistence

The local Worker owns provider profiles, authentication references, validation, and runtime activation. RCS caches a redacted environment catalog and persists the default reference plus per-session model snapshots. The browser is the management and control UI.

Selected because it preserves current authentication behavior, supports multi-machine environments, prevents cross-session leakage, and can restore session state after restarts.

## 5. State Model and Source of Truth

The system has three separate model states.

### 5.1 Environment default

Each environment has at most one `defaultModelRef`. It is stored in the local provider configuration and reported to RCS with the redacted catalog.

Changing this value affects only sessions created after the change. It never mutates existing Session records.

### 5.2 Persisted session selection

At session creation, RCS resolves the environment default and copies a provider/model snapshot into the Session record. This makes the session independent of future default changes.

After a successful session-level switch, the Session record is updated to the newly applied snapshot.

### 5.3 Active runtime selection

The active CLI child reports the provider and resolved model it actually applied. This is the authoritative runtime acknowledgement. RCS updates the persisted Session only after this acknowledgement.

The effective selection precedence is:

1. Last successfully acknowledged Session selection.
2. Best-effort model recovered from legacy Session history.
3. Environment default copied at session creation or first legacy recovery.
4. Existing CLI default resolution.

Browser `localStorage` is not a source of truth. It retains only UI preferences such as search text or a collapsed section.

## 6. Configuration Model

### 6.1 Provider configuration file

Evolve `~/.claude/providers.json` to a backward-compatible versioned document.

```ts
interface ProviderConfigurationV2 {
  version: 2
  revision: number
  defaultModel: ModelRef | null
  providers: ProviderProfile[]
}
```

The loader accepts both:

- The legacy array of OpenAI-compatible providers.
- The v2 object.

Legacy input is migrated in memory. The file is rewritten as v2 only after an explicit successful browser or CLI save. Writes remain atomic.

### 6.2 Provider profile

```ts
type ProviderKind =
  | 'anthropic'
  | 'anthropic-compatible'
  | 'openai-compatible'
  | 'chatgpt'
  | 'gemini'
  | 'grok'
  | 'bedrock'
  | 'vertex'
  | 'foundry'

interface ProviderProfile {
  id: string
  displayName: string
  kind: ProviderKind
  baseUrl?: string
  auth: AuthReference
  compatRule?: string
  enabled: boolean
  archived: boolean
  models: ModelProfile[]
}
```

Provider IDs are stable identifiers. Renaming a display name does not change the ID.

Chinese-provider presets are stored as OpenAI-compatible profiles with preset endpoint, compatibility, and model suggestions. They do not require a separate runtime protocol.

### 6.3 Authentication reference

```ts
type AuthScheme =
  | 'oauth'
  | 'api-key'
  | 'bearer'
  | 'aws-iam'
  | 'gcp-adc'
  | 'azure-ad'
  | 'proxy'

type AuthSource =
  | 'secure-storage'
  | 'settings'
  | 'environment'
  | 'helper'
  | 'cloud-chain'

interface AuthReference {
  scheme: AuthScheme
  source: AuthSource
  envName?: string
}
```

The local file stores only an authentication reference. OAuth tokens, API keys, helper output, and cloud credentials remain in the existing storage/source for that method.

The redacted catalog adds runtime status such as `configured`, `expiresAt`, and `lastErrorCode`; these values are reported capabilities and are not persisted secrets.

### 6.4 Model profile

```ts
interface ModelProfile {
  id: string
  displayName: string
  remoteModelId: string
  enabled: boolean
  archived: boolean
  aliases?: string[]
  capabilities?: {
    tools?: boolean
    vision?: boolean
    thinking?: boolean
    contextWindow?: number
    maxOutputTokens?: number
  }
  validation: {
    status: 'unverified' | 'valid' | 'invalid'
    checkedAt?: number
    errorCode?: string
  }
}
```

Model IDs are stable within a Provider profile. `remoteModelId` is the exact value sent to the provider.

Models can be added from:

1. A provider model-list API when supported.
2. Built-in suggestions.
3. Manual entry of any model ID.

Manual entry is always available. Discovery failure does not prevent saving an unverified model.

### 6.5 Model reference and Session snapshot

```ts
interface ModelRef {
  providerId: string
  modelProfileId: string
}

interface SessionModelSelection {
  providerId: string
  modelProfileId: string
  resolvedModelId: string
  providerConfigRevision: number
  updatedAt: number
}
```

`resolvedModelId` is copied into the Session to preserve the actual model selected at creation or last switch. Editing a Model profile later does not silently rewrite old conversations. A Session moves to the edited profile definition only after the user selects that model again from the Session selector.

Provider authentication and endpoint changes are not copied into the Session because credential rotation and security fixes must remain current.

## 7. Supported Provider and Authentication UI

The browser Provider wizard exposes the same user-facing choices as the current login/provider flows:

- Claude subscription OAuth.
- Anthropic Console/API key.
- Anthropic-compatible endpoint.
- OpenAI-compatible endpoint.
- ChatGPT subscription/device OAuth.
- Gemini API.
- Grok API.
- Amazon Bedrock.
- Google Vertex AI.
- Microsoft Foundry.
- Chinese-provider presets.
- Fully custom compatible provider.

The wizard steps are:

1. Select runtime environment.
2. Select provider kind or preset.
3. Configure endpoint fields supported by that provider.
4. Select and complete an existing authentication method.
5. Add models by discovery, suggestion, or manual ID.
6. Validate and save.
7. Optionally mark one enabled model as the environment default.

The browser invokes the existing local authentication implementation through structured Worker commands. It does not duplicate token exchange, refresh, credential-chain, or secure-storage code.

### 7.1 OAuth

The Worker starts the existing OAuth/device flow and returns only authorization URLs, device codes, sanitized progress, and final status. Tokens are stored locally by the existing implementation and are never returned to the browser or RCS.

### 7.2 API keys and bearer tokens

Secrets must not be sent as chat messages or ordinary logged control payloads.

A dedicated secret-control exchange is used:

1. The Worker advertises a short-lived recipient key and operation ID.
2. The browser encrypts the secret for that Worker.
3. RCS relays ciphertext without logging or persistence.
4. The Worker decrypts it in memory and calls the current provider-specific save path.
5. The response contains only status and redacted metadata.

The secret exchange uses ephemeral P-256 ECDH keys, HKDF-SHA-256, and AES-256-GCM, implemented through browser WebCrypto and the corresponding Worker crypto API. The operation ID and environment ID are authenticated as additional data. Recipient keys expire after five minutes, are valid for one successful operation, and are deleted after success, failure, or expiry. The browser sends its ephemeral public key, IV, ciphertext, operation ID, and expiry; RCS never receives material that can derive the shared key. Protocol test vectors, replay tests, expiry tests, and log-redaction tests must pass before browser secret entry is enabled.

### 7.3 AWS, GCP, and Azure

The browser reports and refreshes existing AWS profile/STS, Google ADC, and Azure credential-chain state. It can invoke only already-configured, allowlisted authentication refresh actions. It cannot submit arbitrary shell commands.

### 7.4 Host and enterprise policy

Host-managed provider variables and managed settings remain authoritative. Managed profiles are rendered read-only. Browser model selection must call the existing allowlist check before validation or activation.

## 8. Browser Provider Page

The page begins with an environment selector because profiles and credentials are local to a runtime environment.

The page contains:

1. A default-model summary with provider, model, validation status, and a statement that changes affect new sessions only.
2. Provider cards with protocol, endpoint, authentication source/status, enabled model count, compatibility rule, and last validation result.
3. An expandable model table with default marker, display name, remote model ID, capabilities, enabled state, and validation state.
4. Actions to add, edit, validate, enable, disable, archive, authenticate, reauthenticate, and set default.

Provider or Model profiles referenced by Sessions are soft-archived rather than physically deleted. Archived entries are hidden from new selections but remain resolvable for old Sessions.

Exactly zero or one enabled model may be the environment default. Disabling or archiving the current default requires selecting a replacement or explicitly leaving the environment without a browser-managed default.

Saving an unverified model is allowed. An invalid model cannot be set as default. An unverified model can be set as default only after an explicit warning confirmation.

## 9. New Session Behavior

New-session APIs resolve the default on the server/Worker boundary rather than trusting a browser-local value. This ensures non-browser clients and refreshed browser tabs receive identical behavior.

The creation flow is:

1. The browser chooses an environment and creates the Session.
2. RCS reads the latest redacted catalog/default for that environment.
3. RCS copies a `SessionModelSelection` snapshot into the new Session record in the same logical operation.
4. The Work Item carries the selection to the Worker.
5. The Worker resolves the local Provider profile, builds a per-child environment overlay, and spawns the CLI with the exact model.
6. The CLI emits its actual provider/model in initialization metadata.
7. RCS reconciles the acknowledged value with the Session snapshot.

The new-session dialog shows the resolved default but does not need another full model selector in the first release. The user can switch immediately from the Session page.

Changing an environment default never performs a bulk Session update.

## 10. Session Model Selection

The Session control bar replaces the hard-coded four-item menu with a searchable, provider-grouped selector populated from the Session environment's redacted catalog.

Only enabled, non-archived, policy-allowed models appear as selectable. The current historical selection remains visible even if it later becomes archived or unavailable.

Selection uses a structured control request:

```ts
interface SetSessionModelRequest {
  providerId: string
  modelProfileId: string
  expectedProviderConfigRevision: number
  operationId: string
}
```

The sequence is:

1. RCS verifies Session ownership and environment binding.
2. The Worker verifies that the revision and target profile exist locally.
3. The Worker validates policy and authentication readiness.
4. The child runtime applies an immutable Provider/Model runtime snapshot at the next request boundary.
5. The child emits `model_changed` with the actual provider and resolved model.
6. RCS persists the new Session selection only after the acknowledgement.
7. The browser updates the selected item after receiving the authoritative event.

Switching is disabled while a response is actively streaming. This prevents the main request, tools, side queries, or subagents in one turn from observing different Provider snapshots.

If activation fails, the old runtime and Session record remain unchanged. The response uses structured error codes such as:

- `provider_not_found`
- `model_not_found`
- `authentication_required`
- `authentication_failed`
- `model_not_allowed`
- `endpoint_unreachable`
- `protocol_incompatible`
- `stale_provider_revision`
- `runtime_switch_failed`

## 11. Runtime Activation

A new Provider Runtime service is the only component allowed to turn a Provider/Model selection into request configuration.

It must:

1. Resolve the Provider profile and exact Session model snapshot.
2. Build provider-specific client options without relying on ambient primary-model environment overrides.
3. Apply compatibility rules in the production request builder.
4. Invalidate or replace OpenAI/Grok client instances, model-string caches, capability caches, and other provider-derived memoized state.
5. Publish an immutable runtime configuration revision.
6. Leave the previous runtime active if any activation step fails.

Each RCS Session already runs in an isolated child CLI process. Provider switching therefore mutates only that Session child and cannot change sibling Sessions.

At spawn time, the bridge parent builds a per-child environment overlay and passes the selected model explicitly. It must not mutate the parent process provider state as a side effect.

## 12. RCS Persistence and Protocol Changes

### 12.1 Session persistence

Add typed Session fields equivalent to:

- `modelProviderId`
- `modelProfileId`
- `modelResolvedId`
- `modelConfigRevision`
- `modelUpdatedAt`

The SQLite migration is additive and nullable. Existing Session rows remain valid.

### 12.2 Work contract

Extend Session Work data with the persisted model selection. A reconnect or Worker restart therefore spawns the same selection rather than consulting the current environment default.

### 12.3 Environment capabilities

Add a redacted, revisioned capability:

```ts
interface ProviderModelCatalogCapability {
  version: 1
  revision: number
  defaultModel: ModelRef | null
  providers: RedactedProviderProfile[]
}
```

The Worker re-reports this capability on reconnect and after every acknowledged profile/default change.

### 12.4 Structured commands and events

Add environment commands for:

- `get_provider_catalog`
- `save_provider_profile`
- `archive_provider_profile`
- `save_model_profile`
- `archive_model_profile`
- `set_default_model`
- `validate_provider_model`
- `begin_provider_auth`
- `remove_provider_auth`

Add session control for `set_session_model` and events for:

- `provider_catalog_changed`
- `provider_auth_changed`
- `default_model_changed`
- `session_model_changing`
- `session_model_changed`
- `session_model_change_failed`

All mutations include an idempotent operation ID and an expected revision.

## 13. Concurrency and Reconciliation

Provider configuration uses optimistic concurrency.

- The browser submits `expectedRevision`.
- A stale edit returns a conflict and the latest redacted catalog.
- A successful local atomic write increments the revision exactly once.
- RCS updates its cache only from a Worker acknowledgement.

Session switching also uses operation IDs. Duplicate delivery returns the original result without applying the switch twice.

If the child applied a model but RCS failed before persisting it, the next initialization or `session_model_changed` event reconciles the Session to the actual runtime. RCS never invents an acknowledgement based only on the browser request.

If RCS has a Session selection that is absent from a newly reported catalog, the selection is retained and marked unavailable. It is not replaced with the new default.

## 14. Legacy Migration

### 14.1 Provider configuration

Legacy OpenAI-compatible registry entries become Provider profiles with one Model profile derived from `defaultModel`. Existing environment-key references and compatibility rules are preserved.

Existing settings/env login configurations are exposed as detected profiles. They are not copied to a different secret store.

### 14.2 Existing Sessions

For a Session with no persisted structured selection:

1. Inspect the latest persisted `system/init` model.
2. Match it to a reported Provider/Model profile when unambiguous.
3. Otherwise create an in-memory legacy selection that preserves the raw model ID.
4. Persist a structured selection only after an unambiguous recovery or the user's first successful switch.

The migration never silently assigns the current environment default to a historical Session that reported a different model.

## 15. Backward Compatibility

Workers advertise:

- `provider_model_catalog_v1`
- `session_model_persistence_v1`
- `provider_runtime_switch_v1`

With an older Worker:

- The Provider page remains read-only.
- The Session page falls back to the current alias selector and legacy `set_model` request.
- Cross-provider switching is disabled.
- Existing sessions and commands continue working.

The CLI continues accepting legacy string-only `set_model` controls. The new structured control is additive.

## 16. Security Requirements

1. RCS database rows, event history, logs, error messages, analytics, and capability payloads contain no raw provider secret.
2. Browser secret fields are never cached in local storage, form history controlled by the app, or error telemetry.
3. Secret-control ciphertext is single-use, short-lived, bound to environment and operation ID, and replay-protected.
4. OAuth tokens never pass through RCS.
5. Cloud refresh commands are preconfigured and allowlisted; the browser cannot supply a command string.
6. Managed provider policy and `availableModels` are checked before validation and activation.
7. Base URLs are validated and requests are made by the local Worker, not RCS. Existing proxy and enterprise routing rules remain effective.
8. All displayed authentication values are redacted metadata only.

## 17. Test Strategy

### 17.1 Unit tests

- Legacy provider array to v2 migration.
- v2 schema validation and atomic save.
- Stable Provider/Model IDs and soft archive semantics.
- Default must reference an enabled, non-invalid model.
- Session snapshot serialization and precedence.
- Provider revision conflicts and idempotent operation IDs.
- Managed model allowlist enforcement.
- Error and capability redaction.
- Runtime snapshot construction without ambient primary-model override leakage.
- Provider-specific cache replacement and rollback.

### 17.2 Integration tests

- Add each supported provider kind and save one or more models.
- Complete or detect each existing authentication method.
- Set an environment default and create a Session.
- Change the default and confirm existing Sessions are unchanged.
- Switch a Session within one Provider and across Providers.
- Reload the browser and retain the selection.
- Restart RCS and retain the selection.
- Restart/reconnect the Worker and spawn the same selection.
- Fail authentication, validation, or activation and retain the old runtime.
- Archive a selected model and keep historical Session display/recovery.
- Use two environments with different catalogs/defaults.
- Race two browser edits and return a revision conflict.

### 17.3 End-to-end acceptance flow

1. Add an OpenAI-compatible Provider through the browser.
2. Add two custom remote model IDs.
3. Authenticate without exposing the key to RCS persistence or logs.
4. Validate both models and set the first as environment default.
5. Create a Session and verify its first request uses the first model.
6. Switch the Session to the second model and verify the next request uses it.
7. Change the environment default.
8. Reload the browser, restart RCS, and reconnect the Worker.
9. Verify the old Session still uses the second model.
10. Create another Session and verify it uses the new default.

## 18. Delivery Sequence

### Phase 1: Domain and migration foundation

- Add v2 Provider configuration types and legacy loader.
- Add Session model persistence fields and SQLite migration.
- Add redacted catalog and Session selection types.
- Add revision, idempotency, and soft-archive rules.

### Phase 2: Local Provider service and protocols

- Implement Provider/Profile CRUD behind a single local service.
- Implement redacted capability reporting and environment commands.
- Reuse current auth implementations through structured commands.
- Add exact Provider/Model validation.
- Add secret-control protocol with security tests.

### Phase 3: Runtime activation

- Implement immutable Provider runtime snapshots.
- Wire compatibility rules into production request building.
- Replace or invalidate provider-derived clients and caches.
- Add structured cross-provider Session switch and rollback.
- Add model-change acknowledgement events.

### Phase 4: RCS lifecycle persistence

- Copy environment default into new Sessions.
- Extend Work Items and bridge spawn options.
- Restore Session selection after reconnect/restart.
- Reconcile runtime acknowledgement with Session persistence.
- Add legacy Session recovery.

### Phase 5: Browser management UI

- Replace read-only Provider cards with environment-scoped CRUD.
- Add provider/authentication wizard and model discovery/manual entry.
- Add validation, enable/archive, and default actions.
- Add revision-conflict and structured-error UX.

### Phase 6: Browser Session UI

- Replace hard-coded aliases with searchable provider-grouped models.
- Show historical/unavailable selections.
- Disable switching during an active stream.
- Persist only after authoritative acknowledgement.
- Display the resolved default in the new-session dialog.

### Phase 7: Hardening and rollout

- Complete unit, integration, migration, and end-to-end suites.
- Run secret-leak scans against API responses, event history, logs, and database state.
- Verify old-Worker fallbacks.
- Roll out behind capability checks and a feature flag before making v2 writes the default.

## 19. Acceptance Criteria

The feature is complete only when all of the following hold:

- Every currently supported provider/authentication path is represented in the browser.
- A user can save multiple custom models under a Provider.
- Each environment can select one default enabled model.
- New Sessions copy the current environment default.
- Default changes do not mutate existing Sessions.
- A Session can switch among enabled, policy-allowed models across Providers.
- A successful switch survives browser, RCS, and Worker restarts.
- A failed switch leaves runtime and persisted Session state unchanged.
- Historical Sessions retain their last model reference even after archive or catalog changes.
- Sibling Sessions are unaffected by a Provider/model switch.
- No raw provider secret is persisted, logged, or returned by RCS.
- Older Workers continue operating with the legacy selector and controls.

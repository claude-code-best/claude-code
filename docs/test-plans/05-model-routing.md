# Model Routing Test Plan

## Overview

The model routing system is responsible for API provider selection, model alias resolution, model name normalization, and runtime model decisions. The testing focus is on pure functions and environment-variable-driven logic.

## Files Under Test

| File | Key Exports |
|------|-------------|
| `src/utils/model/aliases.ts` | `MODEL_ALIASES`, `MODEL_FAMILY_ALIASES`, `isModelAlias`, `isModelFamilyAlias` |
| `src/utils/model/providers.ts` | `APIProvider`, `getAPIProvider`, `isFirstPartyAnthropicBaseUrl` |
| `src/utils/model/model.ts` | `firstPartyNameToCanonical`, `getCanonicalName`, `parseUserSpecifiedModel`, `normalizeModelStringForAPI`, `getRuntimeMainLoopModel`, `getDefaultMainLoopModelSetting` |

---

## Test Cases

### src/utils/model/aliases.ts

#### describe('isModelAlias')

- test('returns true for "sonnet"') — Valid alias
- test('returns true for "opus"')
- test('returns true for "haiku"')
- test('returns true for "best"')
- test('returns true for "sonnet[1m]"')
- test('returns true for "opus[1m]"')
- test('returns true for "opusplan"')
- test('returns false for full model ID') — `'claude-sonnet-4-6-20250514'` → false
- test('returns false for unknown string') — `'gpt-4'` → false
- test('is case-sensitive') — `'Sonnet'` → false (aliases are lowercase)

#### describe('isModelFamilyAlias')

- test('returns true for "sonnet"')
- test('returns true for "opus"')
- test('returns true for "haiku"')
- test('returns false for "best"') — best is not a family alias
- test('returns false for "opusplan"')
- test('returns false for "sonnet[1m]"')

---

### src/utils/model/providers.ts

#### describe('getAPIProvider')

- test('returns "firstParty" by default') — Returns firstParty when no relevant env vars are set
- test('returns "bedrock" when CLAUDE_CODE_USE_BEDROCK is set') — Env is a truthy value
- test('returns "vertex" when CLAUDE_CODE_USE_VERTEX is set')
- test('returns "foundry" when CLAUDE_CODE_USE_FOUNDRY is set')
- test('bedrock takes precedence over vertex') — Bedrock takes priority when multiple env vars are set simultaneously

#### describe('isFirstPartyAnthropicBaseUrl')

- test('returns true when ANTHROPIC_BASE_URL is not set') — Default API
- test('returns true for api.anthropic.com') — `'https://api.anthropic.com'` → true
- test('returns false for custom URL') — `'https://my-proxy.com'` → false
- test('returns false for invalid URL') — Invalid URL → false
- test('returns true for staging URL when USER_TYPE is ant') — `'https://api-staging.anthropic.com'` + ant → true

---

### src/utils/model/model.ts

#### describe('firstPartyNameToCanonical')

- test('maps opus-4-6 full name to canonical') — `'claude-opus-4-6-20250514'` → `'claude-opus-4-6'`
- test('maps sonnet-4-6 full name') — `'claude-sonnet-4-6-20250514'` → `'claude-sonnet-4-6'`
- test('maps haiku-4-5') — `'claude-haiku-4-5-20251001'` → `'claude-haiku-4-5'`
- test('maps 3P provider format') — `'us.anthropic.claude-opus-4-6-v1:0'` → `'claude-opus-4-6'`
- test('maps claude-3-7-sonnet') — `'claude-3-7-sonnet-20250219'` → `'claude-3-7-sonnet'`
- test('maps claude-3-5-sonnet') → `'claude-3-5-sonnet'`
- test('maps claude-3-5-haiku') → `'claude-3-5-haiku'`
- test('maps claude-3-opus') → `'claude-3-opus'`
- test('is case insensitive') — `'Claude-Opus-4-6'` → `'claude-opus-4-6'`
- test('falls back to input for unknown model') — `'unknown-model'` → `'unknown-model'`
- test('differentiates opus-4 vs opus-4-5 vs opus-4-6') — More specific versions match first

#### describe('parseUserSpecifiedModel')

- test('resolves "sonnet" to default sonnet model')
- test('resolves "opus" to default opus model')
- test('resolves "haiku" to default haiku model')
- test('resolves "best" to best model')
- test('resolves "opusplan" to default sonnet model') — opusplan defaults to sonnet
- test('appends [1m] suffix when alias has [1m]') — `'sonnet[1m]'` → model name + `'[1m]'`
- test('preserves original case for custom model names') — `'my-Custom-Model'` case preserved
- test('handles [1m] suffix on non-alias models') — `'custom-model[1m]'` → `'custom-model[1m]'`
- test('trims whitespace') — `'  sonnet  '` → parsed correctly

#### describe('getRuntimeMainLoopModel')

- test('returns mainLoopModel by default') — Returns as-is when no special conditions
- test('returns opus in plan mode when opusplan is set') — opusplan + plan mode → opus
- test('returns sonnet in plan mode when haiku is set') — haiku + plan mode → upgraded to sonnet
- test('returns mainLoopModel in non-plan mode') — No replacement in non-plan mode

---

## Mock Requirements

| Dependency | Mock Approach | Notes |
|------------|---------------|-------|
| `process.env.CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY` | Set/restore directly | Provider selection |
| `process.env.ANTHROPIC_BASE_URL` | Set/restore directly | URL detection |
| `process.env.USER_TYPE` | Set/restore directly | Staging URL and ant features |
| `getModelStrings()` | mock.module | Returns fixed model IDs |
| `getMainLoopModelOverride` | mock.module | In-session model override |
| `getSettings_DEPRECATED` | mock.module | Model from user settings |
| `getUserSpecifiedModelSetting` | mock.module | `getRuntimeMainLoopModel` dependency |
| `isModelAllowed` | mock.module | Allowlist check |

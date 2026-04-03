# DEV-LOG

## WebSearch Bing Adapter Implementation (2026-04-03)

The original `WebSearchTool` only supported Anthropic API server-side search (`web_search_20250305` server tool), making the search feature unavailable on unofficial API endpoints (third-party proxies). This change introduces an adapter architecture with Bing search page parsing as a fallback.

**New files:**

| File | Description |
|------|-------------|
| `src/tools/WebSearchTool/adapters/types.ts` | Adapter interface definitions: `WebSearchAdapter`, `SearchResult`, `SearchOptions`, `SearchProgress` |
| `src/tools/WebSearchTool/adapters/apiAdapter.ts` | API adapter — wraps the existing `queryModelWithStreaming` logic into `ApiSearchAdapter` |
| `src/tools/WebSearchTool/adapters/bingAdapter.ts` | Bing adapter — directly scrapes Bing HTML, extracts search results via regex |
| `src/tools/WebSearchTool/adapters/index.ts` | Adapter factory — selects backend based on environment variables / API Base URL |
| `src/tools/WebSearchTool/__tests__/bingAdapter.test.ts` | Bing adapter unit tests (32 cases: decodeHtmlEntities, extractBingResults, search mock) |
| `src/tools/WebSearchTool/__tests__/bingAdapter.integration.ts` | Bing adapter integration tests — real network request validation |

**Refactored files:**

| File | Changes |
|------|---------|
| `src/tools/WebSearchTool/WebSearchTool.ts` | Changed from direct API calls to `createAdapter()` factory pattern; `isEnabled()` always returns true; removed ~200 lines of inline API call logic |
| `src/tools/WebFetchTool/utils.ts` | `skipWebFetchPreflight` default changed from `!undefined` (i.e., true) to explicit `=== false`, enabling domain preflight checks by default |

**Bing adapter key technical details:**

1. **Anti-scraping bypass**: Uses full Edge browser request headers (including 13 headers like `Sec-Ch-Ua`, `Sec-Fetch-*`, etc.) to prevent Bing from returning JS-rendered empty pages; `setmkt=en-US` parameter forces US English market to avoid IP geolocation-based regional results (German forums, Singapore gold prices, etc.)
2. **URL decoding** (`resolveBingUrl()`): Bing's redirect URLs (`bing.com/ck/a?...&u=a1aHR0cHM6Ly9...`) contain base64-encoded real URLs in the `u` parameter that need to be decoded before use
3. **Snippet extraction** (`extractSnippet()`): Three-tier fallback strategy — `b_lineclamp` → `b_caption <p>` → `b_caption` direct text
4. **HTML entity decoding** (`decodeHtmlEntities()`): Handles 7 common HTML entities
5. **Domain filtering**: Client-side `allowedDomains` / `blockedDomains` filtering with subdomain matching support

**Current status**: `createAdapter()` in `adapters/index.ts` is hardcoded to return `BingSearchAdapter`, skipping the API/Bing auto-selection logic (original logic preserved in comments). Auto-selection can be restored by uncommenting in the future.

---

## Anti-Distillation Mechanism Removal (2026-04-02)

Found three anti-distillation related code sections in the project — all removed.

**Removed content:**
- `src/services/api/claude.ts` — Removed fake_tools injection logic (originally lines 302-314). This code injected `anti_distillation: ['fake_tools']` into API requests via the `ANTI_DISTILLATION_CC` feature flag, causing the server to mix in fake tool calls in responses to pollute distillation data
- `src/utils/betas.ts` — Removed connector-text summarization beta injection block and `SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER` import. This mechanism had the server buffer assistant text between tool calls and return it in summarized form
- `src/constants/betas.ts` — Removed `SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER` constant definition (originally lines 23-25)
- `src/utils/streamlinedTransform.ts` — Changed comment from "distillation-resistant" to "compact". The streamlined mode itself is a valid output compression feature; only the description was corrected

---

## Buddy Command Merge + Feature Flag Convention Fix (2026-04-02)

Merged `pr/smallflyingpig/36` branch (buddy command support + rehatch fix) and fixed feature flag usage patterns.

**Merged content (from PR):**
- `src/commands/buddy/buddy.ts` — New `/buddy` command supporting hatch / rehatch / pet / mute / unmute subcommands
- `src/commands/buddy/index.ts` — Changed from stub to proper `Command` type export
- `src/buddy/companion.ts` — Added `generateSeed()`, `getCompanion()` supports seed-driven reproducible rolling
- `src/buddy/types.ts` — Added `seed?` field to `CompanionSoul`

**Post-merge fixes:**
- `src/entrypoints/cli.tsx` — PR had hardcoded `const feature = (name) => name === "BUDDY"`, violating feature flag conventions. Restored to standard `import { feature } from 'bun:bundle'`
- `src/commands.ts` — PR used static `import buddy` to bypass feature gate. Restored to `feature('BUDDY') ? require(...) : null` + conditional spread
- `src/commands/buddy/buddy.ts` — Removed unused `companionInfoText` function and unnecessary `Roll`/`SPECIES` imports
- `CLAUDE.md` — Rewrote Feature Flag System section with clear conventions: use `import { feature } from 'bun:bundle'` in code, enable via `FEATURE_<NAME>=1` environment variable

**Usage:** `FEATURE_BUDDY=1 bun run dev`

---

## Auto Mode Completion (2026-04-02)

Decompilation lost three prompt template files for the auto mode classifier. Code logic was complete but couldn't run.

**Added:**
- `yolo-classifier-prompts/auto_mode_system_prompt.txt` — Main system prompt
- `yolo-classifier-prompts/permissions_external.txt` — External permissions template (user rules replace defaults)
- `yolo-classifier-prompts/permissions_anthropic.txt` — Internal permissions template (user rules appended)

**Changes:**
- `scripts/dev.ts` + `build.ts` — Scan `FEATURE_*` environment variables and inject as Bun `--feature` flags
- `cli.tsx` — Print enabled features on startup
- `permissionSetup.ts` — `AUTO_MODE_ENABLED_DEFAULT` determined by `feature('TRANSCRIPT_CLASSIFIER')`. Enabling the feature enables auto mode
- `docs/safety/auto-mode.mdx` — Added prompt template section

**Usage:** `FEATURE_TRANSCRIPT_CLASSIFIER=1 bun run dev`

**Note:** Prompt templates are reconstructed artifacts.

---

## USER_TYPE=ant TUI Fix (2026-04-02)

Global functions declared in `global.d.ts` were undefined at runtime in the decompiled version, causing TUI crashes when `USER_TYPE=ant`.

Fix approach: explicit imports / local stubs / global stubs / new stub files. Files involved:
`cli.tsx`, `model.ts`, `context.ts`, `effort.ts`, `thinking.ts`, `undercover.ts`, `Spinner.tsx`, `AntModelSwitchCallout.tsx` (new), `UndercoverAutoCallout.tsx` (new)

Notes:
- `USER_TYPE=ant` enables alt-screen fullscreen mode; the centered fullscreen area is expected behavior
- Remaining un-stubbed global functions in `global.d.ts` (`getAntModels`, etc.) should be handled with the same pattern when encountering `X is not defined` errors

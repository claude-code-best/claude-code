# Testing Specification

This document defines the testing specification, current coverage status, and improvement plan for the claude-code project.

## 1. Tech Stack

| Item | Choice |
|------|--------|
| Test framework | `bun:test` |
| Assertions/Mock | `bun:test` built-in |
| Coverage | `bun test --coverage` |
| CI | GitHub Actions, auto-run on push/PR to main |

## 2. Test Layers

This project uses a **unit test + integration test** two-layer structure; no E2E or snapshot tests.

- **Unit tests** — Pure functions, utility classes, parsers. Files placed alongside source in `src/**/__tests__/`.
- **Integration tests** — Multi-module collaboration flows. Centralized in `tests/integration/`.

## 3. File Structure and Naming

```
src/
├── utils/__tests__/           # Pure function unit tests
├── tools/<Tool>/__tests__/    # Tool unit tests
├── services/mcp/__tests__/    # MCP unit tests
├── utils/permissions/__tests__/
├── utils/model/__tests__/
├── utils/settings/__tests__/
├── utils/shell/__tests__/
├── utils/git/__tests__/
└── __tests__/                 # Top-level module tests (Tool.ts, tools.ts)
tests/
├── integration/               # Integration tests (not yet created)
├── mocks/                     # Shared mock/fixture (not yet created)
└── helpers/                   # Test helper functions
```

- Test files: `<module>.test.ts`
- Naming style: `describe("functionName")` + `test("behavior description")`, in English
- Writing principles: Arrange-Act-Assert, single responsibility, independence, boundary coverage

## 4. Current Coverage Status

> Updated: 2026-04-02 | **1623 tests, 84 files, 0 fail, 851ms**

### 4.1 Reliability Scoring

Each test file is rated by assertion depth, boundary coverage, mock quality, and test independence:

| Grade | Meaning |
|-------|---------|
| **GOOD** | Precise assertions (exact match), sufficient boundaries, clear structure |
| **ACCEPTABLE** | Happy path fully covered, some boundaries or assertions could be strengthened |
| **WEAK** | Has notable deficiencies: weak assertions, missing critical boundaries, or fragility risk |

### 4.2 Distribution by Module

#### P0 — Core Modules

| File | Tests | Score | Coverage | Main Gaps |
|------|-------|-------|----------|-----------|
| `src/__tests__/Tool.test.ts` | 20 | GOOD | buildTool, toolMatchesName, findToolByName, filterToolProgressMessages | — |
| `src/__tests__/tools.test.ts` | 9 | ACCEPTABLE | parseToolPreset, filterToolsByDenyRules | Preset coverage only tests "default"; has redundant cases |
| `src/tools/FileEditTool/__tests__/utils.test.ts` | 22 | ACCEPTABLE | normalizeQuotes, applyEditToFile, preserveQuoteStyle | `findActualString` assertion too weak (`not.toBeNull`); `preserveQuoteStyle` only 2 cases |
| `src/tools/shared/__tests__/gitOperationTracking.test.ts` | 20 | ACCEPTABLE | parseGitCommitId, detectGitOperation | All 6 GH PR actions covered; missing `trackGitOperations` test (needs mock analytics) |
| `src/tools/BashTool/__tests__/destructiveCommandWarning.test.ts` | 21 | ACCEPTABLE | git/rm/SQL/k8s/terraform dangerous patterns | safe commands 4 assertions combined; missing `rm -rf /`, `DROP DATABASE`, piped commands |
| `src/tools/BashTool/__tests__/commandSemantics.test.ts` | 10 | ACCEPTABLE | grep/diff/test/rg/find exit code semantics | mock `splitCommand_DEPRECATED` may diverge from implementation; coverage could be more comprehensive |

**Utils Pure Functions (19 files):**

| File | Tests | Score | Coverage | Main Gaps |
|------|-------|-------|----------|-----------|
| `utils/__tests__/array.test.ts` | 12 | GOOD | intersperse, count, uniq | — |
| `utils/__tests__/set.test.ts` | 11 | GOOD | difference, intersects, every, union | — |
| `utils/__tests__/xml.test.ts` | 9 | GOOD | escapeXml, escapeXmlAttr | Missing null/undefined input tests |
| `utils/__tests__/hash.test.ts` | 12 | ACCEPTABLE | djb2Hash, hashContent, hashPair | `hashContent`/`hashPair` no known-answer assertions (only test determinism) |
| `utils/__tests__/stringUtils.test.ts` | 30 | GOOD | All 10 functions covered, including Unicode boundaries | — |
| `utils/__tests__/semver.test.ts` | 16 | ACCEPTABLE | gt/gte/lt/lte/satisfies/order | Missing pre-release, tilde range, malformed version strings |
| `utils/__tests__/uuid.test.ts` | 6 | ACCEPTABLE | validateUuid | Uppercase test only `not.toBeNull`, doesn't verify normalized output |
| `utils/__tests__/format.test.ts` | 27 | GOOD | formatFileSize, formatDuration, formatNumber, formatTokens, formatRelativeTime | All `toBe` exact match, including billions/weeks/days boundaries |
| `utils/__tests__/frontmatterParser.test.ts` | 22 | GOOD | parseFrontmatter, splitPathInFrontmatter, parsePositiveIntFromFrontmatter | — |
| `utils/__tests__/file.test.ts` | 13 | ACCEPTABLE | convertLeadingTabsToSpaces, addLineNumbers, stripLineNumberPrefix | `addLineNumbers` only `toContain`; missing Windows path separator tests |
| `utils/__tests__/glob.test.ts` | 6 | ACCEPTABLE | extractGlobBaseDirectory | Missing absolute path, root `/`, Windows path |
| `utils/__tests__/diff.test.ts` | 8 | ACCEPTABLE | adjustHunkLineNumbers, getPatchFromContents | `getPatchFromContents` only checks structure, doesn't verify diff content correctness |
| `utils/__tests__/json.test.ts` | 15 | GOOD | safeParseJSON, parseJSONL, addItemToJSONCArray | — |
| `utils/__tests__/truncate.test.ts` | 18 | ACCEPTABLE | truncateToWidth, wrapText, truncatePathMiddle | **Missing CJK/emoji/wide-char tests** (core scenario for width-aware implementation) |
| `utils/__tests__/path.test.ts` | 15 | ACCEPTABLE | containsPathTraversal, normalizePathForConfigKey | Only covers 2/5+ exported functions |
| `utils/__tests__/tokens.test.ts` | 18 | GOOD | getTokenCountFromUsage, doesMostRecentAssistantMessageExceed200k, etc. | — |
| `utils/__tests__/stream.test.ts` | 15 | GOOD | Stream\<T\> enqueue/read/drain/next/done/error/for-await | — |
| `utils/__tests__/abortController.test.ts` | 13 | GOOD | createAbortController/createChildAbortController parent-child propagation | — |
| `utils/__tests__/bufferedWriter.test.ts` | 10 | GOOD | createBufferedWriter immediate/buffered/flush/overflow | — |
| `utils/__tests__/gitDiff.test.ts` | 25 | GOOD | parseGitNumstat/parseGitDiff/parseShortstat pure parsing | — |
| `utils/__tests__/sliceAnsi.test.ts` | 13 | GOOD | sliceAnsi ANSI-aware slicing + undoAnsiCodes | — |
| `utils/__tests__/treeify.test.ts` | 13 | ACCEPTABLE | treeify flat/nested/circular references | Missing deep nesting performance tests |
| `utils/__tests__/words.test.ts` | 11 | GOOD | slug format (adjective-verb-noun), uniqueness | — |

**Context Building (3 files):**

| File | Tests | Score | Coverage | Main Gaps |
|------|-------|-------|----------|-----------|
| `utils/__tests__/claudemd.test.ts` | 14 | ACCEPTABLE | stripHtmlComments, isMemoryFilePath, getLargeMemoryFiles | **Only tests 3 helper functions**; core discovery/loading/`@include` directive/memoization not covered |
| `utils/__tests__/systemPrompt.test.ts` | 8 | GOOD | buildEffectiveSystemPrompt | — |
| `__tests__/history.test.ts` | 26 | GOOD | parseReferences/expandPastedTextRefs/formatPastedTextRef, etc. 5 functions | — |

#### P1 — Important Modules

| File | Tests | Score | Coverage | Main Gaps |
|------|-------|-------|----------|-----------|
| `permissions/__tests__/permissionRuleParser.test.ts` | 16 | GOOD | escape/unescape rules, roundtrip completeness | — |
| `permissions/__tests__/permissions.test.ts` | 12 | ACCEPTABLE | getDenyRuleForTool, getAskRuleForTool, filterDeniedAgents | `as any` cast; missing MCP tool deny tests |
| `permissions/__tests__/shellRuleMatching.test.ts` | 19 | GOOD | wildcards, escaping, regex special characters | — |
| `permissions/__tests__/PermissionMode.test.ts` | 22 | ACCEPTABLE | permissionModeFromString, isExternalPermissionMode, etc. | isExternalPermissionMode ant false path covered; missing standalone `bubble` mode test |
| `permissions/__tests__/dangerousPatterns.test.ts` | 7 | WEAK | CROSS_PLATFORM_CODE_EXEC, DANGEROUS_BASH_PATTERNS | Pure data smoke test, no behavioral tests; doesn't verify array has no duplicates |
| `model/__tests__/aliases.test.ts` | 15 | ACCEPTABLE | isModelAlias, isModelFamilyAlias | Missing null/undefined/empty string input |
| `model/__tests__/model.test.ts` | 13 | ACCEPTABLE | firstPartyNameToCanonical | Missing empty string, non-standard date suffix |
| `model/__tests__/providers.test.ts` | 9 | ACCEPTABLE | getAPIProvider, isFirstPartyAnthropicBaseUrl | `originalEnv` declared but unused; env restoration incomplete |
| `utils/__tests__/messages.test.ts` | 36 | GOOD | createAssistantMessage, createUserMessage, extractTag, etc. 16 describe blocks | `normalizeMessages` only checks length, doesn't verify content |

**Tool Submodules (8 files):**

| File | Tests | Score | Coverage | Main Gaps |
|------|-------|-------|----------|-----------|
| `tools/PowerShellTool/__tests__/powershellSecurity.test.ts` | 24 | GOOD | AST security detection: Invoke-Expression/iex/encoded/dynamic/download/COM | — |
| `tools/PowerShellTool/__tests__/commandSemantics.test.ts` | 21 | GOOD | grep/rg/findstr/robocopy exit codes, pipeline last-segment | — |
| `tools/PowerShellTool/__tests__/destructiveCommandWarning.test.ts` | 38 | GOOD | Remove-Item/Format-Volume/Clear-Disk/git/SQL/COMPUTER/alias full coverage | — |
| `tools/PowerShellTool/__tests__/gitSafety.test.ts` | 29 | GOOD | .git path detection/NTFS short name/backslash/quote/backtick escaping | — |
| `tools/LSPTool/__tests__/formatters.test.ts` | 18 | GOOD | All 8 format functions null/empty/valid input | — |
| `tools/LSPTool/__tests__/schemas.test.ts` | 13 | GOOD | isValidLSPOperation type guard 9 operations + invalid/empty/case | — |
| `tools/WebFetchTool/__tests__/preapproved.test.ts` | 18 | GOOD | isPreapprovedHost exact/path-scoped/subpath/case/subdomain | — |
| `tools/WebFetchTool/__tests__/urlValidation.test.ts` | 18 | GOOD | validateURL/isPermittedRedirect local reimplementation (avoids heavy dependency chain) | — |

#### P2 — Supplementary Modules

| File | Tests | Score | Coverage | Main Gaps |
|------|-------|-------|----------|-----------|
| `utils/__tests__/cron.test.ts` | 31 | GOOD | parseCronExpression, computeNextCronRun, cronToHuman | Missing month boundary, leap year |
| `utils/__tests__/git.test.ts` | 15 | ACCEPTABLE | normalizeGitRemoteUrl (SSH/HTTPS/ssh://) | Missing git://, file://, port number |
| `settings/__tests__/config.test.ts` | 38 | GOOD | SettingsSchema, type guards, validateSettingsFileContent, formatZodError | Missing DeniedMcpServerEntrySchema |

#### P3-P6 — Extended Coverage (27 files)

| File | Tests | Score | Notes |
|------|-------|-------|-------|
| `utils/__tests__/errors.test.ts` | 33 | GOOD | — |
| `utils/__tests__/envUtils.test.ts` | 33 | GOOD | env save/restore specification |
| `utils/__tests__/effort.test.ts` | 30 | GOOD | 5 mock modules, comprehensive boundaries |
| `utils/__tests__/argumentSubstitution.test.ts` | 22 | ACCEPTABLE | Missing escaped quotes, out-of-bounds index |
| `utils/__tests__/sanitization.test.ts` | 14 | ACCEPTABLE | — |
| `utils/__tests__/sleep.test.ts` | 14 | GOOD | Time-related tests, sufficient margin |
| `utils/__tests__/CircularBuffer.test.ts` | 11 | ACCEPTABLE | Missing capacity=1, empty buffer getRecent |
| `utils/__tests__/memoize.test.ts` | 18 | GOOD | Cache hit/stale/LRU full coverage |
| `utils/__tests__/tokenBudget.test.ts` | 21 | GOOD | — |
| `utils/__tests__/displayTags.test.ts` | 17 | GOOD | — |
| `utils/__tests__/taggedId.test.ts` | 10 | GOOD | — |
| `utils/__tests__/controlMessageCompat.test.ts` | 15 | GOOD | — |
| `utils/__tests__/gitConfigParser.test.ts` | 21 | GOOD | — |
| `utils/__tests__/windowsPaths.test.ts` | 19 | GOOD | Bidirectional round-trip tests |
| `utils/__tests__/envExpansion.test.ts` | 15 | GOOD | — |
| `utils/__tests__/formatBriefTimestamp.test.ts` | 10 | GOOD | Fixed now timestamp, deterministic |
| `utils/__tests__/notebook.test.ts` | 9 | ACCEPTABLE | Merge assertions weak |
| `utils/__tests__/hyperlink.test.ts` | 10 | ACCEPTABLE | Empty string test behavior comment confusing |
| `utils/__tests__/zodToJsonSchema.test.ts` | 9 | WEAK | **object properties only `toBeDefined`, doesn't verify type**; optional fields don't verify absence |
| `utils/__tests__/objectGroupBy.test.ts` | 5 | ACCEPTABLE | Minimal, missing undefined key test |
| `utils/__tests__/contentArray.test.ts` | 6 | ACCEPTABLE | Missing interleaved tool_result+text |
| `utils/__tests__/slashCommandParsing.test.ts` | 8 | GOOD | — |
| `utils/__tests__/groupToolUses.test.ts` | 10 | GOOD | — |
| `utils/__tests__/shell/__tests__/outputLimits.test.ts` | 7 | ACCEPTABLE | — |
| `utils/__tests__/envValidation.test.ts` | 12 | GOOD | validateBoundedIntEnvVar | value=1 no lower bound confirmed as design intent (function only validates >0 and <=upperLimit) |
| `utils/git/__tests__/gitConfigParser.test.ts` | 20 | GOOD | — |
| `services/mcp/__tests__/mcpStringUtils.test.ts` | 16 | GOOD | — |
| `services/mcp/__tests__/normalization.test.ts` | 10 | GOOD | — |

### 4.3 Score Summary

| Grade | File Count | Percentage |
|-------|------------|------------|
| **GOOD** | 46 | 55% |
| **ACCEPTABLE** | 32 | 38% |
| **WEAK** | 6 | 7% |

## 5. Systemic Issues

### 5.1 Weak Assertions (Smell: `toContain` instead of exact match)

The following files have tests using `toContain` or `not.toBeNull` to check results. When the implementation returns any string containing the target substring, the test still passes and cannot detect format errors:

| File | Affected Function | Suggestion |
|------|-------------------|------------|
| `file.test.ts` | addLineNumbers | Assert complete output format |
| `diff.test.ts` | getPatchFromContents | Verify hunk content correctness |
| `notebook.test.ts` | mapNotebookCellsToToolResult | Verify merged content |
| `uuid.test.ts` | validateUuid (uppercase) | Assert exact value after normalization |

### 5.2 Integration Test Gap

All three integration tests defined in the spec have not been created:

| Plan | Status | Dependencies |
|------|--------|--------------|
| `tests/integration/tool-chain.test.ts` | Not created | Needs mock of tools.ts full registration chain |
| `tests/integration/context-build.test.ts` | Not created | Needs mock of context.ts heavy dependency chain |
| `tests/integration/message-pipeline.test.ts` | Not created | Needs mock of API layer |

The `tests/mocks/` directory also does not exist — no shared mock/fixture infrastructure.

### 5.3 Mock Related

| Issue | Affected File | Description |
|-------|---------------|-------------|
| Heavy dependencies not mocked | `gitOperationTracking.test.ts` | `trackGitOperations` calls analytics/bootstrap; test only covers `detectGitOperation` (no side effects) |
| Env restoration incomplete | `providers.test.ts` | Only deletes known keys; newly added env vars will cause test leakage |

### 5.4 Potential Bugs

| File | Function | Issue |
|------|----------|-------|
| ~~`envValidation.test.ts`~~ | ~~validateBoundedIntEnvVar~~ | ~~value=1 no lower bound check~~ — **Confirmed**: function only validates `parsed > 0` and `parsed <= upperLimit`, does not enforce `parsed >= defaultValue`; this is by design |

### 5.5 Known Limitations

| Module | Issue |
|--------|-------|
| `Bun.JSONL.parseChunk` | Hangs indefinitely on malformed lines (Bun 1.3.10 bug) |
| `context.ts` core logic | Depends on bootstrap/state + git + 50+ modules, mocking infeasible |
| `tools.ts` (getAllBaseTools) | Import chain too heavy |
| `spawnMultiAgent.ts` | 50+ dependencies |
| `messages.ts` partial functions | Depends on `getFeatureValue_CACHED_MAY_BE_STALE` |
| UI components (`screens/`, `components/`) | Requires Ink rendering test environment |

### 5.6 Mock Pattern

Unlock heavy-dependency modules via `mock.module()` + `await import()`:

| Mocked Module | Unlocked Tests |
|---------------|----------------|
| `src/utils/log.ts` | json, tokens, FileEditTool/utils, permissions, memoize, PermissionMode |
| `src/services/tokenEstimation.ts` | tokens |
| `src/utils/slowOperations.ts` | tokens, permissions, memoize, PermissionMode |
| `src/utils/debug.ts` | envValidation, outputLimits |
| `src/utils/bash/commands.ts` | commandSemantics |
| `src/utils/thinking.js` | effort |
| `src/utils/settings/settings.js` | effort |
| `src/utils/auth.js` | effort |
| `src/services/analytics/growthbook.js` | effort, tokenBudget |
| `src/utils/powershell/dangerousCmdlets.js` | powershellSecurity |
| `src/utils/cwd.js` | gitSafety |
| `src/utils/powershell/parser.js` | gitSafety |
| `src/utils/stringUtils.js` | LSP formatters |
| `figures` | treeify |

**Constraint**: `mock.module()` must be called inline in each test file; it cannot be imported from a shared helper.

## 6. Completion Status

> Updated: 2026-04-02 | **1623 tests, 84 files, 0 fail, 851ms**

### Completed

| Plan | Status | New Tests | Description |
|------|--------|-----------|-------------|
| Plan 12 — Mock Reliability | **Completed** | +9 | PermissionMode ant false path, providers env snapshot restoration |
| Plan 10 — WEAK Fixes | **Completed** | +15 | format assertion precision, envValidation fix, zodToJsonSchema/destructors/notebook hardening |
| Plan 13 — CJK/Emoji | **Completed** | +17 | truncate CJK/emoji width-aware tests |
| Plan 11 — ACCEPTABLE Strengthening | **Completed** | +62 | diff/uuid/hash/semver/path/claudemd/fileEdit/providers/messages, etc. 15 files |
| Plan 14 — Integration Tests | **Completed** | +43 | Set up tests/mocks/ + tool-chain/context-build/message-pipeline/cli-arguments |
| Plan 15 — CLI + Coverage | **Completed** | +11 | Commander.js argument parsing, coverage baseline |
| Phase 16 — Zero-Dependency Pure Functions | **Completed** | +126 | stream/abortController/bufferedWriter/gitDiff/history/sliceAnsi/treeify/words 8 files |
| Phase 17 — Tool Submodules | **Completed** | +179 | PowerShell security/semantics/destructive/gitSafety + LSP formatting/schema + WebFetch preapproved/URL 8 files |
| Phase 18 — WEAK Fixes | **Completed** | +20 | format exact match, envValidation boundary, PermissionMode strengthening, gitOperationTracking PR actions |

### Coverage Baseline

| Metric | Value |
|--------|-------|
| Total tests | 1623 |
| Test files | 84 |
| Failures | 0 |
| Assertions | 2516 |
| Run time | ~851ms |
| Tool.ts line coverage | 100% |
| Overall line coverage | ~33% (Bun coverage limitation: modules under `mock.module` pattern are not reported) |

> **Note**: Bun `--coverage` only reports files directly loaded in the test import chain. Source files using the `mock.module()` + `await import()` pattern (most `src/utils/` pure functions) do not appear in the coverage report. Actual test coverage is higher than the reported value.

### Not Planned

| Module | Reason |
|--------|--------|
| `query.ts` / `QueryEngine.ts` | Core loop, requires full integration environment |
| `services/api/claude.ts` | Needs mock SDK streaming response |
| `spawnMultiAgent.ts` | 50+ dependencies |
| `modelCost.ts` | Depends on bootstrap/state + analytics |
| `mcp/dateTimeParser.ts` | Calls Haiku API |
| `screens/` / `components/` | Requires Ink rendering tests |

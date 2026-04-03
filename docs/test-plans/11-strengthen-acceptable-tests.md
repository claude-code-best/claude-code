# Plan 11 — Strengthen ACCEPTABLE-Rated Tests

> Priority: Medium | ~15 files | Estimated ~80 new test cases

This plan performs targeted improvements on specific deficiencies in ACCEPTABLE-rated files. Each entry lists only the parts that need modification, not a full rewrite.

---

## 11.1 `src/utils/__tests__/diff.test.ts`

| Change | Current | Change To |
|--------|---------|-----------|
| `getPatchFromContents` assertion | `hunks.length > 0` | Verify specific `+`/`-` line content |
| `$` character escaping | Not tested | Add test with content containing `$` |
| `ignoreWhitespace` option | Not tested | Add `ignoreWhitespace: true` case |
| Delete all content | Not tested | `newContent: ""` |
| Multiple hunk offsets | `adjustHunkLineNumbers` only single hunk | Add multi-hunk array test |

---

## 11.2 `src/utils/__tests__/path.test.ts`

Currently covers only 2 of 5+ exported functions. Add:

| Function | Minimum cases | Key edge cases |
|----------|--------------|----------------|
| `expandPath` | 6 | `~/` expansion, absolute path passthrough, relative path, empty string, contains null byte, `~user` format |
| `toRelativePath` | 3 | Same-level file, subdirectory, parent directory |
| `sanitizePath` | 3 | Normal path, contains `..` segments, empty string |

`containsPathTraversal` additions:
- URL-encoded `%2e%2e%2f` (confirm no match, document as not-a-requirement)
- Mixed separators `foo/..\bar`

`normalizePathForConfigKey` additions:
- Mixed separators `foo/bar\baz`
- Redundant separators `foo//bar`
- Windows drive letter `C:\foo\bar`

---

## 11.3 `src/utils/__tests__/uuid.test.ts`

| Change | Description |
|--------|-------------|
| Strengthen uppercase test assertion | `not.toBeNull()` → verify normalized output (lowercase + hyphen format) |
| Add `createAgentId` | 3 cases: no label / with label / output format regex `/^a[a-z]*-[a-f0-9]{16}$/` |
| Leading/trailing whitespace | `" 550e8400-...  "` expected `null` |

---

## 11.4 `src/utils/__tests__/semver.test.ts`

| Case | Input | Expected |
|------|-------|----------|
| Pre-release comparison | `gt("1.0.0", "1.0.0-alpha")` | `true` |
| Inter-pre-release comparison | `order("1.0.0-alpha", "1.0.0-beta")` | `-1` |
| Tilde range | `satisfies("1.2.5", "~1.2.3")` | `true` |
| `*` wildcard | `satisfies("2.0.0", "*")` | `true` |
| Malformed version | `order("abc", "1.0.0")` | Confirm does not throw |
| `0.0.0` | `gt("0.0.0", "0.0.0")` | `false` |

---

## 11.5 `src/utils/__tests__/hash.test.ts`

| Change | Current | Change To |
|--------|---------|-----------|
| djb2 32-bit check | `hash \| 0` (always true) | `Number.isSafeInteger(hash) && Math.abs(hash) <= 0x7FFFFFFF` |
| hashContent empty string | Not tested | Add case |
| hashContent format | Output not verified as numeric string | `toMatch(/^\d+$/)` |
| hashPair empty string | Not tested | `hashPair("", "b")`, `hashPair("", "")` |
| Known answer test | None | Assert `djb2Hash("hello")` equals a specific value (run once in console first to determine) |

---

## 11.6 `src/utils/__tests__/claudemd.test.ts`

Currently covers only 3 helper functions. Add:

| Case | Function | Description |
|------|----------|-------------|
| Unclosed comment | `stripHtmlComments` | `"<!-- no close some text"` → returned as-is |
| Multi-line comment | `stripHtmlComments` | `"<!--\nmulti\nline\n-->text"` → `"text"` |
| Same-line comment + content | `stripHtmlComments` | `"<!-- note -->some text"` → `"some text"` |
| Comment inside inline code | `stripHtmlComments` | `` `<!-- kept -->` `` → preserved |
| Case insensitivity | `isMemoryFilePath` | `"claude.md"`, `"CLAUDE.MD"` |
| Non-.md rules file | `isMemoryFilePath` | `.claude/rules/foo.txt` → `false` |
| Empty array | `getLargeMemoryFiles` | `[]` → `[]` |

---

## 11.7 `src/tools/FileEditTool/__tests__/utils.test.ts`

| Function | New cases |
|----------|----------|
| `normalizeQuotes` | Mixed quotes `"`she said 'hello'"` |
| `stripTrailingWhitespace` | CR-only `\r`, no trailing newline, all-whitespace string |
| `findActualString` | Empty content, Unicode content |
| `preserveQuoteStyle` | Single quotes, apostrophe in contractions (e.g., `it's`), empty string |
| `applyEditToFile` | `replaceAll=true` with zero matches, `oldString` without trailing `\n`, multi-line content |

---

## 11.8 `src/utils/model/__tests__/providers.test.ts`

| Change | Description |
|--------|-------------|
| Remove `originalEnv` | Unused, eliminate dead code |
| Switch env restoration to snapshot | `beforeEach` saves `process.env`, `afterEach` restores |
| Add all three variables set simultaneously | bedrock + vertex + foundry all set to `"1"`, verify priority |
| Add non-`"1"` values | `"true"`, `"0"`, `""` |
| `isFirstPartyAnthropicBaseUrl` | URL with path `/v1`, trailing slash, non-HTTPS |

---

## 11.9 `src/utils/__tests__/hyperlink.test.ts`

| Case | Description |
|------|-------------|
| Empty URL | `createHyperlink("http://x.com", "", { supported: true })` does not throw |
| undefined supportsHyperlinks | Falls back to default detection when option not provided |
| Non-ant staging URL | `USER_TYPE !== "ant"` staging returns `false` |

---

## 11.10 `src/utils/__tests__/objectGroupBy.test.ts`

| Case | Description |
|------|-------------|
| Key returns undefined | `(_, i) => undefined` → all grouped under `undefined` key |
| Key is special character | `({ name }) => name` contains spaces/CJK characters |

---

## 11.11 `src/utils/__tests__/CircularBuffer.test.ts`

| Case | Description |
|------|-------------|
| capacity=1 | Add 2 elements, only the last one is retained |
| Empty buffer getRecent | Returns empty array |
| getRecent(0) | Returns empty array |

---

## 11.12 `src/utils/__tests__/contentArray.test.ts`

| Case | Description |
|------|-------------|
| Mixed alternating | `[tool_result, text, tool_result]` — verify insertion at correct position |

---

## 11.13 `src/utils/__tests__/argumentSubstitution.test.ts`

| Case | Description |
|------|-------------|
| Escaped quotes | `"he said \"hello\""` |
| Out-of-bounds index | `$ARGUMENTS[99]` (not enough arguments) |
| Multiple placeholders | `"cmd $0 $1 $0"` |

---

## 11.14 `src/utils/__tests__/messages.test.ts`

| Change | Description |
|--------|-------------|
| Strengthen `normalizeMessages` assertion | Verify split message content, not just length |
| `isNotEmptyMessage` whitespace | `[{ type: "text", text: "  " }]` |

---

## Acceptance Criteria

- [ ] `bun test` all passing
- [ ] Target files upgraded from ACCEPTABLE to GOOD
- [ ] No `toContain` used for exact value checks

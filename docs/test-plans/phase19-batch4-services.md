# Phase 19 - Batch 4: Services Pure Logic

> Estimated ~84 tests / 5 files | Some require lightweight mocking

---

## 1. `src/services/compact/__tests__/grouping.test.ts` (~15 tests)

**Source file**: `src/services/compact/grouping.ts` (64 lines)
**Target function**: `groupMessagesByApiRound`

### Test Cases

```typescript
describe("groupMessagesByApiRound", () => {
  test("returns single group for single API round")
  test("splits at new assistant message ID")
  test("keeps tool_result messages with their parent assistant message")
  test("handles streaming chunks (same assistant ID stays grouped)")
  test("returns empty array for empty input")
  test("handles all user messages (no assistant)")
  test("handles alternating assistant IDs")
  test("three API rounds produce three groups")
  test("user messages before first assistant go in first group")
  test("consecutive user messages stay in same group")
  test("does not produce empty groups")
  test("handles single message")
  test("preserves message order within groups")
  test("handles system messages")
  test("tool_result after assistant stays in same round")
})
```

### Mock Requirements
Construct `Message` mock objects (type: 'user'/'assistant', message: { id, content })

---

## 2. `src/services/compact/__tests__/stripMessages.test.ts` (~20 tests)

**Source file**: `src/services/compact/compact.ts` (1709 lines)
**Target functions**: `stripImagesFromMessages`, `collectReadToolFilePaths` (private)

### Test Cases

```typescript
describe("stripImagesFromMessages", () => {
  // User message handling
  test("replaces image block with [image] text")
  test("replaces document block with [document] text")
  test("preserves text blocks unchanged")
  test("handles multiple image/document blocks in single message")
  test("returns original message when no media blocks")

  // Nested inside tool_result
  test("replaces image inside tool_result content")
  test("replaces document inside tool_result content")
  test("preserves non-media tool_result content")

  // Non-user messages
  test("passes through assistant messages unchanged")
  test("passes through system messages unchanged")

  // Edge cases
  test("handles empty message array")
  test("handles string content (non-array) in user message")
  test("does not mutate original messages")
})

describe("collectReadToolFilePaths", () => {
  // Note: This is a private function and may need to be tested indirectly through stripImagesFromMessages or other exports
  // If it cannot be tested directly, skip or cover via integration tests
  test("collects file_path from Read tool_use blocks")
  test("skips tool_use with FILE_UNCHANGED_STUB result")
  test("returns empty set for messages without Read tool_use")
  test("handles multiple Read calls across messages")
  test("normalizes paths via expandPath")
})
```

### Mock Requirements
Need to mock `expandPath` (if testing collectReadToolFilePaths)
Need to mock `log`, `slowOperations` and other heavy dependencies
Construct `Message` mock objects

---

## 3. `src/services/compact/__tests__/prompt.test.ts` (~12 tests)

**Source file**: `src/services/compact/prompt.ts` (375 lines)
**Target function**: `formatCompactSummary`

### Test Cases

```typescript
describe("formatCompactSummary", () => {
  test("strips <analysis>...</analysis> block")
  test("replaces <summary>...</summary> with 'Summary:\\n' prefix")
  test("handles analysis + summary together")
  test("handles summary without analysis")
  test("handles analysis without summary")
  test("collapses multiple newlines to double")
  test("trims leading/trailing whitespace")
  test("handles empty string")
  test("handles plain text without tags")
  test("handles multiline analysis content")
  test("preserves content between analysis and summary")
  test("handles nested-like tags gracefully")
})
```

### Mock Requirements
Need to mock heavy dependency chain (`log`, feature flags, etc.)
`formatCompactSummary` is pure string processing; if the import chain is not too heavy, complex mocking is unnecessary

---

## 4. `src/services/mcp/__tests__/channelPermissions.test.ts` (~25 tests)

**Source file**: `src/services/mcp/channelPermissions.ts` (241 lines)
**Target functions**: `hashToId`, `shortRequestId`, `truncateForPreview`, `filterPermissionRelayClients`

### Test Cases

```typescript
describe("hashToId", () => {
  test("returns 5-char string")
  test("uses only letters a-z excluding 'l'")
  test("is deterministic (same input = same output)")
  test("different inputs produce different outputs (with high probability)")
  test("handles empty string")
})

describe("shortRequestId", () => {
  test("returns 5-char string from tool use ID")
  test("is deterministic")
  test("avoids profanity substrings (retries with salt)")
  test("returns a valid ID even if all retries hit bad words (unlikely)")
})

describe("truncateForPreview", () => {
  test("returns JSON string for object input")
  test("truncates to <=200 chars when input is long")
  test("adds ellipsis or truncation indicator")
  test("returns short input unchanged")
  test("handles string input")
  test("handles null/undefined input")
})

describe("filterPermissionRelayClients", () => {
  test("keeps connected clients in allowlist with correct capabilities")
  test("filters out disconnected clients")
  test("filters out clients not in allowlist")
  test("filters out clients missing required capabilities")
  test("returns empty array for empty input")
  test("type predicate narrows correctly")
})

describe("PERMISSION_REPLY_RE", () => {
  test("matches 'y abcde'")
  test("matches 'yes abcde'")
  test("matches 'n abcde'")
  test("matches 'no abcde'")
  test("is case-insensitive")
  test("does not match without ID")
})
```

### Mock Requirements
`hashToId` export status may need to be confirmed
`filterPermissionRelayClients` requires mocking client types
`truncateForPreview` may depend on `jsonStringify` (requires mocking `slowOperations`)

---

## 5. `src/services/mcp/__tests__/officialRegistry.test.ts` (~12 tests)

**Source file**: `src/services/mcp/officialRegistry.ts` (73 lines)
**Target functions**: `normalizeUrl` (private), `isOfficialMcpUrl`, `resetOfficialMcpUrlsForTesting`

### Test Cases

```typescript
describe("normalizeUrl", () => {
  // Note: If private, test indirectly through isOfficialMcpUrl
  test("removes trailing slash")
  test("removes query parameters")
  test("preserves path")
  test("handles URL with port")
  test("handles URL with hash fragment")
})

describe("isOfficialMcpUrl", () => {
  test("returns false when registry not loaded (initial state)")
  test("returns true for URL added to registry")
  test("returns false for non-registered URL")
  test("uses normalized URL for comparison")
})

describe("resetOfficialMcpUrlsForTesting", () => {
  test("clears the cached URLs")
  test("allows fresh start after reset")
})

describe("URL normalization + lookup integration", () => {
  test("URL with trailing slash matches normalized version")
  test("URL with query params matches normalized version")
  test("different URLs do not match")
  test("case sensitivity check")
})
```

### Mock Requirements
Need to mock `axios` (avoid network requests)
Use `resetOfficialMcpUrlsForTesting` for test isolation

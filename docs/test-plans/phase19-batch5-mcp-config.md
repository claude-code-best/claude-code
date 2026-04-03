# Phase 19 - Batch 5: MCP Config + modelCost

> Estimated ~80 tests / 4 files | Requires moderate mocking

---

## 1. `src/services/mcp/__tests__/configUtils.test.ts` (~30 tests)

**Source file**: `src/services/mcp/config.ts` (1580 lines)
**Target functions**: `unwrapCcrProxyUrl`, `urlPatternToRegex` (private), `commandArraysMatch` (private), `toggleMembership` (private), `addScopeToServers` (private), `dedupPluginMcpServers`, `getMcpServerSignature` (if exported)

### Test Strategy
Private functions that cannot be tested directly are covered indirectly through the public `dedupPluginMcpServers`. Exported functions are tested directly.

### Test Cases

```typescript
describe("unwrapCcrProxyUrl", () => {
  test("returns original URL when no CCR proxy markers")
  test("extracts mcp_url from CCR proxy URL with /v2/session_ingress/shttp/mcp/")
  test("extracts mcp_url from CCR proxy URL with /v2/ccr-sessions/")
  test("returns original URL when mcp_url param is missing")
  test("handles malformed URL gracefully")
  test("handles URL with both proxy marker and mcp_url")
  test("preserves non-CCR URLs unchanged")
})

describe("dedupPluginMcpServers", () => {
  test("keeps unique plugin servers")
  test("suppresses plugin server duplicated by manual config")
  test("suppresses plugin server duplicated by earlier plugin")
  test("keeps servers with null signature")
  test("returns empty for empty inputs")
  test("reports suppressed with correct duplicateOf name")
  test("handles multiple plugins with same config")
})

describe("toggleMembership (via integration)", () => {
  test("adds item when shouldContain=true and not present")
  test("removes item when shouldContain=false and present")
  test("returns same array when already in desired state")
})

describe("addScopeToServers (via integration)", () => {
  test("adds scope to each server config")
  test("returns empty object for undefined input")
  test("returns empty object for empty input")
  test("preserves all original config properties")
})

describe("urlPatternToRegex (via integration)", () => {
  test("matches exact URL")
  test("matches wildcard pattern *.example.com")
  test("matches multiple wildcards")
  test("does not match non-matching URL")
  test("escapes regex special characters in pattern")
})

describe("commandArraysMatch (via integration)", () => {
  test("returns true for identical arrays")
  test("returns false for different lengths")
  test("returns false for same length different elements")
  test("returns true for empty arrays")
})
```

### Mock Requirements
Need to mock `feature()` (bun:bundle), `jsonStringify`, `safeParseJSON`, `log`, etc.
Unlock via `mock.module()` + `await import()` pattern

---

## 2. `src/services/mcp/__tests__/filterUtils.test.ts` (~20 tests)

**Source file**: `src/services/mcp/utils.ts` (576 lines)
**Target functions**: `filterToolsByServer`, `hashMcpConfig`, `isToolFromMcpServer`, `isMcpTool`, `parseHeaders`

### Test Cases

```typescript
describe("filterToolsByServer", () => {
  test("filters tools matching server name prefix")
  test("returns empty for no matching tools")
  test("handles empty tools array")
  test("normalizes server name for matching")
})

describe("hashMcpConfig", () => {
  test("returns 16-char hex string")
  test("is deterministic")
  test("excludes scope from hash")
  test("different configs produce different hashes")
  test("key order does not affect hash (sorted)")
})

describe("isToolFromMcpServer", () => {
  test("returns true when tool belongs to specified server")
  test("returns false for different server")
  test("returns false for non-MCP tool name")
  test("handles empty tool name")
})

describe("isMcpTool", () => {
  test("returns true for tool name starting with 'mcp__'")
  test("returns true when tool.isMcp is true")
  test("returns false for regular tool")
  test("returns false when neither condition met")
})

describe("parseHeaders", () => {
  test("parses 'Key: Value' format")
  test("parses multiple headers")
  test("trims whitespace around key and value")
  test("throws on missing colon")
  test("throws on empty key")
  test("handles value with colons (like URLs)")
  test("returns empty object for empty array")
  test("handles duplicate keys (last wins)")
})
```

### Mock Requirements
Need to mock `normalizeNameForMCP`, `mcpInfoFromString`, `jsonStringify`, `createHash`, etc.
`parseHeaders` is the most self-contained and may not need much mocking

---

## 3. `src/services/mcp/__tests__/channelNotification.test.ts` (~15 tests)

**Source file**: `src/services/mcp/channelNotification.ts` (317 lines)
**Target functions**: `wrapChannelMessage`, `findChannelEntry`

### Test Cases

```typescript
describe("wrapChannelMessage", () => {
  test("wraps content in <channel> tag with source attribute")
  test("escapes server name in attribute")
  test("includes meta attributes when provided")
  test("escapes meta values via escapeXmlAttr")
  test("filters out meta keys not matching SAFE_META_KEY pattern")
  test("handles empty meta")
  test("handles content with special characters")
  test("formats with newlines between tags and content")
})

describe("findChannelEntry", () => {
  test("finds server entry by exact name match")
  test("finds plugin entry by matching second segment")
  test("returns undefined for no match")
  test("handles empty channels array")
  test("handles server name without colon")
  test("handles 'plugin:name' format correctly")
  test("prefers exact match over partial match")
})
```

### Mock Requirements
Need to mock `escapeXmlAttr` (from xml.ts, already tested) or use directly
`CHANNEL_TAG` constant export status needs to be confirmed

---

## 4. `src/utils/__tests__/modelCost.test.ts` (~15 tests)

**Source file**: `src/utils/modelCost.ts` (232 lines)
**Target functions**: `formatModelPricing`, `COST_TIER_*` constants

### Test Cases

```typescript
describe("COST_TIER constants", () => {
  test("COST_TIER_3_15 has inputTokens=3, outputTokens=15")
  test("COST_TIER_15_75 has inputTokens=15, outputTokens=75")
  test("COST_TIER_5_25 has inputTokens=5, outputTokens=25")
  test("COST_TIER_30_150 has inputTokens=30, outputTokens=150")
  test("COST_HAIKU_35 has inputTokens=0.8, outputTokens=4")
  test("COST_HAIKU_45 has inputTokens=1, outputTokens=5")
})

describe("formatModelPricing", () => {
  test("formats integer prices without decimals: '$3/$15 per Mtok'")
  test("formats float prices with 2 decimals: '$0.80/$4.00 per Mtok'")
  test("formats mixed: '$5/$25 per Mtok'")
  test("formats large prices: '$30/$150 per Mtok'")
  test("formats $1/$5 correctly (integer but small)")
  test("handles zero prices: '$0/$0 per Mtok'")
})

describe("MODEL_COSTS", () => {
  test("maps known model names to cost tiers")
  test("contains entries for claude-sonnet-4-6")
  test("contains entries for claude-opus-4-6")
  test("contains entries for claude-haiku-4-5")
})
```

### Mock Requirements
Need to mock `log`, `slowOperations` and other heavy dependencies (modelCost.ts typically has a heavy import chain)
`formatModelPricing` and `COST_TIER_*` are pure data/pure functions, test directly once mocking succeeds

# Phase 19 - Batch 3: Tool Submodule Pure Logic

> Estimated ~113 tests / 6 files | Uses `mock.module()` + `await import()` pattern

---

## 1. `src/tools/GrepTool/__tests__/headLimit.test.ts` (~20 tests)

**Source file**: `src/tools/GrepTool/GrepTool.ts` (578 lines)
**Target functions**: `applyHeadLimit<T>`, `formatLimitInfo` (not exported, testability needs confirmation)

### Test Strategy
If the function is exported from the file, obtain it directly via `await import()`. If private, test indirectly through GrepTool output, or extract to a separate file.

### Test Cases

```typescript
describe("applyHeadLimit", () => {
  test("returns full array when limit is undefined (default 250)")
  test("applies limit correctly: limits to N items")
  test("limit=0 means no limit (returns all)")
  test("applies offset correctly")
  test("offset + limit combined")
  test("offset beyond array length returns empty")
  test("returns appliedLimit when truncation occurred")
  test("returns appliedLimit=undefined when no truncation")
  test("limit larger than array returns all items with appliedLimit=undefined")
  test("empty array returns empty with appliedLimit=undefined")
  test("offset=0 is default")
  test("negative limit behavior")
})

describe("formatLimitInfo", () => {
  test("formats 'limit: N, offset: M' when both present")
  test("formats 'limit: N' when only limit")
  test("formats 'offset: M' when only offset")
  test("returns empty string when both undefined")
  test("handles limit=0 (no limit, should not appear)")
})
```

### Mock Requirements
Need to mock heavy dependency chain (`log`, `slowOperations`, etc.), use `mock.module()` + `await import()` to obtain only target functions

---

## 2. `src/tools/MCPTool/__tests__/classifyForCollapse.test.ts` (~25 tests)

**Source file**: `src/tools/MCPTool/classifyForCollapse.ts` (605 lines)
**Target functions**: `classifyMcpToolForCollapse`, `normalize`

### Test Cases

```typescript
describe("normalize", () => {
  test("leaves snake_case unchanged: 'search_issues'")
  test("converts camelCase to snake_case: 'searchIssues' -> 'search_issues'")
  test("converts kebab-case to snake_case: 'search-issues' -> 'search_issues'")
  test("handles mixed: 'searchIssuesByStatus' -> 'search_issues_by_status'")
  test("handles already lowercase single word")
  test("handles empty string")
  test("handles PascalCase: 'SearchIssues' -> 'search_issues'")
})

describe("classifyMcpToolForCollapse", () => {
  // Search tools
  test("classifies Slack search_messages as search")
  test("classifies GitHub search_code as search")
  test("classifies Linear search_issues as search")
  test("classifies Datadog search_logs as search")
  test("classifies Notion search as search")

  // Read tools
  test("classifies Slack get_message as read")
  test("classifies GitHub get_file_contents as read")
  test("classifies Linear get_issue as read")
  test("classifies Filesystem read_file as read")

  // Dual classification
  test("some tools are both search and read")
  test("some tools are neither search nor read")

  // Unknown tools
  test("unknown tool returns { isSearch: false, isRead: false }")
  test("tool name with camelCase variant still matches")
  test("tool name with kebab-case variant still matches")

  // Server name does not affect classification
  test("server name parameter is accepted but unused in current logic")

  // Edge cases
  test("empty tool name returns false/false")
  test("case sensitivity check (should match after normalize)")
  test("handles tool names with numbers")
})
```

### Mock Requirements
File is self-contained (only internal Set + normalize function), need to confirm whether `normalize` is exported

---

## 3. `src/tools/FileReadTool/__tests__/blockedPaths.test.ts` (~18 tests)

**Source file**: `src/tools/FileReadTool/FileReadTool.ts` (1184 lines)
**Target functions**: `isBlockedDevicePath`, `getAlternateScreenshotPath`

### Test Cases

```typescript
describe("isBlockedDevicePath", () => {
  // Blocked devices
  test("blocks /dev/zero")
  test("blocks /dev/random")
  test("blocks /dev/urandom")
  test("blocks /dev/full")
  test("blocks /dev/stdin")
  test("blocks /dev/tty")
  test("blocks /dev/console")
  test("blocks /dev/stdout")
  test("blocks /dev/stderr")
  test("blocks /dev/fd/0")
  test("blocks /dev/fd/1")
  test("blocks /dev/fd/2")

  // Block /proc
  test("blocks /proc/self/fd/0")
  test("blocks /proc/123/fd/2")

  // Allowed paths
  test("allows /dev/null")
  test("allows regular file paths")
  test("allows /home/user/file.txt")
})

describe("getAlternateScreenshotPath", () => {
  test("returns undefined for path without AM/PM")
  test("returns alternate path for macOS screenshot with regular space before AM")
  test("returns alternate path for macOS screenshot with U+202F before PM")
  test("handles path without time component")
  test("handles multiple AM/PM occurrences")
  test("returns undefined when no space variant difference")
})
```

### Mock Requirements
Need to mock heavy dependency chain, obtain functions via `await import()`

---

## 4. `src/tools/AgentTool/__tests__/agentDisplay.test.ts` (~15 tests)

**Source file**: `src/tools/AgentTool/agentDisplay.ts` (105 lines)
**Target functions**: `resolveAgentOverrides`, `compareAgentsByName`

### Test Cases

```typescript
describe("resolveAgentOverrides", () => {
  test("marks no overrides when all agents active")
  test("marks inactive agent as overridden")
  test("overriddenBy shows the overriding agent source")
  test("deduplicates agents by (agentType, source)")
  test("preserves agent definition properties")
  test("handles empty arrays")
  test("handles agent from git worktree (duplicate detection)")
})

describe("compareAgentsByName", () => {
  test("sorts alphabetically ascending")
  test("returns negative when a.name < b.name")
  test("returns positive when a.name > b.name")
  test("returns 0 for same name")
  test("is case-sensitive")
})

describe("AGENT_SOURCE_GROUPS", () => {
  test("contains expected source groups in order")
  test("has unique labels")
})
```

### Mock Requirements
Need to mock `AgentDefinition`, `AgentSource` type dependencies

---

## 5. `src/tools/AgentTool/__tests__/agentToolUtils.test.ts` (~20 tests)

**Source file**: `src/tools/AgentTool/agentToolUtils.ts` (688 lines)
**Target functions**: `countToolUses`, `getLastToolUseName`, `extractPartialResult`

### Test Cases

```typescript
describe("countToolUses", () => {
  test("counts tool_use blocks in messages")
  test("returns 0 for messages without tool_use")
  test("returns 0 for empty array")
  test("counts multiple tool_use blocks across messages")
  test("counts tool_use in single message with multiple blocks")
})

describe("getLastToolUseName", () => {
  test("returns last tool name from assistant message")
  test("returns undefined for message without tool_use")
  test("returns the last tool when multiple tool_uses present")
  test("handles message with non-array content")
})

describe("extractPartialResult", () => {
  test("extracts text from last assistant message")
  test("returns undefined for messages without assistant content")
  test("handles interrupted agent with partial text")
  test("returns undefined for empty messages")
  test("concatenates multiple text blocks")
  test("skips non-text content blocks")
})
```

### Mock Requirements
Need to mock message type dependencies

---

## 6. `src/tools/SkillTool/__tests__/skillSafety.test.ts` (~15 tests)

**Source file**: `src/tools/SkillTool/SkillTool.ts` (1110 lines)
**Target functions**: `skillHasOnlySafeProperties`, `extractUrlScheme`

### Test Cases

```typescript
describe("skillHasOnlySafeProperties", () => {
  test("returns true for command with only safe properties")
  test("returns true for command with undefined extra properties")
  test("returns false for command with unsafe meaningful property")
  test("returns true for command with null extra properties")
  test("returns true for command with empty array extra property")
  test("returns true for command with empty object extra property")
  test("returns false for command with non-empty unsafe array")
  test("returns false for command with non-empty unsafe object")
  test("returns true for empty command object")
})

describe("extractUrlScheme", () => {
  test("extracts 'gs' from 'gs://bucket/path'")
  test("extracts 'https' from 'https://example.com'")
  test("extracts 'http' from 'http://example.com'")
  test("extracts 's3' from 's3://bucket/path'")
  test("defaults to 'gs' for unknown scheme")
  test("defaults to 'gs' for path without scheme")
  test("defaults to 'gs' for empty string")
})
```

### Mock Requirements
Need to mock heavy dependency chain, obtain functions via `await import()`

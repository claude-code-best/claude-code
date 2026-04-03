# Phase 19 - Batch 2: More utils + state + commands

> Estimated ~120 tests / 8 files | Some require lightweight mocking

---

## 1. `src/utils/__tests__/collapseTeammateShutdowns.test.ts` (~10 tests)

**Source file**: `src/utils/collapseTeammateShutdowns.ts` (56 lines)
**Dependencies**: Types only

### Test Cases

```typescript
describe("collapseTeammateShutdowns", () => {
  test("returns same messages when no teammate shutdowns")
  test("leaves single shutdown message unchanged")
  test("collapses consecutive shutdown messages into batch")
  test("batch attachment has correct count")
  test("does not collapse non-consecutive shutdowns")
  test("preserves non-shutdown messages between shutdowns")
  test("handles empty array")
  test("handles mixed message types")
  test("collapses more than 2 consecutive shutdowns")
  test("non-teammate task_status messages are not collapsed")
})
```

### Mock Requirements
Construct `RenderableMessage` mock objects (with `task_status` attachment, `status=completed`, `taskType=in_process_teammate`)

---

## 2. `src/utils/__tests__/privacyLevel.test.ts` (~12 tests)

**Source file**: `src/utils/privacyLevel.ts` (56 lines)
**Dependencies**: `process.env`

### Test Cases

```typescript
describe("getPrivacyLevel", () => {
  test("returns 'default' when no env vars set")
  test("returns 'essential-traffic' when CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC is set")
  test("returns 'no-telemetry' when DISABLE_TELEMETRY is set")
  test("'essential-traffic' takes priority over 'no-telemetry'")
})

describe("isEssentialTrafficOnly", () => {
  test("returns true for 'essential-traffic' level")
  test("returns false for 'default' level")
  test("returns false for 'no-telemetry' level")
})

describe("isTelemetryDisabled", () => {
  test("returns true for 'no-telemetry' level")
  test("returns true for 'essential-traffic' level")
  test("returns false for 'default' level")
})

describe("getEssentialTrafficOnlyReason", () => {
  test("returns env var name when restricted")
  test("returns null when unrestricted")
})
```

### Mock Requirements
`process.env` save/restore pattern (refer to existing `envUtils.test.ts`)

---

## 3. `src/utils/__tests__/textHighlighting.test.ts` (~18 tests)

**Source file**: `src/utils/textHighlighting.ts` (167 lines)
**Dependencies**: `@alcalzone/ansi-tokenize`

### Test Cases

```typescript
describe("segmentTextByHighlights", () => {
  // Basic
  test("returns single segment with no highlights")
  test("returns highlighted segment for single highlight")
  test("returns two segments for highlight covering middle portion")
  test("returns three segments for highlight in the middle")

  // Multiple highlights
  test("handles non-overlapping highlights")
  test("handles overlapping highlights (priority-based)")
  test("handles adjacent highlights")

  // Edge cases
  test("highlight starting at 0")
  test("highlight ending at text length")
  test("highlight covering entire text")
  test("empty text with highlights")
  test("empty highlights array returns single segment")

  // ANSI handling
  test("correctly segments text with ANSI escape codes")
  test("handles text with mixed ANSI and highlights")

  // Properties
  test("preserves highlight color property")
  test("preserves highlight priority property")
  test("preserves dimColor and inverse flags")
  test("highlights with start > end are handled gracefully")
})
```

### Mock Requirements
May need to mock `@alcalzone/ansi-tokenize`, or use directly (if installed)

---

## 4. `src/utils/__tests__/detectRepository.test.ts` (~15 tests)

**Source file**: `src/utils/detectRepository.ts` (179 lines)
**Dependencies**: git commands (`getRemoteUrl`)

### Key Functions to Test

**`parseGitRemote(input: string): ParsedRepository | null`** -- pure regex parsing
**`parseGitHubRepository(input: string): string | null`** -- pure function

### Test Cases

```typescript
describe("parseGitRemote", () => {
  // HTTPS
  test("parses HTTPS URL: https://github.com/owner/repo.git")
  test("parses HTTPS URL without .git suffix")
  test("parses HTTPS URL with subdirectory path (only takes first 2 segments)")

  // SSH
  test("parses SSH URL: git@github.com:owner/repo.git")
  test("parses SSH URL without .git suffix")

  // ssh://
  test("parses ssh:// URL: ssh://git@github.com/owner/repo.git")

  // git://
  test("parses git:// URL")

  // Edge cases
  test("returns null for invalid URL")
  test("returns null for empty string")
  test("handles GHE hostname")
  test("handles port number in URL")
})

describe("parseGitHubRepository", () => {
  test("extracts 'owner/repo' from valid remote URL")
  test("handles plain 'owner/repo' string input")
  test("returns null for non-GitHub host (if restricted)")
  test("returns null for invalid input")
  test("is case-sensitive for owner/repo")
})
```

### Mock Requirements
Only testing `parseGitRemote` and `parseGitHubRepository` (pure functions), no git mocking needed

---

## 5. `src/utils/__tests__/markdown.test.ts` (~20 tests)

**Source file**: `src/utils/markdown.ts` (382 lines)
**Dependencies**: `marked`, `cli-highlight`, theme types

### Key Function to Test

**`padAligned(content, displayWidth, targetWidth, align)`** -- pure function

### Test Cases

```typescript
describe("padAligned", () => {
  test("left-aligns: pads with spaces on right")
  test("right-aligns: pads with spaces on left")
  test("center-aligns: pads with spaces on both sides")
  test("no padding when displayWidth equals targetWidth")
  test("handles content wider than targetWidth")
  test("null/undefined align defaults to left")
  test("handles empty string content")
  test("handles zero displayWidth")
  test("handles zero targetWidth")
  test("center alignment with odd padding distribution")
})
```

Note: `numberToLetter`/`numberToRoman`/`getListNumber` are private functions and cannot be tested directly unless exported from the module. If truly private, test list rendering indirectly through `applyMarkdown`:

```typescript
describe("list numbering (via applyMarkdown)", () => {
  test("numbered list renders with digits")
  test("nested ordered list uses letters (a, b, c)")
  test("deep nested list uses roman numerals")
  test("unordered list uses bullet markers")
})
```

### Mock Requirements
`padAligned` needs no mocking. `applyMarkdown` may need to mock theme dependencies.

---

## 6. `src/state/__tests__/store.test.ts` (~15 tests)

**Source file**: `src/state/store.ts` (35 lines)
**Dependencies**: None

### Test Cases

```typescript
describe("createStore", () => {
  test("returns object with getState, setState, subscribe")
  test("getState returns initial state")
  test("setState updates state via updater function")
  test("setState does not notify when state unchanged (Object.is)")
  test("setState notifies subscribers on change")
  test("subscribe returns unsubscribe function")
  test("unsubscribe stops notifications")
  test("multiple subscribers all get notified")
  test("onChange callback is called on state change")
  test("onChange is not called when state unchanged")
  test("works with complex state objects")
  test("works with primitive state")
  test("updater receives previous state")
  test("sequential setState calls produce final state")
  test("subscriber called after all state changes in synchronous batch")
})
```

### Mock Requirements
None

---

## 7. `src/commands/plugin/__tests__/parseArgs.test.ts` (~18 tests)

**Source file**: `src/commands/plugin/parseArgs.ts` (104 lines)
**Dependencies**: None

### Test Cases

```typescript
describe("parsePluginArgs", () => {
  // No arguments
  test("returns { type: 'menu' } for undefined")
  test("returns { type: 'menu' } for empty string")
  test("returns { type: 'menu' } for whitespace only")

  // help
  test("returns { type: 'help' } for 'help'")

  // install
  test("parses 'install my-plugin' -> { type: 'install', name: 'my-plugin' }")
  test("parses 'install my-plugin@github' with marketplace")
  test("parses 'install https://github.com/...' as URL marketplace")

  // uninstall
  test("returns { type: 'uninstall', name: '...' }")

  // enable/disable
  test("returns { type: 'enable', name: '...' }")
  test("returns { type: 'disable', name: '...' }")

  // validate
  test("returns { type: 'validate', name: '...' }")

  // manage
  test("returns { type: 'manage' }")

  // Marketplace subcommands
  test("parses 'marketplace add ...'")
  test("parses 'marketplace remove ...'")
  test("parses 'marketplace list'")

  // Edge cases
  test("handles extra whitespace")
  test("handles unknown subcommand gracefully")
})
```

### Mock Requirements
None

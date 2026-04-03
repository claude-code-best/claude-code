# Phase 19 - Batch 1: Zero-Dependency Micro Utils

> Estimated ~154 tests / 13 files | All pure functions, no mocking needed

---

## 1. `src/utils/__tests__/semanticBoolean.test.ts` (~8 tests)

**Source file**: `src/utils/semanticBoolean.ts` (30 lines)
**Dependencies**: `zod/v4`

### Test Cases

```typescript
describe("semanticBoolean", () => {
  // Basic Zod behavior
  test("parses boolean true to true")
  test("parses boolean false to false")
  test("parses string 'true' to true")
  test("parses string 'false' to false")
  // Edge cases
  test("rejects string 'TRUE' (case-sensitive)")
  test("rejects string 'FALSE' (case-sensitive)")
  test("rejects number 1")
  test("rejects null")
  test("rejects undefined")
  // Custom inner schema
  test("works with custom inner schema (z.boolean().optional())")
})
```

### Mock Requirements
None

---

## 2. `src/utils/__tests__/semanticNumber.test.ts` (~10 tests)

**Source file**: `src/utils/semanticNumber.ts` (37 lines)
**Dependencies**: `zod/v4`

### Test Cases

```typescript
describe("semanticNumber", () => {
  test("parses number 42")
  test("parses number 0")
  test("parses negative number -5")
  test("parses float 3.14")
  test("parses string '42' to 42")
  test("parses string '-7.5' to -7.5")
  test("rejects string 'abc'")
  test("rejects empty string ''")
  test("rejects null")
  test("rejects boolean true")
  test("works with custom inner schema (z.number().int().min(0))")
})
```

### Mock Requirements
None

---

## 3. `src/utils/__tests__/lazySchema.test.ts` (~6 tests)

**Source file**: `src/utils/lazySchema.ts` (9 lines)
**Dependencies**: None

### Test Cases

```typescript
describe("lazySchema", () => {
  test("returns a function")
  test("calls factory on first invocation")
  test("returns cached result on subsequent invocations")
  test("factory is called only once (call count verification)")
  test("works with different return types")
  test("each call to lazySchema returns independent cache")
})
```

### Mock Requirements
None

---

## 4. `src/utils/__tests__/withResolvers.test.ts` (~8 tests)

**Source file**: `src/utils/withResolvers.ts` (14 lines)
**Dependencies**: None

### Test Cases

```typescript
describe("withResolvers", () => {
  test("returns object with promise, resolve, reject")
  test("promise resolves when resolve is called")
  test("promise rejects when reject is called")
  test("resolve passes value through")
  test("reject passes error through")
  test("promise is instanceof Promise")
  test("works with generic type parameter")
  test("resolve/reject can be called asynchronously")
})
```

### Mock Requirements
None

---

## 5. `src/utils/__tests__/userPromptKeywords.test.ts` (~12 tests)

**Source file**: `src/utils/userPromptKeywords.ts` (28 lines)
**Dependencies**: None

### Test Cases

```typescript
describe("matchesNegativeKeyword", () => {
  test("matches 'wtf'")
  test("matches 'shit'")
  test("matches 'fucking broken'")
  test("does not match normal input like 'fix the bug'")
  test("is case-insensitive")
  test("matches partial word in sentence")
})

describe("matchesKeepGoingKeyword", () => {
  test("matches exact 'continue'")
  test("matches 'keep going'")
  test("matches 'go on'")
  test("does not match 'cont'")
  test("does not match empty string")
  test("matches within larger sentence 'please continue'")
})
```

### Mock Requirements
None

---

## 6. `src/utils/__tests__/xdg.test.ts` (~15 tests)

**Source file**: `src/utils/xdg.ts` (66 lines)
**Dependencies**: None (injected via options parameter)

### Test Cases

```typescript
describe("getXDGStateHome", () => {
  test("returns ~/.local/state by default")
  test("respects XDG_STATE_HOME env var")
  test("uses custom homedir from options")
})

describe("getXDGCacheHome", () => {
  test("returns ~/.cache by default")
  test("respects XDG_CACHE_HOME env var")
})

describe("getXDGDataHome", () => {
  test("returns ~/.local/share by default")
  test("respects XDG_DATA_HOME env var")
})

describe("getUserBinDir", () => {
  test("returns ~/.local/bin")
  test("uses custom homedir from options")
})

describe("resolveOptions", () => {
  test("defaults env to process.env")
  test("defaults homedir to os.homedir()")
  test("merges partial options")
})

describe("path construction", () => {
  test("all paths end with correct subdirectory")
  test("respects HOME env via homedir override")
})
```

### Mock Requirements
None (injected via options.env and options.homedir)

---

## 7. `src/utils/__tests__/horizontalScroll.test.ts` (~20 tests)

**Source file**: `src/utils/horizontalScroll.ts` (138 lines)
**Dependencies**: None

### Test Cases

```typescript
describe("calculateHorizontalScrollWindow", () => {
  // Basic scenarios
  test("all items fit within available width")
  test("single item selected within view")
  test("selected item at beginning")
  test("selected item at end")
  test("selected item beyond visible range scrolls right")
  test("selected item before visible range scrolls left")

  // Arrow indicators
  test("showLeftArrow when items hidden on left")
  test("showRightArrow when items hidden on right")
  test("no arrows when all items visible")
  test("both arrows when items hidden on both sides")

  // Edge cases
  test("empty itemWidths array")
  test("single item")
  test("available width is 0")
  test("item wider than available width")
  test("all items same width")
  test("varying item widths")
  test("firstItemHasSeparator adds separator width to first item")
  test("selectedIdx in middle of overflow")
  test("scroll snaps to show selected at left edge")
  test("scroll snaps to show selected at right edge")
})
```

### Mock Requirements
None

---

## 8. `src/utils/__tests__/generators.test.ts` (~18 tests)

**Source file**: `src/utils/generators.ts` (89 lines)
**Dependencies**: None

### Test Cases

```typescript
describe("lastX", () => {
  test("returns last yielded value")
  test("returns only value from single-yield generator")
  test("throws on empty generator")
})

describe("returnValue", () => {
  test("returns generator return value")
  test("returns undefined for void return")
})

describe("toArray", () => {
  test("collects all yielded values")
  test("returns empty array for empty generator")
  test("preserves order")
})

describe("fromArray", () => {
  test("yields all array elements")
  test("yields nothing for empty array")
})

describe("all", () => {
  test("merges multiple generators preserving yield order")
  test("respects concurrency cap")
  test("handles empty generator array")
  test("handles single generator")
  test("handles generators of different lengths")
  test("yields all values from all generators")
})
```

### Mock Requirements
None (use fromArray to construct test data)

---

## 9. `src/utils/__tests__/sequential.test.ts` (~12 tests)

**Source file**: `src/utils/sequential.ts` (57 lines)
**Dependencies**: None

### Test Cases

```typescript
describe("sequential", () => {
  test("wraps async function, returns same result")
  test("single call resolves normally")
  test("concurrent calls execute sequentially (FIFO order)")
  test("preserves arguments correctly")
  test("error in first call does not block subsequent calls")
  test("preserves rejection reason")
  test("multiple args passed correctly")
  test("returns different wrapper for each call to sequential")
  test("handles rapid concurrent calls")
  test("execution order matches call order")
  test("works with functions returning different types")
  test("wrapper has same arity expectations")
})
```

### Mock Requirements
None

---

## 10. `src/utils/__tests__/fingerprint.test.ts` (~15 tests)

**Source file**: `src/utils/fingerprint.ts` (77 lines)
**Dependencies**: `crypto` (built-in)

### Test Cases

```typescript
describe("FINGERPRINT_SALT", () => {
  test("has expected value '59cf53e54c78'")
})

describe("extractFirstMessageText", () => {
  test("extracts text from first user message")
  test("extracts text from single user message with array content")
  test("returns empty string when no user messages")
  test("skips assistant messages")
  test("handles mixed content blocks (text + image)")
})

describe("computeFingerprint", () => {
  test("returns deterministic 3-char hex string")
  test("same input produces same fingerprint")
  test("different message text produces different fingerprint")
  test("different version produces different fingerprint")
  test("handles short strings (length < 21)")
  test("handles empty string")
  test("fingerprint is valid hex")
})

describe("computeFingerprintFromMessages", () => {
  test("end-to-end: messages -> fingerprint")
})
```

### Mock Requirements
Need `mock.module` to handle `UserMessage`/`AssistantMessage` type dependencies (check actual import situation)

---

## 11. `src/utils/__tests__/configConstants.test.ts` (~8 tests)

**Source file**: `src/utils/configConstants.ts` (22 lines)
**Dependencies**: None

### Test Cases

```typescript
describe("NOTIFICATION_CHANNELS", () => {
  test("contains expected channels")
  test("is readonly array")
  test("includes 'auto', 'iterm2', 'terminal_bell'")
})

describe("EDITOR_MODES", () => {
  test("contains 'normal' and 'vim'")
  test("has exactly 2 entries")
})

describe("TEAMMATE_MODES", () => {
  test("contains 'auto', 'tmux', 'in-process'")
  test("has exactly 3 entries")
})
```

### Mock Requirements
None

---

## 12. `src/utils/__tests__/directMemberMessage.test.ts` (~12 tests)

**Source file**: `src/utils/directMemberMessage.ts` (70 lines)
**Dependencies**: Types only (mockable)

### Test Cases

```typescript
describe("parseDirectMemberMessage", () => {
  test("parses '@agent-name hello world'")
  test("parses '@agent-name single-word'")
  test("returns null for non-matching input")
  test("returns null for empty string")
  test("returns null for '@name' without message")
  test("handles hyphenated agent names like '@my-agent msg'")
  test("handles multiline message content")
  test("extracts correct recipientName and message")
})

// sendDirectMemberMessage requires mocking teamContext/writeToMailbox
describe("sendDirectMemberMessage", () => {
  test("returns error when no team context")
  test("returns error for unknown recipient")
  test("calls writeToMailbox with correct args for valid recipient")
  test("returns success for valid message")
})
```

### Mock Requirements
`sendDirectMemberMessage` requires mocking `AppState['teamContext']` and `WriteToMailboxFn`

---

## 13. `src/utils/__tests__/collapseHookSummaries.test.ts` (~12 tests)

**Source file**: `src/utils/collapseHookSummaries.ts` (60 lines)
**Dependencies**: Types only

### Test Cases

```typescript
describe("collapseHookSummaries", () => {
  test("returns same messages when no hook summaries")
  test("collapses consecutive messages with same hookLabel")
  test("does not collapse messages with different hookLabels")
  test("aggregates hookCount across collapsed messages")
  test("merges hookInfos arrays")
  test("merges hookErrors arrays")
  test("takes max totalDurationMs")
  test("takes any truthy preventContinuation")
  test("leaves single hook summary unchanged")
  test("handles three consecutive same-label summaries")
  test("preserves non-hook messages in between")
  test("returns empty array for empty input")
})
```

### Mock Requirements
Need to construct `RenderableMessage` mock objects

# Phase 16 — Zero-Dependency Pure Function Tests

> Created: 2026-04-02
> Estimated: +120 tests / 8 files
> Goal: Cover all pure function / zero external dependency class modules

All modules are pure functions or classes with zero external dependencies, making mock cost zero and ROI highest.

---

## 16.1 `src/utils/__tests__/stream.test.ts` (~15 tests)

**Target module**: `src/utils/stream.ts` (76 lines)
**Exports**: `Stream<T>` class -- manual async queue implementing `AsyncIterator<T>`

| Test Case | Verification |
|---------|--------|
| enqueue then read | Single message delivered correctly |
| enqueue multiple then drain | Multiple messages consumed in order |
| done resolves pending readers | Iteration ends after `done()` |
| done with no pending readers | Safe shutdown when no waiters |
| error rejects pending readers | `error(e)` propagates exception |
| error after done | Subsequent operations handled safely |
| single-iteration guard | Cannot iterate after `return()` |
| empty stream done immediately | `done` returns `{ done: true }` when no data |
| concurrent enqueue | Multiple enqueues without data loss |
| backpressure | No data loss when reader is slower than writer |

---

## 16.2 `src/utils/__tests__/abortController.test.ts` (~12 tests)

**Target module**: `src/utils/abortController.ts` (99 lines)
**Exports**: `createAbortController()`, `createChildAbortController()`

| Test Case | Verification |
|---------|--------|
| parent abort propagates to child | `parent.abort()` -> child aborted |
| child abort does NOT propagate to parent | `child.abort()` -> parent still active |
| already-aborted parent -> child immediately aborted | Inherits abort state at creation time |
| child listener cleanup after parent abort | No leaks after WeakRef collection |
| multiple children of same parent | Independent abort propagation |
| child abort then parent abort | Order does not matter |
| signal.maxListeners raised | MaxListenersExceededWarning not triggered |

---

## 16.3 `src/utils/__tests__/bufferedWriter.test.ts` (~14 tests)

**Target module**: `src/utils/bufferedWriter.ts` (100 lines)
**Exports**: `createBufferedWriter()`

| Test Case | Verification |
|---------|--------|
| single write buffered | write -> buffer accumulates |
| flush on size threshold | Auto-flush when exceeding maxSize |
| flush on timer | Timer-triggered flush |
| immediate mode | `{ immediate: true }` bypasses buffering |
| overflow coalescing | Overflow content merged into next flush |
| empty buffer flush | No side effects when flushing empty buffer |
| close flushes remaining | close triggers final flush |
| multiple writes before flush | Batch writes merged |
| flush callback receives concatenated data | writeFn arguments correct |

**Mock**: Inject `writeFn` callback, optionally use fake timers

---

## 16.4 `src/utils/__tests__/gitDiff.test.ts` (~20 tests)

**Target module**: `src/utils/gitDiff.ts` (532 lines)
**Testable functions**: `parseGitNumstat()`, `parseGitDiff()`, `parseShortstat()`

| Test Case | Verification |
|---------|--------|
| parseGitNumstat — single file | `1\t2\tpath` -> { added: 1, deleted: 2, file: "path" } |
| parseGitNumstat — binary file | `-\t-\timage.png` -> binary flag |
| parseGitNumstat — rename | `{ old => new }` format parsing |
| parseGitNumstat — empty diff | Empty string -> [] |
| parseGitNumstat — multiple files | Correct multi-line splitting |
| parseGitDiff — added lines | Counting lines starting with `+` |
| parseGitDiff — deleted lines | Counting lines starting with `-` |
| parseGitDiff — hunk header | `@@ -a,b +c,d @@` parsing |
| parseGitDiff — new file mode | `new file mode 100644` detection |
| parseGitDiff — deleted file mode | `deleted file mode` detection |
| parseGitDiff — binary diff | Binary files differ handling |
| parseShortstat — all components | `1 file changed, 5 insertions(+), 3 deletions(-)` |
| parseShortstat — insertions only | No deletions |
| parseShortstat — deletions only | No insertions |
| parseShortstat — files only | Only file changed |
| parseShortstat — empty | Empty string -> default values |
| parseShortstat — rename | `1 file changed, ...` rename |

**Mock**: No mocking needed -- all pure string parsing

---

## 16.5 `src/__tests__/history.test.ts` (~18 tests)

**Target module**: `src/history.ts` (464 lines)
**Testable functions**: `parseReferences()`, `expandPastedTextRefs()`, `formatPastedTextRef()`, `formatImageRef()`, `getPastedTextRefNumLines()`

| Test Case | Verification |
|---------|--------|
| parseReferences — text ref | `#1` -> [{ type: "text", ref: 1 }] |
| parseReferences — image ref | `@1` -> [{ type: "image", ref: 1 }] |
| parseReferences — multiple refs | `#1 #2 @3` -> 3 refs |
| parseReferences — no refs | `"hello"` -> [] |
| parseReferences — duplicate refs | `#1 #1` -> deduplicated or preserved |
| parseReferences — zero ref | `#0` -> boundary |
| parseReferences — large ref | `#999` -> normal |
| formatPastedTextRef — basic | Output format verification |
| formatPastedTextRef — multiline | Multiline content format |
| getPastedTextRefNumLines — 1 line | Returns 1 |
| getPastedTextRefNumLines — multiple lines | Newline counting |
| expandPastedTextRefs — single ref | Replaces single reference |
| expandPastedTextRefs — multiple refs | Replaces multiple references |
| expandPastedTextRefs — no refs | Returns as-is |
| expandPastedTextRefs — mixed content | Text + references mixed |
| formatImageRef — basic | Output format |

**Mock**: `mock.module("src/bootstrap/state.ts", ...)` to unlock module

---

## 16.6 `src/utils/__tests__/sliceAnsi.test.ts` (~16 tests)

**Target module**: `src/utils/sliceAnsi.ts` (91 lines)
**Exports**: `sliceAnsi()` -- ANSI-aware string slicing

| Test Case | Verification |
|---------|--------|
| plain text slice | Equivalent to `"hello".slice(1,3)` |
| preserve ANSI codes | `\x1b[31mhello\x1b[0m` preserves color after slicing |
| close opened styles | Correctly closes when slice point is inside ANSI style |
| hyperlink handling | OSC 8 hyperlinks not broken |
| combining marks (diacritics) | `e\u0301` not split apart |
| Devanagari matras | Zero-width characters not broken |
| full-width characters | CJK character width = 2 |
| empty slice | Returns empty string |
| full slice | Returns full string |
| boundary at ANSI code | Boundary exactly at escape sequence |
| nested ANSI styles | Correctly handled with multiple nesting levels |
| slice start > end | Empty result |

**Mock**: `mock.module("@alcalzone/ansi-tokenize", ...)`, `mock.module("ink/stringWidth", ...)`

---

## 16.7 `src/utils/__tests__/treeify.test.ts` (~15 tests)

**Target module**: `src/utils/treeify.ts` (170 lines)
**Exports**: `treeify()` -- recursive tree rendering

| Test Case | Verification |
|---------|--------|
| simple flat tree | `{ a: {}, b: {} }` -> 2 lines |
| nested tree | `{ a: { b: { c: {} } } }` -> 3 lines with indentation |
| array values | `[1, 2, 3]` rendered as list |
| circular reference | No infinite recursion |
| empty object | `{}` handling |
| single key | Layout adaptation |
| branch vs last-branch character | branch vs last-branch |
| custom prefix | Options prefix propagation |
| deep nesting | Correct indentation at 5+ levels |
| mixed object/array | Mixed structure |

**Mock**: `mock.module("figures", ...)`, color module mock

---

## 16.8 `src/utils/__tests__/words.test.ts` (~10 tests)

**Target module**: `src/utils/words.ts` (800 lines, mostly word list data)
**Exports**: `generateWordSlug()`, `generateShortWordSlug()`

| Test Case | Verification |
|---------|--------|
| generateWordSlug format | `adjective-verb-noun` three-segment format |
| generateShortWordSlug format | `adjective-noun` two-segment format |
| all parts non-empty | No empty segments |
| hyphen separator | `-` separator |
| all parts from word lists | Components from predefined word lists |
| multiple calls uniqueness | Consecutive calls not always identical |
| no consecutive hyphens | No `--` |
| lowercase only | All lowercase |

**Mock**: `mock.module("crypto", ...)` to control `randomBytes` for deterministic tests

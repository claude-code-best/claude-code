# Plan 13 — CJK/Emoji Supplementary Tests for truncate

> Priority: Medium | 1 file | Estimated ~15 new test cases

`truncate.ts` uses `stringWidth` and grapheme segmentation to implement width-aware truncation, but existing tests only cover ASCII. This is a missing core scenario.

---

## Functions Under Test

- `truncateToWidth(text, maxWidth)` -- Tail truncation with `...`
- `truncateStartToWidth(text, maxWidth)` -- Head truncation with `...`
- `truncateToWidthNoEllipsis(text, maxWidth)` -- Tail truncation without ellipsis
- `truncatePathMiddle(path, maxLength)` -- Middle truncation of paths
- `wrapText(text, maxWidth)` -- Width-aware line wrapping

---

## New Cases

### CJK Full-Width Characters

| Case | Function | Input | maxWidth | Expected Behavior |
|------|------|------|----------|----------|
| Pure Chinese truncation | `truncateToWidth` | `"你好世界"` | 4 | `"你好…"` (each Chinese char occupies width 2) |
| Chinese-English mixed | `truncateToWidth` | `"hello你好"` | 8 | `"hello你…"` |
| Full-width no truncation | `truncateToWidth` | `"你好"` | 4 | `"你好"` (exactly 4) |
| Single emoji | `truncateToWidth` | `"👋"` | 2 | `"👋"` (emoji typically width 2) |
| Emoji truncation | `truncateToWidth` | `"hello 👋 world"` | 8 | Verify width calculation is correct |
| Head CJK | `truncateStartToWidth` | `"你好世界"` | 4 | `"…界"` |
| No-ellipsis CJK | `truncateToWidthNoEllipsis` | `"你好世界"` | 4 | `"你好"` |

> **Note**: Width calculation for CJK/emoji by `stringWidth` depends on the specific implementation. Confirm actual widths in the REPL before writing assertions:
> ```typescript
> import { stringWidth } from "src/utils/truncate.ts";
> console.log(stringWidth("你好")); // confirm whether it's 4 or 2
> console.log(stringWidth("👋"));  // confirm emoji width
> ```

### Path Middle Truncation Supplement

| Case | Input | maxLength | Expected |
|------|------|-----------|------|
| Overly long filename | `"/very/long/path/to/MyComponent.tsx"` | 10 | Contains `…` and ends with `.tsx` |
| Short string without slashes | `"abc"` | 1 | Confirm no error thrown |
| Very small maxLength | `"/a/b"` | 1 | Confirm no error thrown |
| maxLength=4 | `"/a/b/c.ts"` | 4 | Confirm behavior |

### wrapText Supplement

| Case | Input | maxWidth | Expected |
|------|------|----------|------|
| Contains newlines | `"hello\nworld"` | 10 | Preserves existing newlines |
| Width=0 | `"hello"` | 0 | Empty string or original (confirm no error thrown) |

---

## Implementation Steps

1. Confirm actual `stringWidth` return values for CJK/emoji in the REPL
2. Write precise assertions based on actual values
3. If `stringWidth` depends on ICU or platform-specific features, add platform checks (`process.platform !== "win32"` skip condition)
4. Run tests

---

## Acceptance Criteria

- [ ] At least 5 CJK/emoji-related tests passing
- [ ] Assertions based on actual `stringWidth` return values, not guesswork
- [ ] `bun test` all passing

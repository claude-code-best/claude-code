# Utility Functions (Pure Functions) Test Plan

## Overview

Covers all independently unit-testable pure functions under `src/utils/`. These functions have no external dependencies and exhibit deterministic input/output behavior, forming the foundational layer of the testing pyramid.

## Files Under Test

| File | Status | Key Exports |
|------|--------|-------------|
| `src/utils/array.ts` | **Has tests** | intersperse, count, uniq |
| `src/utils/set.ts` | **Has tests** | difference, intersects, every, union |
| `src/utils/xml.ts` | Needs tests | escapeXml, escapeXmlAttr |
| `src/utils/hash.ts` | Needs tests | djb2Hash, hashContent, hashPair |
| `src/utils/stringUtils.ts` | Needs tests | escapeRegExp, capitalize, plural, firstLineOf, countCharInString, normalizeFullWidthDigits, normalizeFullWidthSpace, safeJoinLines, truncateToLines, EndTruncatingAccumulator |
| `src/utils/semver.ts` | Needs tests | gt, gte, lt, lte, satisfies, order |
| `src/utils/uuid.ts` | Needs tests | validateUuid, createAgentId |
| `src/utils/format.ts` | Needs tests | formatFileSize, formatSecondsShort, formatDuration, formatNumber, formatTokens, formatRelativeTime, formatRelativeTimeAgo |
| `src/utils/json.ts` | Needs tests | safeParseJSON, safeParseJSONC, parseJSONL, addItemToJSONCArray |
| `src/utils/truncate.ts` | Needs tests | truncatePathMiddle, truncateToWidth, truncateStartToWidth, truncateToWidthNoEllipsis, truncate, wrapText |
| `src/utils/diff.ts` | Needs tests | adjustHunkLineNumbers, getPatchFromContents |
| `src/utils/frontmatterParser.ts` | Needs tests | parseFrontmatter, splitPathInFrontmatter, parsePositiveIntFromFrontmatter, parseBooleanFrontmatter, parseShellFrontmatter |
| `src/utils/file.ts` | Needs tests (pure function portion) | convertLeadingTabsToSpaces, addLineNumbers, stripLineNumberPrefix, pathsEqual, normalizePathForComparison |
| `src/utils/glob.ts` | Needs tests (pure function portion) | extractGlobBaseDirectory |
| `src/utils/tokens.ts` | Needs tests | getTokenCountFromUsage |
| `src/utils/path.ts` | Needs tests (pure function portion) | containsPathTraversal, normalizePathForConfigKey |

---

## Test Cases

### src/utils/xml.ts — Test file: `src/utils/__tests__/xml.test.ts`

#### describe('escapeXml')

- test('escapes ampersand') — `&` → `&amp;`
- test('escapes less-than') — `<` → `&lt;`
- test('escapes greater-than') — `>` → `&gt;`
- test('does not escape quotes') — `"` and `'` remain unchanged
- test('handles empty string') — `""` → `""`
- test('handles string with no special chars') — `"hello"` returned as-is
- test('escapes multiple special chars in one string') — `<a & b>` → `&lt;a &amp; b&gt;`

#### describe('escapeXmlAttr')

- test('escapes all xml chars plus quotes') — `"` → `&quot;`, `'` → `&apos;`
- test('escapes double quotes') — `he said "hi"` correctly escaped
- test('escapes single quotes') — `it's` correctly escaped

---

### src/utils/hash.ts — Test file: `src/utils/__tests__/hash.test.ts`

#### describe('djb2Hash')

- test('returns consistent hash for same input') — Same input returns same result
- test('returns different hashes for different inputs') — Different inputs most likely produce different results
- test('returns a 32-bit integer') — Result is within int32 range
- test('handles empty string') — Empty string has a deterministic hash value
- test('handles unicode strings') — Chinese characters/emoji etc. handled correctly

#### describe('hashContent')

- test('returns consistent hash for same content') — Deterministic
- test('returns string result') — Return value is a string

#### describe('hashPair')

- test('returns consistent hash for same pair') — Deterministic
- test('order matters') — hashPair(a, b) != hashPair(b, a)
- test('handles empty strings')

---

### src/utils/stringUtils.ts — Test file: `src/utils/__tests__/stringUtils.test.ts`

#### describe('escapeRegExp')

- test('escapes dots') — `.` → `\\.`
- test('escapes asterisks') — `*` → `\\*`
- test('escapes brackets') — `[` → `\\[`
- test('escapes all special chars') — `.*+?^${}()|[]\` all escaped
- test('leaves normal chars unchanged') — `hello` unchanged
- test('escaped string works in RegExp') — `new RegExp(escapeRegExp('a.b'))` exactly matches `a.b`

#### describe('capitalize')

- test('uppercases first char') — `"foo"` → `"Foo"`
- test('does NOT lowercase rest') — `"fooBar"` → `"FooBar"` (unlike lodash capitalize)
- test('handles single char') — `"a"` → `"A"`
- test('handles empty string') — `""` → `""`
- test('handles already capitalized') — `"Foo"` → `"Foo"`

#### describe('plural')

- test('returns singular for n=1') — `plural(1, 'file')` → `'file'`
- test('returns plural for n=0') — `plural(0, 'file')` → `'files'`
- test('returns plural for n>1') — `plural(3, 'file')` → `'files'`
- test('uses custom plural form') — `plural(2, 'entry', 'entries')` → `'entries'`

#### describe('firstLineOf')

- test('returns first line of multi-line string') — `"a\nb\nc"` → `"a"`
- test('returns full string when no newline') — `"hello"` → `"hello"`
- test('handles empty string') — `""` → `""`
- test('handles string starting with newline') — `"\nhello"` → `""`

#### describe('countCharInString')

- test('counts occurrences') — `countCharInString("aabac", "a")` → `3`
- test('returns 0 when char not found') — `countCharInString("hello", "x")` → `0`
- test('handles empty string') — `countCharInString("", "a")` → `0`
- test('respects start position') — `countCharInString("aaba", "a", 2)` → `1`

#### describe('normalizeFullWidthDigits')

- test('converts full-width digits to half-width') — `"０１２３"` → `"0123"`
- test('leaves half-width digits unchanged') — `"0123"` → `"0123"`
- test('mixed content') — `"port ８０８０"` → `"port 8080"`

#### describe('normalizeFullWidthSpace')

- test('converts ideographic space to regular space') — `"\u3000"` → `" "`
- test('converts multiple spaces') — `"a\u3000b\u3000c"` → `"a b c"`

#### describe('safeJoinLines')

- test('joins lines with default delimiter') — `["a","b"]` → `"a,b"`
- test('truncates when exceeding maxSize') — Truncates and appends `...[truncated]` when limit exceeded
- test('handles empty array') — `[]` → `""`
- test('uses custom delimiter') — When delimiter is `"\n"`, joins by line

#### describe('truncateToLines')

- test('returns full text when within limit') — Returns as-is when line count does not exceed limit
- test('truncates and adds ellipsis') — Truncates and adds `...` when limit exceeded
- test('handles exact limit') — Does not truncate when exactly at maxLines
- test('handles single line') — Single-line text is not truncated

#### describe('EndTruncatingAccumulator')

- test('accumulates strings normally within limit')
- test('truncates when exceeding maxSize')
- test('reports truncated status correctly')
- test('reports totalBytes including truncated content')
- test('toString includes truncation marker')
- test('clear resets all state')
- test('append with Buffer works') — Accepts Buffer type

---

### src/utils/semver.ts — Test file: `src/utils/__tests__/semver.test.ts`

#### describe('gt / gte / lt / lte')

- test('gt: 2.0.0 > 1.0.0') → true
- test('gt: 1.0.0 > 1.0.0') → false
- test('gte: 1.0.0 >= 1.0.0') → true
- test('lt: 1.0.0 < 2.0.0') → true
- test('lte: 1.0.0 <= 1.0.0') → true
- test('handles pre-release versions') — `1.0.0-beta < 1.0.0`

#### describe('satisfies')

- test('version satisfies caret range') — `satisfies('1.2.3', '^1.0.0')` → true
- test('version does not satisfy range') — `satisfies('2.0.0', '^1.0.0')` → false
- test('exact match') — `satisfies('1.0.0', '1.0.0')` → true

#### describe('order')

- test('returns -1 for lesser') — `order('1.0.0', '2.0.0')` → -1
- test('returns 0 for equal') — `order('1.0.0', '1.0.0')` → 0
- test('returns 1 for greater') — `order('2.0.0', '1.0.0')` → 1

---

### src/utils/uuid.ts — Test file: `src/utils/__tests__/uuid.test.ts`

#### describe('validateUuid')

- test('accepts valid v4 UUID') — `'550e8400-e29b-41d4-a716-446655440000'` → returns UUID
- test('returns null for invalid format') — `'not-a-uuid'` → null
- test('returns null for empty string') — `''` → null
- test('returns null for null/undefined input')
- test('accepts uppercase UUIDs') — Uppercase letters are valid

#### describe('createAgentId')

- test('returns string starting with "a"') — Prefix is `a`
- test('has correct length') — Prefix + 16 hex characters
- test('generates unique ids') — Two consecutive calls produce different results

---

### src/utils/format.ts — Test file: `src/utils/__tests__/format.test.ts`

#### describe('formatFileSize')

- test('formats bytes') — `500` → `"500 bytes"`
- test('formats kilobytes') — `1536` → `"1.5KB"`
- test('formats megabytes') — `1572864` → `"1.5MB"`
- test('formats gigabytes') — `1610612736` → `"1.5GB"`
- test('removes trailing .0') — `1024` → `"1KB"` (not `"1.0KB"`)

#### describe('formatSecondsShort')

- test('formats milliseconds to seconds') — `1234` → `"1.2s"`
- test('formats zero') — `0` → `"0.0s"`

#### describe('formatDuration')

- test('formats seconds') — `5000` → `"5s"`
- test('formats minutes and seconds') — `65000` → `"1m 5s"`
- test('formats hours') — `3661000` → `"1h 1m 1s"`
- test('formats days') — `90061000` → `"1d 1h 1m"`
- test('returns "0s" for zero') — `0` → `"0s"`
- test('hideTrailingZeros omits zero components') — `3600000` + `hideTrailingZeros` → `"1h"`
- test('mostSignificantOnly returns largest unit') — `3661000` + `mostSignificantOnly` → `"1h"`

#### describe('formatNumber')

- test('formats thousands') — `1321` → `"1.3k"`
- test('formats small numbers as-is') — `900` → `"900"`
- test('lowercase output') — `1500` → `"1.5k"` (not `"1.5K"`)

#### describe('formatTokens')

- test('strips .0 suffix') — `1000` → `"1k"` (not `"1.0k"`)
- test('keeps non-zero decimal') — `1500` → `"1.5k"`

#### describe('formatRelativeTime')

- test('formats past time') — now - 3600s → `"1h ago"` (narrow style)
- test('formats future time') — now + 3600s → `"in 1h"` (narrow style)
- test('formats less than 1 second') — now → `"0s ago"`
- test('uses custom now parameter for deterministic output')

---

### src/utils/json.ts — Test file: `src/utils/__tests__/json.test.ts`

#### describe('safeParseJSON')

- test('parses valid JSON') — `'{"a":1}'` → `{ a: 1 }`
- test('returns null for invalid JSON') — `'not json'` → null
- test('returns null for null input') — `null` → null
- test('returns null for undefined input') — `undefined` → null
- test('returns null for empty string') — `""` → null
- test('handles JSON with BOM') — BOM prefix does not affect parsing
- test('caches results for repeated calls') — Same input is not parsed repeatedly

#### describe('safeParseJSONC')

- test('parses JSON with comments') — JSON containing `//` comments parsed correctly
- test('parses JSON with trailing commas') — Lenient mode
- test('returns null for invalid input')
- test('returns null for null input')

#### describe('parseJSONL')

- test('parses multiple JSON lines') — `'{"a":1}\n{"b":2}'` → `[{a:1}, {b:2}]`
- test('skips malformed lines') — Skips lines with errors
- test('handles empty input') — `""` → `[]`
- test('handles trailing newline') — Trailing newline does not produce an empty element
- test('accepts Buffer input') — Buffer type also works
- test('handles BOM prefix')

#### describe('addItemToJSONCArray')

- test('adds item to existing array') — `[1, 2]` + 3 → `[1, 2, 3]`
- test('creates new array for empty content') — `""` + item → `[item]`
- test('creates new array for non-array content') — `'"hello"'` + item → `[item]`
- test('preserves comments in JSONC') — Comments are not discarded
- test('handles empty array') — `"[]"` + item → `[item]`

---

### src/utils/diff.ts — Test file: `src/utils/__tests__/diff.test.ts`

#### describe('adjustHunkLineNumbers')

- test('shifts line numbers by positive offset') — All hunks' oldStart/newStart increased by offset
- test('shifts by negative offset') — Negative offset decreases line numbers
- test('handles empty hunk array') — `[]` → `[]`

#### describe('getPatchFromContents')

- test('returns empty array for identical content') — Same content produces no diff
- test('detects added lines') — New content has additional lines
- test('detects removed lines') — Old content has missing lines
- test('detects modified lines') — Line content changed
- test('handles empty old content') — From empty file to content
- test('handles empty new content') — Deleting all content

---

### src/utils/frontmatterParser.ts — Test file: `src/utils/__tests__/frontmatterParser.test.ts`

#### describe('parseFrontmatter')

- test('extracts YAML frontmatter between --- delimiters') — Correctly extracts frontmatter and returns body
- test('returns empty frontmatter for content without ---') — Empty data when no frontmatter
- test('handles empty content') — `""` handled correctly
- test('handles frontmatter-only content') — Only frontmatter without body
- test('falls back to quoting on YAML parse error') — Invalid YAML does not crash

#### describe('splitPathInFrontmatter')

- test('splits comma-separated paths') — `"a.ts, b.ts"` → `["a.ts", "b.ts"]`
- test('expands brace patterns') — `"*.{ts,tsx}"` → `["*.ts", "*.tsx"]`
- test('handles string array input') — `["a.ts", "b.ts"]` → `["a.ts", "b.ts"]`
- test('respects braces in comma splitting') — Commas inside braces are not used as delimiters

#### describe('parsePositiveIntFromFrontmatter')

- test('returns number for valid positive int') — `5` → `5`
- test('returns undefined for negative') — `-1` → undefined
- test('returns undefined for non-number') — `"abc"` → undefined
- test('returns undefined for float') — `1.5` → undefined

#### describe('parseBooleanFrontmatter')

- test('returns true for true') — `true` → true
- test('returns true for "true"') — `"true"` → true
- test('returns false for false') — `false` → false
- test('returns false for other values') — `"yes"`, `1` → false

#### describe('parseShellFrontmatter')

- test('returns bash for "bash"') — Correctly identified
- test('returns powershell for "powershell"')
- test('returns undefined for invalid value') — `"zsh"` → undefined

---

### src/utils/file.ts (pure function portion) — Test file: `src/utils/__tests__/file.test.ts`

#### describe('convertLeadingTabsToSpaces')

- test('converts single tab to 2 spaces') — `"\thello"` → `"  hello"`
- test('converts multiple leading tabs') — `"\t\thello"` → `"    hello"`
- test('does not convert tabs within line') — `"a\tb"` remains unchanged
- test('handles mixed content')

#### describe('addLineNumbers')

- test('adds line numbers starting from 1') — Each line gets a `N\t` prefix
- test('respects startLine parameter') — Starts from the specified line number
- test('handles empty content')

#### describe('stripLineNumberPrefix')

- test('strips tab-prefixed line number') — `"1\thello"` → `"hello"`
- test('strips padded line number') — `"  1\thello"` → `"hello"`
- test('returns line unchanged when no prefix')

#### describe('pathsEqual')

- test('returns true for identical paths')
- test('handles trailing slashes') — With/without trailing slash treated as equal
- test('handles case sensitivity based on platform')

#### describe('normalizePathForComparison')

- test('normalizes forward slashes')
- test('resolves path for comparison')

---

### src/utils/glob.ts (pure function portion) — Test file: `src/utils/__tests__/glob.test.ts`

#### describe('extractGlobBaseDirectory')

- test('extracts static prefix from glob') — `"src/**/*.ts"` → `{ baseDir: "src", relativePattern: "**/*.ts" }`
- test('handles root-level glob') — `"*.ts"` → `{ baseDir: ".", relativePattern: "*.ts" }`
- test('handles deep static path') — `"src/utils/model/*.ts"` → baseDir is `"src/utils/model"`
- test('handles Windows drive root') — `"C:\\Users\\**\\*.ts"` correctly split

---

### src/utils/tokens.ts (pure function portion) — Test file: `src/utils/__tests__/tokens.test.ts`

#### describe('getTokenCountFromUsage')

- test('sums input and output tokens') — `{ input_tokens: 100, output_tokens: 50 }` → 150
- test('includes cache tokens') — cache_creation + cache_read included in total
- test('handles zero values') — Returns 0 when all values are 0

---

### src/utils/path.ts (pure function portion) — Test file: `src/utils/__tests__/path.test.ts`

#### describe('containsPathTraversal')

- test('detects ../ traversal') — `"../etc/passwd"` → true
- test('detects mid-path traversal') — `"foo/../../bar"` → true
- test('returns false for safe paths') — `"src/utils/file.ts"` → false
- test('returns false for paths containing .. in names') — `"foo..bar"` → false

#### describe('normalizePathForConfigKey')

- test('converts backslashes to forward slashes') — `"src\\utils"` → `"src/utils"`
- test('leaves forward slashes unchanged')

---

## Mock Requirements

Most functions in this plan are pure functions and **require no mocks**. A few exceptions:

| Function | Dependency | Handling |
|----------|-----------|----------|
| `hashContent` / `hashPair` | `Bun.hash` | Automatically available under Bun runtime |
| `formatRelativeTime` | `Date` | Use `now` parameter to inject deterministic time |
| `safeParseJSON` | `logError` | Can skip via `shouldLogError: false` |
| `safeParseJSONC` | `logError` | Mock `logError` to avoid noisy test output |

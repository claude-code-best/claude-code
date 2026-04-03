# Context Building Test Plan

## Overview

The context building system is responsible for assembling the system prompt and user context sent to the Claude API. It consists of three parts: git status retrieval, CLAUDE.md file discovery and loading, and system prompt assembly.

## Files Under Test

| File | Key Exports |
|------|-------------|
| `src/context.ts` | `getSystemContext`, `getUserContext`, `getGitStatus`, `setSystemPromptInjection` |
| `src/utils/claudemd.ts` | `stripHtmlComments`, `getClaudeMds`, `isMemoryFilePath`, `getLargeMemoryFiles`, `filterInjectedMemoryFiles`, `getExternalClaudeMdIncludes`, `hasExternalClaudeMdIncludes`, `processMemoryFile`, `getMemoryFiles` |
| `src/utils/systemPrompt.ts` | `buildEffectiveSystemPrompt` |

---

## Test Cases

### src/utils/claudemd.ts — Pure Function Portion

#### describe('stripHtmlComments')

- test('strips block-level HTML comments') — `"text <!-- comment --> more"` → content does not contain the comment
- test('preserves inline content') — Inline text is preserved
- test('preserves code block content') — Comments inside ` ```html\n<!-- not stripped -->\n``` ` are not removed
- test('returns stripped: false when no comments') — stripped is false when there are no comments
- test('returns stripped: true when comments exist')
- test('handles empty string') — `""` → `{ content: "", stripped: false }`
- test('handles multiple comments') — All comments are removed

#### describe('getClaudeMds')

- test('assembles memory files with type descriptions') — Different types have different prefix descriptions
- test('includes instruction prompt prefix') — Output includes instruction prefix
- test('handles empty memory files array') — Empty array returns empty string or minimal prefix
- test('respects filter parameter') — Filter function can exclude specific types
- test('concatenates multiple files with separators')

#### describe('isMemoryFilePath')

- test('returns true for CLAUDE.md path') — `"/project/CLAUDE.md"` → true
- test('returns true for .claude/rules/ path') — `"/project/.claude/rules/foo.md"` → true
- test('returns true for memory file path') — `"~/.claude/memory/foo.md"` → true
- test('returns false for regular file') — `"/project/src/main.ts"` → false
- test('returns false for unrelated .md file') — `"/project/README.md"` → false

#### describe('getLargeMemoryFiles')

- test('returns files exceeding 40K chars') — Files with content > MAX_MEMORY_CHARACTER_COUNT are returned
- test('returns empty array when all files are small')
- test('correctly identifies threshold boundary')

#### describe('filterInjectedMemoryFiles')

- test('filters out AutoMem type files') — Removes auto-memory when feature flag is enabled
- test('filters out TeamMem type files')
- test('preserves other types') — Non-AutoMem/TeamMem files are preserved

#### describe('getExternalClaudeMdIncludes')

- test('returns includes from outside CWD') — External @include paths are identified
- test('returns empty array when all includes are internal')

#### describe('hasExternalClaudeMdIncludes')

- test('returns true when external includes exist')
- test('returns false when no external includes')

---

### src/utils/systemPrompt.ts

#### describe('buildEffectiveSystemPrompt')

- test('returns default system prompt when no overrides') — Uses default prompt when no overrides are present
- test('overrideSystemPrompt replaces everything') — Override mode replaces all content
- test('customSystemPrompt replaces default') — `--system-prompt` parameter replaces the default
- test('appendSystemPrompt is appended after main prompt') — Append comes after the main prompt
- test('agent definition replaces default prompt') — Agent mode uses agent prompt
- test('agent definition with append combines both') — Agent prompt + append
- test('override takes precedence over agent and custom') — Highest priority
- test('returns array of strings') — Return value is SystemPrompt type (string array)

---

### src/context.ts — Portions Requiring Mocks

#### describe('getGitStatus')

- test('returns formatted git status string') — Contains branch, status, log, user
- test('truncates status at 2000 chars') — Overly long status is truncated
- test('returns null in test environment') — Returns null when `NODE_ENV=test`
- test('returns null in non-git directory') — Returns null for non-git repositories
- test('runs git commands in parallel') — Multiple git commands execute in parallel

#### describe('getSystemContext')

- test('includes gitStatus key') — Returned object contains gitStatus
- test('returns memoized result on subsequent calls') — Multiple calls return the same result
- test('skips git when instructions disabled')

#### describe('getUserContext')

- test('includes currentDate key') — Returned object contains current date
- test('includes claudeMd key when CLAUDE.md exists') — Loads CLAUDE.md content
- test('respects CLAUDE_CODE_DISABLE_CLAUDE_MDS env') — Does not load CLAUDE.md when set
- test('returns memoized result')

#### describe('setSystemPromptInjection')

- test('clears memoized context caches') — Next call to getSystemContext/getUserContext recomputes
- test('injection value is accessible via getSystemPromptInjection')

---

## Mock Requirements

| Dependency | Mock Approach | Purpose |
|------------|---------------|---------|
| `execFileNoThrow` | `mock.module` | Git commands in `getGitStatus` |
| `getMemoryFiles` | `mock.module` | CLAUDE.md loading in `getUserContext` |
| `getCwd` | `mock.module` | Path resolution context |
| `process.env.NODE_ENV` | Set directly | Test environment detection |
| `process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS` | Set directly | Disable CLAUDE.md |

## Integration Test Scenarios

Located in `tests/integration/context-build.test.ts`:

### describe('Context assembly pipeline')

- test('getUserContext produces claudeMd containing CLAUDE.md content') — End-to-end verification that CLAUDE.md is correctly loaded into context
- test('buildEffectiveSystemPrompt + getUserContext produces complete prompt') — System prompt + user context completeness
- test('setSystemPromptInjection invalidates and rebuilds context') — Context is rebuilt after injection

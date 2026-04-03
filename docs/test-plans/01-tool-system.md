# Tool System Test Plan

## Overview

The Tool system is the core of Claude Code, responsible for tool definition, registration, discovery, and filtering. This plan covers tool interfaces and utility functions in `src/Tool.ts`, registration/filtering logic in `src/tools.ts`, and independently testable pure functions in each tool's directory.

## Files Under Test

| File | Key Exports |
|------|-------------|
| `src/Tool.ts` | `buildTool`, `toolMatchesName`, `findToolByName`, `getEmptyToolPermissionContext`, `filterToolProgressMessages` |
| `src/tools.ts` | `parseToolPreset`, `filterToolsByDenyRules`, `getAllBaseTools`, `getTools`, `assembleToolPool` |
| `src/tools/shared/gitOperationTracking.ts` | `parseGitCommitId`, `detectGitOperation` |
| `src/tools/shared/spawnMultiAgent.ts` | `resolveTeammateModel`, `generateUniqueTeammateName` |
| `src/tools/GrepTool/GrepTool.ts` | `applyHeadLimit`, `formatLimitInfo` (internal helper functions) |
| `src/tools/FileEditTool/utils.ts` | String matching/patching related pure functions |

---

## Test Cases

### src/Tool.ts

#### describe('buildTool')

- test('fills in default isEnabled as true') — When isEnabled is not provided, the built tool.isEnabled() should return true
- test('fills in default isConcurrencySafe as false') — Default should be false (fail-closed)
- test('fills in default isReadOnly as false') — Default assumes write operations
- test('fills in default isDestructive as false') — Default is non-destructive
- test('fills in default checkPermissions as allow') — Default checkPermissions should return `{ behavior: 'allow', updatedInput }`
- test('fills in default userFacingName from tool name') — userFacingName should default to tool.name
- test('preserves explicitly provided methods') — Custom isEnabled and other methods passed in should override defaults
- test('preserves all non-defaultable properties') — name, inputSchema, call, description and other properties are preserved as-is

#### describe('toolMatchesName')

- test('returns true for exact name match') — `{ name: 'Bash' }` matches 'Bash'
- test('returns false for non-matching name') — `{ name: 'Bash' }` does not match 'Read'
- test('returns true when name matches an alias') — `{ name: 'Bash', aliases: ['BashTool'] }` matches 'BashTool'
- test('returns false when aliases is undefined') — `{ name: 'Bash' }` does not match 'BashTool'
- test('returns false when aliases is empty') — `{ name: 'Bash', aliases: [] }` does not match 'BashTool'

#### describe('findToolByName')

- test('finds tool by primary name') — Finds tool by name from the tools list
- test('finds tool by alias') — Finds tool by alias from the tools list
- test('returns undefined when no match') — Returns undefined when not found
- test('returns first match when duplicates exist') — Returns the first tool when multiple tools share the same name

#### describe('getEmptyToolPermissionContext')

- test('returns default permission mode') — mode should be 'default'
- test('returns empty maps and arrays') — additionalWorkingDirectories is an empty Map, rules is an empty object
- test('returns isBypassPermissionsModeAvailable as false')

#### describe('filterToolProgressMessages')

- test('filters out hook_progress messages') — Removes messages with type hook_progress
- test('keeps tool progress messages') — Preserves non-hook_progress messages
- test('returns empty array for empty input')
- test('handles messages without type field') — Messages where data has no type should be preserved

---

### src/tools.ts

#### describe('parseToolPreset')

- test('returns "default" for "default" input') — Exact match
- test('returns "default" for "Default" input') — Case-insensitive
- test('returns null for unknown preset') — Unknown string returns null
- test('returns null for empty string')

#### describe('filterToolsByDenyRules')

- test('returns all tools when no deny rules') — Empty deny rules do not filter any tools
- test('filters out tools matching blanket deny rule') — Deny rule `{ toolName: 'Bash' }` should remove Bash
- test('does not filter tools with content-specific deny rules') — Deny rule `{ toolName: 'Bash', ruleContent: 'rm -rf' }` does not remove Bash (only blocks specific commands at runtime)
- test('filters MCP tools by server name prefix') — Deny rule `mcp__server` should remove all tools under that server
- test('preserves tools not matching any deny rule')

#### describe('getAllBaseTools')

- test('returns a non-empty array of tools') — Contains at least the core tools
- test('each tool has required properties') — Each tool should have name, inputSchema, call, and other properties
- test('includes BashTool, FileReadTool, FileEditTool') — Core tools are always present
- test('includes TestingPermissionTool when NODE_ENV is test') — Requires setting env

#### describe('getTools')

- test('returns filtered tools based on permission context') — Filters based on deny rules
- test('returns simple tools in CLAUDE_CODE_SIMPLE mode') — Returns only Bash/Read/Edit
- test('filters disabled tools via isEnabled') — Tools where isEnabled returns false are excluded

---

### src/tools/shared/gitOperationTracking.ts

#### describe('parseGitCommitId')

- test('extracts commit hash from git commit output') — Extracts `abc1234` from `[main abc1234] message`
- test('returns null for non-commit output') — Returns null when parsing fails
- test('handles various branch name formats') — `[feature/foo abc1234]` etc.

#### describe('detectGitOperation')

- test('detects git commit operation') — Identified as commit when command contains `git commit`
- test('detects git push operation') — Identified when command contains `git push`
- test('returns null for non-git commands') — Returns null for non-git commands
- test('detects git merge operation')
- test('detects git rebase operation')

---

### src/tools/shared/spawnMultiAgent.ts

#### describe('resolveTeammateModel')

- test('returns specified model when provided')
- test('falls back to default model when not specified')

#### describe('generateUniqueTeammateName')

- test('generates a name when no existing names') — Returns base name when no conflicts
- test('appends suffix when name conflicts') — Adds suffix when conflicting with existing names
- test('handles multiple conflicts') — Increments suffix on multiple conflicts

---

## Mock Requirements

| Dependency | Mock Approach | Notes |
|------------|---------------|-------|
| `bun:bundle` (feature) | Already polyfilled as `() => false` | No additional mock needed |
| `process.env` | `bun:test` mock | For testing `USER_TYPE`, `NODE_ENV`, `CLAUDE_CODE_SIMPLE` |
| `getDenyRuleForTool` | mock module | Needs controlled return values in `filterToolsByDenyRules` tests |
| `isToolSearchEnabledOptimistic` | mock module | Conditional loading in `getAllBaseTools` |

## Integration Test Scenarios

Located in `tests/integration/tool-chain.test.ts`:

### describe('Tool registration and discovery')

- test('getAllBaseTools returns tools that can be found by findToolByName') — Registration to discovery full pipeline
- test('filterToolsByDenyRules + getTools produces consistent results') — Filtering pipeline consistency
- test('assembleToolPool deduplicates built-in and MCP tools') — Merge and deduplication logic

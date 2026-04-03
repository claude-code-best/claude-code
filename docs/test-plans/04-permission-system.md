# Permission System Test Plan

## Overview

The permission system controls whether tools can execute. It includes rule parsers, permission check pipelines, and permission mode evaluation. The testing focus is on pure function parsers and rule matching logic.

## Files Under Test

| File | Key Exports |
|------|-------------|
| `src/utils/permissions/permissionRuleParser.ts` | `permissionRuleValueFromString`, `permissionRuleValueToString`, `escapeRuleContent`, `unescapeRuleContent`, `normalizeLegacyToolName`, `getLegacyToolNames` |
| `src/utils/permissions/PermissionMode.ts` | Permission mode constants and helper functions |
| `src/utils/permissions/permissions.ts` | `hasPermissionsToUseTool`, `getDenyRuleForTool`, `checkRuleBasedPermissions` |
| `src/types/permissions.ts` | `PermissionMode`, `PermissionBehavior`, `PermissionRule` type definitions |

---

## Test Cases

### src/utils/permissions/permissionRuleParser.ts

#### describe('escapeRuleContent')

- test('escapes backslashes first') — `'test\\value'` → `'test\\\\value'`
- test('escapes opening parentheses') — `'print(1)'` → `'print\\(1\\)'`
- test('escapes closing parentheses') — `'func()'` → `'func\\(\\)'`
- test('handles combined escape') — `\\` in `'echo "test\\nvalue"'` is escaped first
- test('handles empty string') — `''` → `''`
- test('no-op for string without special chars') — `'npm install'` returned as-is

#### describe('unescapeRuleContent')

- test('unescapes parentheses') — `'print\\(1\\)'` → `'print(1)'`
- test('unescapes backslashes last') — `'test\\\\nvalue'` → `'test\\nvalue'`
- test('handles empty string')
- test('roundtrip: escape then unescape returns original') — `unescapeRuleContent(escapeRuleContent(x)) === x`

#### describe('permissionRuleValueFromString')

- test('parses tool name only') — `'Bash'` → `{ toolName: 'Bash' }`
- test('parses tool name with content') — `'Bash(npm install)'` → `{ toolName: 'Bash', ruleContent: 'npm install' }`
- test('parses content with escaped parentheses') — `'Bash(python -c "print\\(1\\)")'` → ruleContent is `'python -c "print(1)"'`
- test('treats empty parens as tool-wide rule') — `'Bash()'` → `{ toolName: 'Bash' }` (no ruleContent)
- test('treats wildcard content as tool-wide rule') — `'Bash(*)'` → `{ toolName: 'Bash' }`
- test('normalizes legacy tool names') — `'Task'` → `{ toolName: 'Agent' }` (or corresponding AGENT_TOOL_NAME)
- test('handles malformed input: no closing paren') — `'Bash(npm'` → entire string as toolName
- test('handles malformed input: content after closing paren') — `'Bash(npm)extra'` → entire string as toolName
- test('handles missing tool name') — `'(foo)'` → entire string as toolName

#### describe('permissionRuleValueToString')

- test('serializes tool name only') — `{ toolName: 'Bash' }` → `'Bash'`
- test('serializes with content') — `{ toolName: 'Bash', ruleContent: 'npm install' }` → `'Bash(npm install)'`
- test('escapes content with parentheses') — ruleContent containing `()` is correctly escaped
- test('roundtrip: fromString then toString preserves value') — Roundtrip consistency

#### describe('normalizeLegacyToolName')

- test('maps Task to Agent tool name') — `'Task'` → AGENT_TOOL_NAME
- test('maps KillShell to TaskStop tool name') — `'KillShell'` → TASK_STOP_TOOL_NAME
- test('maps AgentOutputTool to TaskOutput tool name')
- test('returns unknown names unchanged') — `'UnknownTool'` → `'UnknownTool'`

#### describe('getLegacyToolNames')

- test('returns legacy names for canonical name') — Given AGENT_TOOL_NAME, returns array containing `'Task'`
- test('returns empty array for name with no legacy aliases')

---

### src/utils/permissions/permissions.ts — Requires Mocks

#### describe('getDenyRuleForTool')

- test('returns deny rule matching tool name') — Returns when a blanket deny rule matches
- test('returns null when no deny rules match') — Returns null when nothing matches
- test('matches MCP tools by server prefix') — `mcp__server` rule matches MCP tools under that server
- test('does not match content-specific deny rules') — Deny rules with ruleContent do not act as blanket deny

#### describe('checkRuleBasedPermissions') (integration-level)

- test('deny rule takes precedence over allow') — Deny wins when both allow and deny rules exist
- test('ask rule prompts user') — Returns `{ behavior: 'ask' }` when matching an ask rule
- test('allow rule permits execution') — Returns `{ behavior: 'allow' }` when matching an allow rule
- test('passthrough when no rules match') — Returns passthrough when no rules match

---

## Mock Requirements

| Dependency | Mock Approach | Notes |
|------------|---------------|-------|
| `bun:bundle` (feature) | Already polyfilled | BRIEF_TOOL_NAME conditional loading |
| Tool constants import | Actual values | AGENT_TOOL_NAME etc. imported from constants file |
| `appState` | mock object | State dependency in `hasPermissionsToUseTool` |
| Tool objects | mock object | Simulating tool's name, checkPermissions, etc. |

## Integration Test Scenarios

### describe('Permission pipeline end-to-end')

- test('deny rule blocks tool before it runs') — Deny rule intercepts before call
- test('bypassPermissions mode allows all') — In bypass mode, ask → allow
- test('dontAsk mode converts ask to deny') — In dontAsk mode, ask → deny

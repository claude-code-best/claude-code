# 权限系统测试计划

## 概述

权限系统控制工具是否可以执行，包含规则解析器、权限检查管线和权限模式判断。测试重点是纯函数解析器和规则匹配逻辑。

## 被测文件

| 文件 | 关键导出 |
|------|----------|
| `src/utils/permissions/permissionRuleParser.ts` | `permissionRuleValueFromString`, `permissionRuleValueToString`, `escapeRuleContent`, `unescapeRuleContent`, `normalizeLegacyToolName`, `getLegacyToolNames` |
| `src/utils/permissions/PermissionMode.ts` | 权限模式常量和辅助函数 |
| `src/utils/permissions/permissions.ts` | `hasPermissionsToUseTool`, `getDenyRuleForTool`, `checkRuleBasedPermissions` |
| `src/types/permissions.ts` | `PermissionMode`, `PermissionBehavior`, `PermissionRule` 类型定义 |

---

## 测试用例

### src/utils/permissions/permissionRuleParser.ts

#### describe('escapeRuleContent')

- test('escapes backslashes first') — `'test\\value'` → `'test\\\\value'`
- test('escapes opening parentheses') — `'print(1)'` → `'print\\(1\\)'`
- test('escapes closing parentheses') — `'func()'` → `'func\\(\\)'`
- test('handles combined escape') — `'echo "test\\nvalue"'` 中的 `\\` 先转义
- test('handles empty string') — `''` → `''`
- test('no-op for string without special chars') — `'npm install'` 原样返回

#### describe('unescapeRuleContent')

- test('unescapes parentheses') — `'print\\(1\\)'` → `'print(1)'`
- test('unescapes backslashes last') — `'test\\\\nvalue'` → `'test\\nvalue'`
- test('handles empty string')
- test('roundtrip: escape then unescape returns original') — `unescapeRuleContent(escapeRuleContent(x)) === x`

#### describe('permissionRuleValueFromString')

- test('parses tool name only') — `'Bash'` → `{ toolName: 'Bash' }`
- test('parses tool name with content') — `'Bash(npm install)'` → `{ toolName: 'Bash', ruleContent: 'npm install' }`
- test('parses content with escaped parentheses') — `'Bash(python -c "print\\(1\\)")'` → ruleContent 为 `'python -c "print(1)"'`
- test('treats empty parens as tool-wide rule') — `'Bash()'` → `{ toolName: 'Bash' }`（无 ruleContent）
- test('treats wildcard content as tool-wide rule') — `'Bash(*)'` → `{ toolName: 'Bash' }`
- test('normalizes legacy tool names') — `'Task'` → `{ toolName: 'Agent' }`（或对应的 AGENT_TOOL_NAME）
- test('handles malformed input: no closing paren') — `'Bash(npm'` → 整个字符串作为 toolName
- test('handles malformed input: content after closing paren') — `'Bash(npm)extra'` → 整个字符串作为 toolName
- test('handles missing tool name') — `'(foo)'` → 整个字符串作为 toolName

#### describe('permissionRuleValueToString')

- test('serializes tool name only') — `{ toolName: 'Bash' }` → `'Bash'`
- test('serializes with content') — `{ toolName: 'Bash', ruleContent: 'npm install' }` → `'Bash(npm install)'`
- test('escapes content with parentheses') — ruleContent 含 `()` 时正确转义
- test('roundtrip: fromString then toString preserves value') — 往返一致

#### describe('normalizeLegacyToolName')

- test('maps Task to Agent tool name') — `'Task'` → AGENT_TOOL_NAME
- test('maps KillShell to TaskStop tool name') — `'KillShell'` → TASK_STOP_TOOL_NAME
- test('maps AgentOutputTool to TaskOutput tool name')
- test('returns unknown names unchanged') — `'UnknownTool'` → `'UnknownTool'`

#### describe('getLegacyToolNames')

- test('returns legacy names for canonical name') — 给定 AGENT_TOOL_NAME 返回包含 `'Task'`
- test('returns empty array for name with no legacy aliases')

---

### src/utils/permissions/permissions.ts — 需 Mock

#### describe('getDenyRuleForTool')

- test('returns deny rule matching tool name') — 匹配到 blanket deny 规则时返回
- test('returns null when no deny rules match') — 无匹配时返回 null
- test('matches MCP tools by server prefix') — `mcp__server` 规则匹配该 server 下的 MCP 工具
- test('does not match content-specific deny rules') — 有 ruleContent 的 deny 规则不作为 blanket deny

#### describe('checkRuleBasedPermissions')（集成级别）

- test('deny rule takes precedence over allow') — 同时有 allow 和 deny 时 deny 优先
- test('ask rule prompts user') — 匹配 ask 规则返回 `{ behavior: 'ask' }`
- test('allow rule permits execution') — 匹配 allow 规则返回 `{ behavior: 'allow' }`
- test('passthrough when no rules match') — 无匹配规则返回 passthrough

---

## Mock 需求

| 依赖 | Mock 方式 | 说明 |
|------|-----------|------|
| `bun:bundle` (feature) | 已 polyfill | BRIEF_TOOL_NAME 条件加载 |
| Tool 常量导入 | 实际值 | AGENT_TOOL_NAME 等从常量文件导入 |
| `appState` | mock object | `hasPermissionsToUseTool` 中的状态依赖 |
| Tool 对象 | mock object | 模拟 tool 的 name, checkPermissions 等 |

## 集成测试场景

### describe('Permission pipeline end-to-end')

- test('deny rule blocks tool before it runs') — deny 规则在 call 前拦截
- test('bypassPermissions mode allows all') — bypass 模式下 ask → allow
- test('dontAsk mode converts ask to deny') — dontAsk 模式下 ask → deny

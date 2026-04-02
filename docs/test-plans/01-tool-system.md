# Tool 系统测试计划

## 概述

Tool 系统是 Claude Code 的核心，负责工具的定义、注册、发现和过滤。本计划覆盖 `src/Tool.ts` 中的工具接口与工具函数、`src/tools.ts` 中的注册/过滤逻辑，以及各工具目录下可独立测试的纯函数。

## 被测文件

| 文件 | 关键导出 |
|------|----------|
| `src/Tool.ts` | `buildTool`, `toolMatchesName`, `findToolByName`, `getEmptyToolPermissionContext`, `filterToolProgressMessages` |
| `src/tools.ts` | `parseToolPreset`, `filterToolsByDenyRules`, `getAllBaseTools`, `getTools`, `assembleToolPool` |
| `src/tools/shared/gitOperationTracking.ts` | `parseGitCommitId`, `detectGitOperation` |
| `src/tools/shared/spawnMultiAgent.ts` | `resolveTeammateModel`, `generateUniqueTeammateName` |
| `src/tools/GrepTool/GrepTool.ts` | `applyHeadLimit`, `formatLimitInfo`（内部辅助函数） |
| `src/tools/FileEditTool/utils.ts` | 字符串匹配/补丁相关纯函数 |

---

## 测试用例

### src/Tool.ts

#### describe('buildTool')

- test('fills in default isEnabled as true') — 不传 isEnabled 时，构建的 tool.isEnabled() 应返回 true
- test('fills in default isConcurrencySafe as false') — 默认值应为 false（fail-closed）
- test('fills in default isReadOnly as false') — 默认假设有写操作
- test('fills in default isDestructive as false') — 默认非破坏性
- test('fills in default checkPermissions as allow') — 默认 checkPermissions 应返回 `{ behavior: 'allow', updatedInput }`
- test('fills in default userFacingName from tool name') — userFacingName 默认应返回 tool.name
- test('preserves explicitly provided methods') — 传入自定义 isEnabled 等方法时应覆盖默认值
- test('preserves all non-defaultable properties') — name, inputSchema, call, description 等属性原样保留

#### describe('toolMatchesName')

- test('returns true for exact name match') — `{ name: 'Bash' }` 匹配 'Bash'
- test('returns false for non-matching name') — `{ name: 'Bash' }` 不匹配 'Read'
- test('returns true when name matches an alias') — `{ name: 'Bash', aliases: ['BashTool'] }` 匹配 'BashTool'
- test('returns false when aliases is undefined') — `{ name: 'Bash' }` 不匹配 'BashTool'
- test('returns false when aliases is empty') — `{ name: 'Bash', aliases: [] }` 不匹配 'BashTool'

#### describe('findToolByName')

- test('finds tool by primary name') — 从 tools 列表中按 name 找到工具
- test('finds tool by alias') — 从 tools 列表中按 alias 找到工具
- test('returns undefined when no match') — 找不到时返回 undefined
- test('returns first match when duplicates exist') — 多个同名工具时返回第一个

#### describe('getEmptyToolPermissionContext')

- test('returns default permission mode') — mode 应为 'default'
- test('returns empty maps and arrays') — additionalWorkingDirectories 为空 Map，rules 为空对象
- test('returns isBypassPermissionsModeAvailable as false')

#### describe('filterToolProgressMessages')

- test('filters out hook_progress messages') — 移除 type 为 hook_progress 的消息
- test('keeps tool progress messages') — 保留非 hook_progress 的消息
- test('returns empty array for empty input')
- test('handles messages without type field') — data 不含 type 时应保留

---

### src/tools.ts

#### describe('parseToolPreset')

- test('returns "default" for "default" input') — 精确匹配
- test('returns "default" for "Default" input') — 大小写不敏感
- test('returns null for unknown preset') — 未知字符串返回 null
- test('returns null for empty string')

#### describe('filterToolsByDenyRules')

- test('returns all tools when no deny rules') — 空 deny 规则不过滤任何工具
- test('filters out tools matching blanket deny rule') — deny rule `{ toolName: 'Bash' }` 应移除 Bash
- test('does not filter tools with content-specific deny rules') — deny rule `{ toolName: 'Bash', ruleContent: 'rm -rf' }` 不移除 Bash（只在运行时阻止特定命令）
- test('filters MCP tools by server name prefix') — deny rule `mcp__server` 应移除该 server 下所有工具
- test('preserves tools not matching any deny rule')

#### describe('getAllBaseTools')

- test('returns a non-empty array of tools') — 至少包含核心工具
- test('each tool has required properties') — 每个工具应有 name, inputSchema, call 等属性
- test('includes BashTool, FileReadTool, FileEditTool') — 核心工具始终存在
- test('includes TestingPermissionTool when NODE_ENV is test') — 需设置 env

#### describe('getTools')

- test('returns filtered tools based on permission context') — 根据 deny rules 过滤
- test('returns simple tools in CLAUDE_CODE_SIMPLE mode') — 仅返回 Bash/Read/Edit
- test('filters disabled tools via isEnabled') — isEnabled 返回 false 的工具被排除

---

### src/tools/shared/gitOperationTracking.ts

#### describe('parseGitCommitId')

- test('extracts commit hash from git commit output') — 从 `[main abc1234] message` 中提取 `abc1234`
- test('returns null for non-commit output') — 无法解析时返回 null
- test('handles various branch name formats') — `[feature/foo abc1234]` 等

#### describe('detectGitOperation')

- test('detects git commit operation') — 命令含 `git commit` 时识别为 commit
- test('detects git push operation') — 命令含 `git push` 时识别
- test('returns null for non-git commands') — 非 git 命令返回 null
- test('detects git merge operation')
- test('detects git rebase operation')

---

### src/tools/shared/spawnMultiAgent.ts

#### describe('resolveTeammateModel')

- test('returns specified model when provided')
- test('falls back to default model when not specified')

#### describe('generateUniqueTeammateName')

- test('generates a name when no existing names') — 无冲突时返回基础名
- test('appends suffix when name conflicts') — 与已有名称冲突时添加后缀
- test('handles multiple conflicts') — 多次冲突时递增后缀

---

## Mock 需求

| 依赖 | Mock 方式 | 说明 |
|------|-----------|------|
| `bun:bundle` (feature) | 已 polyfill 为 `() => false` | 不需额外 mock |
| `process.env` | `bun:test` mock | 测试 `USER_TYPE`、`NODE_ENV`、`CLAUDE_CODE_SIMPLE` |
| `getDenyRuleForTool` | mock module | `filterToolsByDenyRules` 测试中需控制返回值 |
| `isToolSearchEnabledOptimistic` | mock module | `getAllBaseTools` 中条件加载 |

## 集成测试场景

放在 `tests/integration/tool-chain.test.ts`：

### describe('Tool registration and discovery')

- test('getAllBaseTools returns tools that can be found by findToolByName') — 注册 → 查找完整链路
- test('filterToolsByDenyRules + getTools produces consistent results') — 过滤管线一致性
- test('assembleToolPool deduplicates built-in and MCP tools') — 合并去重逻辑

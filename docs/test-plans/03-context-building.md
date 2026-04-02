# Context 构建测试计划

## 概述

Context 构建系统负责组装发送给 Claude API 的系统提示和用户上下文。包括 git 状态获取、CLAUDE.md 文件发现与加载、系统提示拼装三部分。

## 被测文件

| 文件 | 关键导出 |
|------|----------|
| `src/context.ts` | `getSystemContext`, `getUserContext`, `getGitStatus`, `setSystemPromptInjection` |
| `src/utils/claudemd.ts` | `stripHtmlComments`, `getClaudeMds`, `isMemoryFilePath`, `getLargeMemoryFiles`, `filterInjectedMemoryFiles`, `getExternalClaudeMdIncludes`, `hasExternalClaudeMdIncludes`, `processMemoryFile`, `getMemoryFiles` |
| `src/utils/systemPrompt.ts` | `buildEffectiveSystemPrompt` |

---

## 测试用例

### src/utils/claudemd.ts — 纯函数部分

#### describe('stripHtmlComments')

- test('strips block-level HTML comments') — `"text <!-- comment --> more"` → content 不含注释
- test('preserves inline content') — 行内文本保留
- test('preserves code block content') — ` ```html\n<!-- not stripped -->\n``` ` 内的注释不移除
- test('returns stripped: false when no comments') — 无注释时 stripped 为 false
- test('returns stripped: true when comments exist')
- test('handles empty string') — `""` → `{ content: "", stripped: false }`
- test('handles multiple comments') — 多个注释全部移除

#### describe('getClaudeMds')

- test('assembles memory files with type descriptions') — 不同 type 的文件有不同前缀描述
- test('includes instruction prompt prefix') — 输出包含指令前缀
- test('handles empty memory files array') — 空数组返回空字符串或最小前缀
- test('respects filter parameter') — filter 函数可过滤特定类型
- test('concatenates multiple files with separators')

#### describe('isMemoryFilePath')

- test('returns true for CLAUDE.md path') — `"/project/CLAUDE.md"` → true
- test('returns true for .claude/rules/ path') — `"/project/.claude/rules/foo.md"` → true
- test('returns true for memory file path') — `"~/.claude/memory/foo.md"` → true
- test('returns false for regular file') — `"/project/src/main.ts"` → false
- test('returns false for unrelated .md file') — `"/project/README.md"` → false

#### describe('getLargeMemoryFiles')

- test('returns files exceeding 40K chars') — 内容 > MAX_MEMORY_CHARACTER_COUNT 的文件被返回
- test('returns empty array when all files are small')
- test('correctly identifies threshold boundary')

#### describe('filterInjectedMemoryFiles')

- test('filters out AutoMem type files') — feature flag 开启时移除自动记忆
- test('filters out TeamMem type files')
- test('preserves other types') — 非 AutoMem/TeamMem 的文件保留

#### describe('getExternalClaudeMdIncludes')

- test('returns includes from outside CWD') — 外部 @include 路径被识别
- test('returns empty array when all includes are internal')

#### describe('hasExternalClaudeMdIncludes')

- test('returns true when external includes exist')
- test('returns false when no external includes')

---

### src/utils/systemPrompt.ts

#### describe('buildEffectiveSystemPrompt')

- test('returns default system prompt when no overrides') — 无任何覆盖时使用默认提示
- test('overrideSystemPrompt replaces everything') — override 模式替换全部内容
- test('customSystemPrompt replaces default') — `--system-prompt` 参数替换默认
- test('appendSystemPrompt is appended after main prompt') — append 在主提示之后
- test('agent definition replaces default prompt') — agent 模式使用 agent prompt
- test('agent definition with append combines both') — agent prompt + append
- test('override takes precedence over agent and custom') — 优先级最高
- test('returns array of strings') — 返回值为 SystemPrompt 类型（字符串数组）

---

### src/context.ts — 需 Mock 的部分

#### describe('getGitStatus')

- test('returns formatted git status string') — 包含 branch、status、log、user
- test('truncates status at 2000 chars') — 超长 status 被截断
- test('returns null in test environment') — `NODE_ENV=test` 时返回 null
- test('returns null in non-git directory') — 非 git 仓库返回 null
- test('runs git commands in parallel') — 多个 git 命令并行执行

#### describe('getSystemContext')

- test('includes gitStatus key') — 返回对象包含 gitStatus
- test('returns memoized result on subsequent calls') — 多次调用返回同一结果
- test('skips git when instructions disabled')

#### describe('getUserContext')

- test('includes currentDate key') — 返回对象包含当前日期
- test('includes claudeMd key when CLAUDE.md exists') — 加载 CLAUDE.md 内容
- test('respects CLAUDE_CODE_DISABLE_CLAUDE_MDS env') — 设置后不加载 CLAUDE.md
- test('returns memoized result')

#### describe('setSystemPromptInjection')

- test('clears memoized context caches') — 调用后下次 getSystemContext/getUserContext 重新计算
- test('injection value is accessible via getSystemPromptInjection')

---

## Mock 需求

| 依赖 | Mock 方式 | 用途 |
|------|-----------|------|
| `execFileNoThrow` | `mock.module` | `getGitStatus` 中的 git 命令 |
| `getMemoryFiles` | `mock.module` | `getUserContext` 中的 CLAUDE.md 加载 |
| `getCwd` | `mock.module` | 路径解析上下文 |
| `process.env.NODE_ENV` | 直接设置 | 测试环境检测 |
| `process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS` | 直接设置 | 禁用 CLAUDE.md |

## 集成测试场景

放在 `tests/integration/context-build.test.ts`：

### describe('Context assembly pipeline')

- test('getUserContext produces claudeMd containing CLAUDE.md content') — 端到端验证 CLAUDE.md 被正确加载到 context
- test('buildEffectiveSystemPrompt + getUserContext produces complete prompt') — 系统提示 + 用户上下文完整性
- test('setSystemPromptInjection invalidates and rebuilds context') — 注入后重新构建上下文

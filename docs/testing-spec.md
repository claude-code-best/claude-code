# Testing Specification

本文档定义 claude-code 项目的测试规范、当前覆盖状态和改进计划。

## 1. 技术栈

| 项 | 选型 |
|----|------|
| 测试框架 | `bun:test` |
| 断言/Mock | `bun:test` 内置 |
| 覆盖率 | `bun test --coverage` |
| CI | GitHub Actions，push/PR 到 main 自动运行 |

## 2. 测试层次

本项目采用 **单元测试 + 集成测试** 两层结构，不做 E2E 或快照测试。

- **单元测试** — 纯函数、工具类、解析器。文件就近放置于 `src/**/__tests__/`。
- **集成测试** — 多模块协作流程。集中于 `tests/integration/`。

## 3. 文件结构与命名

```
src/
├── utils/__tests__/           # 纯函数单元测试
├── tools/<Tool>/__tests__/    # Tool 单元测试
├── services/mcp/__tests__/    # MCP 单元测试
├── utils/permissions/__tests__/
├── utils/model/__tests__/
├── utils/settings/__tests__/
├── utils/shell/__tests__/
├── utils/git/__tests__/
└── __tests__/                 # 顶层模块测试 (Tool.ts, tools.ts)
tests/
├── integration/               # 集成测试（尚未创建）
├── mocks/                     # 共享 mock/fixture（尚未创建）
└── helpers/                   # 测试辅助函数
```

- 测试文件：`<module>.test.ts`
- 命名风格：`describe("functionName")` + `test("行为描述")`，英文
- 编写原则：Arrange-Act-Assert、单一职责、独立性、边界覆盖

## 4. 当前覆盖状态

> 更新日期：2026-04-02 | **1297 tests, 68 files, 0 fail, 980ms**

### 4.1 可靠度评分

每个测试文件按断言深度、边界覆盖、mock 质量、测试独立性综合评定：

| 等级 | 含义 |
|------|------|
| **GOOD** | 断言精确（exact match），边界充分，结构清晰 |
| **ACCEPTABLE** | 正常路径覆盖完整，部分边界或断言可加强 |
| **WEAK** | 存在明显缺陷：断言过弱、重要边界缺失、或有脆弱性风险 |

### 4.2 按模块分布

#### P0 — 核心模块

| 文件 | Tests | 评分 | 覆盖范围 | 主要不足 |
|------|-------|------|----------|----------|
| `src/__tests__/Tool.test.ts` | 20 | GOOD | buildTool, toolMatchesName, findToolByName, filterToolProgressMessages | — |
| `src/__tests__/tools.test.ts` | 9 | ACCEPTABLE | parseToolPreset, filterToolsByDenyRules | 预设覆盖仅测 "default"；有冗余用例 |
| `src/tools/FileEditTool/__tests__/utils.test.ts` | 22 | ACCEPTABLE | normalizeQuotes, applyEditToFile, preserveQuoteStyle | `findActualString` 断言过弱（`not.toBeNull`）；`preserveQuoteStyle` 仅 2 用例 |
| `src/tools/shared/__tests__/gitOperationTracking.test.ts` | 14 | WEAK | parseGitCommitId, detectGitOperation | **未 mock analytics 依赖**，测试产生副作用；6 个 GH PR action 仅测 2 个 |
| `src/tools/BashTool/__tests__/destructiveCommandWarning.test.ts` | 21 | ACCEPTABLE | git/rm/SQL/k8s/terraform 危险模式 | safe commands 4 断言合一；缺少 `rm -rf /`、`DROP DATABASE`、管道命令 |
| `src/tools/BashTool/__tests__/commandSemantics.test.ts` | 10 | ACCEPTABLE | grep/diff/test/rg/find 退出码语义 | mock `splitCommand_DEPRECATED` 与实现可能分歧；覆盖可更全面 |

**Utils 纯函数（19 文件）：**

| 文件 | Tests | 评分 | 覆盖范围 | 主要不足 |
|------|-------|------|----------|----------|
| `utils/__tests__/array.test.ts` | 12 | GOOD | intersperse, count, uniq | — |
| `utils/__tests__/set.test.ts` | 11 | GOOD | difference, intersects, every, union | — |
| `utils/__tests__/xml.test.ts` | 9 | GOOD | escapeXml, escapeXmlAttr | 缺 null/undefined 输入测试 |
| `utils/__tests__/hash.test.ts` | 12 | ACCEPTABLE | djb2Hash, hashContent, hashPair | `hashContent`/`hashPair` 无已知答案断言（仅测确定性） |
| `utils/__tests__/stringUtils.test.ts` | 30 | GOOD | 10 个函数全覆盖，含 Unicode 边界 | — |
| `utils/__tests__/semver.test.ts` | 16 | ACCEPTABLE | gt/gte/lt/lte/satisfies/order | 缺 pre-release、tilde range、畸形版本串 |
| `utils/__tests__/uuid.test.ts` | 6 | ACCEPTABLE | validateUuid | 大写测试仅 `not.toBeNull`，未验证标准化输出 |
| `utils/__tests__/format.test.ts` | 20 | WEAK | formatFileSize, formatDuration, formatNumber 等 | **多处 `toContain` 应为 `toBe`**：formatNumber/formatTokens/formatRelativeTime 仅检查子串 |
| `utils/__tests__/frontmatterParser.test.ts` | 22 | GOOD | parseFrontmatter, splitPathInFrontmatter, parsePositiveIntFromFrontmatter | — |
| `utils/__tests__/file.test.ts` | 13 | ACCEPTABLE | convertLeadingTabsToSpaces, addLineNumbers, stripLineNumberPrefix | `addLineNumbers` 仅 `toContain`；缺 Windows 路径分隔符测试 |
| `utils/__tests__/glob.test.ts` | 6 | ACCEPTABLE | extractGlobBaseDirectory | 缺绝对路径、根 `/`、Windows 路径 |
| `utils/__tests__/diff.test.ts` | 8 | ACCEPTABLE | adjustHunkLineNumbers, getPatchFromContents | `getPatchFromContents` 仅检查结构，未验证 diff 内容正确性 |
| `utils/__tests__/json.test.ts` | 15 | GOOD | safeParseJSON, parseJSONL, addItemToJSONCArray | — |
| `utils/__tests__/truncate.test.ts` | 18 | ACCEPTABLE | truncateToWidth, wrapText, truncatePathMiddle | **缺 CJK/emoji/wide-char 测试**（这是宽度感知实现的核心场景） |
| `utils/__tests__/path.test.ts` | 15 | ACCEPTABLE | containsPathTraversal, normalizePathForConfigKey | 仅覆盖 2/5+ 导出函数 |
| `utils/__tests__/tokens.test.ts` | 18 | GOOD | getTokenCountFromUsage, doesMostRecentAssistantMessageExceed200k 等 | — |

**Context 构建（2 文件）：**

| 文件 | Tests | 评分 | 覆盖范围 | 主要不足 |
|------|-------|------|----------|----------|
| `utils/__tests__/claudemd.test.ts` | 14 | ACCEPTABLE | stripHtmlComments, isMemoryFilePath, getLargeMemoryFiles | **仅测 3 个辅助函数**，核心发现/加载/`@include` 指令/memoization 未覆盖 |
| `utils/__tests__/systemPrompt.test.ts` | 8 | GOOD | buildEffectiveSystemPrompt | — |

#### P1 — 重要模块

| 文件 | Tests | 评分 | 覆盖范围 | 主要不足 |
|------|-------|------|----------|----------|
| `permissions/__tests__/permissionRuleParser.test.ts` | 16 | GOOD | escape/unescape 规则，roundtrip 完整性 | — |
| `permissions/__tests__/permissions.test.ts` | 12 | ACCEPTABLE | getDenyRuleForTool, getAskRuleForTool, filterDeniedAgents | `as any` cast；缺 MCP tool deny 测试 |
| `permissions/__tests__/shellRuleMatching.test.ts` | 19 | GOOD | 通配符、转义、正则特殊字符 | — |
| `permissions/__tests__/PermissionMode.test.ts` | 18 | WEAK | permissionModeFromString, isExternalPermissionMode 等 | **`isExternalPermissionMode` false 路径从未执行**；mode 覆盖不完整（5 选 3） |
| `permissions/__tests__/dangerousPatterns.test.ts` | 7 | WEAK | CROSS_PLATFORM_CODE_EXEC, DANGEROUS_BASH_PATTERNS | 纯数据 smoke test，无行为测试；不验证数组无重复 |
| `model/__tests__/aliases.test.ts` | 15 | ACCEPTABLE | isModelAlias, isModelFamilyAlias | 缺 null/undefined/空串输入 |
| `model/__tests__/model.test.ts` | 13 | ACCEPTABLE | firstPartyNameToCanonical | 缺空串、非标准日期后缀 |
| `model/__tests__/providers.test.ts` | 9 | ACCEPTABLE | getAPIProvider, isFirstPartyAnthropicBaseUrl | `originalEnv` 声明未使用；env 恢复不完整 |
| `utils/__tests__/messages.test.ts` | 36 | GOOD | createAssistantMessage, createUserMessage, extractTag 等 16 个 describe | `normalizeMessages` 仅检查长度未验证内容 |

#### P2 — 补充模块

| 文件 | Tests | 评分 | 覆盖范围 | 主要不足 |
|------|-------|------|----------|----------|
| `utils/__tests__/cron.test.ts` | 31 | GOOD | parseCronExpression, computeNextCronRun, cronToHuman | 缺月边界、闰年 |
| `utils/__tests__/git.test.ts` | 15 | ACCEPTABLE | normalizeGitRemoteUrl (SSH/HTTPS/ssh://) | 缺 git://、file://、端口号 |
| `settings/__tests__/config.test.ts` | 38 | GOOD | SettingsSchema, type guards, validateSettingsFileContent, formatZodError | 缺 DeniedMcpServerEntrySchema |

#### P3-P6 — 扩展覆盖（27 文件）

| 文件 | Tests | 评分 | 备注 |
|------|-------|------|------|
| `utils/__tests__/errors.test.ts` | 33 | GOOD | — |
| `utils/__tests__/envUtils.test.ts` | 33 | GOOD | env 保存/恢复规范 |
| `utils/__tests__/effort.test.ts` | 30 | GOOD | 5 个 mock 模块，边界完整 |
| `utils/__tests__/argumentSubstitution.test.ts` | 22 | ACCEPTABLE | 缺转义引号、越界索引 |
| `utils/__tests__/sanitization.test.ts` | 14 | ACCEPTABLE | — |
| `utils/__tests__/sleep.test.ts` | 14 | GOOD | 时间相关测试，margin 充足 |
| `utils/__tests__/CircularBuffer.test.ts` | 11 | ACCEPTABLE | 缺 capacity=1、空 buffer getRecent |
| `utils/__tests__/memoize.test.ts` | 18 | GOOD | 缓存 hit/stale/LRU 全覆盖 |
| `utils/__tests__/tokenBudget.test.ts` | 21 | GOOD | — |
| `utils/__tests__/displayTags.test.ts` | 17 | GOOD | — |
| `utils/__tests__/taggedId.test.ts` | 10 | GOOD | — |
| `utils/__tests__/controlMessageCompat.test.ts` | 15 | GOOD | — |
| `utils/__tests__/gitConfigParser.test.ts` | 21 | GOOD | — |
| `utils/__tests__/windowsPaths.test.ts` | 19 | GOOD | 双向 round-trip 测试 |
| `utils/__tests__/envExpansion.test.ts` | 15 | GOOD | — |
| `utils/__tests__/formatBriefTimestamp.test.ts` | 10 | GOOD | 固定 now 时间戳，确定性 |
| `utils/__tests__/notebook.test.ts` | 9 | ACCEPTABLE | 合并断言偏弱 |
| `utils/__tests__/hyperlink.test.ts` | 10 | ACCEPTABLE | 空串测试行为注释混乱 |
| `utils/__tests__/zodToJsonSchema.test.ts` | 9 | WEAK | **object 属性仅 `toBeDefined` 未验证类型**；optional 字段未验证 absence |
| `utils/__tests__/objectGroupBy.test.ts` | 5 | ACCEPTABLE | 极简，缺 undefined key 测试 |
| `utils/__tests__/contentArray.test.ts` | 6 | ACCEPTABLE | 缺混合 tool_result+text 交替 |
| `utils/__tests__/slashCommandParsing.test.ts` | 8 | GOOD | — |
| `utils/__tests__/groupToolUses.test.ts` | 10 | GOOD | — |
| `utils/__tests__/shell/__tests__/outputLimits.test.ts` | 7 | ACCEPTABLE | — |
| `utils/__tests__/envValidation.test.ts` | 9 | ACCEPTABLE | **可能存在 bug**：lower bound=100 但 value=1 报 valid |
| `utils/git/__tests__/gitConfigParser.test.ts` | 20 | GOOD | — |
| `services/mcp/__tests__/mcpStringUtils.test.ts` | 16 | GOOD | — |
| `services/mcp/__tests__/normalization.test.ts` | 10 | GOOD | — |

### 4.3 评分汇总

| 等级 | 文件数 | 占比 |
|------|--------|------|
| **GOOD** | 30 | 47% |
| **ACCEPTABLE** | 26 | 41% |
| **WEAK** | 8 | 12% |

## 5. 系统性问题

### 5.1 断言过弱（Smell: `toContain` 代替精确匹配）

以下文件的部分测试使用 `toContain` 或 `not.toBeNull` 检查结果，当实现返回包含目标子串的任何字符串时测试仍通过，无法检测格式错误：

| 文件 | 受影响函数 | 建议 |
|------|-----------|------|
| `format.test.ts` | formatNumber, formatTokens, formatRelativeTime | 改为 `toBe` 精确匹配 |
| `file.test.ts` | addLineNumbers | 断言完整输出格式 |
| `diff.test.ts` | getPatchFromContents | 验证 hunk 内容正确性 |
| `notebook.test.ts` | mapNotebookCellsToToolResult | 验证合并后内容 |
| `uuid.test.ts` | validateUuid (uppercase) | 断言标准化后的精确值 |

### 5.2 集成测试空白

Spec 定义的三个集成测试均未创建：

| 计划 | 状态 | 依赖 |
|------|------|------|
| `tests/integration/tool-chain.test.ts` | 未创建 | 需 mock tools.ts 完整注册链 |
| `tests/integration/context-build.test.ts` | 未创建 | 需 mock context.ts 重依赖链 |
| `tests/integration/message-pipeline.test.ts` | 未创建 | 需 mock API 层 |

`tests/mocks/` 目录也不存在，无共享 mock/fixture 基础设施。

### 5.3 Mock 相关

| 问题 | 影响文件 | 说明 |
|------|----------|------|
| 未 mock 重依赖 | `gitOperationTracking.test.ts` | `detectGitOperation` 内部调用 analytics，测试产生副作用 |
| `isExternalPermissionMode` 永远 true | `PermissionMode.test.ts` | false 路径从未被执行，测试形同虚设 |
| env 恢复不完整 | `providers.test.ts` | 仅删除已知 key，新增 env var 会导致测试泄漏 |

### 5.4 潜在 Bug

| 文件 | 函数 | 问题 |
|------|------|------|
| `envValidation.test.ts` | validateBoundedIntEnvVar | 测试断言 lower bound=100 时 value=1 返回 `status: "valid"`，与函数名语义矛盾，可能是源码 bug 或测试逻辑错误 |

### 5.5 已知限制

| 模块 | 问题 |
|------|------|
| `Bun.JSONL.parseChunk` | 畸形行时无限挂起（Bun 1.3.10 bug） |
| `context.ts` 核心逻辑 | 依赖 bootstrap/state + git + 50+ 模块，mock 不可行 |
| `tools.ts` (getAllBaseTools) | 导入链过重 |
| `spawnMultiAgent.ts` | 50+ 依赖 |
| `messages.ts` 部分函数 | 依赖 `getFeatureValue_CACHED_MAY_BE_STALE` |
| UI 组件 (`screens/`, `components/`) | 需 Ink 渲染测试环境 |

### 5.6 Mock 模式

通过 `mock.module()` + `await import()` 解锁重依赖模块：

| 被 Mock 模块 | 解锁的测试 |
|-------------|-----------|
| `src/utils/log.ts` | json, tokens, FileEditTool/utils, permissions, memoize, PermissionMode |
| `src/services/tokenEstimation.ts` | tokens |
| `src/utils/slowOperations.ts` | tokens, permissions, memoize, PermissionMode |
| `src/utils/debug.ts` | envValidation, outputLimits |
| `src/utils/bash/commands.ts` | commandSemantics |
| `src/utils/thinking.js` | effort |
| `src/utils/settings/settings.js` | effort |
| `src/utils/auth.js` | effort |
| `src/services/analytics/growthbook.js` | effort, tokenBudget |

**约束**：`mock.module()` 必须在每个测试文件内联调用，不能从共享 helper 导入。

## 6. 完成状态

> 更新日期：2026-04-02 | **1297 tests, 68 files, 0 fail, 980ms**

### 已完成

| 计划 | 状态 | 新增测试 | 说明 |
|------|------|---------|------|
| Plan 12 — Mock 可靠性 | **已完成** | +9 | PermissionMode ant false 路径、providers env 快照恢复 |
| Plan 10 — WEAK 修复 | **已完成** | +15 | format 断言精确化、envValidation 修正、zodToJsonSchema/destructors/notebook 加固 |
| Plan 13 — CJK/Emoji | **已完成** | +17 | truncate CJK/emoji 宽度感知测试 |
| Plan 11 — ACCEPTABLE 加强 | **已完成** | +62 | diff/uuid/hash/semver/path/claudemd/fileEdit/providers/messages 等 15 文件 |
| Plan 14 — 集成测试 | **已完成** | +43 | 搭建 tests/mocks/ + tool-chain/context-build/message-pipeline/cli-arguments |
| Plan 15 — CLI + 覆盖率 | **已完成** | +11 | Commander.js 参数解析、覆盖率基线 |

### 覆盖率基线

| 指标 | 数值 |
|------|------|
| 总测试数 | 1297 |
| 测试文件数 | 68 |
| 失败数 | 0 |
| 断言数 | 1990 |
| 运行耗时 | ~1s |
| Tool.ts 行覆盖率 | 100% |
| 整体行覆盖率 | ~33%（Bun coverage 限制：`mock.module` 模式下的模块不报告） |

> **注意**：Bun `--coverage` 仅报告测试 import 链中直接加载的文件。使用 `mock.module()` + `await import()` 模式的源文件（大多数 `src/utils/` 纯函数）不显示在覆盖率报告中。实际测试覆盖率高于报告值。

### 不纳入计划

| 模块 | 原因 |
|------|------|
| `query.ts` / `QueryEngine.ts` | 核心循环，需完整集成环境 |
| `services/api/claude.ts` | 需 mock SDK 流式响应 |
| `spawnMultiAgent.ts` | 50+ 依赖 |
| `modelCost.ts` | 依赖 bootstrap/state + analytics |
| `mcp/dateTimeParser.ts` | 调用 Haiku API |
| `screens/` / `components/` | 需 Ink 渲染测试 |

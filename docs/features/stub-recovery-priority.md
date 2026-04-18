# 剩余 Stub 恢复优先级（按当前源码）

> 更新日期: 2026-04-15
> 结论口径: 以当前 `src/` + `packages/` 源码为准，不以历史设计文档为准。
> 目标: 将剩余 stub 按 `恢复收益 / 实现复杂度 / 是否挡主流程` 归类，给出实际可执行的恢复顺序。

## 一、判定口径

本文中的“主流程”特指外部版默认用户最容易直接碰到的执行链路：

1. `src/entrypoints/cli.tsx` 快速入口
2. `src/main.tsx` 命令注册与主 action
3. `src/screens/REPL.tsx` 与 `src/query.ts` 的常规对话循环
4. 默认或显式可见的工具与命令

以下内容不视为主流程阻塞：

- `process.env.USER_TYPE === 'ant'` 的内部路径
- 纯遥测 / 内部监控
- feature flag 关闭时根本不会暴露给普通用户的能力
- 已被显式隐藏的占位命令

## 二、先说结论

建议恢复顺序：

1. `SSH`
2. `Bash Classifier`
3. `WebBrowserTool`

并行的收口 / 验证项：

4. `WorkflowTool` 设计口径澄清
5. `DiscoverSkillsTool`
6. `Cached Microcompact`

原因：`WebBrowserTool` 仍然属于真正部分完成的能力面；`WorkflowTool` 按当前代码模型更像 prompt expansion surface，不应继续误判为“缺少执行引擎”；`DiscoverSkillsTool` 与 `Cached Microcompact` 已从“待恢复”转为“基本完成，需收口验证”。

## 三、优先级总表

| 优先级 | 模块 | 主要文件 | 恢复收益 | 实现复杂度 | 挡主流程 | 结论 |
|------|------|------|------|------|------|------|
| P0 | SSH 远程会话 | `src/ssh/createSSHSession.ts` | 高 | 中高 | 是 | 最优先 |
| P1 | Bash 语义分类器 | `src/utils/permissions/bashClassifier.ts` | 高 | 中 | 否 | 高 ROI |
| P2 | Workflow prompt surface | `packages/builtin-tools/src/tools/WorkflowTool/WorkflowTool.ts` | 中 | 低 | 否 | 基本完成，需澄清设计边界 |
| P2 | 显式技能搜索工具 | `packages/builtin-tools/src/tools/DiscoverSkillsTool/DiscoverSkillsTool.ts` | 中 | 低 | 否 | 基本完成，转入收口与测试 |
| P1 | 内嵌浏览器工具 | `packages/builtin-tools/src/tools/WebBrowserTool/WebBrowserTool.ts` | 中 | 中高 | 否 | 部分完成，需补 runtime 或收口成 browser-lite |
| P2 | Cached microcompact | `src/services/compact/cachedMicrocompact.ts` | 高 | 中 | 否 | 基本完成，转入硬化与验证 |
| P2 | Agent snapshot 更新对话框 | `src/components/agents/SnapshotUpdateDialog.ts` | 中 | 低中 | 否 | 补齐一个已连通但无 UI 的链路 |
| P3 | 反馈受挫检测 | `src/components/FeedbackSurvey/useFrustrationDetection.ts` | 低中 | 低 | 否 | UX 补丁 |
| P3 | 平台辅助原生模块 | `packages/modifiers-napi/src/index.ts`, `packages/url-handler-napi/src/index.ts` | 低中 | 低中 | 否 | 平台能力补强 |
| P3 | `/reset-limits` | `src/commands/reset-limits/index.ts` | 低 | 低 | 否 | 仅补齐显式提示链路 |
| P4 | internal runner / telemetry | `src/environment-runner/main.ts`, `src/self-hosted-runner/main.ts`, `src/utils/sessionDataUploader.ts`, `src/utils/sdkHeapDumpMonitor.ts`, `src/hooks/notifs/useAntOrgWarningNotification.ts` | 低 | 中到高 | 否 | 长期后置 |

## 四、P0 - P2 详细说明

### P0: SSH 远程会话

**文件**

- `src/ssh/createSSHSession.ts`

**现状**

- `src/main.tsx` 已明确暴露 `claude ssh <host> [dir]`。
- `main.tsx` 在 `3775` 行附近直接动态导入 `createSSHSession()` / `createLocalSSHSession()`。
- 当前实现直接抛 `SSHSessionError('SSH sessions are not supported in this build')`。

**为什么排第一**

- 这是一个已经暴露给用户、但运行时被 stub 卡死的显式入口。
- 不是“未来功能”，而是“入口存在、帮助里可见、实际不能用”。
- 修复后能立刻把一个主命令从假可用变成真可用。

**复杂度来源**

- 需要处理 SSH 建链、错误回传、远端 cwd、auth proxy、stderr tail。
- 已有 `SSHSessionManager` 接口，说明调用方契约基本稳定，难点主要在 runtime 实现而不是接口设计。

**建议拆解**

1. 先恢复 `createLocalSSHSession()`，打通本地伪 SSH 流程。
2. 再补真实 SSH session 创建。
3. 最后补重连、端口转发和更好的错误分类。

### P1: Bash 语义分类器

**文件**

- `src/utils/permissions/bashClassifier.ts`

**现状**

- 权限 UI、`bashPermissions.ts`、`classifierDecision.ts` 都已接入。
- 当前实现明确写着 `Stub for external builds - classifier permissions feature is ANT-ONLY`。
- `isClassifierPermissionsEnabled()` 恒为 `false`，`classifyBashCommand()` 恒返回 disabled。

**为什么优先级高**

- 不挡主流程，但直接影响 Bash 工具体验和自动审批能力。
- 修复收益覆盖面广，因为 BashTool 是高频主工具。
- 不需要先重做整个权限框架，只需把分类后端从 no-op 变成可用实现。

**复杂度来源**

- 需要决定是本地规则引擎、轻量 AST、还是保守的模式匹配策略。
- 但外围编排基本都在，属于“后端一补，整条链路就活”。

**建议目标**

- 第一阶段先做保守匹配，支持 deny / ask / allow 的最小闭环。
- 不要一开始追求 Anthropic 内部同等能力。

### P2: Workflow prompt surface

**文件**

- `packages/builtin-tools/src/tools/WorkflowTool/WorkflowTool.ts`

**现状**

- `WorkflowTool`、`createWorkflowCommand.ts`、`constants.ts`、`WorkflowPermissionRequest.tsx`、`src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts` 已存在。
- `getWorkflowCommands()` 生成的是 `type: 'prompt'` 的命令，`kind: 'workflow'`。
- `WorkflowTool.call()` 会读取 workflow 内容并把它返回给模型。
- 这条链路和 `/commit`、skills、prompt command 的执行模式一致：命令/工具提供 prompt，模型再去调用普通工具执行。

**为什么不再列为主恢复项**

- 当前更准确的判断是：它按现有设计已经基本可用。
- 缺的不是“执行引擎”，而是文档口径和能力边界说明。
- `LocalWorkflowTask` / `WorkflowDetailDialog` 这类结构更像未来高级 background workflow 轨道，不是当前 WorkflowTool 主路径的必需部分。

**建议动作**

1. 把文档统一改成“workflow = prompt-backed command”
2. 统一 `/workflow-name` 与 `WorkflowTool.call()` 的输出语义
3. 再决定是否要把 background workflow 作为未来升级功能单独推进

### P1: DiscoverSkillsTool

**文件**

- `packages/builtin-tools/src/tools/DiscoverSkillsTool/prompt.ts`
- `packages/builtin-tools/src/tools/DiscoverSkillsTool/DiscoverSkillsTool.ts`

**现状**

- `src/constants/prompts.ts` 已经尝试读取 `DISCOVER_SKILLS_TOOL_NAME`。
- 本地 skill index、prefetch、remote loader、remote state 都已有实现。
- `DISCOVER_SKILLS_TOOL_NAME` 已补上，`DiscoverSkillsTool.call()` 已能调用本地 TF-IDF 搜索。

**为什么排 P1**

- 这项已经不再是主恢复缺口。
- 当前更准确的状态是“基本完成”，剩余工作集中在测试、上下文使用和文档同步。

**建议拆解**

1. 补测试，覆盖显式搜索结果与空结果路径。
2. 修正 `call()` 中对上下文 `cwd` 的获取。
3. 同步文档口径，移出“待恢复主项”。

### P2: WebBrowserTool

**文件**

- `packages/builtin-tools/src/tools/WebBrowserTool/WebBrowserTool.ts`
- `packages/builtin-tools/src/tools/WebBrowserTool/WebBrowserPanel.ts`

**现状**

- `src/tools.ts` 已在 `feature('WEB_BROWSER_TOOL')` 下注册工具。
- `src/screens/REPL.tsx` 已给面板留了位置。
- 当前 `navigate` / `screenshot` 已有 HTTP fetch-lite 实现，但 `click` / `type` / `scroll` 仍需 full runtime，Panel 仍是 `null`。

**为什么是 P2，不是 P1**

- 功能面存在，但默认外部用户并不会直接依赖它完成主流程。
- 但它已经不是纯 placeholder，更准确的状态是“部分完成，待补完”。
- 真正的复杂度仍在 full browser runtime / Bun WebView。

**建议拆解**

1. 先决定产品方向：收口成 browser-lite，还是继续补 full runtime。
2. 若走 browser-lite，收紧文案并补简单 Panel。
3. 若走 full runtime，再补 `click / type / scroll`。

### P2: Cached Microcompact

**文件**

- `src/services/compact/cachedMicrocompact.ts`
- `src/services/compact/cachedMCConfig.ts`

**现状**

- `microCompact.ts`、`query.ts`、`services/api/claude.ts` 都已经接了调用点。
- `constants/prompts.ts` 也已经预留配置读取。
- `cachedMicrocompact.ts` 与 `cachedMCConfig.ts` 现在已有真实实现，`microCompact.ts` 也已经走 `cachedMicrocompactPath()`。

**为什么不是更高优先级**

- 它已经不再是“待恢复”主项。
- 更准确的状态是“基本完成，但需要硬化验证”。
- 当前主要风险是边界行为、模型兼容性和测试覆盖，而不是主路径完全缺失。

**建议拆解**

1. 补集成测试，覆盖阈值、去重、pin、baseline/delta 逻辑。
2. 补更明确的 debug logging 与失败回退。
3. 从“恢复主项”移到“验证/硬化项”。

### P2: Snapshot 更新对话框

**文件**

- `src/components/agents/SnapshotUpdateDialog.ts`

**现状**

- `main.tsx`、`dialogLaunchers.tsx` 都会走到这里。
- 当前组件直接 `return null`，`buildMergePrompt()` 也返回空字符串。

**为什么是 P2**

- 这不是大 feature，但它属于“调用点真实存在、UI 仍为空”的典型残缺项。
- 实现成本低于前几个，适合穿插修复。

## 五、P3 - P4 详细说明

### P3: 反馈与平台辅助项

**包含**

- `src/components/FeedbackSurvey/useFrustrationDetection.ts`
- `packages/modifiers-napi/src/index.ts`
- `packages/url-handler-napi/src/index.ts`
- `src/commands/reset-limits/index.ts`

**判断**

- `useFrustrationDetection.ts` 已被 `REPL.tsx` 使用，但只是 survey UX，不挡核心功能。
- `modifiers-napi` 在 macOS 下有部分实现，其他平台退化为 false，可接受。
- `url-handler-napi` 会影响 deep link URL launch，但不是日常主流程。
- `/reset-limits` 已在文案中出现，但仍是隐藏 stub，修复价值有限。

### P4: internal runner / telemetry

**包含**

- `src/environment-runner/main.ts`
- `src/self-hosted-runner/main.ts`
- `src/utils/sessionDataUploader.ts`
- `src/utils/sdkHeapDumpMonitor.ts`
- `src/hooks/notifs/useAntOrgWarningNotification.ts`

**判断**

- 这些模块不是没有价值，而是对当前外部版几乎不构成主线能力缺口。
- 多数要么是 feature-gated，要么是 `ant-only`，要么明显偏内部监控与基础设施。

## 六、建议的实际恢复批次

### 批次 A: 先修“显式暴露但跑不通”的入口

1. `src/ssh/createSSHSession.ts`
2. `src/utils/permissions/bashClassifier.ts`

### 批次 B: 修“骨架已齐、核心仍空”的 feature shell

1. `packages/builtin-tools/src/tools/WorkflowTool/WorkflowTool.ts` 的设计口径澄清与文档统一

### 批次 C: 修“已注册但 runtime 缺失”的增强能力

1. `packages/builtin-tools/src/tools/WebBrowserTool/WebBrowserTool.ts`
2. `packages/builtin-tools/src/tools/WebBrowserTool/WebBrowserPanel.ts`

### 批次 D: 做“基本完成项”的收口与验证

1. `packages/builtin-tools/src/tools/DiscoverSkillsTool/DiscoverSkillsTool.ts`
2. `src/services/compact/cachedMicrocompact.ts`

### 批次 E: 修“可见但不挡主线”的 UI / 平台补丁

1. `src/components/agents/SnapshotUpdateDialog.ts`
2. `src/components/FeedbackSurvey/useFrustrationDetection.ts`
3. `packages/url-handler-napi/src/index.ts`
4. `packages/modifiers-napi/src/index.ts`

## 七、当前不建议优先投入的方向

### 关于 `summary` 的状态说明

仓库里现在有两种不同含义的 `summary`，需要明确区分：

1. **后台会话 task summary**

   - 文件: `src/utils/taskSummary.ts`
   - 状态: **已从纯 stub 变成基础实现**
   - 当前能力: 仅在 `BG_SESSIONS` + bg session 下生效，按最近一次 assistant/tool_use 更新 `status` 与 `waitingFor`
   - 结论: 不能算“完整”，但也不应继续归类为纯 stub

2. **隐藏的 `/summary` 命令**

   - 文件: `src/commands/summary/index.js`
   - 状态: **仍为隐藏 stub**
   - 当前能力: `isEnabled: () => false`
   - 结论: 如果讨论“summary 命令是否完成”，答案是否定的

因此，后续讨论 `summary` 时应统一使用下面的表述：

- `task summary`: 基础版已完成
- `/summary` 命令: 仍未完成

### 隐藏命令 stub

当前至少还有一批明确导出为 `name: 'stub'` 的隐藏命令，包括：

- `teleport`
- `summary`
- `ctx_viz`
- `share`
- `bughunter`
- `backfill-sessions`
- `autofix-pr`
- `break-cache`
- `ant-trace`
- `issue`
- `env`
- `debug-tool-call`
- `perf-issue`
- `good-claude`
- `onboarding`
- `oauth-refresh`
- `mock-limits`
- `reset-limits`

这些命令的共同特点是：

- 不是“看起来能用、但运行时报错”，而是已经明确被隐藏和禁用。
- 从产品角度，它们比 SSH、Workflow、Bash Classifier 更靠后。

### 大规模 type stub 清理

当前扫描中带 `Auto-generated type stub` 标记的文件仍有数百个量级。

这类工作重要，但不适合和功能恢复搅在一起做。更合理的顺序是：

1. 先恢复高价值运行时 stub。
2. 再单独开一个类型恢复专项。

## 八、哪些旧文档结论已经过期

以下模块在历史文档中曾被写成 stub，但当前源码已经不是本轮恢复重点：

- `src/services/compact/reactiveCompact.ts`
- `src/proactive/index.ts`
- `src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts`
- `src/utils/taskSummary.ts`（现为基础实现，不再是纯 stub）
- `src/utils/eventLoopStallDetector.ts`
- `src/utils/ccshareResume.ts`
- `src/services/contextCollapse/index.ts`

后续如果需要继续维护 stub 清单，应优先更新本文档，而不是继续沿用这些旧设计稿中的状态判断。

## 九、执行建议

如果目标是尽快提升外部版可用性，建议严格按下面顺序推进：

1. `SSH`
2. `bashClassifier`
3. `WebBrowserTool`
4. `WorkflowTool` 设计口径澄清
5. `DiscoverSkillsTool` 收口
6. `cachedMicrocompact` 硬化

如果明确**先不处理** `SSH` 和 `bashClassifier`，后续完整顺序改为：

1. `WebBrowserTool`
2. `WorkflowTool` 设计口径澄清
3. `DiscoverSkillsTool` 收口
4. `cachedMicrocompact` 硬化
5. `SnapshotUpdateDialog`
6. `useFrustrationDetection`
7. `url-handler-napi`
8. `modifiers-napi`
9. `/summary`
10. 其他隐藏命令 stub
11. type stub 专项清理

如果目标是“减少仓库里看起来像半成品的地方”，则应在上面这条主线完成后，再处理：

1. `SnapshotUpdateDialog`
2. `useFrustrationDetection`
3. `url-handler-napi`
4. `modifiers-napi`
5. 隐藏命令 stub
6. type stub 专项清理

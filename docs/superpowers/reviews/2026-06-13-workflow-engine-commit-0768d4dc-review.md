# Commit 审查报告：0768d4dc8f69023b55adf2f5c176c766640600cb

- **Commit**: `0768d4dc8f69023b55adf2f5c176c766640600cb`
- **Title**: `feat(workflow): add workflow engine, /workflows panel, /ultracode skill`
- **Author**: claude-code-best <claude-code-best@proton.me>
- **Date**: 2026-06-13
- **规模**: 90 文件，+12925 / -833
- **审查日期**: 2026-06-13
- **审查方法**: 多视角对抗式 workflow 编排（7 个并行 reviewer → consolidator 合并 → refuter 反驳 → final judge），journal `run_id = wtujwahzf`

---

## TL;DR

这个 commit 引入的 workflow engine **架构干净、引擎层测试覆盖率高**，但**脚本沙箱和路径校验存在真实漏洞**，并且在本次审查过程中**我亲身实证发现了多个 judge report 没覆盖的 host 集成 bug**（其中包括 workflow 状态变更通知根本没有接进 host 通知系统，导致"完成时自动通知"承诺落空）。受信 LLM 威胁模型下无严格 blocker，但建议合并前修 4 项。

**严重度计数**（综合 judge + 我的实证）：
- CRITICAL: 0
- HIGH: 2
- MEDIUM: 9
- LOW: 4
- INFO: 6

---

## 审查方法

用 commit 自身引入的 workflow engine 跑了一个对抗式审查 workflow：

1. **Phase 1 — MultiPerspectiveScan**: 7 个并行 reviewer（architecture / runtime / types / test-quality / integration / security / removal-docs），用 Explore agentType，独立扫各自维度
2. **Phase 2 — Consolidation**: opus consolidator 合并去重，按主题归类
3. **Phase 3 — AdversarialRefutation**: general-purpose refuter 对每个 CRITICAL/HIGH 用新证据反驳
4. **Phase 4 — FinalReport**: opus judge 综合输出最终报告

journal 完整 10 条 agent 记录在 `.claude/workflow-runs/wtujwahzf/journal.jsonl`。

**审查过程中实证发现的额外 bug**（judge 没覆盖，因为我正好用这个引擎跑审查才暴露）：见下一节。

---

## 我实证发现的 bug（judge report 之外）

这些是跑审查过程中亲身踩到的，judge 的 7 个 reviewer 没看到，因为这些 bug 涉及 host 集成层（`src/workflow/*`、`src/tasks/LocalWorkflowTask/*`）和实际工具调用语义，需要"真正用一次"才能暴露。

### [HIGH] `args` schema 回归：旧 `z.string()` → 新 `z.unknown()`，prompt 未同步

- **文件**: `packages/workflow-engine/src/tool/schema.ts:14-19`、`packages/workflow-engine/src/tool/WorkflowTool.ts:38-49, 114`
- **现象**: 调用 Workflow 工具传 `args: {"commit": "..."}`，脚本里 `args.commit === undefined`。子 agent 端到端复现：当 args 是 object 时全链路 OK；是 string 时丢字段。
- **根因**: 旧 `packages/builtin-tools/src/tools/WorkflowTool/WorkflowTool.ts`（本 commit 删除）的 schema 是 `args: z.string().optional()`，模型按旧契约发字符串。本 commit 改成 `z.unknown().optional()` 但 prompt 没强约束"必须传对象"，模型继续按旧契约发字符串 → 运行时 `args` 是 string → 脚本里 `args.commit` 拿不到。
- **影响**: 任何依赖 `args` 透传的命名 workflow 都会拿到 undefined 字段，直接 throw 或 silently 拿不到参数。我不得不在脚本里把 commit hash 写死绕过。
- **修复方向**:
  - `WorkflowTool.call` 加防御：`if (typeof input.args === 'string') input.args = JSON.parse(input.args)`
  - 或 schema 用 `z.preprocess((v) => typeof v === 'string' ? JSON.parse(v) : v, z.unknown())`
  - 同步 prompt：明确"args 必须是 JSON 对象，禁止传字符串化的 JSON"

### [HIGH] Workflow 状态变更通知未接入 host 通知系统

- **文件**: `packages/workflow-engine/src/tool/WorkflowTool.ts:127-140`、`src/workflow/ports.ts:84-135`、`src/workflow/wiring.ts`
- **现象**: WorkflowTool 的工具返回文本承诺"完成时会自动通知。用 /workflows 查看实时进度。"，但本次审查中：
  - smoke test (`w17jmnsq3`) 完成时，我没收到任何 task-notification
  - review-commit (`wtujwahzf`) 完成时，我没收到任何 task-notification，是用户手动告诉我"结束了"我才知道
  - 失败的 review-commit (`wpv9nu2eo`、`w2tvwj0ka`) 也没收到失败通知
  - 同期启动的 Agent 工具（非 workflow）完成时**有**收到 `<task-notification>`
- **根因**: 引擎确实通过 `ports.progressEmitter.emit({ type: 'run_done', ... })` 发了事件，`taskRegistrar.complete/fail/kill` 也被调了，但**没有任何代码把这些事件桥接到 host 的通知机制**（AgentTool 完成时通过 `runAgent.ts` 的 finally 触发 task-notification）。Workflow tool detached 执行后，host 没有订阅 taskRegistrar 的状态变更。
- **影响**: 任何 workflow（特别是耗时长的）跑完用户都不知道；用户必须主动 `/workflows` 查看；workflow 失败时用户完全感知不到。这直接违背了 commit message 和 prompt 中"完成时会自动通知"的承诺。
- **修复方向**:
  - 在 `src/workflow/wiring.ts`（或 host bundle 构造处）订阅 `WorkflowService.subscribe`，对 `status` 从 `running` → `completed/failed/killed` 的转换发 host 通知
  - 或在 `WorkflowTool.ts:124` 的 `.then(result => onFinish(...))` 内，根据 result.status 触发 host notification（参考 `runAgent.ts` 的 task-notification 路径）

### [MEDIUM] `failWorkflowTask` 丢弃 error message

- **文件**: `src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts:96-107`
- **现象**: workflow 失败时 progress store 的 `RunProgress.error` 字段在 `/workflows` 面板能看到（`WorkflowDetail.tsx:63-67` 渲染 `run.error`），但 `BackgroundTasksDialog` 用的 `LocalWorkflowTask` 状态对象没有 error 字段——`failWorkflowTask(taskId, setAppState)` 完全丢弃 error。两套状态系统不一致。
- **影响**: 用户在 `BackgroundTasksDialog` 看到 workflow 标记为 failed，但不知道为什么 failed；必须切到 `/workflows` panel 才能看到 error 文字。
- **修复方向**: `failWorkflowTask` 签名加 `error?: string` 参数，存入 `LocalWorkflowTaskState`，并在 `BackgroundTasksDialog` 渲染。

### [LOW] WorkflowTool 的 run_id 提示与实际 run 目录解析路径不一致

- **文件**: `src/workflow/ports.ts:69`、`packages/workflow-engine/src/tool/WorkflowTool.ts:121`
- **现象**: `WorkflowTool.ts:121` 的 `cwd: host.cwd` 来自 `getCwd()`（运行时 cwd，可能在 worktree 切换时变化）；而 `ports.ts:69` 的 `runsDir = ${getProjectRoot()}/.claude/workflow-runs` 用的是 session 启动时的 project root。两者在某些路径下不一致（如 mid-session `EnterWorktreeTool`）。
- **影响**: 命名 workflow 文件解析（用 cwd）和 journal 持久化路径（用 projectRoot）可能落到不同目录，调试时混乱。
- **修复方向**: 统一用 `getProjectRoot()`，或在文档里明确两者的语义差异。

---

## Judge 报告核心 finding

### HIGH：脚本沙箱可被动态 `import()` 绕过

- **文件**: `packages/workflow-engine/src/engine/script.ts:166-221`
- **问题**: `assertScriptBody` 只屏蔽**静态** `import` 语句（regex `/^\s*import\b/m`），但 `new AsyncFunction()` 体内可 `await import('node:child_process')`、可直接访问 `process.env` / `Buffer` / `globalThis`。Node 和 Bun 实测都能逃逸。
- **降级理由**: LLM 本就有 `BashTool`（`src/constants/tools.ts:139`），沙箱逃逸不扩大能力；但破坏了 resume 的确定性假设 + 未来若引入半信任脚本源会致命。
- **修复**: `import(` 加进 regex 黑名单 + 文档明确"沙箱保确定性，不保安全"。

### MEDIUM（7 项，按价值排序）

1. **`scriptPath` 任意文件读，无路径校验** — `WorkflowTool.ts:184-188`、`service.ts:104-109`。`input.scriptPath` 来自 LLM，无 containment check，可读 `/etc/passwd`、`~/.ssh/id_rsa`。`FileReadTool` 已有此能力，但 `scriptPath` 绕过权限提示。
2. **命名 workflow 路径遍历** — `namedWorkflows.ts:18-19`。`name` 参数未过滤 `../`，`name = "../../etc/passwd"` 可逃出 `workflowDir`（虽然 `.ts/.js/.mjs` 扩展名限制缓解了利用）。
3. **Budget 检查竞态** — `hooks.ts:53, 95-106`。`assertCanSpend()` 在 semaphore 之前，N 个并发都能过检 → 实测 4 并发 100 token budget 实花 200（100% 超支）。默认 `budget = null` 时不触发，显式设 budget 才暴露。
4. **`parallel`/`pipeline` 静默吞错** — `hooks.ts:126-134, 148-160`。`catch {}` 完全无日志，workflow 作者无法知道 agent 为何失败。"null on error"契约本身是对的，但应该 log。
5. **双重类型断言掩盖 schema/type 漂移** — `WorkflowTool.ts:56`。`workflowInputSchema as unknown as z.ZodType<WorkflowInput>`，应该 `export type WorkflowInput = z.infer<typeof workflowInputSchema>`。
6. **Service 层测试 mock adapter 永远返回 ok** — `service.test.ts:39-68`。`fakePorts()` 永远返回 `{kind: 'ok', output: 'mock-out'}`，service 层的失败路由（`service.ts:164-173`）未测。
7. **Journal 并发写入顺序非确定** — `hooks.ts:111-113`。`push` + `index++` 同步原子，但 `await append()` 落盘顺序是完成顺序而非调用顺序。resume 时若并发完成顺序不同，key 不匹配 → journal 失效 → 全重跑。**对 parallel workflow 来说 resume 几乎无效**。

### LOW / INFO

- LOW: Semaphore permit 在 abort 时延迟释放（queued waiter 阻塞至 permit 到来）
- LOW: `WorkflowsPanel.tsx:40-45` 的 `useSyncExternalStore` 无 error boundary
- LOW: WorkflowService singleton 无 shutdown 清理
- INFO: `AgentRunParams.schema` 用 `object` 而非 `Record<string, unknown>`
- INFO: `WorkflowInputSchema` 类型未从 package index 导出
- INFO: 旧 `builtin-tools/WorkflowTool` 删除干净，无残留 import
- INFO: workflow-engine 包零 host 依赖（只 ajv + zod）
- INFO: HostHandle 用 Symbol-based opacity 是合理的 seam

### 被反驳的发现（refuter 用新证据推翻）

- ~~**CRITICAL**: 并发 journal 索引腐蚀~~ — 误判 JS 单线程执行模型。`push` 和 `index++` 之间无 `await`，不可被抢占。
- ~~**HIGH**: 键盘 stale reference 竞态~~ — 误判 `useEventCallback` 语义。`usehooks-ts` 的 ref 在 layout phase 同步更新，键盘 handler 总能拿到最新 `focused`。
- ~~**HIGH**: sub-agent 默认 `acceptEdits` 权限~~ — 全代码库约定（`resumeAgent.ts:161` 同样写法），非 workflow 特有漏洞。

---

## 做得好的地方

1. **架构干净**：workflow-engine 包零 host 依赖（只 ajv + zod），教科书级 hexagonal。所有 host 交互通过注入的 `Ports` / `HostHandle`。
2. **Journal 离散检测健壮**：`hooks.ts:65-81` 的 key mismatch → 优雅降级到全重跑，不会产生错误结果。
3. **Budget API 设计良好**：`Budget` 类的 `assertCanSpend` / `addOutputTokens` / `remaining` API 表面正确（虽然实现有竞态），后续加 reservation 机制容易。
4. **Engine 层测试覆盖扎实**：`hooks.test.ts` 覆盖 dead / skipped / budget exhaust / abort / adapter 错误 / parallel-pipeline error suppression，这是 engine 层该有的覆盖深度。
5. **旧代码删除干净**：commit 正确删除 `builtin-tools/WorkflowTool`，保留 `bundled/` 作为扩展点，更新 `biome.json` 排除项匹配新架构，无残留 import。
6. **设计文档完备**：`docs/features/workflow-scripts.md`、`docs/superpowers/specs/2026-06-12-workflow-engine-design.md`、`docs/superpowers/plans/2026-06-12-workflow-engine.md` 配套齐全。

---

## 推荐 merge 前修复（按优先级）

1. **[HIGH] Workflow 状态变更通知接入 host** — 在 `src/workflow/wiring.ts` 订阅 `WorkflowService.subscribe`，对 status 转换发 host notification；这是 commit message 和 prompt 已承诺但未实现的功能。
2. **[HIGH] `args` schema 防御性 parse** — `WorkflowTool.call` 加 `if (typeof input.args === 'string') JSON.parse(...)` + 同步 prompt。
3. **[HIGH] 脚本沙箱黑名单加 `import(`** — `script.ts:166` 一行修复 + 文档明确"沙箱保确定性不保安全"。
4. **[MEDIUM] `scriptPath` / `name` 路径校验** — containment check，拒绝 `../`、绝对路径越界。
5. **[MEDIUM] `failWorkflowTask` 保存 error** — 签名加 error 参数，存入 task state，与 progress store 对齐。
6. **[MEDIUM] `assertCanSpend()` 挪到 semaphore critical section 内** — 关闭 budget 超支竞态。
7. **[MEDIUM] service.test.ts 加 dead/skipped 路由测试** — 关闭 service 层失败路由覆盖盲区。
8. **[MEDIUM] `WorkflowInput = z.infer<typeof workflowInputSchema>`** — 消除双重断言，防 schema/type 漂移。

前 5 项都是几行到几十行的小改动，建议合并前完成。第 6-8 项可以 follow-up。

---

## 审查过程的元观察（dogfooding 发现）

用 commit 自身引入的 workflow engine 跑这个审查，等于把引擎当 dogfood。除了上述具体 bug，还有一些元观察：

- **"完成时自动通知"承诺落空**是最影响用户体验的一条——workflow 跑完了用户不知道，跑挂了用户也不知道，必须主动 `/workflows`。这违背了工具描述里写的契约。
- **journal 落盘路径与命名 workflow 解析路径用了不同根**（`getProjectRoot()` vs `getCwd()`），调试时容易找不到 journal 文件。
- **smoke test 能跑通、review-commit 不能跑通**——区别在于 review-commit 读 `args.commit`，这暴露了 schema 回归。说明现有测试覆盖（即使是 99.65% 的引擎覆盖率）无法替代真实使用场景的 dogfooding。
- **refuter 反驳掉 2 个 CRITICAL/HIGH** 是对抗式审查的价值证明：单 reviewer 视角会基于错误假设（JS 并发模型、React ref 语义）报假阳性，多一层反驳能纠偏。

完整 journal（10 条 agent 输出）：`.claude/workflow-runs/wtujwahzf/journal.jsonl`

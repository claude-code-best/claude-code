# research-report —— 库优先运行示例

用 `@claude-code-best/workflow-engine` **直接**运行一个 workflow，绕开 Workflow 工具与核心 `runAgent`。

## 状态

- **引擎层**：完整且测试覆盖 **99.65% 行 / 99.20% 函数**（workflow-engine 包 112 个 mock 测试全绿）。
- **本 example**：编排逻辑（`parallel` / `pipeline` / `schema` / `args`）经 mock 端到端验证；**真实 LLM 已跑通**（直连 Anthropic SDK）。
- **定位**：库 API 与引擎逻辑的**参考实现 + 冒烟示范**，不是生产服务——见下方「生产就绪」。

## 它演示了什么

- **库可独立使用**：`run.ts` 只 `import { runWorkflow, ... } from '@claude-code-best/workflow-engine'`，自己组装 7 个端口，不依赖 `src/` 任何核心模块。
- **agent 后端直连 Anthropic SDK**：`agentRunner` 调 `client.messages.create`，子 agent = 一次模型调用（不经核心 `runAgent`、不经 Workflow 工具）。
- **真实 LLM + 结构化输出**：`agent(schema)` → prompt 追加 JSON 指令 → 提取 JSON → `validateAgainstSchema`（Ajv）校验，失败回退 `dead`。
- **引擎能力全覆盖**：`parallel`（屏障，多角度 fan-out）→ `pipeline`（无屏障，逐条深挖）→ `phase` / `log` / `args`。

## 运行

```bash
ANTHROPIC_API_KEY=sk-... \
  bun run packages/workflow-engine/examples/research-report/run.ts "Edge Computing"
```

环境变量：

- `ANTHROPIC_API_KEY`（必填）
- `ANTHROPIC_MODEL`：默认 `claude-sonnet-4-5`
- `WORKFLOW_API_CONCURRENCY`：API 并发上限，默认 `3`（见下）。低 tier 可设 `1` 串行
- `RESEARCH_RUNS_DIR`：journal 目录，默认 `~/.claude/workflow-runs`（resume 时复用）

## 健壮性与排错

runner 内置了几项让真实 API 跑得稳的处理：

- **API 并发限制**：`llmAgent` 经独立信号量限并发（默认 3），**独立于引擎的 CPU 级 semaphore**——LLM API 对并发远比 CPU 敏感，按 cores（可能 14）放并发会触发 429。用 `WORKFLOW_API_CONCURRENCY` 调。
- **429/5xx 重试**：指数退避（500ms → 1s → 2s → 4s，最多 4 次）；连接/超时错误也重试。
- **SDK 日志关闭**：`new Anthropic({ logLevel: 'off' })`（options 优先级最高，压过 `ANTHROPIC_LOG` env）。否则 SDK 会打 `[log_xxxxx] sending request {…}` 这种完整请求 JSON。
- **错误摘要精简**：失败只打 `HTTP 429 rate_limit_error` 这种短行，不打印含 request body 的整段 message。
- **synthesize 防 JSON**：prompt 明确禁止把输入的 `deepFindings` JSON 原样粘进报告。

排错速查：

| 现象 | 原因 / 处理 |
|------|------|
| `HTTP 429 ...` 频繁 | 降 `WORKFLOW_API_CONCURRENCY=1`（或 2） |
| agent `✗ [dead]` 多 | 模型未按 schema 返回 JSON；换更强模型或放宽 schema |
| `[log_xxx] sending request` 刷屏 | 不应再出现（已 `logLevel:'off'`）；若仍出现检查 env 是否覆盖 |
| 报告被截断 | synthesize 已 `maxTokens:8192`；仍不够可改 workflow 脚本 |

## 文件

| 文件 | 作用 |
|------|------|
| `research-report.workflow.mjs` | workflow 脚本（编排逻辑，纯 JS，引擎沙箱执行） |
| `run.ts` | runner：组装端口 + 直连 SDK + 运行 + 终端进度 |
| （同级 `../smoke.ts`） | 最小冒烟入口（3 次调用，秒级验证通路） |

## 扩展点

- **联网调研**：给 `llmAgent` 的 `messages.create` 加 `tools: [{ type: 'web_search_20250305' }]`（Anthropic server-side web search），research 角度即可联网。
- **命名命令复用**：把 `research-report.workflow.mjs` 复制到项目 `.claude/workflows/research-report.mjs`，即可通过 `/research-report` 或 Workflow 工具运行（同一脚本，两种入口）。
- **token 预算**：`runWorkflow({ budgetTotal: 200000 })` 设上限；脚本内用 `budget.remaining()` 自适应规模。
- **resume**：同 `runId` + `resume: true` 重放 journal，已完成的 agent 不重跑。

## 生产就绪（诚实）

本 example 验证的是**库的 API 与引擎编排逻辑**，不是生产服务。要上生产还差：

- **真实 LLM 压测**：长 workflow、大量并发、中断/resume 的真实场景验证（mock 覆盖不到模型行为）。
- **核心 adapter 的 v1 延期项**：`budgetTotal` 注入、skip/retry UI、worktree 隔离、StructuredOutput 完整接入（本 example 用 prompt+JSON 解析，比核心真实路径弱）。
- **错误恢复**：journal resume 只在 mock 验证过；真实中途崩溃的重放正确性未压测。

引擎核心逻辑（并发 / 预算 / journal / schema）有 99.65% 覆盖的 mock 测试兜底，可作为基础继续建。

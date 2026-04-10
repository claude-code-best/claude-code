<div align="center">

# CoStrict

**企业级 AI 编程助手 · 终端原生**

[快速开始](#快速开始) · [架构](#架构总览) · [部署](#私有化部署) · [API 协议](#api-多协议兼容) · [CoStrict 专有模块](#costrict-专有模块)

</div>

---

## CoStrict 是什么

CoStrict 是一款免费开源的 AI 辅助编程工具，专为企业级开发场景设计。支持私有化部署，是组织级安全、标准化 AI 开发工作流的最佳选择。

| 能力 | 说明 |
|------|------|
| **CoStrict 企业认证** | OAuth 2.0 + Casdoor SSO，自动 Token 刷新，机器指纹绑定 |
| **8 种 API 协议** | CoStrict / Anthropic / OpenAI / Gemini / Grok / Bedrock / Vertex / Foundry |
| **53+ 内置工具** | 文件读写、Shell 执行、Web 搜索、Agent 调度、MCP 扩展——开箱即用 |
| **16 个结构化 Agent** | 严格需求分析→架构设计→任务规划→编码→验证全链路编排 |
| **私有化部署** | Remote Control Server (Docker) + Bridge Mode，数据不出内网 |
| **Feature Flag 体系** | 19+ 默认特性 + 环境变量热开关，按需启用零代码改动 |
| **安全合规** | 权限模式分级、Policy 策略网关、Worktree 隔离、审计日志 |
| **全平台** | macOS / Windows / Linux，Computer Use + Chrome Use 双通道 UI 自动化 |

---

## 快速开始

### 安装版

```bash
bun i -g @costrict/xxx
csc
```

### 源码版

**环境要求**：[Bun](https://bun.sh/) >= 1.2.0

```bash
git clone https://github.com/y574444354/csc.git
cd csc
bun install
bun run dev       # 版本号显示 888 即成功
bun run build     # 生产构建 → dist/cli.js + chunk 文件
```

### 首次登录

启动后输入 `/login`，CoStrict 提供两种认证入口：

**1. CoStrict 企业登录（推荐）**

浏览器自动打开 CoStrict OAuth 页面，完成 SSO 登录后自动写入凭证：

```
/login → 选择 CoStrict → 浏览器 SSO 登录 → 自动完成
```

- 认证服务：`https://zgsm.sangfor.com/oidc-auth`
- 凭证存储：`~/.claude/csc-auth.json`（0600 权限）
- 自动刷新：三层 Token 验证 + 预防性刷新 + 401 反应性恢复

**2. 第三方 API 直连**

选择 Anthropic Compatible / OpenAI / Gemini 填写 Base URL 和 API Key：

| 字段 | 说明 | 示例 |
|------|------|------|
| Base URL | API 服务地址 | `https://api.example.com/v1` |
| API Key | 认证密钥 | `sk-xxx` |
| Haiku Model | 快速模型 | `claude-haiku-4-5-20251001` |
| Sonnet Model | 均衡模型 | `claude-sonnet-4-6` |
| Opus Model | 高性能模型 | `claude-opus-4-6` |

也可直接编辑 `~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.example.com/v1",
    "ANTHROPIC_AUTH_TOKEN": "sk-xxx",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5-20251001",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-6",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-6"
  }
}
```

---

## CoStrict 专有模块

### 企业认证体系 (`src/costrict/provider/`)

| 模块 | 职责 |
|------|------|
| `auth.ts` | OAuth 2.0 登录流程：浏览器跳转、Token 轮询、凭证保存 |
| `credentials.ts` | 凭证管理：读写 `csc-auth.json`、机器指纹 SHA256 生成 |
| `token.ts` | Token 生命周期：JWT 解析、三层验证、自动刷新 |
| `fetch.ts` | 请求中间件：动态注入 Authorization + 自定义 Headers、预防性/反应性 Token 刷新 |
| `oauth-params.ts` | OAuth 参数构建：Casdoor provider 标识、插件版本、URI Scheme |
| `models.ts` | 动态模型列表：从 AI Gateway 拉取可用模型，1 小时缓存 |
| `modelMapping.ts` | 模型名解析：5 级优先级映射 Anthropic 模型名到 CoStrict 模型 ID |
| `index.ts` | 查询入口：复用 OpenAI 兼容路径，注入 CoStrict fetch 和 baseURL |

**Token 刷新策略**：

```
请求发起 → 读取凭证 → Token 是否过期？
  ├─ 否 → 正常请求（注入 Authorization + X-Costrict-* headers）
  └─ 是 → refresh_token 刷新 → 成功？
       ├─ 是 → 更新凭证 → 正常请求
       └─ 否 → 使用旧 Token 尝试 → 401？
            ├─ 是 → 再次刷新 → 重试请求
            └─ 否 → 返回原始响应
```

**模型名解析优先级**：

1. 传入 model 已是已知 CoStrict 模型 ID（用户 `/model` 明确选择）
2. `COSTRICT_MODEL` 环境变量（管理员全局覆盖）
3. `COSTRICT_DEFAULT_{HAIKU|SONNET|OPUS}_MODEL` 环境变量（按族映射）
4. 缓存模型列表的第一个可用模型
5. 透传原始模型名（兜底）

### 结构化 Agent (`src/costrict/agents/`)

CoStrict 提供严格分阶段的 Agent 编排，覆盖从需求到交付的全链路：

| Agent | 阶段 | 职责 |
|-------|------|------|
| `strictSpec` | 需求 | 需求澄清 → 架构设计 → 任务规划 → 执行（四阶段工作流） |
| `requirement` | 需求 | 用户需求 → 结构化系统需求文档 |
| `designAgent` | 设计 | 需求文档 → C4 Model 架构设计 |
| `taskPlan` | 规划 | 需求 + 设计 → 高层次任务规划 |
| `strictPlan` | 规划 | 用户需求 → 可执行实施计划 |
| `subCoding` | 编码 | 高效低成本的代码实现 |
| `taskCheck` | 验证 | 任务质量检查与改进 |
| `tddTestDesign` | 测试 | 功能需求 → 测试用例设计 |
| `tddTestPrepare` | 测试 | 测试环境准备 |
| `tddRunAndFix` | 测试 | 执行验证 → 自动修复 |
| `tddTestAndFix` | 测试 | 测试执行与诊断修复 |
| `codeReviewSecurity` | 安全 | 代码安全审计 |
| `quickExplore` | 探索 | 快速项目探索与代码理解 |
| `wikiProjectAnalyze` | 文档 | 项目分类分析 |
| `wikiCatalogueDesign` | 文档 | 文档结构设计 |
| `wikiDocumentGenerate` | 文档 | 技术文档生成 |
| `wikiIndexGeneration` | 文档 | 索引文档生成 |

**StrictSpec 全链路编排**：

```
用户需求 → StrictSpec
  ├─ Stage 1: Requirement → 结构化需求文档
  ├─ Stage 2: DesignAgent → C4 Model 架构设计
  ├─ Stage 3: TaskPlan → 任务规划
  └─ Stage 4: SubCoding → 编码实现
```

### CoStrict 技能 (`src/costrict/skill/`)

| 技能 | 说明 |
|------|------|
| `projectWiki` | 项目文档体系生成（分析→设计→生成→索引） |
| `tdd` | TDD 全流程（设计→准备→执行→修复） |
| `builtin` | 内置技能注册与索引 |

---

## API 多协议兼容

CoStrict 通过流适配器模式将所有 API 协议转为内部统一格式，下游代码零改动。

| 协议 | 启用方式 | 适用场景 |
|------|---------|---------|
| **CoStrict** | `/login` 选 CoStrict 或 `CLAUDE_CODE_USE_COSTRICT=1` | 企业 SSO + AI Gateway 动态模型 |
| **Anthropic** | 默认 | 原生 Messages API |
| **OpenAI** | `CLAUDE_CODE_USE_OPENAI=1` | Ollama / DeepSeek / vLLM |
| **Gemini** | `CLAUDE_CODE_USE_GEMINI=1` | Google Gemini API |
| **xAI Grok** | `CLAUDE_CODE_USE_GROK=1` | xAI Grok API |
| **AWS Bedrock** | `CLAUDE_CODE_USE_BEDROCK=1` | AWS Bedrock |
| **Google Vertex** | `CLAUDE_CODE_USE_VERTEX=1` | Vertex AI |
| **Foundry** | `CLAUDE_CODE_USE_FOUNDRY=1` | Anthropic Foundry |

---

## 架构总览

```
┌───────────────────────────────────────────────────────────┐
│  CLI 入口 (cli.tsx) — 12 快速路径 + main.tsx 完整 CLI     │
├───────────────────────────────────────────────────────────┤
│  REPL 对话循环                                             │
│  REPL.tsx → QueryEngine → query() → API Client            │
│  流式响应 · Tool 调度 · 上下文压缩 · 记忆管理             │
├───────────────┬───────────────────────────────────────────┤
│  CoStrict 专有 │            通用工具层                     │
│  ┌──────────┐ │  ┌─────────────────────────────────────┐  │
│  │ Provider  │ │  │ 53+ 内置工具                        │  │
│  │  OAuth    │ │  │ 文件 / Shell / Agent / Web / MCP   │  │
│  │  Token    │ │  │ Cron / Worktree / LSP / Skill      │  │
│  │  Fetch    │ │  └─────────────────────────────────────┘  │
│  │ Models    │ ├───────────────────────────────────────────┤
│  │ Mapping   │ │            Agent 编排层                   │
│  └──────────┘ │  ┌─────────────────────────────────────┐  │
│  ┌──────────┐ │  │ CoStrict Agents (16)                │  │
│  │ Agents   │ │  │ StrictSpec · TDD · Wiki · Security  │  │
│  │  (16)    │ │  └─────────────────────────────────────┘  │
│  └──────────┘ │  ┌─────────────────────────────────────┐  │
│  ┌──────────┐ │  │ 通用 Agents                         │  │
│  │ Skills   │ │  │ AgentTool · Team · Coordinator      │  │
│  │  (3)     │ │  │ Fork Subagent · Worktree 隔离       │  │
│  └──────────┘ │  └─────────────────────────────────────┘  │
├───────────────┴───────────────────────────────────────────┤
│  API 兼容层 (8 协议) → 统一流适配器 → 下游代码零改动     │
├───────────────────────────────────────────────────────────┤
│  基础设施                                                 │
│  Feature Flag · Daemon · Bridge/RCS · Voice Mode          │
│  BG Sessions · Policy 网关 · Sentry · GrowthBook          │
└───────────────────────────────────────────────────────────┘
```

### CLI 入口快速路径

| 命令 | 说明 | Feature Gate |
|------|------|-------------|
| `--version` | 版本输出：`4.0.1 (CoStrict)` | — |
| `--claude-in-chrome-mcp` | Chrome 浏览器控制 MCP | — |
| `--computer-use-mcp` | Computer Use MCP | `CHICAGO_MCP` |
| `rc` / `bridge` / `remote-control` | Bridge 模式 | `BRIDGE_MODE` |
| `daemon` | 守护进程 | `DAEMON` |
| `ps` / `logs` / `attach` / `kill` | 后台会话管理 | `BG_SESSIONS` |
| `new` / `list` / `reply` | Template 任务 | `TEMPLATES` |
| `environment-runner` | BYOC 环境运行器 | `BYOC_ENVIRONMENT_RUNNER` |
| `self-hosted-runner` | 自托管运行器 | `SELF_HOSTED_RUNNER` |
| `--tmux` + `--worktree` | Tmux 工作区隔离 | — |
| 默认路径 | 完整 REPL CLI | — |

---

## 工具体系

### 内置工具分类

| 分类 | 工具 | 说明 |
|------|------|------|
| **文件操作** | `FileReadTool` `FileEditTool` `FileWriteTool` `GlobTool` `GrepTool` | 代码读写与搜索 |
| **Shell 执行** | `BashTool` `PowerShellTool` `REPLTool` | 命令执行与交互式 REPL |
| **Agent 协作** | `AgentTool` `TaskCreateTool` `TaskUpdateTool` `TaskListTool` `TaskGetTool` `TaskOutputTool` `TaskStopTool` | 多 Agent 任务调度 |
| **团队编排** | `TeamCreateTool` `TeamDeleteTool` `SendMessageTool` | Agent Team 编排 |
| **规划验证** | `EnterPlanModeTool` `ExitPlanModeTool` `VerifyPlanExecutionTool` | 结构化规划与验证 |
| **Web 网络** | `WebFetchTool` `WebSearchTool` `WebBrowserTool` | 网页获取/搜索/浏览器自动化 |
| **MCP 扩展** | `MCPTool` `McpAuthTool` `ListMcpResourcesTool` `ReadMcpResourceTool` | Model Context Protocol |
| **调度定时** | `CronCreateTool` `CronDeleteTool` `CronListTool` | Cron 定时任务 |
| **工作区** | `EnterWorktreeTool` `ExitWorktreeTool` | Git Worktree 隔离 |
| **交互辅助** | `AskUserQuestionTool` `TodoWriteTool` `SkillTool` `ToolSearchTool` `DiscoverSkillsTool` `ConfigTool` | 用户交互与配置 |
| **开发辅助** | `LSPTool` `NotebookEditTool` `BriefTool` | LSP / Notebook / 会话摘要 |
| **远程触发** | `RemoteTriggerTool` `MonitorTool` | 远程 Agent 触发与监控 |
| **高级特性** | `SleepTool` `SnipTool` `WorkflowTool` `TungstenTool` | Proactive / 工作流 / 实验性 |

### MCP 扩展

```bash
csc mcp serve     # 启动 MCP 服务器
csc mcp add       # 添加 MCP 服务
csc mcp list      # 列出已配置服务
```

---

## Feature Flag 体系

所有特性通过 `FEATURE_<FLAG_NAME>=1` 环境变量按需启用。

### 默认启用（Dev + Build）

| 优先级 | Feature | 说明 |
|--------|---------|------|
| 核心 | `BUDDY` | 宠物伙伴 |
| 核心 | `TRANSCRIPT_CLASSIFIER` | 会话自动分类 |
| 核心 | `BRIDGE_MODE` | Bridge / Remote Control |
| 核心 | `AGENT_TRIGGERS_REMOTE` | 远程 Agent 触发 |
| 核心 | `CHICAGO_MCP` | Computer Use MCP |
| 核心 | `VOICE_MODE` | 语音输入 |
| 监控 | `SHOT_STATS` | 统计面板 |
| 监控 | `PROMPT_CACHE_BREAK_DETECTION` | 缓存断裂检测 |
| 监控 | `TOKEN_BUDGET` | Token 预算管理 |
| P0 | `AGENT_TRIGGERS` | 本地 Agent 触发 |
| P0 | `ULTRATHINK` | 深度思考 |
| P0 | `BUILTIN_EXPLORE_PLAN_AGENTS` | 内置探索/规划 Agent |
| P0 | `LODESTONE` | Lodestone |
| P1 | `EXTRACT_MEMORIES` | 记忆提取 |
| P1 | `VERIFICATION_AGENT` | 验证 Agent |
| P1 | `KAIROS_BRIEF` | Kairos 摘要 |
| P1 | `AWAY_SUMMARY` | 离线摘要 |
| P1 | `ULTRAPLAN` | 超级规划 |
| P2 | `DAEMON` | 守护进程 |

### 按需启用

| Feature | 说明 |
|---------|------|
| `BG_SESSIONS` | 后台会话 (ps/logs/attach/kill) |
| `FORK_SUBAGENT` | Fork 子 Agent 并行执行 |
| `PROACTIVE` | 主动式 Agent |
| `KAIROS` | Kairos 全功能 |
| `COORDINATOR_MODE` | Coordinator 协调模式 |
| `TEMPLATES` | Template 任务系统 |
| `SSH_REMOTE` | SSH 远程连接 |
| `WEB_BROWSER_TOOL` | 浏览器自动化 |
| `WORKFLOW_SCRIPTS` | 工作流脚本 |
| `BYOC_ENVIRONMENT_RUNNER` | BYOC 环境运行器 |
| `SELF_HOSTED_RUNNER` | 自托管运行器 |

```bash
FEATURE_FORK_SUBAGENT=1 FEATURE_BG_SESSIONS=1 bun run dev
```

---

## Workspace Packages

| Package | 说明 | 状态 |
|---------|------|------|
| `@ant/ink` | Forked Ink 终端 UI 框架 | 完整 |
| `@ant/computer-use-mcp` | Computer Use MCP Server | 完整 |
| `@ant/computer-use-input` | 键鼠模拟 (多平台 backend) | 完整 |
| `@ant/computer-use-swift` | 截图 + 应用管理 (多平台) | 完整 |
| `@ant/claude-for-chrome-mcp` | Chrome 浏览器控制 | 完整 |
| `remote-control-server` | 自托管 RCS (Docker + Web UI) | 完整 |
| `audio-capture-napi` | 原生音频捕获 | 已恢复 |
| `image-processor-napi` | 图像处理 | 已恢复 |
| `color-diff-napi` | 颜色差异计算 | 完整 |
| `modifiers-napi` | 键盘修饰键检测 | Stub |
| `url-handler-napi` | URL scheme 处理 | Stub |

---

## 测试与质量

| 指标 | 数据 |
|------|------|
| 测试数量 | 2430 tests |
| 测试文件 | 137 files |
| 断言调用 | 3982 expect() |
| 框架 | `bun:test` |
| Lint | Biome |
| Format | Biome |

```bash
bun test                                       # 全量测试
bun test src/utils/__tests__/hash.test.ts       # 单文件
bun test --coverage                            # 覆盖率
bun run lint                                    # 静态检查
bun run health                                  # 健康检查
```

---

## 开发调试

### 常用脚本

| 命令 | 说明 |
|------|------|
| `bun run dev` | 开发模式（MACRO + 全 Feature） |
| `bun run dev:inspect` | 带 Inspector 的开发模式 |
| `bun run build` | 生产构建 (code splitting) |
| `bun run lint:fix` | 自动修复 Lint |
| `bun run format` | 格式化 |
| `bun run health` | 健康检查 |
| `bun run generate:skills` | 生成 Skills 索引 |
| `bun run rcs` | 启动 RCS |
| `bun run docs:dev` | 文档站 (Mintlify) |

### VS Code 调试

```bash
bun run dev:inspect   # → ws://localhost:8888/xxx
# VS Code: F5 → "Attach to Bun (TUI debug)"
```

---

## Teach Me

内置苏格拉底式问答学习：

```bash
/teach-me CoStrict 架构
/teach-me Tool 系统 --level beginner --resume
```

---

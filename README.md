# Claude Code Best V5 (CCB)

[![GitHub Stars](https://img.shields.io/github/stars/claude-code-best/claude-code?style=flat-square&logo=github&color=yellow)](https://github.com/claude-code-best/claude-code/stargazers)
[![GitHub Contributors](https://img.shields.io/github/contributors/claude-code-best/claude-code?style=flat-square&color=green)](https://github.com/claude-code-best/claude-code/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/claude-code-best/claude-code?style=flat-square&color=orange)](https://github.com/claude-code-best/claude-code/issues)
[![GitHub License](https://img.shields.io/github/license/claude-code-best/claude-code?style=flat-square)](https://github.com/claude-code-best/claude-code/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/claude-code-best/claude-code?style=flat-square&color=blue)](https://github.com/claude-code-best/claude-code/commits/main)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?style=flat-square&logo=bun)](https://bun.sh/)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord)](https://discord.gg/uApuzJWGKX)

> Which Claude do you like? The open source one is the best.

牢 A (Anthropic) 官方 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 完整复原的工程化项目。虽然很难绷, 但是它叫做 CCB(踩踩背)... 而且, 我们实现了企业版或者需要登陆 Claude 账号才能使用的特性, 并在此基础上扩展了更多好玩的特性。

[Peri Code](https://github.com/KonghaYao/peri)：Claude Code 兼容的 Rust Agent，多年大模型经验匠心制作，国内大模型（DeepSeek/GLM）精调，CPU/内存极致优化，在开发版/树莓派上也能跑 CC 一样的体验。

[文档在这里](https://ccb.agent-aura.top/) | [留影文档在这里](./Friends.md) | [Discord 群组，群主在线答疑](https://discord.gg/uApuzJWGKX)

| 特性                        | 说明                                                                                                                         | 文档                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **🎯 Goal 持续驱动**        | `/goal <objective>` 设定目标后，自动跨轮驱动 agent 直至完成；带 token budget、completion/blocked audit、`pause`/`resume`/`continue`/`clear` 子命令，网络中断自动暂停 | 源码 [`commands/goal/`](./src/commands/goal/) · [`services/goal/`](./src/services/goal/)                                                  |
| **📦 Artifacts（HTML 上传）** | 复刻 Anthropic 官方 Artifacts：模型把 HTML/数据看板/报告上传到公开 URL（7d/30d 自动过期），`/artifacts` 命令集中管理，Cloudflare Worker + R2 完全开源、可自托管 | [8 小时复刻报告](./docs/blog/2026-06-20-cloud-artifacts-8h-recap.md) · [在线 demo](https://cloud-artifacts.claude-code-best.win/30d/c2jfwi3E-y3fTZ1ors-KE.html) |
| **🧠 Ultracode 多 Agent 编排** | `/ultracode` 注入 workflow 编排手册 + `Workflow` 工具跑确定性 JS 脚本（`agent`/`pipeline`/`parallel`/`phase`）+ `/workflows` 双栏监控面板；支持 journal 重放、token budget、并发 cap | [文档](https://ccb.agent-aura.top/docs/features/workflow-scripts)                                                                         |
| **Claude 群控技术**         | Pipe IPC 多实例协作：同机 main/sub 自动编排 + LAN 跨机器零配置发现与通讯，`/pipes` 选择面板 + `Shift+↓` 交互 + 消息广播路由 | [Pipe IPC](https://ccb.agent-aura.top/docs/features/uds-inbox) / [LAN](https://ccb.agent-aura.top/docs/features/lan-pipes)                |
| **ACP 协议一等一支持**      | 支持接入 Zed、Cursor 等 IDE，支持会话恢复、Skills、权限桥接                                                                  | [文档](https://ccb.agent-aura.top/docs/features/acp-zed)                                                                                  |
| **Remote Control 私有部署** | Docker 自托管远程界面, 可以手机上看 CC                                                                                       | [文档](https://ccb.agent-aura.top/docs/features/remote-control-self-hosting)                                                              |
| **Langfuse 监控**           | 企业级 Agent 监控, 可以清晰看到每次 agent loop 细节, 可以一键转化为数据集                                                    | [文档](https://ccb.agent-aura.top/docs/features/langfuse-monitoring)                                                                      |
| **Web Search**              | 内置网页搜索工具, 支持 bing 和 brave 搜索                                                                                    | [文档](https://ccb.agent-aura.top/docs/features/web-browser-tool)                                                                         |
| **Poor Mode**               | 穷鬼模式，关闭记忆提取和键入建议,大幅度减少并发请求                                                                          | /poor 可以开关                                                                                                                            |
| **Channels 频道通知**       | MCP 服务器推送外部消息到会话（飞书/Slack/Discord/微信等），`--channels plugin:name@marketplace` 启用                         | [文档](https://ccb.agent-aura.top/docs/features/channels)                                                                                 |
| **自定义模型供应商**        | OpenAI/Anthropic/Gemini/Grok 兼容  (`/login`)                                                                                          | [文档](https://ccb.agent-aura.top/docs/features/all-features-guide)                                                                        |
| Voice Mode                  | 语音输入，支持豆包语言输入（`/voice doubao`）                                                                   | [文档](https://ccb.agent-aura.top/docs/features/voice-mode)                                                                               |
| Computer Use                | 屏幕截图、键鼠控制                                                                                                           | [文档](https://ccb.agent-aura.top/docs/features/computer-use)                                                                             |
| Chrome Use                  | 浏览器自动化、表单填写、数据抓取                                                                                             | [自托管](https://ccb.agent-aura.top/docs/features/chrome-use-mcp) [原生版](https://ccb.agent-aura.top/docs/features/claude-in-chrome-mcp) |
| Sentry                      | 企业级错误追踪                                                                                                               | [文档](https://ccb.agent-aura.top/docs/internals/sentry-setup)                                                                            |
| GrowthBook                  | 企业级特性开关                                                                                                               | [文档](https://ccb.agent-aura.top/docs/internals/growthbook-adapter)                                                                      |
| /dream 记忆整理             | 自动整理和优化记忆文件                                                                                                       | [文档](https://ccb.agent-aura.top/docs/features/auto-dream)                                                                               |

- 🚀 [想要启动项目](#-快速开始源码版)
- 🐛 [想要调试项目](#vs-code-调试)
- 📖 [想要学习项目](#teach-me-学习项目)

## ⚡ 快速开始(安装版)

不用克隆仓库, 从 NPM 下载后, 直接使用

```sh
npm i -g claude-code-best

# bun 安装比较多问题, 推荐 npm 装
# bun  i -g claude-code-best
# bun pm -g trust claude-code-best @claude-code-best/mcp-chrome-bridge

ccb # 以 nodejs 打开 claude code
ccb-bun # 以 bun 形态打开
ccb update # 更新到最新版本
CLAUDE_BRIDGE_BASE_URL=https://remote-control.claude-code-best.win/ CLAUDE_BRIDGE_OAUTH_TOKEN=test-my-key ccb --remote-control # 我们有自部署的远程控制
```

> **安装/更新失败？** 先 `npm rm -g claude-code-best` 清理旧版本，再 `npm i -g claude-code-best@latest`。仍失败则指定版本号：`npm i -g claude-code-best@<版本号>`

## ⚡ 快速开始(源码版)

### ⚙️ 环境要求

一定要最新版本的 bun 啊, 不然一堆奇奇怪怪的 BUG!!! bun upgrade!!!

- 📦 [Bun](https://bun.sh/) >= 1.3.11

**安装 Bun：**

```bash
# Linux 和 macOS
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

**安装后的操作：**

1. **让当前终端识别 `bun` 命令**

   安装脚本会把 `~/.bun/bin` 写入对应的 shell 配置文件。macOS 默认 zsh 环境通常会看到：

   ```text
   Added "~/.bun/bin" to $PATH in "~/.zshrc"
   ```

   可以按安装脚本提示重启当前 shell：

   ```bash
   exec /bin/zsh
   ```

   如果你使用 bash，重新加载 bash 配置：

   ```bash
   source ~/.bashrc
   ```

   Windows PowerShell 用户关闭并重新打开 PowerShell 即可。

2. **验证 Bun 是否可用**

   ```bash
   bun --help
   bun --version
   ```

3. **如果已经安装过 Bun，更新到最新版本**

   ```bash
   bun upgrade
   ```

- ⚙️ 常规的配置 CC 的方式, 各大提供商都有自己的配置方式

### 📍 命令执行位置

- 安装或检查 Bun 的命令可以在任意目录执行：
  `curl -fsSL https://bun.sh/install | bash`、`bun --help`、`bun --version`、`bun upgrade`
- 安装本项目依赖、启动开发模式、构建项目时，必须先进入本仓库根目录，也就是包含 `package.json` 的目录。

### 📥 安装

```bash
cd /path/to/claude-code
bun install
```

### ▶️ 运行

```bash
# 开发模式, 看到版本号 888 说明就是对了
bun run dev

# 构建
bun run build
```

构建采用 code splitting 多文件打包（`build.ts`），产物输出到 `dist/` 目录（入口 `dist/cli.js` + 约 450 个 chunk 文件）。

构建出的版本 bun 和 node 都可以启动, 你 publish 到私有源可以直接启动

如果遇到 bug 请直接提一个 issues, 我们优先解决

### 👤 新人配置 /login

首次运行后，在 REPL 中输入 `/login` 命令进入登录配置界面，选择 **Anthropic Compatible** 即可对接第三方 API 兼容服务（无需 Anthropic 官方账号）。
选择 OpenAI 和 Gemini 对应的栏目都是支持相应协议的

需要填写的字段：

| 📌 字段      | 📝 说明       | 💡 示例                      |
| ------------ | ------------- | ---------------------------- |
| Base URL     | API 服务地址  | `https://api.example.com/v1` |
| API Key      | 认证密钥      | `sk-xxx`                     |
| Haiku Model  | 快速模型 ID   | `claude-haiku-4-5-20251001`  |
| Sonnet Model | 均衡模型 ID   | `claude-sonnet-4-6`          |
| Opus Model   | 高性能模型 ID | `claude-opus-4-6`            |

- ⌨️ **Tab / Shift+Tab** 切换字段，**Enter** 确认并跳到下一个，最后一个字段按 Enter 保存

> ℹ️ 支持所有 Anthropic API 兼容服务（如 OpenRouter、AWS Bedrock 代理等），只要接口兼容 Messages API 即可。

## 🎛️ Remote Control 本地全链路联调（新 Web UI）

Remote Control 让你在**浏览器**里操作跑在**其他机器**上的 Claude Code。三方接力：

```
浏览器(新 UI) ──HTTP/SSE──▶ RCS 中继服务器 ──WebSocket──▶ ccb CLI(某台机=“环境”) ──▶ Claude API
     ▲                          (端口 3000                      ▲ 真正干活、读写你的仓库
     └────────── 事件推送 ◀──────  同时托管 UI)  ◀── 消息中继 ────┘
```

- **RCS** 只是“中转站”，自己不思考、不写代码；`packages/remote-control-server/`，对话和消息历史存入 SQLite，实时连接状态保留在内存中。
- **“环境”** 才是真正的 Claude Code：在目标机器上跑 `ccb remote-control`（源码版 `bun run dev remote-control`）把自己注册进 RCS。
- **新 Web UI** 仿 claude.ai，分 **Chat / Code** 双界面 + 项目管理，源码在 `packages/remote-control-server/web/`。

> ⚠️ **命令来源**：`ccb` 是**装了 npm 版或构建后**才有的可执行命令。源码开发目录里没有 `ccb`，请用下表的 `bun run dev …` 等价写法。所有命令都在**仓库根目录**（含 `package.json` 的 `Real-Agentic/`）执行。
>
> | 装了 npm 版 | 源码目录里 |
> | --- | --- |
> | `ccb` | `bun run dev` |
> | `ccb remote-control` | `bun run dev remote-control` |

### 一条命令在本机跑通整条链路

在仓库根目录运行：

```bash
bun run rcs:local
```

该命令以前台 supervisor 方式同时启动 RCS Server 和 Bridge Worker，自动生成并在两个子进程间传递临时 transport secret；Web 构建产物缺失时只构建一次。浏览器打开 <http://127.0.0.1:3000/code/> 即可。终端中的 `Ctrl-C` 会统一关闭两个子进程。

开发 Web UI 时使用：

```bash
bun run rcs:dev
```

它会额外启动 Vite，浏览器打开 <http://127.0.0.1:5173/code/>。其他分层入口：

| 命令 | 用途 |
| --- | --- |
| `bun run rcs:local` | 推荐的本地日常入口：RCS + Bridge，缺失时构建 Web |
| `bun run rcs:dev` | RCS + Bridge + Vite 热更新 |
| `bun run rcs:server` | 只启动 RCS Server，用于分离部署和排障 |
| `bun run rcs:worker` | 只启动 Bridge Worker，需自行配置 `CLAUDE_BRIDGE_*` |
| `bun run rcs` | `rcs:server` 的兼容别名 |

这里有两类不同的 key：

- **Transport secret**：`RCS_API_KEYS` / `CLAUDE_BRIDGE_OAUTH_TOKEN`，只负责 RCS 与 Worker 互相信任；`rcs:local` 和 `rcs:dev` 会自动配对。
- **模型 Provider key**：Anthropic、OpenAI、Gemini、Grok 等模型凭据，由 `/login` 或 Web Provider 设置页持久化；启动器不会打印、复制或写入这些凭据。

个人本地脚本默认绑定 `127.0.0.1` 并启用单用户模式；对话历史仍写入 SQLite。关键环境变量：

| 变量 | 作用 |
| --- | --- |
| `RCS_SINGLE_USER=1` | **单用户模式**：显式关闭 Web 会话按浏览器 UUID 的归属隔离，任意浏览器都能看到并操作同一批对话。浏览器 UUID 仅保留为兼容/配对标识；bridge 设备与工作区仍分别识别。默认关闭，多人或公网部署不要设。 |
| `RCS_DB_PATH`（默认 `./data/rcs.sqlite`） | 会话 + 事件历史落 SQLite，**RCS 重启后对话还在**，隔天回来接着聊。 |

> `rcs:local` 只在 Web `dist/index.html` 缺失时自动构建。修改 UI 源码后请使用 `rcs:dev` 热更新，或显式运行 `cd packages/remote-control-server && bun run build:web`。

### 须知 / 常见坑

- **目录别搞错**：命令必须在 `Real-Agentic/`（仓库根，含 `package.json`），不是外层文件夹。
- **分离部署时两个 token 要一致**：手工使用 `rcs:server` + `rcs:worker` 时，`CLAUDE_BRIDGE_OAUTH_TOKEN` 必须匹配 `RCS_API_KEYS` 中的一个值；统一入口会自动处理。
- **设备身份是安装级的**：bridge 首次运行会在 Claude 配置目录生成 `remote-control-device.json`。重启进程不会改变设备 ID；若复制了整个配置目录到另一台机器，请删除该文件后重启 bridge 以生成新设备 ID。
- **环境身份是稳定的**：同一账户、设备、工作区和 worker 类型会复用同一个 `environment_id`。每次 bridge 重启只接管新的连接租约，不会制造新的孤儿环境。
- **自建 bridge 免授权门**：设了 `CLAUDE_BRIDGE_BASE_URL` 即视为自托管，会绕过 GrowthBook 授权与最低版本校验（`src/bridge/bridgeConfig.ts` 的 `isSelfHostedBridge`）。
- **模型要先配好**：链路通了但发消息报 `There's an issue with the selected model …`，说明这台机器的模型没配。到 ② 那台机器 `/login` 配一个可用模型即可（与 UI/链路无关）。
- **UI 里的“项目”= 接入的环境**：没有环境接入时项目页为空，属正常。ACP agent 类型的环境需 WebSocket 直连，不出现在“新建会话”的环境选择里。
- **停止**：统一入口只需一次 `Ctrl-C`；RCS 的临时连接状态会清空，对话历史保留在 `RCS_DB_PATH` 指定的 SQLite 数据库中。

生产/Docker 自托管部署见 `docs/features/remote-control-self-hosting.md`。

## Feature Flags

先查看当前 dev 或构建产物实际包含的能力：

```bash
bun run dev capabilities
bun run dev capabilities --json
# 构建产物：ccb capabilities --json
```

Feature 环境变量接受 `1/true/yes/on`（启用）和 `0/false/no/off`（禁用，且可覆盖默认项），忽略大小写。例如：

```bash
FEATURE_BUDDY=1 FEATURE_FORK_SUBAGENT=1 bun run dev
FEATURE_BUDDY=0 bun run dev
```

交互式与 RCS 模型消息默认使用 streaming。Headless 若需要逐事件输出：

```bash
ccb --print --verbose --output-format stream-json --include-partial-messages "你的任务"
```

RCS Web 会用完整已生成文本快照实时更新当前助手消息；这些 partial 快照只走 live 通道，不写入 SQLite。模型完成后，最终 `assistant` 消息才作为权威记录持久化，因此刷新或断线重连不会依赖中途快照，也不会重复正文。源码目录中可把上面的 `ccb` 换成 `bun run dev`。

各 Feature 的详细说明见 [`docs/features/`](docs/features/) 目录，欢迎投稿补充。

## VS Code 调试

TUI (REPL) 模式需要真实终端，无法直接通过 VS Code launch 启动调试。使用 **attach 模式**：

### 步骤

1. **终端启动 inspect 服务**：

   ```bash
   bun run dev:inspect
   ```

   会输出类似 `ws://localhost:8888/xxxxxxxx` 的地址。
2. **VS Code 附着调试器**：

   - 在 `src/` 文件中打断点
   - F5 → 选择 **"Attach to Bun (TUI debug)"**

## Teach Me 学习项目

我们新加了一个 teach-me skills, 通过问答式引导帮你理解这个项目的任何模块。(调整 [sigma skill 而来](https://github.com/sanyuan0704/sanyuan-skills))

```bash
# 在 REPL 中直接输入
/teach-me Claude Code 架构
/teach-me React Ink 终端渲染 --level beginner
/teach-me Tool 系统 --resume
```

### 它能做什么

- **诊断水平** — 自动评估你对相关概念的掌握程度，跳过已知的、聚焦薄弱的
- **构建学习路径** — 将主题拆解为 5-15 个原子概念，按依赖排序逐步推进
- **苏格拉底式提问** — 用选项引导思考，而非直接给答案
- **错误概念追踪** — 发现并纠正深层误解
- **断点续学** — `--resume` 从上次进度继续

### 学习记录

学习进度保存在 `.claude/skills/teach-me/` 目录下，支持跨主题学习者档案。

## 相关文档及网站

- **在线文档（Mintlify）**: [ccb.agent-aura.top](https://ccb.agent-aura.top/) — 文档源码位于 [`docs/`](docs/) 目录，欢迎投稿 PR
- **DeepWiki**: [https://deepwiki.com/claude-code-best/claude-code](https://deepwiki.com/claude-code-best/claude-code)

## Contributors

<a href="https://github.com/claude-code-best/claude-code/graphs/contributors">
  <img src="contributors.svg" alt="Contributors" />
</a>

## Star History

<a href="https://www.star-history.com/?repos=claude-code-best%2Fclaude-code&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=claude-code-best/claude-code&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=claude-code-best/claude-code&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=claude-code-best/claude-code&type=date&legend=top-left" />
 </picture>
</a>

## 致谢

- [doubaoime-asr](https://github.com/starccy/doubaoime-asr) — 豆包 ASR 语音识别 SDK，为 Voice Mode 提供无需 Anthropic OAuth 的语音输入方案

## 许可证

本项目仅供学习研究用途。Claude Code 的所有权利归 [Anthropic](https://www.anthropic.com/) 所有。

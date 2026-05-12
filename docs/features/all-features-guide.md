# Claude Code Best (CCB) — 全功能使用指南

本文档覆盖我们通过 13 个 PR 为 CCB 恢复/新增的**全部功能**，按类别组织，每个功能包含说明、使用方法和示例。

---

## 目录

1. [Buddy 伴侣系统](#1-buddy-伴侣系统)
2. [Remote Control 远程控制](#2-remote-control-远程控制)
3. [定时任务 /triggers](#3-定时任务-triggers)
4. [Voice Mode 语音模式](#4-voice-mode-语音模式)
5. [Chrome 浏览器控制](#5-chrome-浏览器控制)
6. [Computer Use 屏幕操控](#6-computer-use-屏幕操控)
7. [Feature Flags 与 GrowthBook](#7-feature-flags-与-growthbook)
8. [/ultraplan 高级规划](#8-ultraplan-高级规划)
9. [Daemon 后台守护](#9-daemon-后台守护)
10. [Pipe IPC 多实例协作](#10-pipe-ipc-多实例协作)
11. [LAN Pipes 局域网群控](#11-lan-pipes-局域网群控)
12. [Monitor 后台监控](#12-monitor-后台监控)
13. [Workflow 工作流脚本](#13-workflow-工作流脚本)
14. [Coordinator 多Worker协调](#14-coordinator-多worker协调)
15. [Proactive 自主模式](#15-proactive-自主模式)
16. [History / Snip 历史管理](#16-history--snip-历史管理)
17. [Fork 子Agent](#17-fork-子agent)
18. [其他恢复的工具](#18-其他恢复的工具)

---

## 1. Buddy 伴侣系统

**PR**: #82 `refactor(buddy): align companion system with official CLI`
**Feature Flag**: `BUDDY`

### 说明
Buddy 是一个后台运行的伴侣 AI，在你主对话进行的同时，异步观察会话内容并提供建议。

### 使用
```bash
# 启动时自动加载（feature 默认开启）
bun run dev

# 在对话中，Buddy 会在适当时机自动提供建议
# 例如当你在调试时，Buddy 可能提示你检查日志
```

---

## 2. Remote Control 远程控制

**PR**: #60 `feat: enable Remote Control (BRIDGE_MODE)` + #170 `feat: restore daemon supervisor`
**Feature Flag**: `BRIDGE_MODE`

### 说明
通过 WebSocket 远程控制 Claude Code 会话。支持自托管私有部署。

### 使用
```bash
# 启动远程控制模式
bun run dev -- remote-control

# 使用自托管服务器
CLAUDE_BRIDGE_BASE_URL=https://your-server.com CLAUDE_BRIDGE_OAUTH_TOKEN=your-token bun run dev --remote-control

# 或通过 /remote-control 命令在会话中启动
/remote-control
```

### 命令
- `claude remote-control` / `claude rc` — 启动远程控制客户端
- `claude bridge` — 同上（别名）

---

## 3. 定时任务 /triggers

**PR**: #88 `feat: enable /schedule by adding AGENT_TRIGGERS_REMOTE`
**Feature Flag**: `AGENT_TRIGGERS_REMOTE`

> 命令名已从 `/schedule` 改为 `/triggers`，避免与上游 bundled skill `schedule` 冲突。`/cron` 是别名。

### 说明
创建定时执行的远程 agent 任务，支持 cron 表达式。

### 使用
```
/triggers create "每天检查依赖更新" --cron "0 9 * * *" --prompt "检查 package.json 中的过期依赖并创建更新 PR"
/triggers list          — 列出所有定时任务
/triggers delete <id>   — 删除指定任务
```

---

## 4. Voice Mode 语音模式

**PR**: #92 `feat: enable /voice mode with native audio binaries`
**Feature Flag**: `VOICE_MODE`

### 说明
Push-to-Talk 语音输入，音频通过 WebSocket 流式传输到 Anthropic STT（Nova 3）。需要 Anthropic OAuth 认证（非 API key）。

### 使用
```bash
# 确保已通过 OAuth 登录
claude auth login

# 在会话中按住指定键说话
# 松开后自动转写为文字输入
```

### 前提条件
- Anthropic OAuth 认证（不支持 API key 模式）
- 系统麦克风权限

---

## 5. Chrome 浏览器控制

**PR**: #93 `feat: enable Claude in Chrome MCP with full browser control`
**Feature Flag**: `CHICAGO_MCP`

### 说明
通过 Chrome 扩展控制浏览器：导航、点击、填表、截图、执行 JS。

### 使用
```bash
# 启动带 Chrome 控制的模式
bun run dev -- --chrome

# 安装 Chrome 扩展后，AI 可以：
# - 打开网页、点击按钮
# - 填写表单
# - 截取页面内容
# - 执行 JavaScript
```

### AI 可用工具
- `navigate` — 导航到 URL
- `click` / `find` / `form_input` — 页面交互
- `get_page_text` / `read_page` — 读取内容
- `javascript_tool` — 执行 JS
- `gif_creator` — 录制操作 GIF

---

## 6. Computer Use 屏幕操控

**PR**: #98 + #137 `feat: Computer Use — 跨平台 Executor + Python Bridge + GUI 无障碍`
**Feature Flag**: `CHICAGO_MCP`

### 说明
跨平台屏幕操控：截图、键鼠模拟、应用管理。支持 macOS + Windows，Linux 后端待完成。

### 使用
```bash
# 启动后 AI 可自动调用屏幕操控工具
bun run dev

# AI 可以：
# - 截取屏幕/窗口截图
# - 模拟键盘输入和鼠标操作
# - 列出运行的应用
# - 使用剪贴板
```

### 平台支持
| 平台 | 截图 | 键鼠 | 应用管理 |
|------|------|------|----------|
| macOS | ✅ | ✅ | ✅ |
| Windows | ✅ | ✅ | ✅ |
| Linux | ⏳ | ⏳ | ⏳ |

---

## 7. Feature Flags 与 GrowthBook

**PR**: #140 + #153 `feat: enable GrowthBook local gate defaults`
**Feature Flags**: `SHOT_STATS`, `PROMPT_CACHE_BREAK_DETECTION`, `TOKEN_BUDGET`

### 说明
本地 GrowthBook gate defaults 机制，绕过远程 feature flag 服务，确保功能在无网络时也可使用。

### 使用
```bash
# 通过环境变量启用任意 feature
FEATURE_PROACTIVE=1 bun run dev

# dev/build 模式有各自的默认启用列表
# 查看 scripts/dev.ts 中的 DEFAULT_FEATURES
```

### 关键 feature flags
| Flag | 说明 |
|------|------|
| `SHOT_STATS` | API 调用统计 |
| `TOKEN_BUDGET` | Token 预算控制 |
| `PROMPT_CACHE_BREAK_DETECTION` | Prompt 缓存命中检测 |

---

## 8. /ultraplan 高级规划

**PR**: #156 `feat: enable /ultraplan and harden GrowthBook fallback chain`
**Feature Flag**: `ULTRAPLAN`

### 说明
高级多 agent 规划模式。将复杂任务分解为多个阶段，每阶段可分配给不同 agent 并行执行。

### 使用
```
/ultraplan 实现一个完整的用户认证系统，包括注册、登录、密码重置、OAuth 集成
```

AI 会生成：
1. 任务分解（多阶段）
2. 每阶段的 agent 分配
3. 依赖关系图
4. 并行执行计划

---

## 9. Daemon 后台守护

**PR**: #170 `feat: restore daemon supervisor and remoteControlServer command`
**Feature Flag**: `DAEMON`

### 说明
Daemon 模式允许 Claude Code 作为后台长驻进程运行，管理多个 worker。

### 使用
```bash
# 启动 daemon
claude daemon start

# 查看状态
claude daemon status

# 停止
claude daemon stop

# 启动远程控制服务器
bun run rcs
```

---

## 10. Pipe IPC 多实例协作

**PR**: #241 `feat: restore pipe IPC, LAN pipes, monitor tool`
**Feature Flag**: `UDS_INBOX`

### 说明
同一台机器上的多个 Claude Code 实例通过 UDS（Unix Domain Socket / Windows Named Pipe）自动发现并协作。首个启动的实例成为 main，后续自动注册为 sub。

### 使用

**启动多实例**：
```bash
# 终端 1
bun run dev
# → 自动成为 main

# 终端 2
bun run dev
# → 自动成为 sub-1，被 main attach
```

**管理实例**：
```
/pipes                — 显示所有实例，Shift+↓ 展开选择面板
/pipes select <name>  — 选中实例
/pipes all            — 全选
/pipes none           — 取消全选
/attach <name>        — 手动 attach 某实例
/detach <name>        — 断开连接
/send <name> <msg>    — 向指定实例发送消息
/claim-main           — 强制声明为 main
/pipe-status          — 显示详细状态
/peers                — 列出所有已发现的 peer
```

**选择面板操作**：
1. 按 `Shift+↓` 展开面板
2. `↑/↓` 移动光标
3. `Space` 选中/取消 pipe
4. `Enter` 确认关闭
5. `←/→` 切换路由模式（selected pipes ↔ local main）

**消息广播**：
选中 pipe 后，输入的消息自动路由到所有选中的 slave 执行，结果流式回传到 main。

**权限转发**：
slave 执行需要权限的工具时（如 BashTool），权限请求自动转发到 main 的确认队列。

---

## 11. LAN Pipes 局域网群控

**PR**: #241（同上）
**Feature Flag**: `LAN_PIPES`

### 说明
在 Pipe IPC 基础上增加 TCP 传输层和 UDP Multicast 发现，实现跨机器零配置协作。

### 使用

**局域网多机器**：
```bash
# 机器 A (192.168.50.22)
bun run dev

# 机器 B (192.168.50.27)
bun run dev

# 两边启动后 3-5 秒自动发现和 attach
# /pipes 显示 [LAN] 标记的远端实例
```

**防火墙配置**（每台机器都需要）：

Windows（管理员 PowerShell）：
```powershell
New-NetFirewallRule -DisplayName "CCB LAN Beacon (UDP)" -Direction Inbound -Protocol UDP -LocalPort 7101 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "CCB LAN Pipes (TCP)" -Direction Inbound -Protocol TCP -LocalPort 1024-65535 -Program (Get-Command bun).Source -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "CCB LAN Beacon Out (UDP)" -Direction Outbound -Protocol UDP -RemotePort 7101 -Action Allow -Profile Private
```

macOS：
```bash
# 首次运行时系统弹对话框，点"允许"即可
```

Linux：
```bash
sudo firewall-cmd --zone=trusted --add-port=7101/udp --permanent
sudo firewall-cmd --zone=trusted --add-port=1024-65535/tcp --permanent
sudo firewall-cmd --reload
```

**通知显示格式**：
```
# 本机 sub
Routed to [sub-1]; main can continue other tasks

# LAN peer
Routed to [main] vmwin11/192.168.50.27; main can continue other tasks
```

---

## 12. Monitor 后台监控

**PR**: #241（同上）
**Feature Flag**: `MONITOR_TOOL`

### 说明
在后台运行 shell 命令持续监控输出（类似 `watch` 命令）。AI 也可自主调用 MonitorTool。

### 使用

**用户命令**：
```
/monitor tail -f /var/log/syslog
/monitor watch -n 5 docker ps
/monitor "while true; do curl -s localhost:3000/health; sleep 10; done"
```

**查看监控**：
- 按 `Shift+Down` 展开后台任务面板
- 查看监控输出和状态

**Windows 兼容**：
`watch -n <sec> <cmd>` 自动转为 PowerShell 循环：
```powershell
while($true){ <cmd>; Start-Sleep -Seconds <sec> }
```

**AI 调用**：
AI 可在对话中自动调用 `MonitorTool` 监控日志、构建输出等。

---

## 13. Workflow 工作流脚本

**PR**: #241（同上）
**Feature Flag**: `WORKFLOW_SCRIPTS`

### 说明
执行 `.claude/workflows/` 目录下的用户定义工作流脚本。

### 使用

**创建工作流**：
```bash
mkdir -p .claude/workflows
cat > .claude/workflows/deploy.sh << 'EOF'
#!/bin/bash
echo "Running tests..."
bun test
echo "Building..."
bun run build
echo "Deploying..."
EOF
chmod +x .claude/workflows/deploy.sh
```

**列出可用工作流**：
```
/workflows
```

**AI 调用**：
AI 可通过 `WorkflowTool` 自动执行工作流：
```
请执行 deploy 工作流
```

---

## 14. Coordinator 多Worker协调

**PR**: #241（同上）
**Feature Flag**: `COORDINATOR_MODE`

### 说明
启用 coordinator 模式后，AI 可自动将任务分配给多个 worker 并行执行。

### 使用
```
/coordinator       — 切换 coordinator 模式开/关
```

启用后，AI 在处理复杂任务时会：
1. 分析任务可并行的部分
2. 自动创建 worker 分支
3. 分配子任务
4. 汇总结果

---

## 15. Proactive 自主模式

**PR**: #241（同上）
**Feature Flag**: `PROACTIVE` / `KAIROS`

### 说明
启用后 AI 会主动发起操作（而不仅回应用户输入），例如自动检测文件变更、主动提出优化建议。

### 使用
```
/proactive         — 切换 proactive 模式开/关
```

---

## 16. History / Snip 历史管理

**PR**: #241（同上）
**Feature Flag**: `HISTORY_SNIP`

### 说明
查看和管理对话历史，支持手动截断以释放上下文窗口空间。

### 使用
```
/history           — 显示对话历史摘要
/force-snip        — 强制在当前位置截断历史
```

AI 也可通过 `SnipTool` 自动截断过长的对话：
```
对话太长了，请帮我截断历史
```

---

## 17. Fork 子Agent

**PR**: #241（同上）
**Feature Flag**: `FORK_SUBAGENT`

### 说明
在当前对话上下文中 fork 一个独立的子 agent，继承完整会话状态独立执行。

### 使用
```
/fork              — 基于当前上下文 fork 子 agent
```

子 agent 会：
- 继承当前的全部对话历史
- 在独立的执行环境中运行
- 不影响主会话状态

---

## 18. 其他恢复的工具

以下工具从 stub 恢复为完整实现：

| 工具 | 说明 | 使用 |
|------|------|------|
| `SleepTool` | 暂停执行指定时间 | AI 在轮询场景自动调用 |
| `WebBrowserTool` | 终端内网页交互 | AI 需要查看网页时调用 |
| `SubscribePRTool` | 订阅 GitHub PR 变更 | `/subscribe-pr` 或 AI 调用 |
| `PushNotificationTool` | 推送桌面通知 | AI 在长任务完成时调用 |
| `CtxInspectTool` | 检查上下文窗口使用 | AI 判断上下文剩余空间 |
| `TerminalCaptureTool` | 截取终端屏幕 | AI 需要看终端输出时调用 |
| `SendUserFileTool` | 向用户发送文件 | AI 导出文件时调用 |
| `REPLTool` | 启动子 REPL 会话 | AI 需要独立交互环境时调用 |
| `VerifyPlanExecutionTool` | 验证执行计划完成度 | AI 完成计划后自动验证 |
| `SuggestBackgroundPRTool` | 建议创建后台 PR | AI 发现可独立的变更时提议 |
| `ListPeersTool` | 列出已发现的 peer | AI 查询多实例状态时调用 |

---

## 附录：全部 Feature Flags

| Flag | 默认 | 说明 |
|------|------|------|
| `BUDDY` | ✅ dev only | 伴侣系统 |
| `BRIDGE_MODE` | ✅ dev only | 远程控制 |
| `VOICE_MODE` | ✅ dev+build | 语音模式 |
| `CHICAGO_MCP` | ✅ dev+build | Computer Use + Chrome |
| `AGENT_TRIGGERS_REMOTE` | ✅ dev+build | 定时任务 |
| `SHOT_STATS` | ✅ dev+build | API 统计 |
| `TOKEN_BUDGET` | ✅ dev+build | Token 预算 |
| `PROMPT_CACHE_BREAK_DETECTION` | ✅ dev+build | 缓存检测 |
| `ULTRAPLAN` | ✅ dev+build | 高级规划 |
| `DAEMON` | ✅ dev+build | 后台守护 |
| `UDS_INBOX` | ✅ dev only | Pipe IPC |
| `LAN_PIPES` | ✅ dev only | LAN 群控 |
| `MONITOR_TOOL` | ✅ dev+build | 后台监控 |
| `WORKFLOW_SCRIPTS` | ✅ dev+build | 工作流脚本 |
| `FORK_SUBAGENT` | ✅ dev+build | 子 Agent |
| `KAIROS` | ✅ dev+build | Kairos 调度 |
| `COORDINATOR_MODE` | ✅ dev+build | 多 Worker |
| `HISTORY_SNIP` | ✅ dev+build | 历史管理 |
| `CONTEXT_COLLAPSE` | ✅ dev+build | 上下文折叠 |
| `ULTRATHINK` | ✅ dev+build | 扩展思考 |
| `EXTRACT_MEMORIES` | ✅ dev+build | 自动记忆提取 |
| `VERIFICATION_AGENT` | ✅ dev+build | 验证 Agent |
| `KAIROS_BRIEF` | ✅ dev+build | Brief 模式 |
| `AWAY_SUMMARY` | ✅ dev+build | 离开摘要 |
| `ACP` | ✅ dev+build | ACP 协议 |
| `LODESTONE` | ✅ dev+build | 深度链接 |
| `BUILTIN_EXPLORE_PLAN_AGENTS` | ✅ dev+build | 内置 Explore/Plan agent |
| `AGENT_TRIGGERS` | ✅ dev+build | 本地定时任务 |
| `BG_SESSIONS` | ✅ dev only | 后台会话 |
| `TEMPLATES` | ✅ dev only | 模板系统 |
| `TRANSCRIPT_CLASSIFIER` | ✅ dev only | 对话分类 |

手动启用任意 flag：
```bash
FEATURE_FLAG_NAME=1 bun run dev
```

---

## 附录：PR 列表

| PR | 日期 | 标题 |
|----|------|------|
| #60 | 2026-04-02 | feat: enable Remote Control (BRIDGE_MODE) |
| #82 | 2026-04-03 | refactor(buddy): align companion system |
| #88 | 2026-04-03 | feat: enable /schedule (AGENT_TRIGGERS_REMOTE) |
| #89 | 2026-04-03 | feat: built-in status line |
| #92 | 2026-04-03 | feat: enable /voice mode |
| #93 | 2026-04-03 | feat: enable Chrome MCP |
| #98 | 2026-04-03 | feat: enable Computer Use (macOS + Windows + Linux) |
| #137 | 2026-04-05 | feat: Computer Use v2 — 跨平台 Executor |
| #140 | 2026-04-05 | feat: enable SHOT_STATS, TOKEN_BUDGET |
| #153 | 2026-04-06 | feat: enable GrowthBook local gate defaults |
| #156 | 2026-04-06 | feat: enable /ultraplan |
| #170 | 2026-04-07 | feat: restore daemon supervisor |
| #241 | 2026-04-11 | feat: restore pipe IPC, LAN pipes, monitor tool |

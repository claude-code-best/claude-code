# DEV-LOG

## /poor 省流模式 (2026-04-11)

新增 `/poor` 命令，toggle 关闭 `extract_memories` 和 `prompt_suggestion`，省 token。

- 新增 `POOR` feature flag（build.ts + dev.ts）
- `src/commands/poor/` — 命令定义 + toggle 实现 + 状态管理
- `src/query/stopHooks.ts` — POOR 模式激活时跳过 extract_memories 和 prompt_suggestion

---

## Pipe IPC + LAN Pipes + Monitor Tool + 工具恢复 (2026-04-08 ~ 2026-04-11)

**分支**: `feat/pr-package-adapt`

### 背景

从 decompiled 代码恢复大量 stub 为完整实现，同时新增 LAN 跨机器通讯能力。本次 PR 覆盖：Pipe IPC 系统、LAN Pipes、Monitor Tool、20+ 工具/组件���复、REPL hook 架构重构。

### 实现

#### 1. PipeServer TCP 双模式（`src/utils/pipeTransport.ts`）

从原始的纯 UDS 服务器扩展为 UDS + TCP 双模式：

- 提取 `setupSocket()` 共享方法，UDS 和 TCP 的 socket 处理逻辑完全一致
- `start(options?: PipeServerOptions)` 新增可选参数 `{ enableTcp, tcpPort }`
- 内部维护两个 `net.Server`（UDS + TCP），共享同一组 `clients: Set<Socket>` 和 `handlers`
- TCP server 绑定 `0.0.0.0` + 动态端口（port=0 由 OS 分配）
- `tcpAddress` getter 暴露 TCP 端口信息
- `close()` 同时关闭两个 server
- 新增类型：`PipeTransportMode`、`TcpEndpoint`、`PipeServerOptions`

PipeClient 对应扩展：
- 构造函数新增可选 `TcpEndpoint` 参数
- `connect()` 根据是否有 TCP endpoint 分派到 `connectTcp()` 或 `connectUds()`
- TCP 连接不需要文件存在轮询，直接建立连接

#### 2. LAN Beacon — UDP Multicast 发现（`src/utils/lanBeacon.ts`，新文件）

零配置局域网 peer 发现：

- **协议**：UDP multicast 组 `224.0.71.67`（"CC" ASCII），端口 `7101`，TTL=1
- **Announce 包**：JSON `{ proto, pipeName, machineId, hostname, ip, tcpPort, role, ts }`
- **广播间隔**：3 秒，首次在 socket bind 完成后立即发送
- **Peer 超时**：15 秒无 announce 视为 lost
- **事件**：`peer-discovered`、`peer-lost`
- **存储**：module-level singleton `getLanBeacon()`/`setLanBeacon()`，不挂在 Zustand state 上

关键修复：
- `addMembership(group, localIp)` + `setMulticastInterface(localIp)` 指定 LAN 网卡，解决 Windows 上 WSL/Docker 虚拟网卡劫持 multicast 的问题
- announce/cleanup 定时器移入 `bind()` 回调内，修复 socket 未就绪时发送的竞态

#### 3. Registry 扩展（`src/utils/pipeRegistry.ts`）

- `PipeRegistryEntry` 新增 `tcpPort?` 和 `lanVisible?` 字段
- `mergeWithLanPeers(registry, lanPeers)` 合并本地 registry 和 LAN beacon peers，本地优先

#### 4. Peer Address 扩展（`src/utils/peerAddress.ts`）

- `parseAddress()` 新增 `tcp` scheme：`tcp:192.168.1.20:7100`
- 新增 `parseTcpTarget()` 解析 `host:port` 字符串

#### 5. REPL 集成（`src/screens/REPL.tsx`）

三个阶段的改动：

**Bootstrap**：`createPipeServer()` 时根据 `feature('LAN_PIPES')` 传入 TCP 选项 → 启动 `LanBeacon` → 注册 entry 携带 tcpPort

**Heartbeat**（每 5 秒）：
- `refreshDiscoveredPipes()` 同时包含本地 subs 和 LAN beacon peers，防止 LAN peer 状态被覆盖
- auto-attach 循环统一遍历本地 subs + LAN peers，LAN peers 通过 TCP endpoint 连接
- cleanup 检查 LAN beacon peers 列表，避免误删存活的 LAN 连接
- attach 请求携带 `machineId`，接收方区分 LAN peer（不要求 sub 角色）

**Cleanup**：通过 `getLanBeacon()` 获取并 `stop()`，`setLanBeacon(null)` 清除

#### 6. 命令更新

- `/pipes`（`src/commands/pipes/pipes.ts`）：显示 `[LAN]` 标记的远端实例
- `/attach`（`src/commands/attach/attach.ts`）：自动查找 LAN beacon 获取 TCP endpoint
- `SendMessageTool`（`src/tools/SendMessageTool/SendMessageTool.ts`）：支持 `tcp:` scheme，权限检查要求用户确认

#### 7. Feature Flag

`LAN_PIPES` — 在 `scripts/dev.ts` 和 `build.ts` 的默认 features 列表中启用。所有 LAN 代码路径均通过 `feature('LAN_PIPES')` 门控。

#### 8. Pipe IPC 基础系统（`UDS_INBOX` feature）

- `PipeServer`/`PipeClient`：UDS 传输，NDJSON 协议（共享 `ndjsonFramer.ts`）
- `PipeRegistry`：machineId 绑定的角色分配（main/sub），文件锁，并行探测
- Master/slave attach 流程、prompt 转发、permission 转发
- Heartbeat 生命周期（5s 间隔，stale entry 清理，busy flag 防重叠）
- 命令：`/pipes`、`/attach`、`/detach`、`/send`、`/claim-main`、`/pipe-status`

#### 9. Monitor Tool（`MONITOR_TOOL` feature）

- `MonitorTool`：AI 可调用的后台 shell 监控工具
- `/monitor` 命令：用户快捷入口，Windows 兼容（watch → PowerShell 循环）
- `MonitorMcpTask`：从 stub 恢复完整生命周期（register/complete/fail/kill）
- `MonitorPermissionRequest`：React 权限确认 UI
- `MonitorMcpDetailDialog`：Shift+Down 详情面板

#### 10. 工具恢复（stub → 实现）

- SnipTool、SleepTool、ListPeersTool、SendUserFileTool
- WebBrowserTool、SubscribePRTool、PushNotificationTool
- CtxInspectTool、TerminalCaptureTool、WorkflowTool
- REPLTool (.js → .ts)、VerifyPlanExecutionTool (.js → .ts)、SuggestBackgroundPRTool (.js → .ts)
- 组件 .ts → .tsx 重写：MonitorPermissionRequest、ReviewArtifactPermissionRequest、MonitorMcpDetailDialog、WorkflowDetailDialog、WorkflowPermissionRequest

#### 11. REPL Hook 架构重构

从 REPL.tsx 提取 ~830 行 Pipe IPC 内联代码为 4 个独立 hook：

| Hook | 行数 | 职责 |
|------|------|------|
| `usePipeIpc` | 623 | 生命周期：bootstrap、handlers、heartbeat、cleanup |
| `usePipeRelay` | 38 | slave→master 消息回传（通过 `setPipeRelay` singleton） |
| `usePipePermissionForward` | 159 | 权限请求转发 + 流式通知显示 |
| `usePipeRouter` | 130 | selected pipe 输入路由 + role/IP 标签显示 |

共享工具：`ndjsonFramer.ts` 替换 3 份重复的 NDJSON 解析。

#### 12. Feature Flags 新增启用

UDS_INBOX、LAN_PIPES、MONITOR_TOOL、FORK_SUBAGENT、KAIROS、COORDINATOR_MODE、WORKFLOW_SCRIPTS、HISTORY_SNIP、CONTEXT_COLLAPSE

### 踩坑记录

1. **Multicast 绑错网卡**：Windows 上 `addMembership(group)` 不指定本地接口时，默认绑到 WSL/Docker 虚拟网卡（`172.19.112.1`），LAN 上的真实机器收不到。必须 `addMembership(group, localIp)` + `setMulticastInterface(localIp)`。

2. **Beacon ref 丢失**：最初用 `(store.getState() as any)._lanBeacon` 挂载 beacon 引用，但 Zustand `setState` 展开 `prev` 时不包含 `_lanBeacon` 属性，下次读取就是 `undefined`。改为 module-level singleton 解决。

3. **Heartbeat 清洗 LAN 连接**：`refreshDiscoveredPipes()` 每 5 秒用仅含本地 registry subs 的列表完全覆盖 `discoveredPipes` + `selectedPipes`，LAN peer 的发现和选择状态被持续清空。必须在 refresh 中同时包含 beacon peers。

4. **Heartbeat cleanup 误删**：`!aliveSubNames.has(slaveName)` 导致 LAN peer（不在本地 registry）被判定为死连接每 5 秒清除一次。需要同时检查 beacon peers 列表。

5. **跨机器 attach 被拒**：两台机器各自为 `main`，attach handler 硬编码 `role !== 'sub'` 拒绝。通过 attach_request 携带 `machineId`，接收方对不同 machineId 的请求放行。

6. **`feature()` 使用约束**：Bun 的 `feature()` 是编译时常量，只能在 `if` 语句或三元条件中直接使用，不能赋值给变量（如 `const x = feature('...')`），否则构建报错。

### 已知限制

- TCP 无认证：同 LAN 内任何设备知道端口号即可连接
- JSON.parse 无 schema 验证：code review 建议增加 Zod 校验
- Beacon 明文广播 IP/hostname/machineId：建议后续 hash 处理
- `getLocalIp()` 可能返回 VPN 地址：多网卡环境需更精确的接口选择

### 测试

- `src/utils/__tests__/lanBeacon.test.ts`：7 个测试（mock dgram）
- `src/utils/__tests__/peerAddress.test.ts`：8 个测试（纯函数）
- 全量：2190 pass / 0 fail

### 防火墙配置

**Windows**（管理员 PowerShell）：
```powershell
New-NetFirewallRule -DisplayName "Claude Code LAN Beacon (UDP)" -Direction Inbound -Protocol UDP -LocalPort 7101 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Claude Code LAN Pipes (TCP)" -Direction Inbound -Protocol TCP -LocalPort 1024-65535 -Program (Get-Command bun).Source -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Claude Code LAN Beacon Out (UDP)" -Direction Outbound -Protocol UDP -RemotePort 7101 -Action Allow -Profile Private
```

**macOS**（首次运行时系统会弹出"允许接受传入连接"对话框，点击允许即可。手动放行）：
```bash
# 如果使用 pf ���火墙，添加规则：
echo "pass in proto udp from any to any port 7101" | sudo pfctl -ef -
# 或��接在 System Settings → Network → Firewall 中允许 bun 进程
```

**Linux**（firewalld）：
```bash
sudo firewall-cmd --zone=trusted --add-port=7101/udp --permanent
sudo firewall-cmd --zone=trusted --add-port=1024-65535/tcp --permanent
sudo firewall-cmd --reload
```

**Linux**（iptables）：
```bash
sudo iptables -A INPUT -p udp --dport 7101 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 1024:65535 -m owner --uid-owner $(id -u) -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

**通用验证**：确认网络为局域网（非公共 WiFi），路���器未开启 AP 隔离。

---


## Daemon + Remote Control Server 还原 (2026-04-07)

**分支**: `feat/daemon-remote-control-server`

### 背景

`src/commands.ts` 注册了 `remoteControlServer` 命令（双重门控 `feature('DAEMON') && feature('BRIDGE_MODE')`），但 `src/commands/remoteControlServer/` 目录缺失，`src/daemon/main.ts` 和 `src/daemon/workerRegistry.ts` 均为 stub。官方 CLI 2.1.92 中情况一致——Anthropic 已预留注册点和底层 `runBridgeHeadless()` 实现，但中间层（daemon supervisor + command 入口）未发布。

通过逐级反向追踪调用链还原完整实现：
```
/remote-control-server (slash command)
  → spawn: claude daemon start
    → daemonMain() (supervisor，管理 worker 生命周期)
      → spawn: claude --daemon-worker=remoteControl
        → runDaemonWorker('remoteControl')
          → runBridgeHeadless(opts, signal)  ← 已有完整实现
            → runBridgeLoop() → 接受远程会话
```

### 实现

#### 1. Worker Registry（`src/daemon/workerRegistry.ts`）

从 stub 还原为 worker 分发器：
- `runDaemonWorker(kind)` 按 `kind` 分发到不同 worker 实现
- `runRemoteControlWorker()` 从环境变量（`DAEMON_WORKER_*`）读取配置，构造 `HeadlessBridgeOpts`，调用 `runBridgeHeadless()`
- 区分 permanent（`EXIT_CODE_PERMANENT = 78`）和 transient 错误，supervisor 据此决定重试或 park
- SIGTERM/SIGINT 信号处理，通过 `AbortController` 传递给 bridge loop

#### 2. Daemon Supervisor（`src/daemon/main.ts`）

从 stub 还原为完整 supervisor 进程：
- `daemonMain(args)` 支持子命令：`start`（启动）、`status`、`stop`、`--help`
- `runSupervisor()` spawn `remoteControl` worker 子进程，通过环境变量传递配置
- 指数退避重启（2s → 120s），10s 内连续崩溃 5 次则 park worker
- permanent exit code（78）直接 park，不重试
- graceful shutdown：SIGTERM → 转发给 worker → 30s grace → SIGKILL
- CLI 参数支持：`--dir`、`--spawn-mode`、`--capacity`、`--permission-mode`、`--sandbox`、`--name`

#### 3. Remote Control Server 命令（`src/commands/remoteControlServer/`）

**`index.ts`** — Command 注册：
- 类型 `local-jsx`，名称 `/remote-control-server`，别名 `/rcs`
- 双 feature 门控：`feature('DAEMON') && feature('BRIDGE_MODE')` + `isBridgeEnabled()`
- lazy load `remoteControlServer.tsx`

**`remoteControlServer.tsx`** — REPL 内 UI：
- 首次调用：前置检查（bridge 可用性 + OAuth token）→ spawn daemon 子进程
- 再次调用：弹出管理对话框（停止/重启/继续），显示 PID 和最近 5 行日志
- 模块级 state 跨调用保持 daemon 进程引用
- graceful stop：SIGTERM → 10s grace → SIGKILL

#### 4. Feature Flag 启用

`build.ts` / `scripts/dev.ts`：`DEFAULT_BUILD_FEATURES` / `DEFAULT_FEATURES` 新增 `DAEMON`

DAEMON 仅有编译时 feature flag 门控，无 GrowthBook gate。

### 与 `/remote-control` 的区别

| | `/remote-control` | `/remote-control-server` (daemon) |
|---|---|---|
| 模式 | 单会话，REPL 内交互式 bridge | 多会话，daemon 持久化服务器 |
| 生命周期 | 跟 REPL 会话绑定 | 独立后台进程，崩溃自动重启 |
| 并发 | 1 个远程连接 | 默认 4 个，可配置 `--capacity` |
| 隔离 | 共享当前目录 | 支持 `worktree` 模式隔离 |
| 底层 | `initReplBridge()` | `runBridgeHeadless()` → `runBridgeLoop()` |

### 修改文件

| 文件 | 变更 |
|------|------|
| `build.ts` | `DEFAULT_BUILD_FEATURES` 新增 `DAEMON` |
| `scripts/dev.ts` | `DEFAULT_FEATURES` 新增 `DAEMON` |
| `src/daemon/main.ts` | 从 stub 还原为 supervisor 实现 |
| `src/daemon/workerRegistry.ts` | 从 stub 还原为 worker 分发器 |
| `src/commands/remoteControlServer/index.ts` | **新增** command 注册 |
| `src/commands/remoteControlServer/remoteControlServer.tsx` | **新增** REPL UI |

### 验证

| 项目 | 结果 |
|------|------|
| `bun run build` | ✅ 成功 (490 files) |
| tsc 新文件检查 | ✅ 无新增类型错误 |

### 使用方式

```bash
# CLI 直接启动 daemon
bun run dev daemon start
bun run dev daemon start --spawn-mode=worktree --capacity=8

# REPL 内
/remote-control-server   # 或 /rcs
```

前提：需要 Anthropic OAuth 登录（`claude login`）。

---

## /ultraplan 启用 + GrowthBook Fallback 加固 + Away Summary 改进 (2026-04-06)

**分支**: `feat/ultraplan-enablement`
**Commit**: `feat: enable /ultraplan and harden GrowthBook fallback chain`

### 背景

`/ultraplan` 是 Claude Code 的高级多代理规划功能：将任务发送到 Claude Code on the web（CCR），由 Opus 进行深度规划，计划完成后返回终端供用户审批和执行。此功能被 3 层门控锁定：`feature('ULTRAPLAN')` 编译 flag + `isEnabled: () => USER_TYPE === 'ant'` + `INTERNAL_ONLY_COMMANDS` 列表。

另外发现 GrowthBook fallback 链在 config 未初始化时会抛异常跳过 `LOCAL_GATE_DEFAULTS`，以及 Away Summary 在不支持 DECSET 1004 focus 事件的终端（CMD/PowerShell）上不工作。

### 实现

#### 1. Ultraplan 启用

- `build.ts` / `scripts/dev.ts`: 添加 `ULTRAPLAN` 到默认编译 flag
- `src/commands.ts`: 将 ultraplan 从 `INTERNAL_ONLY_COMMANDS` 移入公开 `COMMANDS` 列表
- `src/commands/ultraplan.tsx`: `isEnabled` 改为 `() => true`
- `src/screens/REPL.tsx`: 添加 `UltraplanChoiceDialog`、`UltraplanLaunchDialog`、`launchUltraplan` 的 import（HEAD 版使用但未 import，构建报 `not defined`）

#### 2. 反编译 UltraplanChoiceDialog / UltraplanLaunchDialog

REPL.tsx 引用这两个组件但代码库中不存在。从官方 CLI 2.1.92 的 `cli.js` 中定位 minified 函数 `M15`（UltraplanChoiceDialog）和 `P15`（UltraplanLaunchDialog），通过符号映射表反编译为可读 TSX。

**`src/components/ultraplan/UltraplanChoiceDialog.tsx`** — 远程计划批准后的选择对话框：
- 3 个选项：Implement here（注入当前会话）/ Start new session（清空会话重开）/ Cancel（保存到 .md 文件）
- 可滚动计划预览（ctrl+u/d 翻页，鼠标滚轮），自适应终端高度
- 选择后标记远程 task 完成、清除 `ultraplanPendingChoice` 状态、归档远程 CCR session

**`src/components/ultraplan/UltraplanLaunchDialog.tsx`** — 启动确认对话框：
- 显示功能说明、时间估计（~10–30 min）、服务条款链接
- 处理 Remote Control bridge 冲突（选择 run 时自动断开 bridge）
- 首次使用时持久化 `hasSeenUltraplanTerms` 到全局配置

反编译要点：剥离 React Compiler `_c(N)` 缓存数组，还原为标准 `useMemo`/`useCallback`；`useFocusedInputDialog()` 注册 hook 省略（REPL 内部计算 `focusedInputDialog`）；GrowthBook 配置查询替换为本地默认值。

#### 3. GrowthBook Fallback 加固

`src/services/analytics/growthbook.ts`:
- `getFeatureValue_CACHED_MAY_BE_STALE`: 将 `getLocalGateDefault()` 查找移到 try/catch 外层
- `checkStatsigFeatureGate_CACHED_MAY_BE_STALE`: 同上，config 读取包裹在 try/catch 中

修复前：config 未初始化 → `getGlobalConfig()` 抛异常 → catch 直接返回 `defaultValue` → 跳过 `LOCAL_GATE_DEFAULTS`
修复后：config 未初始化 → catch 静默 → 继续查 `LOCAL_GATE_DEFAULTS` → 有默认值就用，没有才 fallback

#### 4. Away Summary 改进（Windows 终端兼容）

**问题**：Away Summary（`feature('AWAY_SUMMARY')` + `tengu_sedge_lantern` gate，上一轮已启用）依赖 DECSET 1004 终端 focus 事件检测用户是否离开。但 Windows 的 CMD 和 PowerShell 不支持此协议，`getTerminalFocusState()` 始终返回 `'unknown'`，原逻辑对 `'unknown'` 状态执行 no-op，导致 Windows 用户永远无法触发离开摘要。

**修改**：`src/hooks/useAwaySummary.ts`

1. **focus 状态处理**：`'unknown'` 现在视同 `'blurred'`（可能已离开），订阅时即启动 idle timer（5 分钟）
2. **idle-based 在场检测**：新增 `isLoading` 转换监听作为用户活跃信号替代 focus 事件：
   - 用户发起新 turn（`isLoading` → `true`）→ 说明在场，取消 idle timer + abort 进行中的生成
   - turn 结束（`isLoading` → `false`）→ 重启 idle timer
   - timer 到期且无进行中 turn → 触发 away summary 生成
3. **兼容性**：仅在 `getTerminalFocusState() === 'unknown'` 时激活 idle 逻辑，支持 DECSET 1004 的终端（iTerm2、Windows Terminal、kitty 等）仍走原有 blur/focus 路径

**效果**：Windows CMD/PowerShell 用户离开终端 5 分钟后，系统自动调用 API 生成摘要并作为 `away_summary` 类型的系统消息追加到对话流中，用户回来时直接在 UI 中看到，无需执行任何命令

#### 5. Cron 定时任务管理技能

`src/skills/bundled/cronManage.ts`（**新增**）+ `src/skills/bundled/index.ts`：

KAIROS 定时任务系统（`tengu_kairos_cron` gate，已在上一轮 GrowthBook 启用中开启）提供了 `ScheduleCronTool` 来创建定时任务，但缺少用户可调用的 list/delete 技能。新增两个 bundled skill 补全管理闭环：

| 技能 | 用法 | 功能 |
|------|------|------|
| `/cron-list` | `/cron-list` | 调用 `CronListTool` 列出所有定时任务，表格显示 ID、Schedule、Prompt、Recurring、Durable |
| `/cron-delete` | `/cron-delete <job-id>` | 调用 `CronDeleteTool` 按 ID 取消指定定时任务 |

两个技能均受 `isKairosCronEnabled()` 门控（`feature('AGENT_TRIGGERS') && tengu_kairos_cron` gate），与 `ScheduleCronTool` 保持一致。

#### 6. Fullscreen 门控修复

- `src/utils/fullscreen.ts`: `isFullscreenEnvEnabled()` 从无条件返回 `true` 改为 `process.env.USER_TYPE === 'ant'`，避免非 ant 用户意外触发全屏模式

### 修改文件

| 文件 | 变更 |
|------|------|
| `build.ts` | `DEFAULT_BUILD_FEATURES` 新增 `ULTRAPLAN` |
| `scripts/dev.ts` | `DEFAULT_FEATURES` 新增 `ULTRAPLAN` |
| `src/commands.ts` | ultraplan 移入公开命令列表 |
| `src/commands/ultraplan.tsx` | `isEnabled` 移除 ant-only 限制 |
| `src/components/ultraplan/UltraplanChoiceDialog.tsx` | **新增** 从 2.1.92 反编译 |
| `src/components/ultraplan/UltraplanLaunchDialog.tsx` | **新增** 从 2.1.92 反编译 |
| `src/screens/REPL.tsx` | 添加 3 个 import |
| `src/services/analytics/growthbook.ts` | fallback 链加固 |
| `src/hooks/useAwaySummary.ts` | idle-based 离开检测 |
| `src/skills/bundled/index.ts` | 注册 cron 技能 |
| `src/skills/bundled/cronManage.ts` | **新增** cron list/delete 技能 |
| `src/utils/fullscreen.ts` | fullscreen 门控修复 |

### 验证

| 项目 | 结果 |
|------|------|
| `bun run build` | ✅ 成功 (480 files) |
| `bun run lint` | ✅ 仅已有 biome-ignore 警告 |
| `/ultraplan` 手动测试 | ✅ 命令注册可见、能启动远程会话、能接收回传计划并显示 ChoiceDialog |

### Ultraplan 工作流

```
/ultraplan <prompt>
  → UltraplanLaunchDialog 确认
  → teleportToRemote 创建 CCR 远程会话
  → pollForApprovedExitPlanMode 轮询（3s 间隔，30min 超时）
  → ExitPlanModeScanner 解析事件流
  → 计划 approved → UltraplanChoiceDialog 显示选择
  → Implement here / Start new session / Cancel
```

需要 Anthropic OAuth（`/login`）。远程会话在 claude.ai/code 上运行。

---

## GrowthBook Local Gate Defaults + P0/P1 Feature Enablement (2026-04-06)

**分支**: `feat/growthbook-enablement`

### 背景

Claude Code 使用 GrowthBook（Anthropic 自建 proxy at api.anthropic.com）进行远程功能开关控制，代码中使用 `tengu_*` 前缀命名。在反编译版本中 GrowthBook 不启动（analytics 空实现），导致 70+ 个功能被 gate 拦截。

经 4 个并行研究代理深度分析，确认**所有被 gate 控制的功能代码都是真实现**（非 stub）。

### 实现方案

**Commit 1** (`feat`): 在 `growthbook.ts` 中添加 `LOCAL_GATE_DEFAULTS` 映射表（25+ boolean gates + 2 object config gates），修改 4 个 getter 函数在 `isGrowthBookEnabled() === false` 时查找本地默认值。

**Commit 2** (`fix`): 发现 `LOCAL_GATE_DEFAULTS` 在有 API key 的用户环境下无效——因为 `isGrowthBookEnabled()` 返回 `true`（analytics 未禁用），代码走 GrowthBook 路径但缓存为空，直接返回 `defaultValue` 跳过了本地默认值。修复：在 3 个 getter 函数的缓存 miss 路径中插入 `LOCAL_GATE_DEFAULTS` 查找。同时修复 `tengu_onyx_plover` 值类型（`JSON.stringify` → 直接对象）和新增 `tengu_kairos_brief_config` 对象型 gate。

修复后的 fallback 链：
```
env overrides → config overrides → [GrowthBook 启用?]
  → 内存缓存 → 磁盘缓存 → LOCAL_GATE_DEFAULTS → defaultValue
```

可通过 `CLAUDE_CODE_DISABLE_LOCAL_GATES=1` 环境变量一键禁用。

### 启用的功能

**P0 — 纯本地功能（7 个 gate）：**

| Gate | 功能 |
|------|------|
| `tengu_keybinding_customization_release` | 自定义快捷键（~/.claude/keybindings.json） |
| `tengu_streaming_tool_execution2` | 流式工具执行（边收边执行） |
| `tengu_kairos_cron` | 定时任务系统 |
| `tengu_amber_json_tools` | Token 高效 JSON 工具格式（省 ~4.5%） |
| `tengu_immediate_model_command` | 运行中即时切换模型 |
| `tengu_basalt_3kr` | MCP 指令增量传输 |
| `tengu_pebble_leaf_prune` | 会话存储叶剪枝优化 |

**P1 — API 依赖功能（8 个 gate）：**

| Gate | 功能 |
|------|------|
| `tengu_session_memory` | 会话记忆（跨会话上下文持久化） |
| `tengu_passport_quail` | 自动记忆提取 |
| `tengu_chomp_inflection` | 提示建议 |
| `tengu_hive_evidence` | 验证代理（对抗性验证） |
| `tengu_kairos_brief` | Brief 精简输出模式 |
| `tengu_sedge_lantern` | 离开摘要 |
| `tengu_onyx_plover` | 自动梦境（记忆巩固） |
| `tengu_willow_mode` | 空闲返回提示 |

**Kill Switch（10 个 gate 保持 true）：**

`tengu_turtle_carbon`、`tengu_amber_stoat`、`tengu_amber_flint`、`tengu_slim_subagent_claudemd`、`tengu_birch_trellis`、`tengu_collage_kaleidoscope`、`tengu_compact_cache_prefix`、`tengu_kairos_cron_durable`、`tengu_attribution_header`、`tengu_slate_prism`

**新增编译 flag：**

| Flag | build.ts | dev.ts | 用途 |
|------|:--------:|:------:|------|
| `AGENT_TRIGGERS` | ON | ON | 定时任务系统 |
| `EXTRACT_MEMORIES` | ON | ON | 自动记忆提取 |
| `VERIFICATION_AGENT` | ON | ON | 对抗性验证代理 |
| `KAIROS_BRIEF` | ON | ON | Brief 精简模式 |
| `AWAY_SUMMARY` | ON | ON | 离开摘要 |
| `ULTRATHINK` | ON | ON | Ultrathink 扩展思考（双重门控修复） |
| `BUILTIN_EXPLORE_PLAN_AGENTS` | ON | ON | 内置 Explore/Plan agents（双重门控修复） |
| `LODESTONE` | ON | ON | Deep link 协议注册（双重门控修复） |

**排除的编译 flag：**
- `KAIROS` — 拉入 `useProactive.js`（缺失文件），`KAIROS_BRIEF` 足够
- `TERMINAL_PANEL` — 拉入 `TerminalCaptureTool`（缺失文件）

**双重门控修复说明：**
部分功能同时被编译 flag 和 GrowthBook gate 控制（双重门控），仅开 GrowthBook gate 不够。
审计发现 3 个被卡住的：`ULTRATHINK`、`BUILTIN_EXPLORE_PLAN_AGENTS`、`LODESTONE`。

### 修改文件

| 文件 | 变更 |
|------|------|
| `build.ts` | `DEFAULT_BUILD_FEATURES` 新增 8 个编译 flag |
| `scripts/dev.ts` | `DEFAULT_FEATURES` 新增 8 个编译 flag |
| `src/services/analytics/growthbook.ts` | 新增 `LOCAL_GATE_DEFAULTS` 映射（27 gates）+ `getLocalGateDefault()` + 修改 4 个 getter 的 fallback 链 |
| `scripts/verify-gates.ts` | 新增 gate 验证脚本（30 gates） |
| `docs/features/growthbook-enablement-plan.md` | 完整研究报告和启用计划 |
| `docs/features/feature-flags-audit-complete.md` | 更新启用状态表 |

### 验证

| 项目 | 结果 |
|------|------|
| `bun run build` | ✅ 成功 (481 files) |
| `bun test` | ✅ 2106 pass / 23 fail（均为已有问题）/ 0 新增失败 |
| `verify-gates.ts` | ✅ 30/30 PASS |
| `/brief` 手动测试 | ✅ 可用（fallback 修复后） |

---

## Enable SHOT_STATS, TOKEN_BUDGET, PROMPT_CACHE_BREAK_DETECTION (2026-04-05)

**PR**: [claude-code-best/claude-code#140](https://github.com/claude-code-best/claude-code/pull/140)
**分支**: `feat/enable-safe-feature-flags`

对 22 个被标记为 "COMPLETE" 的编译时 feature flag 进行实际源码验证（6 个并行子代理 + Codex CLI 独立复核），发现审计报告存在大量误判。最终确认仅 3 个 flag 为真正 compile-only，安全启用。

**验证流程：**

1. 6 个并行子代理分别检查每个 flag 的 `feature('FLAG_NAME')` 引用点、依赖模块完整性、外部服务依赖
2. Codex CLI (v0.118.0, 240K tokens) 独立复核，将原 7 个 "compile-only" 进一步缩减为 3 个
3. 3 个专项代理逐一验证代码路径完整性和运行时安全性

**新启用的 3 个 flag：**

| Flag | 功能 | 用户可感知效果 |
|------|------|---------------|
| `SHOT_STATS` | shot 分布统计 | `/stats` 面板显示 shot 分布和 one-shot rate |
| `TOKEN_BUDGET` | token 预算目标 | 支持 `+500k` / `spend 2M tokens` 语法，自动续写直到达标，带进度条 |
| `PROMPT_CACHE_BREAK_DETECTION` | cache key 变化检测 | 内部诊断，`--debug` 模式可见，写 diff 到临时目录 |

**修改文件：**

| 文件 | 变更 |
|------|------|
| `build.ts` | `DEFAULT_BUILD_FEATURES` 新增 3 个 flag |
| `scripts/dev.ts` | `DEFAULT_FEATURES` 新增 3 个 flag |
| `package.json` / `bun.lock` | 新增 `openai` 依赖（OpenAI 兼容层需要） |

**新增文档：**

| 文件 | 说明 |
|------|------|
| `docs/features/feature-flags-codex-review.md` | Codex 独立复核报告：修正后的 5 类分类、恢复优先级、三轴分类标准建议 |
| `docs/features/feature-flags-audit-complete.md` | 标记所有已启用 flag 的状态（`[build: ON]` / `[dev: ON]`） |

**Codex 复核关键发现：**

- 原 22 个 "COMPLETE" flag 中，8 个核心模块是 stub，3 个依赖远程服务
- `TEAMMEM`、`AGENT_TRIGGERS`、`EXTRACT_MEMORIES`、`KAIROS_BRIEF` 被降级为"有条件可用"（受 GrowthBook 门控）
- 建议审计分类标准改为三轴：实现完整度 × 激活条件 × 运行风险
- 恢复优先级：REACTIVE_COMPACT > BG_SESSIONS > PROACTIVE > CONTEXT_COLLAPSE

**验证结果：**

- `bun run build` → 475 files ✅
- `bun test` → 零新增失败 ✅
- 3 个 flag 代码路径全部完整，无缺失依赖，无 crash 风险 ✅

---

## /dream 手动触发 + DreamTask 类型补全 (2026-04-04)

将 `/dream` 命令从 KAIROS feature gate 中解耦，作为 bundled skill 无条件注册；补全 DreamTask 类型存根。

**新增文件：**

| 文件 | 说明 |
|------|------|
| `src/skills/bundled/dream.ts` | `/dream` skill 注册，调用 `buildConsolidationPrompt()` 生成整理提示词 |

**修改文件：**

| 文件 | 变更 |
|------|------|
| `src/skills/bundled/index.ts` | 导入并注册 `registerDreamSkill()` |
| `src/components/tasks/src/tasks/DreamTask/DreamTask.ts` | `any` 存根 → 从 `src/tasks/DreamTask/DreamTask.js` 重新导出完整类型 |

**新增文档：**

| 文件 | 说明 |
|------|------|
| `docs/features/auto-dream.md` | Auto Dream 原理、触发机制、使用场景完整说明 |

---

## Computer Use macOS 适配修复 (2026-04-04)

**分支**: `feature/computer-use/mac-support`

- **darwin.ts** — 应用枚举改用 Spotlight `mdfind` + `mdls`，获取真实 bundleId（旧方案合成 `com.app.xxx`），覆盖 `/Applications` + `/System/Applications` + CoreServices
- **index.ts** — 新增 `hotkey` backend fallback，非原生模块不崩溃
- **toolCalls.ts** — `resolveRequestedApps()` 新增子串模糊匹配（`"Chrome"` → `"Google Chrome"`）
- **hostAdapter.ts** — `ensureOsPermissions()` 检查 `cu.tcc` 存在性，跨平台 JS backend 安全降级
- **测试**: 17 个 MCP 工具中 10 个完全通过，6 个在 full tier 应用上通过（IDE click tier 受限为预期行为），`screenshot` 未返回图片（疑似屏幕录制权限问题）

---

## Computer Use Windows 增强：窗口绑定截图 + UI Automation + OCR (2026-04-03)


在三平台基础实现之上，利用 Windows 原生 API 增强 Computer Use 的 Windows 专属能力。

**新增文件：**

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/utils/computerUse/win32/windowCapture.ts` | — | `PrintWindow` 窗口绑定截图，支持被遮挡/后台窗口 |
| `src/utils/computerUse/win32/windowEnum.ts` | — | `EnumWindows` 精确窗口枚举（HWND + PID + 标题） |
| `src/utils/computerUse/win32/uiAutomation.ts` | — | `IUIAutomation` UI 元素树读取、按钮点击、文本写入、坐标识别 |
| `src/utils/computerUse/win32/ocr.ts` | — | `Windows.Media.Ocr` 截图+文字识别（英语+中文） |

**修改文件：**

| 文件 | 变更 |
|------|------|
| `packages/@ant/computer-use-swift/src/backends/win32.ts` | `listRunning` 改用 EnumWindows；新增 `captureWindowTarget` 窗口级截图 |

**验证结果（Windows x64）：**
- 窗口枚举：38 个可见窗口 ✅
- 窗口截图：VS Code 2575x1415, 444KB ✅（PrintWindow, 即使被遮挡）
- UI Automation：坐标元素识别 ✅
- OCR：识别 VS Code 界面文字，34 行 ✅

---

## Enable Computer Use — macOS + Windows + Linux (2026-04-03)

恢复 Computer Use 屏幕操控功能。参考项目仅 macOS，本次扩展为三平台支持。

**Phase 1 — MCP server stub 替换：**
从参考项目复制 `@ant/computer-use-mcp` 完整实现（12 文件，6517 行）。

**Phase 2 — 移除 src/ 中 8 处 macOS 硬编码：**

| 文件 | 改动 |
|------|------|
| `src/main.tsx:1605` | 去掉 `getPlatform() === 'macos'` |
| `src/utils/computerUse/swiftLoader.ts` | 移除 darwin-only throw |
| `src/utils/computerUse/executor.ts` | 平台守卫扩展为 darwin+win32+linux；剪贴板按平台分发（pbcopy→PowerShell→xclip）；paste 快捷键 command→ctrl |
| `src/utils/computerUse/drainRunLoop.ts` | 非 darwin 直接执行 fn() |
| `src/utils/computerUse/escHotkey.ts` | 非 darwin 返回 false（Ctrl+C fallback） |
| `src/utils/computerUse/hostAdapter.ts` | 非 darwin 权限检查返回 granted |
| `src/utils/computerUse/common.ts` | platform + screenshotFiltering 动态化 |
| `src/utils/computerUse/gates.ts` | enabled:true + hasRequiredSubscription→true |

**Phase 3 — input/swift 包 dispatcher + backends 三平台架构：**

```
packages/@ant/computer-use-{input,swift}/src/
├── index.ts          ← dispatcher
├── types.ts          ← 共享接口
└── backends/
    ├── darwin.ts      ← macOS AppleScript（原样拆出，不改逻辑）
    ├── win32.ts       ← Windows PowerShell
    └── linux.ts       ← Linux xdotool/scrot/xrandr/wmctrl
```

**编译开关：** `CHICAGO_MCP` 加入 DEFAULT_FEATURES + DEFAULT_BUILD_FEATURES

**验证结果（Windows x64）：**
- `isSupported: true` ✅
- 鼠标定位 + 前台窗口信息 ✅
- 双显示器检测 2560x1440 × 2 ✅
- 全屏截图 3MB base64 ✅
- `bun run build` 463 files ✅

---

## Enable Voice Mode / VOICE_MODE (2026-04-03)

恢复 `/voice` 语音输入功能。`src/` 下所有 voice 相关源码已与官方一致（0 行差异），问题出在：① `VOICE_MODE` 编译开关未开，命令不显示；② `audio-capture-napi` 是 SoX 子进程 stub（Windows 不支持），缺少官方原生 `.node` 二进制。

**新增文件：**

| 文件 | 说明 |
|------|------|
| `vendor/audio-capture/{platform}/audio-capture.node` | 6 个平台的原生音频二进制（cpal，来自参考项目） |
| `vendor/audio-capture-src/index.ts` | 原生模块加载器（按 `${arch}-${platform}` 动态 require `.node`） |

---

## Enable Claude in Chrome MCP (2026-04-03)

恢复 Chrome 浏览器控制功能。`src/` 下所有 claudeInChrome 相关源码已与官方一致（0 行差异），问题出在 `@ant/claude-for-chrome-mcp` 包是 6 行 stub（返回空工具列表和 null server）。

**替换文件：**

| 文件 | 变更 |
|------|------|
| `packages/@ant/claude-for-chrome-mcp/src/index.ts` | 6 行 stub → 15 行完整导出 |

**新增文件：**

| 文件 | 行数 | 说明 |
|------|------|------|
| `packages/@ant/claude-for-chrome-mcp/src/types.ts` | 134 | 类型定义 |
| `packages/@ant/claude-for-chrome-mcp/src/browserTools.ts` | 546 | 17 个浏览器工具定义 |
| `packages/@ant/claude-for-chrome-mcp/src/mcpServer.ts` | 96 | MCP Server |
| `packages/@ant/claude-for-chrome-mcp/src/mcpSocketClient.ts` | 493 | Unix Socket 客户端 |
| `packages/@ant/claude-for-chrome-mcp/src/mcpSocketPool.ts` | 327 | 多 Profile 连接池 |
| `packages/@ant/claude-for-chrome-mcp/src/bridgeClient.ts` | 1126 | Bridge WebSocket 客户端 |
| `packages/@ant/claude-for-chrome-mcp/src/toolCalls.ts` | 301 | 工具调用路由 |

**不需要 feature flag，不需要改 dev.ts/build.ts，不改 src/ 下任何文件。**

**运行时依赖：** Chrome 浏览器 + Claude in Chrome 扩展（https://claude.ai/chrome）

---

## OpenAI 接口兼容 (2026-04-03)

**分支**: `feature/openai`

在 `/login` 流程中新增 "OpenAI Compatible" 选项，支持 Ollama、DeepSeek、vLLM、One API 等兼容 OpenAI Chat Completions API 的第三方服务。用户通过 `/login` 配置后，所有 API 请求自动走 OpenAI 路径。

**改动文件（10 个，+384 / -134）：**

| 文件 | 变更 |
|------|------|
| `.github/workflows/ci.yml` | CI runner 从 `ubuntu-latest` 改为 `macos-latest` |
| `README.md` | TODO 列表新增 "OpenAI 接口兼容" 条目 |
| `src/components/ConsoleOAuthFlow.tsx` | 新增 `openai_chat_api` OAuth state（含 Base URL / API Key / 3 个模型映射字段）；idle 选择列表新增 "OpenAI Compatible" 选项；完整表单 UI（Tab 切换、Enter 保存）；保存时写入 `modelType: 'openai'` + env 到 settings.json；OAuth 登录时重置 `modelType` 为 `anthropic` |
| `src/services/api/openai/index.ts` | 从直接 `yield* adaptOpenAIStreamToAnthropic()` 改为完整流处理循环：累积 content blocks（text/tool_use/thinking）、按 `content_block_stop` yield `AssistantMessage`、同时 yield `StreamEvent` 用于实时显示；错误处理改用新签名 `createAssistantAPIErrorMessage({ content, apiError, error })` |
| `src/services/api/openai/convertMessages.ts` | 输入类型从 Anthropic SDK `BetaMessageParam[]` 改为内部 `(UserMessage \| AssistantMessage)[]`；通过 `msg.type` 而非 `msg.role` 判断角色；从 `msg.message.content` 读取内容；跳过 `cache_edits` / `server_tool_use` 等内部 block 类型 |
| `src/services/api/openai/modelMapping.ts` | 移除 `OPENAI_MODEL_MAP` JSON 环境变量 + 缓存机制；新增 `getModelFamily()` 按 haiku/sonnet/opus 分类；解析优先级改为：`OPENAI_MODEL` → `ANTHROPIC_DEFAULT_{FAMILY}_MODEL` → `DEFAULT_MODEL_MAP` → 原名透传 |
| `src/services/api/openai/__tests__/convertMessages.test.ts` | 测试输入从裸 `{ role, content }` 改为 `makeUserMsg()` / `makeAssistantMsg()` 包装的内部格式 |
| `src/services/api/openai/__tests__/modelMapping.test.ts` | 测试从 `OPENAI_MODEL_MAP` 改为 `ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL`；新增 3 个 env var override 测试 |
| `src/utils/model/providers.ts` | `getAPIProvider()` 新增最高优先级：从 settings.json `modelType` 字段判断；环境变量 `CLAUDE_CODE_USE_OPENAI` 降为次优先 |
| `src/utils/settings/types.ts` | `SettingsSchema` 新增 `modelType` 字段：`z.enum(['anthropic', 'openai']).optional()` |

**关键设计决策：**

1. **`modelType` 存入 settings.json** — 而非纯环境变量，使 `/login` 配置持久化，重启后仍然生效
2. **复用 `ANTHROPIC_DEFAULT_*_MODEL` 环境变量** — 而非新增 `OPENAI_MODEL_MAP`，与 Custom Platform 共用同一套模型映射配置，减少用户认知负担
3. **流处理双 yield** — 同时 yield `AssistantMessage`（给消费方处理工具调用）和 `StreamEvent`（给 REPL 实时渲染），与 Anthropic 路径行为对齐
4. **OAuth 登录重置 modelType** — 用户切换回官方 Anthropic 登录时自动重置为 `anthropic`，避免残留配置导致请求走错误路径

**配置方式：**

```
/login → 选择 "OpenAI Compatible" → 填写 Base URL / API Key / 模型名称
```

或手动编辑 `~/.claude/settings.json`：

```json
{
  "modelType": "openai",
  "env": {
    "OPENAI_BASE_URL": "http://localhost:11434/v1",
    "OPENAI_API_KEY": "ollama",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "qwen3:32b"
  }
}
```

---

## Enable Remote Control / BRIDGE_MODE (2026-04-03)

**PR**: [claude-code-best/claude-code#60](https://github.com/claude-code-best/claude-code/pull/60)

Remote Control 功能将本地 CLI 注册为 bridge 环境，生成可分享的 URL（`https://claude.ai/code/session_xxx`），允许从浏览器、手机或其他设备远程查看输出、发送消息、审批工具调用。

**改动文件：**

| 文件 | 变更 |
|------|------|
| `scripts/dev.ts` | `DEFAULT_FEATURES` 加入 `"BRIDGE_MODE"`，dev 模式默认启用 |
| `src/bridge/peerSessions.ts` | stub → 完整实现：通过 bridge API 发送跨会话消息，含三层安全防护（trim + validateBridgeId 白名单 + encodeURIComponent） |
| `src/bridge/webhookSanitizer.ts` | stub → 完整实现：正则 redact 8 类 secret（GitHub/Anthropic/AWS/npm/Slack token），先 redact 再截断，失败返回安全占位符 |
| `src/entrypoints/sdk/controlTypes.ts` | 12 个 `any` stub → `z.infer<ReturnType<typeof XxxSchema>>` 从现有 Zod schema 推导类型 |
| `src/hooks/useReplBridge.tsx` | `tengu_bridge_system_init` 默认值 `false` → `true`，使 app 端显示 "active" 而非卡在 "connecting" |

**关键设计决策：**

1. **不改现有代码逻辑** — 只补全 stub、修正默认值、开启编译开关
2. **`tengu_bridge_system_init`** — Anthropic 通过 GrowthBook 给订阅用户推送 `true`，但我们的 build 收不到推送；改默认值是唯一不侵入其他代码的方案
3. **`peerSessions.ts` 认证** — 使用 `getBridgeAccessToken()` 获取 OAuth Bearer token，与 `bridgeApi.ts`/`codeSessionApi.ts` 认证模式一致
4. **`webhookSanitizer.ts` 安全** — fail-closed（出错返回 `[webhook content redacted due to sanitization error]`），不泄露原始内容

**验证结果：**

- `/remote-control` 命令可见且可用
- CLI 连接 Anthropic CCR，生成可分享 URL
- App 端（claude.ai/code）显示 "Remote Control active"
- 手机端（Claude iOS app）通过 URL 连接，双向消息正常

![Remote Control on Mobile](docs/images/remote-control-mobile.png)

---

## GrowthBook 自定义服务器适配器 (2026-04-03)

GrowthBook 功能开关系统原为 Anthropic 内部构建设计，硬编码 SDK key 和 API 地址，外部构建因 `is1PEventLoggingEnabled()` 门控始终禁用。新增适配器模式，通过环境变量连接自定义 GrowthBook 服务器，无配置时所有 feature 读取返回代码默认值。

**修改文件：**

| 文件 | 变更 |
|------|------|
| `src/constants/keys.ts` | `getGrowthBookClientKey()` 优先读取 `CLAUDE_GB_ADAPTER_KEY` 环境变量 |
| `src/services/analytics/growthbook.ts` | `isGrowthBookEnabled()` 适配器模式下直接返回 `true`，绕过 1P event logging 门控 |
| `src/services/analytics/growthbook.ts` | `getGrowthBookClient()` base URL 优先使用 `CLAUDE_GB_ADAPTER_URL` |
| `docs/internals/growthbook-adapter.mdx` | 新增适配器配置文档，含全部 ~58 个 feature key 列表 |

**用法：** `CLAUDE_GB_ADAPTER_URL=https://gb.example.com/ CLAUDE_GB_ADAPTER_KEY=sdk-xxx bun run dev`

---

## Datadog 日志端点可配置化 (2026-04-03)

将 Datadog 硬编码的 Anthropic 内部端点改为环境变量驱动，默认禁用。

**修改文件：**

| 文件 | 变更 |
|------|------|
| `src/services/analytics/datadog.ts` | `DATADOG_LOGS_ENDPOINT` 和 `DATADOG_CLIENT_TOKEN` 从硬编码常量改为读取 `process.env.DATADOG_LOGS_ENDPOINT` / `process.env.DATADOG_API_KEY`，默认空字符串；`initializeDatadog()` 增加守卫：端点或 Token 未配置时直接返回 `false` |
| `docs/telemetry-remote-config-audit.md` | 更新第 1 节，反映新的环境变量配置方式 |

**效果：** 默认不向任何外部发送数据；设置两个环境变量即可接入自己的 Datadog 实例。原有 `DISABLE_TELEMETRY`、privacy level、sink killswitch 等防线保留。

**用法：** `DATADOG_LOGS_ENDPOINT=https://http-intake.logs.datadoghq.com/api/v2/logs DATADOG_API_KEY=xxx bun run dev`

---

## Sentry 错误上报集成 (2026-04-03)

恢复反编译过程中被移除的 Sentry 集成。通过 `SENTRY_DSN` 环境变量控制，未设置时所有函数为 no-op，不影响正常运行。

**新增文件：**

| 文件 | 说明 |
|------|------|
| `src/utils/sentry.ts` | 核心模块：`initSentry()`、`captureException()`、`setTag()`、`setUser()`、`closeSentry()`；`beforeSend` 过滤 auth headers 等敏感信息；忽略 ECONNREFUSED/AbortError 等非 actionable 错误 |

**修改文件：**

| 文件 | 变更 |
|------|------|
| `src/utils/errorLogSink.ts` | `logErrorImpl` 末尾调用 `captureException()`，所有经 `logError()` 的错误自动上报 |
| `src/components/SentryErrorBoundary.ts` | 添加 `componentDidCatch`，React 组件渲染错误上报到 Sentry（含 componentStack） |
| `src/entrypoints/init.ts` | 网络配置后调用 `initSentry()` |
| `src/utils/gracefulShutdown.ts` | 优雅关闭时 flush Sentry 事件 |
| `src/screens/REPL.tsx:2809` | `fireCompanionObserver` 调用增加 `typeof` 防护，BUDDY feature 启用时不报错（TODO: 待实现） |
| `package.json` | devDependencies 新增 `@sentry/node` |

**用法：** `SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx bun run dev`

---

## 默认关闭自动更新 (2026-04-03)

修改 `src/utils/config.ts` — `getAutoUpdaterDisabledReason()`，在原有检查逻辑前插入默认关闭逻辑。未设置 `ENABLE_AUTOUPDATER=1` 时，自动更新始终返回 `{ type: 'config' }` 被禁用。

**启用方式：** `ENABLE_AUTOUPDATER=1 bun run dev`

**原因：** 本项目为逆向工程/反编译版本，自动更新会覆盖本地修改的代码。

**同时新增文档：** `docs/auto-updater.md` — 自动更新机制完整审计，涵盖三种安装类型的更新策略、后台轮询、版本门控、原生安装器架构、文件锁、配置项等。

---

## WebSearch Bing 适配器补全 (2026-04-03)

原始 `WebSearchTool` 仅支持 Anthropic API 服务端搜索（`web_search_20250305` server tool），在非官方 API 端点（第三方代理）下搜索功能不可用。本次改动引入适配器架构，新增 Bing 搜索页面解析作为 fallback。

**新增文件：**

| 文件 | 说明 |
|------|------|
| `src/tools/WebSearchTool/adapters/types.ts` | 适配器接口定义：`WebSearchAdapter`、`SearchResult`、`SearchOptions`、`SearchProgress` |
| `src/tools/WebSearchTool/adapters/apiAdapter.ts` | API 适配器 — 将原有 `queryModelWithStreaming` 逻辑封装为 `ApiSearchAdapter` |
| `src/tools/WebSearchTool/adapters/bingAdapter.ts` | Bing 适配器 — 直接抓取 Bing HTML，正则提取搜索结果 |
| `src/tools/WebSearchTool/adapters/index.ts` | 适配器工厂 — 根据环境变量 / API Base URL 选择后端 |
| `src/tools/WebSearchTool/__tests__/bingAdapter.test.ts` | Bing 适配器单元测试（32 cases：decodeHtmlEntities、extractBingResults、search mock） |
| `src/tools/WebSearchTool/__tests__/bingAdapter.integration.ts` | Bing 适配器集成测试 — 真实网络请求验证 |

**重构文件：**

| 文件 | 变更 |
|------|------|
| `src/tools/WebSearchTool/WebSearchTool.ts` | 从直接调用 API 改为 `createAdapter()` 工厂模式；`isEnabled()` 始终返回 true；删除 ~200 行内联 API 调用逻辑 |
| `src/tools/WebFetchTool/utils.ts` | `skipWebFetchPreflight` 默认值从 `!undefined`（即 true）改为显式 `=== false`，使域名预检默认启用 |

**Bing 适配器关键技术细节：**

1. **反爬绕过**：使用完整 Edge 浏览器请求头（含 `Sec-Ch-Ua`、`Sec-Fetch-*` 等 13 个标头），避免 Bing 返回 JS 渲染的空页面；`setmkt=en-US` 参数强制美式英语市场，避免 IP 地理定位导致的区域化结果（德语论坛、新加坡金价等不相关内容）
2. **URL 解码**（`resolveBingUrl()`）：Bing 返回的重定向 URL（`bing.com/ck/a?...&u=a1aHR0cHM6Ly9...`）中 `u` 参数为 base64 编码的真实 URL，需解码后使用
3. **摘要提取**（`extractSnippet()`）：三级降级策略 — `b_lineclamp` → `b_caption <p>` → `b_caption` 直接文本
4. **HTML 实体解码**（`decodeHtmlEntities()`）：处理 7 种常见 HTML 实体
5. **域过滤**：客户端侧 `allowedDomains` / `blockedDomains` 过滤，支持子域名匹配

**当前状态**：`adapters/index.ts` 中 `createAdapter()` 硬编码返回 `BingSearchAdapter`，跳过了 API/Bing 自动选择逻辑（原逻辑被注释保留）。未来可通过取消注释恢复自动选择。

---

## 移除反蒸馏机制 (2026-04-02)

项目中发现三处 anti-distillation 相关代码，全部移除。

**移除内容：**
- `src/services/api/claude.ts` — 删除 fake_tools 注入逻辑（原第 302-314 行），该代码通过 `ANTI_DISTILLATION_CC` feature flag 在 API 请求中注入 `anti_distillation: ['fake_tools']`，使服务端在响应中混入虚假工具调用以污染蒸馏数据
- `src/utils/betas.ts` — 删除 connector-text summarization beta 注入块及 `SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER` 导入，该机制让服务端缓冲工具调用间的 assistant 文本并摘要化返回
- `src/constants/betas.ts` — 删除 `SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER` 常量定义（原第 23-25 行）
- `src/utils/streamlinedTransform.ts` — 注释从 "distillation-resistant" 改为 "compact"，streamlined 模式本身是有效的输出压缩功能，仅修正描述

---

## Buddy 命令合入 + Feature Flag 规范修正 (2026-04-02)

合入 `pr/smallflyingpig/36` 分支（支持 buddy 命令 + 修复 rehatch），并修正 feature flag 使用方式。

**合入内容（来自 PR）：**
- `src/commands/buddy/buddy.ts` — 新增 `/buddy` 命令，支持 hatch / rehatch / pet / mute / unmute 子命令
- `src/commands/buddy/index.ts` — 从 stub 改为正确的 `Command` 类型导出
- `src/buddy/companion.ts` — 新增 `generateSeed()`，`getCompanion()` 支持 seed 驱动的可复现 rolling
- `src/buddy/types.ts` — `CompanionSoul` 增加 `seed?` 字段

**合并后修正：**
- `src/entrypoints/cli.tsx` — PR 硬编码了 `const feature = (name) => name === "BUDDY"`，违反 feature flag 规范，恢复为标准 `import { feature } from 'bun:bundle'`
- `src/commands.ts` — PR 用静态 `import buddy` 绕过了 feature gate，恢复为 `feature('BUDDY') ? require(...) : null` + 条件展开
- `src/commands/buddy/buddy.ts` — 删除未使用的 `companionInfoText` 函数和多余的 `Roll`/`SPECIES` import
- `CLAUDE.md` — 重写 Feature Flag System 章节，明确规范：代码中统一用 `import { feature } from 'bun:bundle'`，启用走环境变量 `FEATURE_<NAME>=1`

**用法：** `FEATURE_BUDDY=1 bun run dev`

---

## Auto Mode 补全 (2026-04-02)

反编译丢失了 auto mode 分类器的三个 prompt 模板文件，代码逻辑完整但无法运行。

**新增：**
- `yolo-classifier-prompts/auto_mode_system_prompt.txt` — 主系统提示词
- `yolo-classifier-prompts/permissions_external.txt` — 外部权限模板（用户规则替换默认值）
- `yolo-classifier-prompts/permissions_anthropic.txt` — 内部权限模板（用户规则追加）

**改动：**
- `scripts/dev.ts` + `build.ts` — 扫描 `FEATURE_*` 环境变量注入 Bun `--feature`
- `cli.tsx` — 启动时打印已启用的 feature
- `permissionSetup.ts` — `AUTO_MODE_ENABLED_DEFAULT` 由 `feature('TRANSCRIPT_CLASSIFIER')` 决定，开 feature 即开 auto mode
- `docs/safety/auto-mode.mdx` — 补充 prompt 模板章节

**用法：** `FEATURE_TRANSCRIPT_CLASSIFIER=1 bun run dev`

**注意：** prompt 模板为重建产物。

---

## USER_TYPE=ant TUI 修复 (2026-04-02)

`global.d.ts` 声明的全局函数在反编译版本运行时未定义，导致 `USER_TYPE=ant` 时 TUI 崩溃。

修复方式：显式 import / 本地 stub / 全局 stub / 新建 stub 文件。涉及文件：
`cli.tsx`, `model.ts`, `context.ts`, `effort.ts`, `thinking.ts`, `undercover.ts`, `Spinner.tsx`, `AntModelSwitchCallout.tsx`(新建), `UndercoverAutoCallout.tsx`(新建)

注意：
- `USER_TYPE=ant` 启用 alt-screen 全屏模式，中心区域满屏是预期行为
- `global.d.ts` 中剩余未 stub 的全局函数（`getAntModels` 等）遇到 `X is not defined` 时按同样模式处理

---

## /login 添加 Custom Platform 选项 (2026-04-03)

在 `/login` 命令的登录方式选择列表中新增 "Custom Platform" 选项（位于第一位），允许用户直接在终端配置第三方 API 兼容服务的 Base URL、API Key 和三种模型映射，保存到 `~/.claude/settings.json`。

**修改文件：**

| 文件 | 变更 |
|------|------|
| `src/components/ConsoleOAuthFlow.tsx` | `OAuthStatus` 类型新增 `custom_platform` state（含 `baseUrl`、`apiKey`、`haikuModel`、`sonnetModel`、`opusModel`、`activeField`）；`idle` case Select 选项新增 Custom Platform 并排第一位；新增 `custom_platform` case 渲染 5 字段表单（Tab/Shift+Tab 切换、focus 高亮、Enter 跳转/保存）；Select onChange 处理 `custom_platform` 初始状态（从 `process.env` 预填当前值）；`OAuthStatusMessageProps` 类型及调用处新增 `onDone` prop |
| `src/components/ConsoleOAuthFlow.tsx` | 新增 `updateSettingsForSource` import |

**UI 交互：**
- 5 个字段同屏：Base URL、API Key、Haiku Model、Sonnet Model、Opus Model
- 当前活动字段的标签用 `suggestion` 背景色 + `inverseText` 反色高亮
- Tab / Shift+Tab 在字段间切换，各自保留输入值
- 每个字段按 Enter 跳到下一个，最后一个字段 (Opus) 按 Enter 保存
- 模型字段自动从 `process.env` 读取当前配置作为预填值，无值则空
- 保存时调用 `updateSettingsForSource('userSettings', { env })` 写入 settings.json，同时更新 `process.env`

**保存的 settings.json env 字段：**
```json
{
  "ANTHROPIC_BASE_URL": "...",
  "ANTHROPIC_AUTH_TOKEN": "...",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL": "...",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "...",
  "ANTHROPIC_DEFAULT_OPUS_MODEL": "..."
}
```

非空字段才写入，保存后立即生效（`onDone()` 触发 `onChangeAPIKey()` 刷新 API 客户端）。


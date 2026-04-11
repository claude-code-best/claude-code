# Pipes + LAN Pipes 完整功能指南

## 概述

Pipes 系统提供 Claude Code CLI 实例之间的通讯能力，分两层：

1. **Pipes（本机）**：同一台机器上的多个 CLI 实例通过 UDS（Unix Domain Socket / Windows Named Pipe）协作
2. **LAN Pipes（局域网）**：不同机器上的 CLI 实例通过 TCP + UDP Multicast 协作

两层使用同一套协议（NDJSON）和同一套命令（`/pipes`、`/attach`、`/send` 等），对用户透明。

## Feature Flags

| Flag | 控制范围 | 默认 |
|------|----------|------|
| `UDS_INBOX` | 本机 Pipe IPC 全部功能 | dev/build 启用 |
| `LAN_PIPES` | 局域网 TCP + beacon 扩展 | dev/build 启用 |

手动启用：`FEATURE_UDS_INBOX=1 FEATURE_LAN_PIPES=1 bun run dev`

## 快速上手

### 本机多实例

```bash
# 终端 1
bun run dev
# 启动后自动注册为 main

# 终端 2
bun run dev
# 自动注册为 sub-1，被 main 自动 attach
```

在终端 1 中输入 `/pipes`，可以看到两个实例。选中 sub-1 后，输入的消息会自动转发到 sub-1 执行。

### 局域网多机器

```bash
# 机器 A (192.168.50.22)
bun run dev

# 机器 B (192.168.50.27)
bun run dev
```

两边启动后等 3-5 秒（beacon 广播间隔），LAN peers 会自动发现并 attach。输入 `/pipes` 可看到标记 `[LAN]` 的远端实例。

### 防火墙配置（两台机器都需要）

**Windows**（管理员 PowerShell）：
```powershell
New-NetFirewallRule -DisplayName "Claude Code LAN Beacon (UDP)" -Direction Inbound -Protocol UDP -LocalPort 7101 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Claude Code LAN Pipes (TCP)" -Direction Inbound -Protocol TCP -LocalPort 1024-65535 -Program (Get-Command bun).Source -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Claude Code LAN Beacon Out (UDP)" -Direction Outbound -Protocol UDP -RemotePort 7101 -Action Allow -Profile Private
# 确认网络为"专用"：Get-NetConnectionProfile
```

**macOS**（首次运行时系统弹出对话框，点击"允许"即可）：
```bash
# 如果需要手动放行 pf 防火墙：
echo "pass in proto udp from any to any port 7101" | sudo pfctl -ef -
```

**Linux**（firewalld / iptables）：
```bash
# firewalld
sudo firewall-cmd --zone=trusted --add-port=7101/udp --permanent
sudo firewall-cmd --zone=trusted --add-port=1024-65535/tcp --permanent
sudo firewall-cmd --reload

# 或 iptables
sudo iptables -A INPUT -p udp --dport 7101 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 1024:65535 -m owner --uid-owner $(id -u) -j ACCEPT
```

确认：网络为局域网（非公共 WiFi），路由器未开启 AP 隔离。

## 交互面板与快捷键

### 状态栏

执行 `/pipes` 后，输入框底部出现 pipe 状态栏（单行）：

```
pipe: cli-a91bad56 (main) 192.168.50.22  2/3 selected  selected pipes only · ←/→ or m switch · Shift+↓ edit
```

状态栏始终可见（直到会话结束），显示：当前 pipe 名、角色、IP、已选数/总数、路由模式。

### 展开选择面板

按 **Shift+↓**（Shift + 下箭头）展开选择面板：

```
pipe: cli-a91bad56 (main) 192.168.50.22  ↑↓ move Space select ←/→ or m route Enter/Esc close Shift+↓ toggle
  当前普通 prompt 走 已选 sub；切换不会清空选择
  ☑ cli-da029538 (sub-1 XC/192.168.50.22)
  ☐ cli-04d67950 (main vmwin11/192.168.50.27)
  ☑ cli-893747d3 [offline] (sub-2 vmwin11/192.168.50.27)
```

### 面板内快捷键

| 快捷键 | 场景 | 作用 |
|--------|------|------|
| **Shift+↓** | 状态栏可见时 | 展开/收起选择面板 |
| **↑ / ↓** | 面板展开时 | 上下移动光标 |
| **Space** | 面板展开时 | 切换当前光标所在 pipe 的选中状态（☑ ↔ ☐） |
| **Enter** | 面板展开时 | 确认并关闭面板 |
| **Esc** | 面板展开时 | 取消并关闭面板 |
| **← / → 或 M** | 状态栏可见且有选中 pipe 时 | 切换路由模式（`selected pipes only` ↔ `local main`） |

### M 键 — 路由模式切换

M 键（或 ← / →）用于在两种路由模式之间切换，**无需展开面板**：

| 模式 | 状态栏显示 | 行为 |
|------|-----------|------|
| `selected pipes only` | 绿色高亮 | 输入的 prompt **仅**发送到选中的 pipe，本地不执行 |
| `local main` | 灰色 | 输入的 prompt 在**本地 main** 执行，不转发到任何 pipe |

切换路由模式**不会清空选择**。你可以在 `local main` 模式下保持选择，随时按 M 切回 `selected pipes only` 继续向远端发送。

### 完整操作流程示例

```
1. 输入 /pipes                     → 状态栏出现，显示发现的实例
2. 按 Shift+↓                      → 展开选择面板
3. 按 ↓ 移动到目标 pipe             → 光标移到 cli-04d67950
4. 按 Space                        → 选中 ☑ cli-04d67950
5. 按 Enter                        → 确认，面板收起
6. 输入 "帮我检查 git status"       → prompt 自动发送到 cli-04d67950 执行
7. 按 M                            → 切换到 local main 模式
8. 输入 "本地做点什么"              → 仅在本地执行
9. 按 M                            → 切回 selected pipes only
10. 输入 "继续远端任务"             → 又发送到 cli-04d67950
```

## 命令参考

### /pipes

显示所有发现的实例，管理选择状态。再次执行 `/pipes` 切换面板展开/收起。

```
/pipes                    — 显示所有实例 + 切换选择面板
/pipes select <name>      — 选中某实例（消息会广播到它）
/pipes deselect <name>    — 取消选中
/pipes all                — 全选
/pipes none               — 全部取消
```

输出示例：
```
Your pipe:   cli-a91bad56
Role:        main
Machine ID:  205d6c3a...
IP:          192.168.50.22
Host:        XC

Main machine: 205d6c3a... (this machine)
  [main] cli-a91bad56  XC/192.168.50.22  [alive] (you)
  ☑ [sub-1] cli-da029538  XC/192.168.50.22  [alive] [connected]

LAN Peers:
  ☐ [main] cli-04d67950  vmwin11/192.168.50.27  tcp:192.168.50.27:58853  [LAN]

Selected: cli-da029538
```

### /attach <name>

手动 attach 到一个实例，使其成为你的 slave。

```
/attach cli-04d67950      — 连接到指定 pipe（自动解析 LAN TCP 端点）
```

attach 后，对方变为 slave，你变为 master。可以向它发送 prompt。通常不需要手动 attach——heartbeat 会自动发现并连接。

### /detach <name>

断开与某个 slave 的连接。

```
/detach cli-04d67950
```

### /send <name> <message>

向指定 pipe 发送消息（不依赖选择状态，直接指定目标）。

```
/send cli-04d67950 请帮我检查一下日志
/send tcp:192.168.50.27:58853 hello    — 直接通过 TCP 地址发送
```

### /claim-main

强制声明当前机器为 main（用于 main 意外退出后的恢复）。

## 消息路由

### 选中 pipe 后的自动路由

1. 通过 `/pipes select` 或 Shift+Down 面板选中一个或多个 pipe
2. 在输入框中正常输入消息
3. 消息自动发送到所有选中的已连接 pipe
4. 每个 pipe 独立执行，结果流式回传到 main 的消息列表

### 路由模式

| 模式 | 行为 |
|------|------|
| `selected`（默认） | 消息发送到选中的 pipe |
| `local` | 消息仅在本地执行，不转发 |

## 架构

### 通信协议

所有通讯使用 NDJSON（Newline-Delimited JSON），每行一个消息：

```json
{"type":"ping","from":"cli-abc","ts":"2026-04-11T00:00:00.000Z"}
{"type":"prompt","data":"帮我查看 git status","from":"cli-abc","ts":"..."}
{"type":"stream","data":"正在执行...","from":"cli-def","ts":"..."}
{"type":"done","data":"","from":"cli-def","ts":"..."}
```

### 消息类型

| 类型 | 方向 | 说明 |
|------|------|------|
| `ping`/`pong` | 双向 | 健康检查 |
| `attach_request`/`accept`/`reject` | M→S/S→M | 连接控制 |
| `detach` | M→S | 断开连接 |
| `prompt` | M→S | 主向从发送 prompt |
| `prompt_ack` | S→M | 从确认接收 |
| `stream` | S→M | 从流式回传 AI 输出 |
| `tool_start`/`tool_result` | S→M | 工具执行通知 |
| `done` | S→M | 本轮完成 |
| `error` | 双向 | 错误通知 |
| `permission_request`/`response`/`cancel` | 双向 | 权限审批转发 |

### 传输层

```
                  本机                          LAN
            ┌──────────────┐            ┌──────────────┐
            │  PipeServer  │            │  PipeServer  │
            │   UDS sock   │            │   UDS sock   │
            │   TCP :rand  │◄───TCP───►│   TCP :rand  │
            ├──────────────┤            ├──────────────┤
            │  LanBeacon   │◄──UDP────►│  LanBeacon   │
            │  224.0.71.67 │  mcast     │  224.0.71.67 │
            └──────────────┘            └──────────────┘
```

- **UDS**：本机实例间通讯，通过文件系统路径寻址（`~/.claude/pipes/cli-xxx.sock`）
- **TCP**：LAN 实例间通讯，动态端口，通过 beacon 发现
- **UDP Multicast**：peer 发现，3 秒广播一次 announce 包

### 角色模型

| 角色 | 说明 |
|------|------|
| `main` | 首个启动的实例，管理 registry |
| `sub` | 后续启动的同机实例（或被 attach 的 LAN 实例） |
| `master` | attach 了至少一个 slave 的实例 |
| `slave` | 被 master attach 控制的实例 |

角色转换：
- 首个启动 → `main`
- 同机后续启动 → `sub`（自动被 main attach → `slave`）
- LAN 发现 → 两边都是 `main`，heartbeat 自动互相 attach
- 被 attach → 变为 `slave`（可通过 `/detach` 恢复）

### 发现机制

**本机**：通过 `~/.claude/pipes/registry.json` 文件（带文件锁），`machineId` 绑定主机身份。

**LAN**：通过 UDP multicast beacon：
1. 每 3 秒广播 `{ proto, pipeName, machineId, ip, tcpPort, role }`
2. 收到其他实例的 announce → 记入 peers Map
3. 15 秒未收到 → 标记 peer lost
4. Heartbeat 合并 local registry + beacon peers → 统一 attach 目标列表

### Heartbeat 循环（5 秒间隔）

```
main/master 角色:
  1. cleanupStaleEntries()        — 清理 registry 中死掉的条目
  2. getAliveSubs()               — 获取存活的本地 subs
  3. refreshDiscoveredPipes()     — 刷新 discoveredPipes（包含 LAN peers）
  4. 合并 LAN peers 到 state
  5. 构建统一 attach 目标列表     — 本地 subs + LAN peers
  6. 遍历未连接的目标 → 自动 attach
  7. 清理断开的 slave 连接        — 同时检查 local registry 和 beacon

sub 角色:
  1. 检测 main 是否存活
  2. main 死亡 → 同机则接管 main 角色，跨机则独立
```

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/utils/pipeTransport.ts` | PipeServer（双模 UDS+TCP）、PipeClient、类型定义 |
| `src/utils/lanBeacon.ts` | UDP multicast beacon、singleton 管理 |
| `src/utils/pipeRegistry.ts` | Registry CRUD、角色判定、machineId、LAN merge |
| `src/utils/peerAddress.ts` | 地址解析（uds:/bridge:/tcp: scheme） |
| `src/screens/REPL.tsx` | Bootstrap、heartbeat、cleanup、prompt 路由 |
| `src/hooks/useMasterMonitor.ts` | Slave client registry、消息订阅 |
| `src/hooks/useSlaveNotifications.ts` | Slave 端通知处理 |
| `src/commands/pipes/pipes.ts` | /pipes 命令 |
| `src/commands/attach/attach.ts` | /attach 命令 |
| `src/commands/send/send.ts` | /send 命令 |
| `src/tools/SendMessageTool/SendMessageTool.ts` | AI 发消息工具（含 tcp: 支持） |

## 后续优化方向

### 安全（P0）

1. **TCP 认证**：首次连接时交换 HMAC-SHA256 token（基于 machineId + session secret），防止未授权设备连接
2. **JSON schema 验证**：在所有 `JSON.parse` 入口点增加 Zod 校验，防止 prototype pollution
3. **Beacon 信息脱敏**：hash machineId 后再广播，不暴露硬件序列号

### 可靠性（P1）

4. **多网卡选择**：`getLocalIp()` 应优先选择 RFC 1918 地址，排除 VPN/Docker 接口
5. **TCP target 验证**：`parseTcpTarget()` 应限制目标为已知 beacon peers 或 RFC 1918 范围
6. **PipeServer close()**：改为 `Promise.allSettled` 并行关闭 UDS + TCP，加 `_closing` guard

### 功能（P2）

7. **mDNS/DNS-SD**：作为 multicast 受限环境下的 beacon 替代方案
8. **固定端口配置**：允许用户指定 TCP 端口范围，便于防火墙精确配置
9. **TLS 加密**：TCP 传输加密，防中间人窃听
10. **双向 prompt**：当前只有 master → slave 方向，可考虑 slave 主动向 master 发送结果/请求

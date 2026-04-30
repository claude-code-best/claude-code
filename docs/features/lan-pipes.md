# LAN Pipes — 局域网多机器群控指南

## 什么是 LAN Pipes

LAN Pipes 让多台机器上的 Claude Code 实例通过局域网自动发现并协作。你可以在一台机器（main）上操控其他机器（sub）上的 Claude Code，发送 prompt、查看执行结果、审批权限请求——全程零配置。

基于本机 Pipe IPC（`UDS_INBOX`）扩展，新增 TCP 传输层 + UDP Multicast 发现。

## 前置条件

- 两台或以上机器在同一局域网
- 每台机器安装了 CCB 并能 `bun run dev`
- Feature flag `LAN_PIPES`（dev/build 默认开启）
- 防火墙允许 UDP 7101 + TCP 动态端口（见下方配置）

## 快速开始

### 第一步：配置防火墙

**每台机器都需要执行。**

**Windows**（管理员 PowerShell）：
```powershell
New-NetFirewallRule -DisplayName "CCB LAN Beacon (UDP)" -Direction Inbound -Protocol UDP -LocalPort 7101 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "CCB LAN Pipes (TCP)" -Direction Inbound -Protocol TCP -LocalPort 1024-65535 -Program (Get-Command bun).Source -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "CCB LAN Beacon Out (UDP)" -Direction Outbound -Protocol UDP -RemotePort 7101 -Action Allow -Profile Private
```

验证网络为"专用"（非公共）：`Get-NetConnectionProfile`

**macOS**：
首次运行时系统弹出"允许接受传入连接"对话框，点击"允许"。

如果使用 pf 防火墙：
```bash
echo "pass in proto udp from any to any port 7101" | sudo pfctl -ef -
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
```

### 第二步：启动

```bash
# 机器 A（例如 192.168.50.22）
bun run dev

# 机器 B（例如 192.168.50.27）
bun run dev
```

启动后等待 3-5 秒（beacon 广播间隔），两边自动发现并连接。

### 第三步：查看和操作

在任一台机器上：
```
/pipes
```

输出示例：
```
pipe: cli-a91bad56 (main) 192.168.50.22  2/3 selected

Main machine: 205d6c3a... (this machine)
  [main] cli-a91bad56  XC/192.168.50.22  [alive] (you)
  ☑ [sub-1] cli-da029538  XC/192.168.50.22  [alive] [connected]

LAN Peers:
  ☐ [main] cli-04d67950  vmwin11/192.168.50.27  tcp:192.168.50.27:58853  [LAN]
```

### 第四步：选中目标并发送任务

1. 按 `Shift+↓` 展开选择面板
2. `↑↓` 移动到 LAN peer
3. `Space` 选中
4. `Enter` 确认
5. 输入 prompt，自动路由到远端执行

远端执行结果会流式回传到你的消息列表：
```
[main vmwin11/192.168.50.27 / cli-04d67950] 正在检查 git status...
[main vmwin11/192.168.50.27 / cli-04d67950] Completed
```

## 完整命令参考

| 命令 | 说明 |
|------|------|
| `/pipes` | 显示所有实例（本机 + LAN），Shift+↓ 展开选择面板 |
| `/pipes select <name>` | 选中某实例 |
| `/pipes all` | 全选 |
| `/pipes none` | 取消全选 |
| `/attach <name>` | 手动 attach（自动识别 LAN peer 并通过 TCP 连接） |
| `/detach <name>` | 断开连接 |
| `/send <name> <msg>` | 向指定 pipe 发送消息 |
| `/send tcp:host:port <msg>` | 直接通过 TCP 地址发送 |
| `/claim-main` | 强制声明为 main |
| `/pipe-status` | 显示详细状态 |
| `/peers` | 列出所有已发现的 peer |

## 快捷键

| 快捷键 | 场景 | 作用 |
|--------|------|------|
| `Shift+↓` | 状态栏可见时 | 展开/收起选择面板 |
| `↑ / ↓` | 面板展开时 | 移动光标 |
| `Space` | 面板展开时 | 选中/取消 |
| `Enter` | 面板展开时 | 确认关闭 |
| `Esc` | 面板展开时 | 取消关闭 |
| `← / →` | 有选中 pipe 时 | 切换路由模式 |
| `M` | 面板展开时 | 同 ←/→ 切换路由模式 |

## 路由模式

| 模式 | 显示 | 行为 |
|------|------|------|
| `selected pipes only` | 绿色 | prompt 仅发送到选中的 pipe，本地不执行 |
| `local main` | 灰色 | prompt 仅在本地执行，不转发 |

切换路由模式不会清空选择。

## 权限转发

当远端 slave 执行需要权限的工具（如 BashTool）时：
1. slave 发送 `permission_request` 到 main
2. main 弹出权限确认对话框，显示 `[role hostname/ip / pipeName]`
3. 用户确认/拒绝
4. 结果发回 slave，继续或中断

## 工作原理

### 发现机制

- 每台机器启动时创建 UDP multicast beacon
- 组地址 `224.0.71.67`，端口 `7101`，TTL=1（不跨路由器）
- 每 3 秒广播一次自身信息（pipeName、IP、TCP 端口、角色）
- 15 秒未收到广播则标记 peer 丢失

### 通信机制

- 本机实例：UDS（Unix Domain Socket / Named Pipe）
- 跨机器：TCP（动态端口，通过 beacon 发现）
- 协议：NDJSON（每行一个 JSON 对象）
- 消息类型：ping/pong、attach/detach、prompt/stream/done/error、permission

### 角色模型

| 角色 | 说明 |
|------|------|
| `main` | 首个启动的实例 |
| `sub` | 同机后续启动的实例 |
| `master` | attach 了至少一个 slave 的实例 |
| `slave` | 被 master attach 的实例 |

跨机器 attach 时，两边都可以是 main——不要求对方必须是 sub。

## 常见问题

### 看不到 LAN peer

1. 检查防火墙是否放行 UDP 7101
2. `Get-NetConnectionProfile`（Windows）确认网络为"专用"
3. 确认两台机器在同一子网（`ping` 能通）
4. 路由器未开启 AP 隔离

### 连接超时

1. 检查 TCP 入站防火墙规则
2. 确认没有 VPN 劫持流量
3. 尝试 `/send tcp:ip:port hello` 直接测试

### beacon 绑到了错误网卡

Windows 上 WSL/Docker 虚拟网卡可能劫持 multicast。beacon 会自动选择非内部 IPv4 接口。如果选错，检查 `getLocalIp()` 返回值。

## 安全说明

- TCP 连接当前**无认证**——同 LAN 内知道端口号即可连接
- Multicast TTL=1，不跨路由器
- AI 通过 `SendMessageTool` 发送 `tcp:` 消息时需**用户显式确认**
- 建议仅在信任的局域网中使用

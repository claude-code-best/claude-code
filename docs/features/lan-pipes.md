# LAN Pipes — 局域网跨机器通讯

## 概述

在现有 UDS (Unix Domain Socket) 本地 Pipe 通讯基础上，增加 TCP 传输层和 UDP Multicast 发现机制，使同一局域网内不同机器上的 Claude Code 实例可以互相发现、连接和双向通讯。

## Feature Flag

`LAN_PIPES` — dev/build 默认启用。也可通过 `FEATURE_LAN_PIPES=1` 环境变量启用。

## 架构

```
Machine A (192.168.1.10)              Machine B (192.168.1.20)
┌─────────────────────────┐           ┌─────────────────────────┐
│ PipeServer              │           │ PipeServer              │
│   UDS: cli-abc.sock     │           │   UDS: cli-def.sock     │
│   TCP: 0.0.0.0:7100     │◄─TCP────►│   TCP: 0.0.0.0:7102     │
├─────────────────────────┤           ├─────────────────────────┤
│ LanBeacon               │◄─UDP─────│ LanBeacon               │
│   multicast 224.0.71.67 │  mcast  ►│   multicast 224.0.71.67 │
└─────────────────────────┘           └─────────────────────────┘
```

## 组件

### 1. PipeServer TCP 扩展 (`pipeTransport.ts`)

- `PipeServer.start()` 接受 `PipeServerOptions`，可选启用 TCP 监听
- 内部维护两个 `net.Server` — UDS + TCP，共享同一组 clients 和 handlers
- `PipeServer.tcpAddress` getter 返回 TCP 端口信息

### 2. PipeClient TCP 扩展 (`pipeTransport.ts`)

- 构造函数新增可选 `TcpEndpoint` 参数
- `connect()` 根据是否有 TCP endpoint 选择连接模式
- 对下游调用者完全透明

### 3. LAN Beacon (`lanBeacon.ts`)

- UDP multicast 组: `224.0.71.67:7101`
- 每 3 秒广播 announce 包，包含 pipeName、machineId、hostname、ip、tcpPort、role
- 15 秒无 announce 视为 peer lost
- TTL=1，仅 link-local，不跨路由器

### 4. Registry 扩展 (`pipeRegistry.ts`)

- `PipeRegistryEntry` 新增 `tcpPort?` 和 `lanVisible?` 字段
- `mergeWithLanPeers()` 合并本地 registry 和 LAN beacon 发现的远端 peers

### 5. Peer Address (`peerAddress.ts`)

- `parseAddress()` 新增 `tcp` scheme: `tcp:192.168.1.20:7100`
- `parseTcpTarget()` 解析 `host:port` 字符串

## 使用方式

### 查看 LAN Peers

```
/pipes
```

输出中会显示 `[LAN]` 标记的远端实例。

### 连接远端实例

```
/attach <pipe-name>
```

自动检测 LAN peer 并通过 TCP 连接。

### 发送消息到 LAN Peer

```
/send tcp:192.168.1.20:7100 <message>
```

或通过 SendMessage tool 使用 `tcp:` scheme。

## 安全

- TCP 连接需用户显式同意（checkPermissions 返回 `ask`）
- Multicast TTL=1，仅限链路本地
- 后续可增加 HMAC-SHA256 challenge 认证

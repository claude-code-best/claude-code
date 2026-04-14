# LAN Pipes — 技术实现文档

面向开发者的实现细节。用户指南见 [lan-pipes.md](./lan-pipes.md)。

---

## 架构

```
Machine A (192.168.50.22)                Machine B (192.168.50.27)
┌───────────────────────────┐           ┌───────────────────────────┐
│ PipeServer                │           │ PipeServer                │
│   UDS: ~/.claude/pipes/   │           │   UDS: ~/.claude/pipes/   │
│       cli-abc.sock        │           │       cli-def.sock        │
│   TCP: 0.0.0.0:<random>  │◄──TCP───►│   TCP: 0.0.0.0:<random>  │
├───────────────────────────┤           ├───────────────────────────┤
│ LanBeacon                 │           │ LanBeacon                 │
│   UDP 224.0.71.67:7101    │◄──UDP───►│   UDP 224.0.71.67:7101    │
├───────────────────────────┤           ├───────────────────────────┤
│ usePipeIpc (hook)         │           │ usePipeIpc (hook)         │
│   initPipeServer          │           │   initPipeServer          │
│   registerMessageHandlers │           │   registerMessageHandlers │
│   runMainHeartbeat        │           │   runSubHeartbeat         │
│   cleanupPipeIpc          │           │   cleanupPipeIpc          │
└───────────────────────────┘           └───────────────────────────┘
```

## Feature Flag

`LAN_PIPES` — 在 `scripts/dev.ts` 和 `build.ts` 的 `DEFAULT_FEATURES` 中启用。

所有 LAN 代码路径通过 `feature('LAN_PIPES')` 编译时门控。`feature()` 只能在 `if` 或三元中使用（Bun 编译时常量约束）。

---

## 核心文件

| 文件 | 说明 |
|------|------|
| `src/utils/pipeTransport.ts` | PipeServer/PipeClient（UDS + TCP 双模式） |
| `src/utils/lanBeacon.ts` | UDP multicast beacon + module singleton |
| `src/utils/ndjsonFramer.ts` | 共享 NDJSON socket 帧解析 |
| `src/utils/pipeRegistry.ts` | 文件注册表 + `mergeWithLanPeers()` |
| `src/utils/peerAddress.ts` | 地址解析（uds/bridge/tcp scheme） |
| `src/utils/pipePermissionRelay.ts` | 权限转发 + `setPipeRelay`/`getPipeRelay` singleton |
| `src/hooks/usePipeIpc.ts` | 生命周期 hook（从 REPL.tsx 提取） |
| `src/hooks/usePipeRelay.ts` | 消息回传 hook |
| `src/hooks/usePipePermissionForward.ts` | 权限转发 hook |
| `src/hooks/usePipeRouter.ts` | 输入路由 hook |
| `src/hooks/useMasterMonitor.ts` | slave 注册表 + 消息订阅 |

---

## PipeServer TCP 扩展

`src/utils/pipeTransport.ts`

### 类型

```typescript
export type PipeTransportMode = 'uds' | 'tcp'
export type TcpEndpoint = { host: string; port: number }
export type PipeServerOptions = { enableTcp?: boolean; tcpPort?: number }
```

### PipeServer 变更

- `setupSocket(socket)` — 从 start() 提取的共享方法，UDS 和 TCP 共用
- `start(options?)` — 可选启用 TCP，port=0 让 OS 分配
- 内部维护两个 `net.Server`，共享同一组 `clients: Set<Socket>` 和 `handlers`
- `tcpAddress` getter 暴露 TCP 端口
- `close()` 同时关闭两个 server

socket 帧解析使用 `attachNdjsonFramer()` from `ndjsonFramer.ts`（替代原先 3 份重复代码）。

### PipeClient 变更

- 构造函数新增可选 `TcpEndpoint` 参数
- `connect()` 根据 tcpEndpoint 分派到 `connectTcp()` 或 `connectUds()`
- TCP 不需要文件存在轮询，直接建连

---

## LAN Beacon

`src/utils/lanBeacon.ts`

### 协议参数

| 参数 | 值 |
|------|-----|
| Multicast 组 | `224.0.71.67` |
| 端口 | `7101` |
| 广播间隔 | `3000ms` |
| Peer 超时 | `15000ms` |
| TTL | `1` |

### Announce 包

```typescript
type LanAnnounce = {
  proto: 'claude-pipe-v1'
  pipeName: string
  machineId: string
  hostname: string
  ip: string
  tcpPort: number
  role: 'main' | 'sub'
  ts: number
}
```

### API

```typescript
class LanBeacon extends EventEmitter {
  constructor(announce: Omit<LanAnnounce, 'proto' | 'ts'>)
  start(): void
  stop(): void
  getPeers(): Map<string, LanAnnounce>  // 防御性拷贝
  updateAnnounce(partial): void         // 使用 spread（不可变更新）

  on('peer-discovered', (peer: LanAnnounce) => void)
  on('peer-lost', (pipeName: string) => void)
}
```

### 存储

module-level singleton：`getLanBeacon()` / `setLanBeacon()`。不挂在 Zustand state 上（避免 `setState` 展开时丢失引用）。

### 网卡绑定

`addMembership(group, localIp)` + `setMulticastInterface(localIp)` 指定 LAN 网卡。解决 Windows 上 WSL/Docker 虚拟网卡劫持 multicast 的问题。

---

## Hook 架构

从 REPL.tsx 提取的 ~830 行 Pipe IPC 代码：

### usePipeIpc（生命周期）

`src/hooks/usePipeIpc.ts`（623 行）

在 REPL.tsx 顶层通过 feature-gated require 加载：

```typescript
const usePipeIpc = feature('UDS_INBOX')
  ? require('../hooks/usePipeIpc.js').usePipeIpc
  : () => undefined;

// 组件内
usePipeIpc({ store, handleIncomingPrompt });
```

内部使用 **lazy getter** 函数加载依赖（避免循环依赖导致 Bun 运行时崩溃）：

```typescript
const pt = () => require('../utils/pipeTransport.js')
const pr = () => require('../utils/pipeRegistry.js')
const mm = () => require('./useMasterMonitor.js')
// ...
```

`import type` 用于静态类型（不会触发模块加载）。

### 四个阶段函数

| 函数 | 职责 |
|------|------|
| `initPipeServer` | 角色判定 + server 创建 + beacon 启动 |
| `registerMessageHandlers` | ping、attach、prompt、permission、detach 五个 handler |
| `runMainHeartbeat` | cleanup + 发现 + auto-attach + 清理死连接 |
| `runSubHeartbeat` | 检测 main 是否存活，死亡则接管或独立 |

### usePipeRelay（消息回传）

`src/hooks/usePipeRelay.ts`（38 行）

提供 `relayPipeMessage()` 和 `pipeReturnHadErrorRef`。relay 函数通过 `getPipeRelay()` module singleton 读取（替代 `globalThis.__pipeSendToMaster`）。

### usePipePermissionForward（权限转发）

`src/hooks/usePipePermissionForward.ts`（159 行）

订阅 `subscribePipeEntries()`，处理：
- `permission_request` → 解析 payload → 查找 tool → 加入确认队列
- `permission_cancel` → 从队列移除
- `stream/error/done` → 转为系统消息显示（含 role + IP 标签）

### usePipeRouter（输入路由）

`src/hooks/usePipeRouter.ts`（130 行）

提供 `routeToSelectedPipes(input): boolean`。读取 `selectedPipes` + `routeMode`，逐个发送到已连接目标。通知显示 `[role] hostname/ip`（LAN peer）或 `[role]`（本机）。

---

## Registry 并行探测

`src/utils/pipeRegistry.ts`

### getAliveSubs()

```typescript
export async function getAliveSubs(): Promise<PipeRegistrySub[]> {
  const registry = await readRegistry()
  const results = await Promise.all(
    registry.subs.map(sub =>
      isPipeAlive(sub.pipeName, 1000).then(alive => alive ? sub : null)
    )
  )
  return results.filter(Boolean)
}
```

### cleanupStaleEntries()

两阶段：
1. **无锁并行探测**：`Promise.all` 探测 main + 所有 subs
2. **短暂持锁写入**：`acquireLock()` → 重新读取 → 应用变更 → 写入 → `releaseLock()`

持锁时间从 N 秒降至 ~10ms。

### getMachineId()

Windows/macOS 使用 `execFile`（异步），不阻塞主线程。结果缓存，仅首次调用执行。

---

## NDJSON 协议

### 消息类型

| 类型 | 方向 | 数据 |
|------|------|------|
| `ping` / `pong` | 双向 | 无 |
| `attach_request` | M→S | `meta: { machineId }` |
| `attach_accept` / `attach_reject` | S→M | `data: reason` |
| `detach` | M→S | 无 |
| `prompt` | M→S | `data: prompt_text` |
| `prompt_ack` | S→M | `data: 'accepted'` |
| `stream` | S→M | `data: partial_text` |
| `done` | S→M | 无 |
| `error` | 双向 | `data: error_message` |
| `permission_request` | S→M | `data: JSON(PipePermissionRequestPayload)` |
| `permission_response` | M→S | `data: JSON(PipePermissionResponsePayload)` |
| `permission_cancel` | M→S | `data: JSON({ requestId, reason })` |

### 帧格式

每行一个 JSON 对象，`\n` 分隔：
```
{"type":"ping","from":"cli-abc","ts":"2026-04-11T00:00:00.000Z"}\n
{"type":"prompt","data":"检查 git status","from":"cli-abc"}\n
```

---

## 跨机器 Attach 流程

```
CLI-B (192.168.50.27) 心跳循环
  → beacon.getPeers() 发现 CLI-A (192.168.50.22)
  → connectToPipe(pName, myName, 3000, { host: '192.168.50.22', port: 58853 })
  → PipeClient.connectTcp() → net.createConnection({ host, port })
  → client.send({ type: 'attach_request', meta: { machineId } })
  → CLI-A 收到：
      isLanPeer = (msg.meta.machineId !== myMachineId) → true
      → 不检查 role，直接 reply({ type: 'attach_accept' })
      → setPipeRelay(socket.write)
  → CLI-B 收到 attach_accept
  → addSlaveClient(pName, client)
  → store.setState: role='master', slaves[pName] = { status: 'idle' }
```

关键：跨机器 attach 不要求对方是 sub 角色。通过 `machineId` 区分 LAN peer。

---

## SendMessageTool TCP 支持

`src/tools/SendMessageTool/SendMessageTool.ts`

- `to` 字段支持 `tcp:host:port` 格式
- `checkPermissions`：`tcp:` scheme 返回 `behavior: 'ask'`，`classifierApprovable: false`
- `call()`：创建临时 `PipeClient` → connect → send → disconnect

---

## 测试

| 文件 | 测试数 | 覆盖 |
|------|--------|------|
| `lanBeacon.test.ts` | 7 | socket 初始化、announce、peer 发现/过滤/清理 |
| `peerAddress.test.ts` | 8 | scheme 解析、parseTcpTarget、端口范围验证 |
| `pipePermissionRelay.test.ts` | 2 | setPipeRelay singleton、权限请求/响应 |
| `pipeTransport.test.ts` | 2 | UDS 基础行为 |
| `useMasterMonitor.test.ts` | 5 | slave 注册/移除、事件发射 |

全量：2190 pass / 0 fail

---

## 已知限制

1. **TCP 无认证** — 同 LAN 内知道端口号即可连接
2. **Beacon 明文广播** — IP/hostname/machineId 未 hash
3. **单网卡选择** — `getLocalIp()` 返回首个非内部 IPv4，可能选到 VPN
4. **端口随机** — 每次启动不同端口，依赖 beacon 发现
5. **SendMessageTool 每次创建新连接** — 未复用已有 slave client

## 后续改进方向

1. HMAC-SHA256 TCP 握手认证
2. machineId hash 后再广播
3. 多网卡选择（优先 RFC 1918 地址）
4. 固定端口范围配置
5. TLS 加密传输
6. SendMessageTool 复用已连接的 slave client

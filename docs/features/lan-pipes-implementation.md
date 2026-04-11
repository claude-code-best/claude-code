# LAN Pipes 实现文档

## 1. 概述

### 1.1 目标

在现有 UDS (Unix Domain Socket) 本地 Pipe 通讯系统基础上，增加 **TCP 传输层** 和 **UDP Multicast 发现机制**，使同一局域网内不同机器上的 Claude Code CLI 实例可以：

1. **自动发现** — 通过 UDP multicast 零配置发现 LAN 内的其他实例
2. **TCP 连接** — 通过 TCP 建立跨机器的双向 NDJSON 管道
3. **复用现有协议** — attach/detach/prompt/stream 等消息类型无需修改

### 1.2 设计原则

- **向后兼容**：所有 LAN 功能通过 `feature('LAN_PIPES')` 门控，不影响现有 UDS 功能
- **双模式共存**：PipeServer 同时监听 UDS 和 TCP，PipeClient 根据参数自动选择连接模式
- **本地优先**：本地 registry 条目优先于 LAN beacon 发现的条目
- **安全保守**：TCP 连接需用户显式同意，multicast TTL=1 不跨路由器

### 1.3 架构总览

```
Machine A (192.168.1.10)                Machine B (192.168.1.20)
┌───────────────────────────┐           ┌───────────────────────────┐
│ PipeServer                │           │ PipeServer                │
│   UDS: cli-abc.sock       │           │   UDS: cli-def.sock       │
│   TCP: 0.0.0.0:<random>   │◄──TCP───►│   TCP: 0.0.0.0:<random>   │
├───────────────────────────┤           ├───────────────────────────┤
│ LanBeacon                 │           │ LanBeacon                 │
│   UDP multicast            │◄──UDP───►│   UDP multicast            │
│   224.0.71.67:7101        │  mcast    │   224.0.71.67:7101        │
├───────────────────────────┤           ├───────────────────────────┤
│ PipeRegistry              │           │ PipeRegistry              │
│   registry.json (local)   │           │   registry.json (local)   │
│   + mergeWithLanPeers()   │           │   + mergeWithLanPeers()   │
└───────────────────────────┘           └───────────────────────────┘
```

---

## 2. Feature Flag

### 2.1 注册

**文件**: `scripts/dev.ts` (L49), `build.ts` (L43)

`LAN_PIPES` 添加到 `DEFAULT_FEATURES` / `DEFAULT_BUILD_FEATURES` 数组中，dev 和 build 默认启用。

也可通过环境变量 `FEATURE_LAN_PIPES=1` 单独启用。

### 2.2 使用约束

Bun 的 `feature()` 只能在 `if` 语句或三元条件中直接使用（编译时常量），不能赋值给变量。所有使用点均遵循此约束。

---

## 3. 核心变更详情

### 3.1 PipeServer TCP 扩展

**文件**: `src/utils/pipeTransport.ts`

#### 新增类型

```typescript
export type PipeTransportMode = 'uds' | 'tcp'
export type TcpEndpoint = { host: string; port: number }
export type PipeServerOptions = {
  enableTcp?: boolean
  tcpPort?: number  // 0 = 随机端口
}
```

#### PipeServer 类变更

| 成员 | 变更类型 | 说明 |
|------|----------|------|
| `tcpServer: Server \| null` | 新增字段 | TCP net.Server 实例 |
| `_tcpAddress: TcpEndpoint \| null` | 新增字段 | TCP 监听地址 |
| `tcpAddress` getter | 新增 | 公开 TCP 端口信息 |
| `setupSocket(socket)` | 重构提取 | 从 `start()` 中提取，UDS 和 TCP 共用 |
| `start(options?)` | 修改签名 | 新增可选 `PipeServerOptions` 参数 |
| `startTcpServer(port)` | 新增私有方法 | 启动 TCP 监听 |
| `close()` | 修改 | 增加 TCP server 关闭逻辑 |

**关键设计决策**：`setupSocket()` 方法被提取为共享逻辑，使 UDS 和 TCP 的 socket 处理完全一致。两种传输模式共享同一组 `clients: Set<Socket>` 和 `handlers`，对上层代码完全透明。

#### 代码路径

```
start(options?)
  ├── ensurePipesDir()
  ├── 清理 stale socket (Unix)
  ├── createServer() → UDS 监听 (现有逻辑)
  │     └── setupSocket() ← 提取的共享逻辑
  └── if options.enableTcp
        └── startTcpServer(port)
              ├── createServer() → TCP 监听 0.0.0.0
              │     └── setupSocket() ← 同一个方法
              └── 记录 _tcpAddress
```

### 3.2 PipeClient TCP 扩展

**文件**: `src/utils/pipeTransport.ts`

#### PipeClient 类变更

| 成员 | 变更类型 | 说明 |
|------|----------|------|
| `tcpEndpoint: TcpEndpoint \| null` | 新增字段 | TCP 连接目标 |
| `constructor(target, sender?, tcpEndpoint?)` | 修改签名 | 新增可选 TCP endpoint |
| `connect(timeout)` | 修改 | 根据 tcpEndpoint 分派 |
| `connectTcp(timeout)` | 新增私有方法 | TCP 连接实现 |
| `connectUds(timeout)` | 重构提取 | 原 `connect()` 的 UDS 逻辑 |

**关键设计决策**：TCP 连接不需要等待文件存在（UDS 的 `access()` 轮询），直接建立 TCP 连接。超时机制相同。

### 3.3 工厂函数更新

```typescript
// 新签名
export async function createPipeServer(
  name: string,
  options?: PipeServerOptions,   // 新增
): Promise<PipeServer>

export async function connectToPipe(
  targetName: string,
  senderName?: string,
  timeoutMs?: number,
  tcpEndpoint?: TcpEndpoint,     // 新增
): Promise<PipeClient>
```

---

### 3.4 LAN Beacon — UDP Multicast 发现

**文件**: `src/utils/lanBeacon.ts` (新文件，~170 行)

#### 协议参数

| 参数 | 值 | 说明 |
|------|-----|------|
| Multicast 组 | `224.0.71.67` | "CC" = Claude Code 的 ASCII 对应 |
| 端口 | `7101` | 固定 UDP 端口 |
| 广播间隔 | `3000ms` | 3 秒一次 announce |
| Peer 超时 | `15000ms` | 15 秒无 announce 视为 lost |
| TTL | `1` | 仅链路本地，不跨路由器 |

#### Announce 包格式

```typescript
type LanAnnounce = {
  proto: 'claude-pipe-v1'     // 协议标识符（用于过滤非本协议 UDP 包）
  pipeName: string            // e.g. "cli-abc12345"
  machineId: string           // OS-level 稳定指纹
  hostname: string            // 主机名
  ip: string                  // 发送端本地 IPv4
  tcpPort: number             // TCP PipeServer 端口
  role: 'main' | 'sub'       // 当前角色
  ts: number                  // unix ms 时间戳
}
```

#### LanBeacon 类 API

```typescript
class LanBeacon extends EventEmitter {
  constructor(announce: Omit<LanAnnounce, 'proto' | 'ts'>)
  start(): void                              // 开始广播 + 监听
  stop(): void                               // 停止并释放资源
  getPeers(): Map<string, LanAnnounce>       // 当前已知 peers
  updateAnnounce(partial): void              // 更新自身 announce 数据

  // Events
  on('peer-discovered', (peer: LanAnnounce) => void)
  on('peer-lost', (pipeName: string) => void)
}
```

#### 内部行为

1. **启动**：`createSocket({ type: 'udp4', reuseAddr: true })` → `bind(7101)` → `addMembership('224.0.71.67')` → `setMulticastTTL(1)`
2. **广播**：`setInterval(sendAnnounce, 3000)` + 启动时立即发一次
3. **接收**：`socket.on('message')` → JSON.parse → 过滤 `proto !== 'claude-pipe-v1'` 和自身 → 更新 peers Map → 触发 `peer-discovered` 事件
4. **清理**：`setInterval(cleanupStalePeers, 7500)` — 超过 15 秒未收到 announce 的 peer 从 Map 移除，触发 `peer-lost` 事件
5. **停止**：清除所有 timer → `dropMembership` → `socket.close()` → 清空 peers

#### 错误处理

所有 socket/网络错误均为 **non-fatal**（logError 但不 throw）。multicast 在某些网络环境可能不支持，这不应阻止 CLI 正常运行。

---

### 3.5 Registry 扩展

**文件**: `src/utils/pipeRegistry.ts`

#### 类型变更

```typescript
export interface PipeRegistryEntry {
  // ... 现有字段 ...
  tcpPort?: number      // 新增：TCP 监听端口
  lanVisible?: boolean  // 新增：是否参与 LAN 广播
}
```

#### 新增函数

```typescript
export type MergedPipeEntry = {
  id: string
  pipeName: string
  role: string
  machineId: string
  ip: string
  hostname: string
  alive: boolean
  source: 'local' | 'lan'       // 来源标识
  tcpEndpoint?: TcpEndpoint     // LAN peer 的 TCP 端点
}

export function mergeWithLanPeers(
  registry: PipeRegistry,
  lanPeers: Map<string, LanAnnounce>,
): MergedPipeEntry[]
```

**合并逻辑**：
1. 先添加本地 registry 的 main 和所有 subs（`source: 'local'`）
2. 遍历 LAN peers，跳过已在本地 registry 中存在的 pipeName
3. 剩余的 LAN peers 作为 `source: 'lan'` 条目添加

---

### 3.6 Peer Address 扩展

**文件**: `src/utils/peerAddress.ts`

#### parseAddress 变更

```typescript
// 之前
export function parseAddress(to: string): {
  scheme: 'uds' | 'bridge' | 'other'
  target: string
}

// 之后
export function parseAddress(to: string): {
  scheme: 'uds' | 'bridge' | 'tcp' | 'other'  // 新增 'tcp'
  target: string
}
```

新增 `tcp:` 前缀解析：`tcp:192.168.1.20:7100` → `{ scheme: 'tcp', target: '192.168.1.20:7100' }`

#### 新增 parseTcpTarget

```typescript
export function parseTcpTarget(
  target: string,
): { host: string; port: number } | null
```

解析 `host:port` 字符串，正则 `^([^:]+):(\d+)$`。

---

### 3.7 REPL Bootstrap 集成

**文件**: `src/screens/REPL.tsx`

#### 启动阶段 (L5165-5200)

在现有 `createPipeServer(pipeName)` 调用处：

```typescript
// 根据 LAN_PIPES flag 决定是否启用 TCP
const server = await createPipeServer(
  pipeName,
  feature('LAN_PIPES') ? { enableTcp: true, tcpPort: 0 } : undefined
);

// 启动 LAN beacon
if (feature('LAN_PIPES') && server.tcpAddress) {
  const { LanBeacon } = require('../utils/lanBeacon.js');
  lanBeaconInstance = new LanBeacon({
    pipeName, machineId, hostname, ip, tcpPort: server.tcpAddress.port, role
  });
  lanBeaconInstance.start();

  // Store beacon in module-level singleton (not on Zustand state)
  const { setLanBeacon } = require('../utils/lanBeacon.js');
  setLanBeacon(lanBeaconInstance);

  // 注册 entry 时附带 tcpPort
  await registerAsMain({ ...entry, tcpPort: server.tcpAddress.port, lanVisible: true });
}
```

#### Heartbeat ��段

在 main heartbeat 循环中：

1. `refreshDiscoveredPipes(aliveSubs)` 同时包含本地 subs 和 LAN beacon peers
2. auto-attach 循环同时遍历本地 subs 和 LAN peers（LAN peers 通过 TCP endpoint 连接）
3. cleanup 时检查 LAN beacon peers 列表，避免误删 LAN 连接

```typescript
// auto-attach 统一目标列表：本地 subs + LAN peers
const attachTargets = [...aliveSubs.map(s => ({ pipeName: s.pipeName }))];
if (feature('LAN_PIPES')) {
  const beacon = getLanBeacon();
  for (const [name, peer] of beacon.getPeers()) {
    attachTargets.push({ pipeName: name, tcpEndpoint: { host: peer.ip, port: peer.tcpPort } });
  }
}
```

#### Cleanup 阶段

```typescript
// 停止 LAN beacon
const { getLanBeacon, setLanBeacon } = require('../utils/lanBeacon.js');
const beacon = getLanBeacon();
if (beacon) {
  try { beacon.stop(); } catch {}
  setLanBeacon(null);
}
```

**Beacon 存储方案**：使用 `lanBeacon.ts` 中的 module-level singleton（`getLanBeacon()`/`setLanBeacon()`），不挂在 Zustand store state 上，避免 `setState` 展开时丢失引用。

---

### 3.8 /pipes 命令 LAN 显示

**文件**: `src/commands/pipes/pipes.ts`

在现有 registry 显示之后，如果 `feature('LAN_PIPES')` 启用：

1. 通过 `getLanBeacon()` 获取 LAN peers
2. 调用 `mergeWithLanPeers()` 合并
3. 过滤 `source === 'lan'` 的条目
4. 显示格式：`☐ [role] pipeName  hostname/ip  tcp:host:port  [LAN]`

---

### 3.9 /attach 命令 TCP 支持

**文件**: `src/commands/attach/attach.ts`

在连接之前，如果 `feature('LAN_PIPES')` 启用：

1. 在 `discoveredPipes` 中查找目标 pipe
2. 通过 `_lanBeacon.getPeers()` 检查是否为 LAN peer
3. 如果是，构造 `TcpEndpoint` 传给 `connectToPipe()`
4. 错误消息中包含 TCP 端点信息便于诊断

---

### 3.10 SendMessageTool TCP 支持

**文件**: `src/tools/SendMessageTool/SendMessageTool.ts`

#### inputSchema 描述更新

当 `LAN_PIPES` 启用时，`to` 字段描述追加 `, or "tcp:<host>:<port>" for a LAN peer`。

#### checkPermissions

```typescript
if (feature('LAN_PIPES') && parseAddress(input.to).scheme === 'tcp') {
  return {
    behavior: 'ask',
    message: `Send a message to LAN peer ${input.to}?...`,
    decisionReason: {
      type: 'safetyCheck',
      reason: 'Cross-machine LAN message requires explicit user consent',
      classifierApprovable: false,
    },
  }
}
```

**安全设计**：`classifierApprovable: false` 确保自动模式不会跳过用户确认。

#### validateInput

新增 `tcp:` scheme 验证分支（与 `uds:` 类似，仅允许 plain text 消息）。

#### call()

```typescript
if (addr.scheme === 'tcp' && feature('LAN_PIPES')) {
  const ep = parseTcpTarget(addr.target);
  const client = new PipeClient(input.to, `send-${process.pid}`, ep);
  await client.connect(5000);
  client.send({ type: 'chat', data: input.message });
  client.disconnect();
  return { data: { success: true, message: `... → TCP ${ep.host}:${ep.port}` } };
}
```

---

## 4. 数据流

### 4.1 LAN 发现流程

```
CLI-A 启动
  → PipeServer.start({ enableTcp: true, tcpPort: 0 })
  → TCP server 监听 0.0.0.0:随机端口
  → LanBeacon.start()
  → 每 3s 广播 UDP announce (pipeName, ip, tcpPort, role, machineId)

CLI-B 启动 (另一台机器)
  → 同上
  → LanBeacon 收到 CLI-A 的 announce
  → peer-discovered 事件
  → Heartbeat 循环合并 LAN peers 到 discoveredPipes

用户在 CLI-B 执行 /pipes
  → 显示 CLI-A 条目，标记 [LAN]
```

### 4.2 跨机器 Attach 流程

```
CLI-B 执行 /attach cli-abc12345
  → feature('LAN_PIPES') → 查找 discoveredPipes → 找到 LAN peer
  → _lanBeacon.getPeers() → 获取 { ip: '192.168.1.10', tcpPort: 7100 }
  → connectToPipe(name, myName, undefined, { host: '192.168.1.10', port: 7100 })
  → PipeClient.connectTcp() → net.createConnection({ host, port })
  → client.send({ type: 'attach_request' })
  → 等待 attach_accept / attach_reject
  → 成功：注册 slave client，切换 master 角色
```

### 4.3 跨机器消息发送

```
用户或 AI 使用 SendMessageTool
  → to: "tcp:192.168.1.20:7102"
  → checkPermissions → behavior: 'ask' → 用户确认
  → parseTcpTarget('192.168.1.20:7102') → { host, port }
  → new PipeClient(to, sender, { host, port })
  → client.connect(5000)
  → client.send({ type: 'chat', data: message })
  → client.disconnect()
```

---

## 5. 测试

### 5.1 新增测试文件

| 文件 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `src/utils/__tests__/lanBeacon.test.ts` | 7 | socket 初始化、announce 发送、peer 发现、自身过滤、协议过滤、role 更新 |
| `src/utils/__tests__/peerAddress.test.ts` | 8 | uds/bridge/tcp/other scheme 解析、parseTcpTarget 正确/异常 |

### 5.2 测试策略

- **lanBeacon.test.ts**：mock dgram 模块，验证 beacon 的发送/接收/清理逻辑
- **peerAddress.test.ts**：纯函数测试，无外部依赖
- **现有 pipeTransport.test.ts**：2 个现有测试继续通过（TCP 扩展不改变 UDS 行为）

### 5.3 测试结果

```
全量测试：2190 pass / 0 fail / 130 files / 4.27s
```

---

## 6. 变更文件清单

| 文件 | 操作 | 变更行数(约) |
|------|------|-------------|
| `scripts/dev.ts` | 修改 | +1 (feature flag) |
| `build.ts` | 修改 | +1 (feature flag) |
| `src/utils/pipeTransport.ts` | 修改 | +120 (TCP 扩展) |
| `src/utils/lanBeacon.ts` | **新增** | ~170 (UDP beacon) |
| `src/utils/pipeRegistry.ts` | 修改 | +80 (类型 + merge 函数) |
| `src/utils/peerAddress.ts` | 修改 | +12 (tcp scheme + parseTcpTarget) |
| `src/screens/REPL.tsx` | 修改 | +45 (bootstrap + heartbeat + cleanup) |
| `src/commands/pipes/pipes.ts` | 修改 | +25 (LAN peers 显示) |
| `src/commands/attach/attach.ts` | 修改 | +25 (TCP endpoint 解析) |
| `src/tools/SendMessageTool/SendMessageTool.ts` | 修改 | +45 (tcp scheme 全链路) |
| `src/utils/__tests__/lanBeacon.test.ts` | **新增** | ~140 (7 tests) |
| `src/utils/__tests__/peerAddress.test.ts` | **新增** | ~60 (8 tests) |
| `docs/features/lan-pipes.md` | **新增** | ~90 (用户文档) |

---

## 7. 已知限制和后续改进

### 7.1 当前限制

1. **无 TCP 认证**：TCP 连接无握手认证，同一局域网内任何知道端口号的进程都能连接
2. **beacon ref 通过 `(state as any)._lanBeacon` 传递**：这是一个 pragmatic hack，因为 AppState 类型由 decompiled 代码定义，修改类型的成本过高
3. **multicast 依赖网络环境**：部分企业网络、AP 隔离的 WiFi 可能不支持 multicast
4. **TCP 端口随机**：每次启动分配不同端口，需依赖 beacon 发现

### 7.2 后续改进方向

1. **HMAC-SHA256 认证**：首次 TCP 握手交换 machineId + challenge token
2. **heartbeat 中 TCP auto-attach LAN peers**：目前 heartbeat 只 auto-attach 本地 registry 的 subs，LAN peers 需手动 /attach
3. **固定端口范围配置**：允许用户配置 TCP 端口范围，便于防火墙规则
4. **mDNS/DNS-SD 作为 beacon 替代**：在 multicast 受限的环境提供更可靠的发现
5. **加密传输**：TLS over TCP，确保消息不被中间人窃听

---

## 8. 防火墙要求

| 协议 | 端口 | 方向 | 用途 |
|------|------|------|------|
| UDP | 7101 | IN + OUT | Multicast beacon 发现 |
| TCP | 动态 (0) | IN | PipeServer TCP 监听 |

### Windows

```powershell
netsh advfirewall firewall add rule name="Claude LAN Beacon" dir=in action=allow protocol=UDP localport=7101
netsh advfirewall firewall add rule name="Claude LAN Pipes" dir=in action=allow program="<bun路径>" enable=yes
```

### macOS

首次运行时系统弹窗允许即可。

### Linux

```bash
sudo firewall-cmd --add-port=7101/udp
# TCP 端口随机，建议放行 bun 进程
```

# Feature: 20260710_F001 - terminal-panel（远程终端面板 v2 设计）

> v1 方案经外部评审定位为"可行性方案而非协议规格"（方向 8/10，技术完备度 5/10）。
> 本 v2 按评审意见重写，定位改为：**为 RCS 新增一套远程 Shell 安全与同步协议**，UI 是协议的消费者。
> 评审的全部代码级论断已逐条核实，见下节；两处实际比评审描述更严重。

## 一、已核实的现状约束（代码依据）

| # | 现状 | 位置 | 对本设计的约束 |
|---|------|------|----------------|
| 1 | 子进程 WS **每次重连从 seq 0 重放全部缓冲事件**（双向，ring 上限 5000 条） | `packages/remote-control-server/src/transport/ws-handler.ts:59` | 比评审"可能重放"更严重：入 bus 的原始输入**必然**被重放。终端数据禁止进入 EventBus |
| 2 | Web 历史接口同样 `getEventsSince(0)`，bus 内全部事件对所有 owner 可见 | `packages/remote-control-server/src/routes/web/sessions.ts:108` | snapshot / 输出若入 bus 会泄露给非请求者 |
| 3 | `/web/bind` **无任何鉴权中间件**，且 `storeBindSession` 是 `Set.add`——知道 sessionId 即可把自己**追加**为共同 owner，原 owner 无感知 | `routes/web/auth.ts:11`、`store.ts:294` | 比评审"绑定已知 session"更严重：是静默共同持有。终端 flag 必须在 bind 收紧前保持关闭 |
| 4 | `uuidAuth` 信任客户端自报 UUID | `src/auth/middleware.ts:159` | 终端路由不得复用 uuidAuth |
| 5 | `normalizePayload` 把自定义 payload 包成 `{content, raw}` | `src/services/transport.ts:49` | 复用普通事件通道必然被改写，需独立通道 |
| 6 | StructuredIO 只放行 `user/control_request/assistant/system`，未知 type 直接丢弃 | `src/cli/structuredIO.ts:453` | 终端消息需双端白名单 + 能力协商，否则静默失效 |
| 7 | Bash 实际执行经过 `shouldUseSandbox(input)` | `packages/builtin-tools/src/tools/BashTool/BashTool.tsx:1048` | 直接 spawn PTY 会绕过 sandbox；PTY 必须走同一 sandbox 决策 |
| 8 | Web 控制路由把请求 body 前 200 字符写日志 | `routes/web/control.ts:67` | 终端 payload 必须整类进入日志 redact 名单 |
| 9 | 本机 Bun 1.3.8 已验证存在 `Bun.Terminal`（function）；node-pty 目前不在任何 package.json 中 | `bun -e` 实测 | PtyBackend 抽象：Bun 构建用 Bun.Terminal，Node 产物用 node-pty（构建产物需 bun/node 双运行时可用） |

## 二、设计原则

1. **终端数据永不进入 EventBus / history / 正文日志。** 独立 TerminalChannel，自己的 seq、自己的缓冲策略、自己的鉴权。
2. **原始按键只属于用户。** 模型没有 raw `TerminalWrite`；模型只有命令级 API（`TerminalRun`），复用 `bashPermissions.ts` 权限管道 + `shouldUseSandbox` 决策。
3. **一切以 `(runtime_epoch, terminal_instance_id, seq)` 定位。** epoch 变化 = 终端已死，UI 如实展示，不伪装恢复。
4. **完成语义靠命令 framing**（OSC 133 shell integration 或 nonce marker + exit code），`idle` 更名为 `quiet`，仅作观察信号，永不返回 `completed`。
5. **PTY 后端不可用 = 显式 unsupported。** 不做 `script -qF` 静默降级（平台参数、resize、信号、前台进程组语义均不等价）。

## 三、terminal.v1 协议

### 3.1 消息封装与通道

- **子进程 ↔ RCS**：新增消息 type `terminal_channel`，StructuredIO 双端白名单加入该 type；连接建立时通过 capabilities 协商 `terminal.v1`，未协商则功能不可见（兼容旧版 CLI/RCS 任意组合）。不复用 `publishSessionEvent`。
- **RCS ↔ 浏览器**：独立 WS 端点 `/web/sessions/:id/terminals/:tid/stream`，不与聊天 SSE 混流。输入走同一 WS（禁止逐键 POST）。
- **envelope 字段**：`v`（协议版本）、`runtime_epoch`、`terminal_instance_id`、`seq`、`client_id`、`request_id`、`kind`、`data`。

### 3.2 消息类型

| 方向 | kind | 语义 |
|------|------|------|
| client→server | `open` / `close` | 新建/关闭终端（对应 Web 按钮，评审指出 v1 遗漏） |
| client→server | `input` | 用户原始按键。at-most-once，不落任何缓冲，失败即丢弃 |
| client→server | `resize` | 仅 lease 持有者可发 |
| client→server | `snapshot_request` | 请求全量屏幕状态 |
| client→server | `signal` | SIGINT 等 |
| server→client | `output` | 增量输出帧，seq 单调递增 |
| server→client | `snapshot` | **定向 unicast 回请求者**，不广播 |
| server→client | `exit` | 命令/终端退出，带 exit code |
| server→client | `lease_state` | 当前控制者变更广播 |
| server→client | `overrun` | 服务端丢帧，客户端必须 snapshot resync |
| server→client | `epoch_changed` | worker 重启，终端已死 |

### 3.3 不可重放 / 不可记录

- `input`：无重试、无缓冲、无持久化；服务端 per-connection 单调 nonce 拒绝重复帧；WS 断开期间的按键直接丢弃并在 UI 提示。
- 日志：`terminal_*` 全类型进入 logger redact 名单；控制/路由日志只允许记录 `kind + byteLength`，禁止记录 data（现有 `control.ts:67` 的 200 字符日志模式不得沿用）。
- history：Web 历史接口与 WS replay 天然不含终端数据（不经过 EventBus）。

### 3.4 鉴权

- 终端路由使用 `sessionIngressAuth` 同级鉴权（API key 或 JWT），**不接受 uuidAuth**。
- 每个 `(client, terminal)` 颁发短时 capability token（TTL 分钟级、可吊销），WS 升级时校验。
- **前置依赖**：`/web/bind` 收紧为真实身份或服务端签发的会话凭证。在此之前 `TERMINAL_PANEL` feature flag 默认关闭，且文档标注仅限严格 loopback 部署。

### 3.5 命令完成语义

- `TerminalRun(command)` 用 shell integration framing 包裹：优先 OSC 133（A/B/C/D 序列），fallback 为注入 nonce echo marker；返回 `{command_id, exit_code, output_ref}`。
- `TerminalStatus` 返回 `{state: running | quiet | exited, quiet_ms}`；`quiet` 文档化为"仅表示近期无输出，不代表完成"（`sleep`、编译、密码提示均会 quiet；持续刷日志永不 quiet）。

### 3.6 屏幕状态与恢复

- 服务端持 headless VT 状态机（评估 `@xterm/headless`；否则自写 VT100 子集）作为唯一权威屏幕状态。
- 重连恢复 = `snapshot`（序列化屏幕 + 光标 + 模式位 + alternate screen 标记）+ 之后的增量 `output` seq。**不重放原始 ANSI 字节流**（避免从 UTF-8/escape 序列中间开始、alternate screen 与历史 resize 不可恢复的问题）。
- scrollback 上限按 VT 行数计，替代 v1 的 512KB 原始字节 ring buffer。

### 3.7 背压

- 输入：浏览器本地合批（≤16ms 或 64B）后经 WS 发送。
- 输出：PTY→RCS 按 30ms/8KB 合帧；RCS→client 每连接 bounded queue（256KB），溢出丢弃中间帧并发 `overrun`，客户端收到后强制 snapshot resync。
- 配额：每 session ≤3 终端；慢消费者只影响自身连接，不阻塞聊天通道。

### 3.8 生命周期（诚实版）

- 持久性承诺 = **worker 进程存活期内跨轮持久**。PTY 挂在 worker 内 `PtyRegistry`（模块级 singleton）。
- worker 退出/升级/迁移 → 广播 `epoch_changed`，终端标记 dead，UI 显示"运行时已重启，终端已结束"。不做跨进程恢复（列入 v2 之后）。
- 状态栏 `cwd`：仅通过 OSC 7 shell integration 获取；未启用 shell integration 时不显示（不猜测）。

### 3.9 模型工具面

- v1 工具集：`TerminalRun`、`TerminalRead`（读 VT 屏幕/输出片段）、`TerminalWait`（等 quiet/exit，带 timeout）、`TerminalInterrupt`、`TerminalList`。**无 raw write**。
- `TerminalRun` 权限 = Bash 同管道（`bashPermissions.ts`）+ 同 sandbox 决策；PTY spawn 使用与 `exec()` 相同的 sandbox 包装。
- 模型命令进入串行队列；队列仅在模型持有 lease 时执行。

### 3.10 控制权 lease

- 每终端单 writer lease：user client 或 model queue 二选一持有；resize owner = lease 持有者；其余客户端只读。
- 用户"接管"按钮：立即抢占 lease、清空模型队列、`lease_state` 广播。杜绝 `git sta` + `ls\r` 交叉写入。

## 四、PtyBackend 抽象

```ts
interface PtyBackend {
  spawn(opts: { cmd: string[]; cwd: string; env: Env; cols: number; rows: number; sandbox: SandboxProfile }): PtyHandle
}
// BunTerminalBackend  — Bun 运行时（Bun.Terminal，Bun ≥1.3.8 已实测存在）
// NodePtyBackend     — Node 运行时产物（node-pty，新增 optionalDependency）
// UnsupportedBackend — 均不可用时：终端入口显示 unsupported + 原因，不降级
```

## 五、里程碑（采纳评审排序）

| 阶段 | 内容 | 估时 |
|------|------|------|
| M0 技术验证 | Bun.Terminal spawn/resize/Ctrl-C/EOF/退出清理；sandbox 包装下的 PTY 行为；node 产物 + node-pty 矩阵；`@xterm/headless` 可行性 | 1–3 天（Bun.Terminal 存在性已验证） |
| M1 内部 MVP | 单终端、单浏览器、本地 shell、固定 sandbox、user-only input、五个模型工具、VT snapshot 恢复；`TERMINAL_PANEL` flag 默认关 | 2–3 周 |
| M2 可用版 | 多终端、lease、完整背压 + overrun resync、CCR v2 适配、权限与日志治理验收 | +3–5 周 |
| M3 生产级 | 跨平台矩阵、SSH（显式授权策略）、资源配额、故障注入测试 | +3–4 周 |

## 六、v1 非目标

SSH 目标机、多浏览器并发写、模型 raw 按键、跨 worker 进程持久化、`script` 降级模式。

## 七、安全验收清单

1. 日志审计：任何 terminal data 不出现在 RC-DEBUG 日志、`/web/sessions/:id`（history）响应、WS replay 中。
2. 重连风暴：反复 kill 浏览器 WS / worker 任一端，验证零输入重放（尤其回车与 Ctrl-C）。
3. 鉴权旁路：仅持自报 UUID 的客户端访问全部终端路由 → 401/403。
4. sandbox 等价性：`TerminalRun` 与 `BashTool` 在同一 sandbox 决策下行为一致（文件写/网络探针对照）。
5. VT 恢复正确性：`vim`、`top`、进度条场景断线重连后屏幕一致。
6. 背压：`yes`/`cat /dev/urandom | base64` 刷屏时聊天通道延迟不劣化，客户端收到 `overrun` 后能 resync。

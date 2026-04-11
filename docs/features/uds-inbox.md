# UDS_INBOX / pipes

## 概述

`UDS_INBOX` 现在不是一个“空壳 flag”，而是一套已经落地的本机 IPC 能力。但它同时承载了两层不同目标，必须拆开理解：

1. **UDS peer messaging**
   - 面向任意 Claude Code 进程。
   - 使用 `src/utils/udsMessaging.ts` 和 `src/utils/udsClient.ts`。
   - 对外入口是 `/peers` 和 `SendMessageTool` 的 `uds:<socket-path>` 地址。
2. **pipes control plane**
   - 面向交互式 REPL 会话之间的主从协作。
   - 使用 `src/utils/pipeTransport.ts`、`src/utils/pipeRegistry.ts` 和 `src/screens/REPL.tsx` 中的内联 bootstrap。
   - 对外入口是 `/pipes`、`/attach`、`/detach`、`/send`、`/pipe-status`、`/history`、`/claim-main`。

这两层都依赖本机 socket，但职责不同。`/peers` 解决“找到其他会话并发消息”，`/pipes` 解决“把一个 REPL 变成另一个 REPL 的受控 worker”。

## 为什么要有单独的 `pipes`

单独的 `pipes` 层有三个实际理由：

1. **命名与角色模型不同**
   - UDS peer 层按 `messagingSocketPath` 寻址。
   - pipes 层按 `cli-xxxxxxxx` 会话名、`main/sub/master/slave` 角色和 `machineId` 注册表工作。
2. **交互语义不同**
   - peer 层是通用消息投递。
   - pipes 层需要 attach、detach、历史收集、选择性广播、状态栏和 REPL 快捷键。
3. **UI 集成不同**
   - peer 层主要服务工具调用。
   - pipes 层直接影响 REPL 提交路径和 PromptInput 页脚。

如果把两者硬合并，`SendMessageTool` 的通用寻址和 REPL 的主从控制会互相污染，命令语义也会变得混乱。

## 当前通信模型

### 1. UDS peer messaging

- 服务端：`src/utils/udsMessaging.ts`
- 客户端：`src/utils/udsClient.ts`
- 发现方式：读取 `~/.claude/sessions/*.json`
- 地址方式：`uds:<socket-path>`
- 传输方式：**本机 Unix socket / Windows named pipe**

这层是真正的“通用收件箱”。

### 2. pipes control plane

- 服务端/客户端：`src/utils/pipeTransport.ts`
- 注册表：`src/utils/pipeRegistry.ts`
- 生效入口：`src/screens/REPL.tsx`
- 发现方式：扫描 `~/.claude/pipes/` + `registry.json`
- 会话名：`cli-${sessionId.slice(0, 8)}`
- 传输方式：**本机 Unix socket / Windows named pipe**

这层是真正的“主从 REPL 协调平面”。

## 关于“局域网通信”的事实

当前实现**不是**真正的局域网传输。

代码里虽然保存了这些字段：

- `localIp`
- `hostname`
- `machineId`
- `mac`

但这些字段当前只用于：

1. 注册表展示
2. main/sub 身份判定
3. `claim-main` 的机器级归属切换
4. 状态输出与排障信息

它们**没有**被用于创建 TCP/WebSocket 连接。真正的传输仍然是 `getPipePath(name)` 返回的本机 socket 路径。

所以目前更准确的描述应该是：

- `pipes` 支持 **本机多实例协作**
- `registry` 带有 **机器身份元数据**
- 但 **尚未实现跨机器局域网 transport**

如果未来要做真局域网版本，至少还需要：

1. TCP/WebSocket transport
2. 认证与会话授权
3. 发现与地址交换
4. 超时、重连和安全边界

## 当前 REPL 行为

当前线上行为由 `src/screens/REPL.tsx` 的内联实现负责：

1. 启动时创建当前 REPL 的 pipe server
2. 通过 `pipeRegistry` 判定 `main` / `sub`
3. 处理 `attach_request` / `detach` / `prompt`
4. 主实例心跳探测并维护 `slaves`
5. `/pipes` 打开状态栏并维护选择器
6. 提交普通消息时，仅向**已连接**的 selected pipes 广播

最近的收敛点：

- 过去遗留了一套未接线的 hook 方案
- 当前已明确以 `REPL.tsx` 内联 bootstrap 为唯一生效实现
- 选中但未连接的 pipe 不再导致本地处理被错误跳过

## 文档与代码对齐约定

后续关于 `UDS_INBOX` / `pipes` 的说明应遵守以下表述：

1. 默认称为“本机 IPC / 本机多实例协作”
2. 不把 `localIp` / `hostname` 元数据表述成已完成的 LAN transport
3. 明确区分 `/peers` 和 `/pipes` 的两层职责
4. 以 `src/screens/REPL.tsx`、`src/utils/pipeTransport.ts`、`src/utils/pipeRegistry.ts` 为事实来源

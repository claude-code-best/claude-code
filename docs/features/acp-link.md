# acp-link — ACP 代理服务器

> 源码目录：`packages/acp-link/`
> PR: #292
> 新增时间：2026-04-18

## 一、功能概述

`acp-link` 是一个 ACP (Agent Client Protocol) 代理服务器，将 WebSocket 客户端桥接到 ACP agent 的 stdio 接口。它让 ACP agent（如 Claude Code）可以通过 WebSocket 远程访问，而不仅限于本地 stdio。

### 核心特性

- **WebSocket → stdio 桥接**：将浏览器/远程客户端的 WebSocket 连接转换为 ACP agent 的 stdin/stdout NDJSON 流
- **会话管理**：创建、加载、恢复、列出、关闭会话
- **权限审批流程**：客户端可远程审批 agent 的工具权限请求
- **RCS 集成**：可与 Remote Control Server (RCS) 连接，将 ACP agent 注册到 RCS 并通过 Web UI 交互
- **HTTPS 支持**：内置自签名证书生成，支持安全连接
- **Token 认证**：自动生成或通过环境变量配置认证 token

## 二、架构

### 独立模式

```
┌──────────────────┐    WebSocket     ┌──────────────────┐    stdio/NDJSON    ┌──────────────┐
│  浏览器/客户端     │ ◄──────────────►│  acp-link        │ ◄────────────────►│  ACP Agent   │
│  (WS Client)     │  ws://host:port  │  (Proxy Server)  │  spawn subprocess │  (Claude等)   │
└──────────────────┘                  └──────────────────┘                    └──────────────┘
```

### RCS 集成模式

```
┌──────────────┐    WebSocket     ┌──────────────────┐    stdio/NDJSON    ┌──────────────┐
│  RCS Web UI  │ ◄──────────────►│  Remote Control  │ ◄─────────────────►│  acp-link    │
│  (/code/*)   │  ACP Relay WS   │  Server (RCS)    │  ACP events        │  + Agent     │
└──────────────┘                  └──────────────────┘                    └──────────────┘
```

### 文件结构

```
packages/acp-link/
├── src/
│   ├── server.ts        # 主服务器：WS 连接管理、会话管理、权限处理、消息桥接
│   ├── rcs-upstream.ts  # RCS 上游客户端：REST 注册 + WS identify 两步流程
│   ├── cert.ts          # TLS 证书生成（自签名）
│   ├── logger.ts        # 日志模块
│   ├── types.ts         # JSON-RPC 和 ACP 协议类型定义
│   ├── cli/
│   │   ├── bin.ts       # CLI 入口
│   │   ├── command.ts   # 命令行参数解析
│   │   ├── app.ts       # 应用启动
│   │   └── context.ts   # 上下文配置
│   └── __tests__/       # 测试（cert, server, types）
├── package.json
└── tsconfig.json
```

## 三、安装与使用

### 基本用法

```bash
# 直接运行（在 monorepo 中）
# 注意：claude 本身不支持 ACP，需要用 ccb-bun --acp 启动 ACP agent
bun packages/acp-link/src/cli/bin.ts ccb-bun -- --acp

# 指定端口和主机
acp-link --port 9000 --host 0.0.0.0 ccb-bun -- --acp

# 启用 HTTPS（自签名证书）
acp-link --https ccb-bun -- --acp

# 调试模式
acp-link --debug ccb-bun -- --acp
```

### CLI 参考

```
USAGE
  acp-link [--port value] [--host value] [--debug] [--no-auth] [--https] <command>...
  acp-link --help
  acp-link --version

FLAGS
       [--port]     Port to listen on                  [default = 9315]
       [--host]     Host to bind to                    [default = localhost]
       [--debug]    Enable debug logging to file
       [--no-auth]  Disable authentication (dangerous)
       [--https]    Enable HTTPS with self-signed cert
    -h  --help      Print help information and exit
    -v  --version   Print version information and exit

ARGUMENTS
  command...  Agent command followed by its arguments (e.g. "ccb-bun -- --acp")
```

## 四、认证

默认启动时自动生成随机 token。客户端连接时不要把 token 放在 URL 中：

```
ws://localhost:9315/ws
```

无法发送 `Authorization` header 的 WebSocket 客户端需要使用
`rcs.auth.<base64url-token>` 子协议传递 token。

配置固定 token：

```bash
ACP_AUTH_TOKEN=my-fixed-token acp-link ccb-bun -- --acp
```

禁用认证（不推荐，仅用于开发）：

```bash
acp-link --no-auth ccb-bun -- --acp
```

## 五、RCS 集成

acp-link 支持将 ACP agent 注册到 Remote Control Server，通过 Web UI 远程操控。

### 连接方式

```bash
# 通过环境变量配置 RCS 连接
ACP_RCS_URL=http://localhost:3000 \
ACP_RCS_TOKEN=sk-rcs-your-key \
acp-link ccb-bun -- --acp
```

### 注册流程（两步）

1. **REST 注册**：通过 `POST /v1/environments/bridge` 向 RCS 注册环境
2. **WS identify**：建立 WebSocket 连接后发送 `identify` 消息（携带 agentId），替代完整 `register`

RCS 的 ACP WebSocket 连接不接受 URL query token。acp-link 会通过
`rcs.auth.<base64url-token>` WebSocket 子协议发送 `ACP_RCS_TOKEN`。

```
acp-link                          RCS
   │                                │
   │── POST /v1/environments/bridge ──►│  (REST 注册)
   │◄── { agentId, sessionId } ───────│
   │                                │
   │── WS connect ─────────────────►│  (WebSocket)
   │── identify { agentId } ────────►│  (WS 标识)
   │◄── identified ─────────────────│
   │                                │
   │── ACP events ─────────────────►│  (双向消息转发)
   │◄── user prompts/permissions ───│
```

## 六、权限模式

### permissionMode 传递链

权限模式通过整条链路传递：Web UI → RCS → acp-link → ACP agent。

支持的权限模式：
- `default` — 每次请求权限确认
- `auto` — 自动判断
- `acceptEdits` — 自动接受编辑
- `plan` — 规划模式
- `dontAsk` — 不询问
- `bypassPermissions` — 绕过权限（需 sandbox 环境）

### fallback 链

当客户端未显式传递 permissionMode 时，使用以下 fallback 链：

```
客户端传值 > config.permissionMode > ACP_PERMISSION_MODE 环境变量
```

示例：

```bash
ACP_PERMISSION_MODE=auto acp-link ccb-bun -- --acp
```

## 七、权限管道（2026-04-18 改进）

### 模式同步

`applySessionMode` 在 agent 切换权限模式时同步 `appState.toolPermissionContext.mode`，确保内部权限上下文与 ACP 客户端状态一致。

### 统一权限流水线

`createAcpCanUseTool` 接入 `hasPermissionsToUseTool` 统一权限流水线，替代原来分散的处理逻辑。支持 `onModeChange` 回调，模式变更时实时同步。

### bypass 检测

`bypassPermissions` 模式增加可用性检测 — 仅在非 root 或 sandbox 环境中允许启用，防止权限绕过的安全风险。

## 八、环境变量

| 变量 | 说明 |
|------|------|
| `ACP_AUTH_TOKEN` | 固定认证 token（默认自动生成） |
| `ACP_PERMISSION_MODE` | 默认权限模式 fallback |
| `ACP_RCS_URL` | RCS 服务器地址（启用 RCS 集成） |
| `ACP_RCS_TOKEN` | RCS API token |

# Remote Control Server 私有化部署指南

本指南说明如何将 Remote Control Server (RCS) 部署到私有环境，并通过 Claude Code CLI 连接使用。

## 架构概览

```
┌──────────────────┐                    ┌──────────────────────┐
│  Claude Code CLI  │ ◄── HTTP/SSE/WS ─►│  Remote Control      │
│  (Bridge Worker)  │     长轮询 + 心跳   │  Server (RCS)        │
└──────────────────┘                    │                      │
                                        │  ┌──────────────┐    │
┌──────────────────┐   HTTP/SSE        │  │ In-Memory    │    │
│  Web UI 控制面板  │ ◄─────────────── │  │ Store        │    │
│  (/code/*)       │                   │  └──────────────┘    │
└──────────────────┘                   │  ┌──────────────┐    │
                                       │  │ JWT Auth     │    │
                                       │  └──────────────┘    │
                                       └──────────────────────┘
```

**RCS 是一个纯内存的中间服务**，它的职责是：
- 接收 Claude Code CLI 的环境注册和工作轮询
- 提供 Web UI 供操作者远程监控和审批
- 通过 WebSocket/SSE 双向传输消息
- 管理会话、环境、权限请求

## 前置条件

- 一台可被 Claude Code CLI 和 Web 浏览器同时访问的服务器（物理机、VM、容器均可）
- [Docker](https://www.docker.com/)
- 启用 `BRIDGE_MODE` feature flag 的 Claude Code 构建

## 部署

### 构建 Docker 镜像

在项目根目录执行：

```bash
docker build -t rcs:latest -f packages/remote-control-server/Dockerfile .
```

### 启动容器

```bash
docker run -d \
  --name rcs \
  -p 3000:3000 \
  -e RCS_API_KEYS=sk-rcs-your-secret-key-here \
  -e RCS_BASE_URL=https://rcs.example.com \
  -v rcs-data:/app/data \
  --restart unless-stopped \
  rcs:latest
```

### Docker Compose

```yaml
version: "3.8"
services:
  rcs:
    build:
      context: .
      dockerfile: packages/remote-control-server/Dockerfile
      args:
        VERSION: "0.1.0"
    ports:
      - "3000:3000"
    environment:
      - RCS_API_KEYS=sk-rcs-your-secret-key-here
      - RCS_BASE_URL=https://rcs.example.com
    volumes:
      - rcs-data:/app/data
    restart: unless-stopped

volumes:
  rcs-data:
```

启动：

```bash
docker compose up -d
```

## 环境变量参考

### 服务器端

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `RCS_API_KEYS` | **是** | _(空)_ | API 密钥列表，逗号分隔。用于客户端认证和 JWT 签名。**务必设置强密钥** |
| `RCS_PORT` | 否 | `3000` | 服务监听端口 |
| `RCS_HOST` | 否 | `0.0.0.0` | 服务监听地址 |
| `RCS_BASE_URL` | 否 | `http://localhost:3000` | 外部访问 URL。用于生成 WebSocket 连接地址，必须与客户端实际访问的地址一致 |
| `RCS_VERSION` | 否 | `0.1.0` | 版本号，显示在 `/health` 响应中 |
| `RCS_POLL_TIMEOUT` | 否 | `8` | V1 工作轮询超时（秒） |
| `RCS_HEARTBEAT_INTERVAL` | 否 | `20` | 心跳间隔（秒） |
| `RCS_JWT_EXPIRES_IN` | 否 | `3600` | JWT 令牌有效期（秒） |
| `RCS_DISCONNECT_TIMEOUT` | 否 | `300` | 断线判定超时（秒） |

### 客户端（Claude Code CLI）

| 变量 | 必填 | 说明 |
|------|------|------|
| `CLAUDE_BRIDGE_BASE_URL` | **是** | RCS 服务器地址，例如 `https://rcs.example.com`。设置此变量即启用自托管模式，跳过 GrowthBook 门控 |
| `CLAUDE_BRIDGE_OAUTH_TOKEN` | **是** | 认证令牌，必须与服务器端 `RCS_API_KEYS` 中的某个值匹配 |
| `CLAUDE_BRIDGE_SESSION_INGRESS_URL` | 否 | WebSocket 入口地址（默认与 `CLAUDE_BRIDGE_BASE_URL` 相同） |
| `CLAUDE_CODE_REMOTE` | 否 | 设为 `1` 时标记为远程执行模式 |

## Claude Code 客户端连接

### 1. 设置环境变量

在运行 Claude Code 的机器上设置：

```bash
export CLAUDE_BRIDGE_BASE_URL="https://rcs.example.com"
export CLAUDE_BRIDGE_OAUTH_TOKEN="sk-rcs-your-secret-key-here"
```

### 2. 启动 Claude Code

```bash
# 使用 dev 模式（BRIDGE_MODE 默认启用）
bun run dev

# 或使用构建产物
bun run dist/cli.js
```

### 3. 执行 /remote-control 命令

在 Claude Code 的 REPL 中输入：

```
/remote-control
```

环境型 Remote Control（例如 `claude remote-control` 子命令）会向 RCS 注册环境，注册成功后在终端显示连接 URL：

```
https://rcs.example.com/code?bridge=<environmentId>
```

交互式 REPL 方式（`--remote-control` 或 `/remote-control`）在某些桥接模式下也可能直接给出会话 URL：

```
https://rcs.example.com/code/session_<id>
```

两种 URL 都可以直接在浏览器打开并远程操控当前会话；只有 environment 模式才会出现在 Web UI 的环境列表中。

若已连接，再次执行 `/remote-control` 会显示对话框，包含以下选项：
- **Disconnect this session** — 断开远程连接
- **Show QR code** — 显示/隐藏二维码
- **Continue** — 保持连接，继续使用

也可通过 CLI 参数直接启动：

```bash
claude remote-control
# 或简写
claude rc
# 或
claude bridge
```

## Web UI 控制面板

通过 `/remote-control` 命令获取 URL 后，在浏览器打开即可使用。功能：

- 查看已注册的运行环境（environment 模式）
- 创建和管理会话
- 实时查看对话消息和工具调用
- 查看 Autopilot 状态（`standby` / `sleeping`）和自动运行指示
- 查看 authoritative task snapshots 驱动的 Tasks 面板
- 审批 Claude Code 的工具权限请求

Web UI 使用 UUID 认证（无需用户账户），适合受信任网络环境。

## 工作流程详解

```
┌──────────────────────────────────────────────────────────┐
│                    完整工作流程                            │
└──────────────────────────────────────────────────────────┘

 1. Claude Code CLI 启动，设置环境变量指向自托管 RCS

 2. 用户执行 /remote-control 命令

 3. 注册环境
    CLI ──POST /v1/environments/bridge──► RCS
    CLI ◄── { environment_id, environment_secret } ── RCS

 4. 终端显示连接 URL
    https://rcs.example.com/code?bridge=<environmentId>

 5. 开始工作轮询（循环）
    CLI ──GET /v1/environments/:id/work/poll──► RCS
         （长轮询，等待任务分配，超时 8 秒后重试）

 6. 浏览器打开 URL → Web UI 创建任务
    Browser ──POST /web/sessions──► RCS
    RCS 分配 work 给正在轮询的 CLI

 7. CLI 收到任务并确认
    CLI ◄── { id, data: { type, sessionId } } ── RCS
    CLI ──POST /v1/environments/:id/work/:workId/ack──► RCS

 8. 建立会话连接
    CLI ──WebSocket /v1/session_ingress──► RCS
         （或使用 V2 的 SSE + HTTP POST）

 9. 双向通信
    CLI ──消息/工具调用结果──► RCS ──► Browser
    CLI ◄──权限审批/指令───── RCS ◄──── Browser
    CLI ──automation_state / task_state──► RCS ──► Browser

10. 心跳保活（每 20 秒）
    CLI ──POST /v1/environments/:id/work/:workId/heartbeat──► RCS

11. 任务完成 → 归档会话 → 注销环境
```

## 故障排查

### Web UI 看不到当前 Autopilot 状态

- `standby`：proactive 已开启，正在等待下一个 tick
- `sleeping`：模型正在 `SleepTool` 等待窗口中

这两个状态通过 worker `external_metadata.automation_state` 上报。如果页面只显示普通 working spinner，优先检查 CLI 和 RCS 之间的 worker metadata PUT 是否成功。

### CLI 无法连接

```
Error: Remote Control is not available in this build.
```

**原因**：`BRIDGE_MODE` feature flag 未启用。

**解决**：使用 dev 模式（默认启用）或确保构建时包含 `BRIDGE_MODE` flag。

### 认证失败 (401)

```
Error: Unauthorized
```

**检查项**：
1. `CLAUDE_BRIDGE_OAUTH_TOKEN` 是否与 `RCS_API_KEYS` 中的值匹配
2. API Key 是否包含多余的空格或换行
3. 两个环境变量是否都已正确设置

### WebSocket 连接中断

**检查项**：
1. 如果使用反向代理，确认已正确配置 WebSocket 升级（`Upgrade` / `Connection` 头）
2. 代理的 `proxy_read_timeout` 是否足够大（建议 86400 秒）
3. 网络防火墙是否允许 WebSocket 流量

### 健康检查

```bash
curl https://rcs.example.com/health
# 预期: {"status":"ok","version":"0.1.0"}
```

## 限制与注意事项

| 项目 | 说明 |
|------|------|
| 存储 | 纯内存存储（Map），服务器重启后所有会话和环境数据丢失 |
| 扩展 | 不支持水平扩展（无共享状态），单实例部署 |
| 并发 | 适合中小规模使用，大量并发会话可能需要性能调优 |
| 数据持久化 | `/app/data` 卷已预留但当前未使用，未来可能用于持久化 |
| Web UI 认证 | 基于 UUID，无用户账户系统，适合受信任网络环境 |

## 与云端模式对比

| 特性 | 云端 (Anthropic CCR) | 自托管 (RCS) |
|------|---------------------|--------------|
| 认证方式 | claude.ai OAuth 订阅 | API Key |
| GrowthBook 门控 | 需要 `tengu_ccr_bridge` 通过 | 自动跳过 |
| 功能标志 | 需要 `BRIDGE_MODE=1` | 同样需要 |
| 部署位置 | Anthropic 云端 | 用户自有服务器 |
| 数据流经 | Anthropic 基础设施 | 用户私有网络 |
| 依赖 | claude.ai 订阅 + OAuth | 仅需 API Key |

自托管模式的核心优势是：设置 `CLAUDE_BRIDGE_BASE_URL` 后，代码自动调用 `isSelfHostedBridge()` 返回 `true`，跳过所有 GrowthBook 和订阅检查，无需 claude.ai 账户即可使用。

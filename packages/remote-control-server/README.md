# Remote Control Server (RCS)

Remote Control Server 是 Claude Code 的远程控制后端，允许你通过浏览器 Web UI 远程监控和操作 Claude Code 会话。

## 功能

- **会话管理** — 创建、监控、归档 Claude Code 会话
- **实时消息流** — WebSocket / SSE 双向传输，实时查看对话和工具调用
- **权限审批** — 在 Web UI 中审批 Claude Code 的工具权限请求
- **多环境管理** — 注册多个运行环境，支持心跳和断线重连
- **认证安全** — API Key + JWT 双层认证

## 快速开始

### Docker 部署（推荐）

```bash
docker run -d \
  --name rcs \
  -p 3000:3000 \
  -e RCS_API_KEYS=your-api-key-here \
  -v rcs-data:/app/data \
  ghcr.io/claude-code-best/remote-control-server:latest
```

## 环境变量

### 服务器配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `RCS_PORT` | `3000` | 监听端口 |
| `RCS_HOST` | `0.0.0.0` | 监听地址 |
| `RCS_API_KEYS` | _(空)_ | API 密钥列表，逗号分隔。客户端和 Worker 连接时需要提供 |
| `RCS_BASE_URL` | _(自动)_ | 外部访问地址，例如 `https://rcs.example.com`。用于生成 WebSocket 连接 URL |
| `RCS_VERSION` | `0.1.0` | 服务版本号，显示在 `/health` 响应中 |

### 超时与心跳

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `RCS_POLL_TIMEOUT` | `8` | V1 轮询超时（秒） |
| `RCS_HEARTBEAT_INTERVAL` | `20` | 心跳间隔（秒） |
| `RCS_JWT_EXPIRES_IN` | `3600` | JWT 令牌有效期（秒） |
| `RCS_DISCONNECT_TIMEOUT` | `300` | 断线判定超时（秒） |

## Claude Code 客户端配置

### 连接到自托管服务器

在 Claude Code 所在环境设置以下变量：

```bash
# 指向你的 RCS 服务器地址
export CLAUDE_BRIDGE_BASE_URL="https://rcs.example.com"

# 认证令牌（与 RCS_API_KEYS 中的值对应）
export CLAUDE_BRIDGE_OAUTH_TOKEN="your-api-key-here"
```

然后启动远程控制模式：

```bash
ccb --remote-control
```

> **注意**：远程控制功能需要启用 `BRIDGE_MODE` feature flag。开发模式下默认启用。

### 环境变量参考

| 变量 | 说明 |
|------|------|
| `CLAUDE_BRIDGE_BASE_URL` | RCS 服务器地址，覆盖默认的 Anthropic 云端地址 |
| `CLAUDE_BRIDGE_OAUTH_TOKEN` | 认证令牌，用于连接 RCS 服务器 |
| `CLAUDE_BRIDGE_SESSION_INGRESS_URL` | WebSocket 入口地址（默认与 BASE_URL 相同） |
| `CLAUDE_CODE_REMOTE` | 设为 `1` 时标记为远程执行模式 |

## Docker Compose 示例

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
      - RCS_API_KEYS=sk-rcs-change-me
      - RCS_BASE_URL=https://rcs.example.com
    volumes:
      - rcs-data:/app/data
    restart: unless-stopped

volumes:
  rcs-data:
```

## ACP 兼容的 remote-control


```sh
ACP_RCS_URL=http://localhost:3000 ACP_RCS_TOKEN=test-my-key acp-link ccb-bun -- --acp
```

## 反向代理配置

使用 Nginx 或 Caddy 反向代理时，需要支持 WebSocket 升级：

```nginx
server {
    listen 443 ssl;
    server_name rcs.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
    }
}
```

Caddy 配置更简单，自动处理 WebSocket：

```
rcs.example.com {
    reverse_proxy localhost:3000
}
```

## 架构概览

```
┌─────────────┐     WebSocket/SSE      ┌──────────────────┐
│  Claude Code │ ◄──────────────────► │  Remote Control  │
│  (Bridge CLI)│     HTTP API          │     Server       │
└─────────────┘                        │                  │
                                       │  ┌────────────┐  │
┌─────────────┐     HTTP/SSE          │  │ Event Bus   │  │
│  Web UI      │ ◄────────────────── │  └────────────┘  │
│  (/code/*)   │                      │  ┌────────────┐  │
└─────────────┘                       │  │ In-Memory   │  │
                                      │  │ Store       │  │
                                      │  └────────────┘  │
                                      └──────────────────┘
```

- **传输层**：WebSocket（V1）和 SSE + HTTP POST（V2）
- **存储**：纯内存存储（Map），重启后数据清除
- **认证**：API Key（客户端）+ JWT（Worker）
- **前端**：原生 JS SPA，通过 `/code/*` 路径访问

## 开发

```bash
# 安装依赖
bun install

# 开发模式（热重载）
bun run dev

# 类型检查
bun run typecheck

# 运行测试
bun test packages/remote-control-server/
```

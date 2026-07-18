# Remote Control Server (RCS)

Remote Control Server 是 Claude Code 的远程控制后端，允许你通过浏览器 Web UI 远程监控和操作 Claude Code 会话。

## 功能

- **会话管理** — 创建、监控、归档 Claude Code 会话
- **实时消息流** — WebSocket / SSE 双向传输，实时查看对话和工具调用
- **权限审批** — 在 Web UI 中审批 Claude Code 的工具权限请求
- **多环境管理** — 注册多个运行环境，支持心跳和断线重连
- **认证安全** — API Key + JWT 双层认证

## 快速开始

### 源码仓库本地开发（推荐）

在仓库根目录用一个前台命令启动 RCS Server 和 Bridge Worker：

```bash
bun run rcs:local
```

它默认绑定 `127.0.0.1`，自动生成并共享 RCS transport secret；Web 产物缺失时会先构建。开发 Web UI 时改用 `bun run rcs:dev`，Vite 地址为 <http://127.0.0.1:5173/code/>。

`RCS_API_KEYS` / `CLAUDE_BRIDGE_OAUTH_TOKEN` 是 RCS transport secret，不是模型 Provider key。模型凭据继续通过 CLI `/login` 或 Web Provider 设置页管理。

需要分离排障时可分别运行 `bun run rcs:server` 与 `bun run rcs:worker`；此时需显式确保两侧 transport secret 匹配。

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
| `RCS_DB_PATH` | `./data/rcs.sqlite` | SQLite 数据库路径。保存会话、所有权、Worker 快照和完整事件历史 |

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
└─────────────┘                       │  │ SQLite +    │  │
                                      │  │ Live Bus    │  │
                                      │  └────────────┘  │
                                      └──────────────────┘
```

- **传输层**：WebSocket（V1）和 SSE + HTTP POST（V2）
- **存储**：会话、所有权、Worker 快照和消息事件持久化到 SQLite；实时订阅使用有界内存事件总线
- **认证**：API Key（客户端）+ JWT（Worker）
- **前端**：React + Vite SPA，通过 `/code/*` 路径访问

默认数据库位于 `./data/rcs.sqlite`。Docker 示例中的
`-v rcs-data:/app/data` 会在容器重启或重建后保留对话历史。裸机部署时，
请确保 `RCS_DB_PATH` 的父目录可写并纳入备份。环境注册和正在派发的临时工作项
仍属于运行时状态，服务重启后需要客户端重新连接。当前 SQLite 存储按单个 RCS
进程设计，不要让多个服务实例同时共享同一个数据库文件。

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

# 生产内存冒烟：2 分钟预热、10,000 条事件、500 次 SSE 连接/断开
bun scripts/memory-smoke.ts
```

内存脚本输出 CSV 格式的 `rss_kib`。诊断真实物理内存时看 RSS，不要把 Bun/Node
运行时可能达到数百 GiB 的 VSZ（虚拟地址空间预留）当作常驻内存。

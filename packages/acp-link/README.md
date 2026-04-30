# acp-link

ACP proxy server that bridges WebSocket clients to ACP (Agent Client Protocol) agents.

> Source code adapted from [chrome-acp](https://github.com/Areo-Joe/chrome-acp).

## Installation

### From source

```bash
# From monorepo root
bun install
```

## Usage

```bash
# Via global install
acp-link /path/to/agent

# Via source
bun src/cli/bin.ts /path/to/agent
```

### Examples

```bash
# Basic usage
acp-link /path/to/agent

# With custom port and host
acp-link --port 9000 --host 0.0.0.0 /path/to/agent

# With debug logging
acp-link --debug /path/to/agent

# Enable HTTPS with self-signed certificate
acp-link --https /path/to/agent

# Disable authentication (dangerous)
acp-link --no-auth /path/to/agent

# Register to RCS with a specific channel group
acp-link --group my-team /path/to/agent

# Pass arguments to the agent (use -- to separate)
acp-link /path/to/agent -- --verbose --model gpt-4
```

## CLI Reference

```
USAGE
  acp-link [--port value] [--host value] [--debug] [--no-auth] [--https] [--group value] <command>...
  acp-link --help
  acp-link --version

FLAGS
       [--port]     Port to listen on                  [default = 9315]
       [--host]     Host to bind to                    [default = localhost]
       [--debug]    Enable debug logging to file
       [--no-auth]  Disable authentication (dangerous)
       [--https]    Enable HTTPS with self-signed cert
       [--group]    Channel group ID for RCS registration (letters, digits, hyphens, underscores only)
    -h  --help      Print help information and exit
    -v  --version   Print version information and exit

ARGUMENTS
  command...  Agent command followed by its arguments
```

## How It Works

1. Listens for WebSocket connections from clients
2. When a "connect" message is received, spawns the configured ACP agent as a subprocess
3. Bridges messages between the WebSocket (client) and stdin/stdout (agent via ACP protocol)
4. Supports session management: create, load, resume, list sessions
5. Handles permission approval flow and heartbeat keepalive

## Authentication

By default, a random token is auto-generated on startup. Connect to the
WebSocket endpoint without putting the token in the URL:

```
ws://localhost:9315/ws
```

Set `ACP_AUTH_TOKEN` env var to use a fixed token, or use `--no-auth` to
disable (not recommended). Clients that cannot send an `Authorization` header
must send the token in a WebSocket subprotocol named
`rcs.auth.<base64url-token>`.

## RCS Upstream

acp-link can register to a Remote Control Server (RCS) for remote access. Set the following environment variables:

| Variable | Description |
|----------|-------------|
| `ACP_RCS_URL` | RCS server URL (e.g. `http://rcs.example.com:3000`) |
| `ACP_RCS_TOKEN` | API token for RCS authentication |
| `ACP_RCS_GROUP` | Channel group ID to lock the agent into (letters, digits, `-`, `_` only) |

You can also use `--group <id>` on the CLI. The CLI flag takes priority over the env var.

## Manager UI

通过 `--manager` flag 启动独立的管理服务（不启动代理）：

```bash
# 启动 Manager（默认端口 9315）
acp-link --manager

# 指定端口
acp-link --manager --port 3210
```

在浏览器打开 `http://localhost:<port>` 即可访问管理界面，创建、停止、删除多个 acp-link 子进程实例并实时查看日志。

通过 Manager UI 创建的子进程会自动跳过 Manager UI。

## License

MIT

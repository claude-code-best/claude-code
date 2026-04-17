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

# Pass arguments to the agent (use -- to separate)
acp-link /path/to/agent -- --verbose --model gpt-4
```

## CLI Reference

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
  command...  Agent command followed by its arguments
```

## How It Works

1. Listens for WebSocket connections from clients
2. When a "connect" message is received, spawns the configured ACP agent as a subprocess
3. Bridges messages between the WebSocket (client) and stdin/stdout (agent via ACP protocol)
4. Supports session management: create, load, resume, list sessions
5. Handles permission approval flow and heartbeat keepalive

## Authentication

By default, a random token is auto-generated on startup. Pass it as a query parameter:

```
ws://localhost:9315/ws?token=<your-token>
```

Set `ACP_AUTH_TOKEN` env var to use a fixed token, or use `--no-auth` to disable (not recommended).

## License

MIT

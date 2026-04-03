# DAEMON — Background Daemon Process

> Feature Flag: `FEATURE_DAEMON=1`
> Implementation Status: Main process and worker registration are Stubs, CLI routing complete
> Reference Count: 3

## 1. Feature Overview

DAEMON turns Claude Code into a background daemon process. The main process (supervisor) manages the lifecycle of multiple worker processes, communicating via Unix domain sockets for IPC. Suitable for continuously running background service scenarios (e.g., providing remote control services with BRIDGE_MODE).

## 2. Implementation Architecture

### 2.1 Module Status

| Module | File | Status |
|--------|------|--------|
| Daemon Main Process | `src/daemon/main.ts` | **Stub** — `daemonMain: () => Promise.resolve()` |
| Worker Registry | `src/daemon/workerRegistry.ts` | **Stub** — `runDaemonWorker: () => Promise.resolve()` |
| CLI Routing | `src/entrypoints/cli.tsx` | **Wired** — `--daemon-worker` and `daemon` subcommand |
| Command Registration | `src/commands.ts` | **Wired** — DAEMON + BRIDGE_MODE gated |

### 2.2 CLI Entry

```
# Start daemon
claude daemon

# Start as a worker
claude --daemon-worker=<kind>
```

### 2.3 Expected Architecture

```
Supervisor (daemonMain)
      |
      +-- Worker 1: assistant-mode
      |   +-- Receives and processes assistant sessions
      |
      +-- Worker 2: bridge-sync
      |   +-- Bridge message synchronization
      |
      +-- Worker 3: proactive
          +-- Proactive task execution
      |
      v
IPC via Unix Domain Sockets
  - Lifecycle management (start, stop, restart)
  - Work distribution
  - Status reporting
```

### 2.4 Relationship with BRIDGE_MODE

DAEMON and BRIDGE_MODE are commonly used together:

```ts
// src/commands.ts
if (feature('DAEMON') && feature('BRIDGE_MODE')) {
  // Load remoteControlServer command
}
```

Dual gating: both features must be enabled to use the remote control server.

## 3. Content Needing Implementation

| Module | Effort | Description |
|--------|--------|-------------|
| `daemon/main.ts` | Large | Supervisor main process: launch workers, lifecycle management, IPC |
| `daemon/workerRegistry.ts` | Medium | Worker type dispatch (assistant/bridge-sync/proactive) |
| Worker implementations | Large | Concrete implementation for each worker type |
| IPC Protocol | Medium | Supervisor-Worker communication layer |

## 4. Key Design Decisions

1. **Multi-Process Architecture**: One supervisor + multiple workers, process isolation
2. **Unix Domain Socket IPC**: Local inter-process communication, low latency
3. **Strong Coupling with BRIDGE_MODE**: The most common use of the daemon is providing remote control services
4. **CLI Subcommand Routing**: `daemon` subcommand and `--daemon-worker` parameter routed in `cli.tsx`

## 5. Usage

```bash
# Enable daemon mode
FEATURE_DAEMON=1 FEATURE_BRIDGE_MODE=1 bun run dev

# Start daemon
claude daemon

# Start as a specific worker
claude --daemon-worker=assistant
```

## 6. File Index

| File | Responsibility |
|------|----------------|
| `src/daemon/main.ts` | Supervisor main process (stub) |
| `src/daemon/workerRegistry.ts` | Worker registry (stub) |
| `src/entrypoints/cli.tsx:95,149` | CLI routing |
| `src/commands.ts:77` | Command registration (dual gating) |

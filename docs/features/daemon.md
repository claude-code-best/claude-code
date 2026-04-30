# DAEMON — 后台守护进程

> Feature Flag: `FEATURE_DAEMON=1`
> 实现状态：Supervisor 和 remoteControl Worker 已实现
> 引用数：3

## 一、功能概述

DAEMON 将 Claude Code 变为后台守护进程。主进程（supervisor）管理多个 worker 子进程的生命周期，通过文件系统状态文件进行通信。适用于持续运行的后台服务场景（如配合 BRIDGE_MODE 提供远程控制服务）。

## 二、实现架构

### 2.1 模块状态

| 模块 | 文件 | 状态 |
|------|------|------|
| 守护主进程 | `src/daemon/main.ts` | **已实现** — Supervisor 含子命令、Worker 生命周期管理、指数退避重启 |
| Worker 注册 | `src/daemon/workerRegistry.ts` | **已实现** — remoteControl Worker（headless bridge） |
| Daemon 状态 | `src/daemon/state.ts` | **已实现** — PID/状态文件的读写与查询 |
| CLI 路由 | `src/entrypoints/cli.tsx` | **布线** — `--daemon-worker` 和 `daemon` 子命令 |
| 命令注册 | `src/commands.ts` | **布线** — DAEMON + BRIDGE_MODE 门控 |

### 2.2 CLI 入口

```
# 启动守护进程
claude daemon start

# 查看状态（默认子命令）
claude daemon status
claude daemon ps

# 停止守护进程
claude daemon stop

# 以 worker 身份启动（由 supervisor 自动调用）
claude --daemon-worker=remoteControl

# 后台会话管理
claude daemon bg
claude daemon attach <session>
claude daemon logs <session>
claude daemon kill <session>
```

### 2.3 架构

```
Supervisor (daemonMain)
      │
      ├── Worker: remoteControl
      │   └── runBridgeHeadless() — 远程控制 headless 模式
      │       接收远程会话、处理消息、权限审批
      │
      ▼
文件系统状态文件 (daemon-state.json)
  - PID、CWD、启动时间、Worker 类型
  - queryDaemonStatus() / stopDaemonByPid()
```

### 2.4 Worker 生命周期管理

Supervisor 为每个 worker 实现：
- **指数退避重启**：初始 2s，上限 120s，倍数 ×2
- **快速失败检测**：10s 内连续崩溃 5 次则 parking（不再重启）
- **永久错误退出码**：78 (EXIT_CODE_PERMANENT) 导致直接 parking
- **优雅关闭**：SIGTERM/SIGINT → abort signal → 30s 强制 SIGKILL

### 2.5 与 BRIDGE_MODE 的关系

DAEMON 和 BRIDGE_MODE 常组合使用：

```ts
// src/commands.ts
if (feature('DAEMON') && feature('BRIDGE_MODE')) {
  // 加载 remoteControlServer 命令
}
```

双重门控：两个 feature 都需要开启才能使用远程控制服务器。

## 三、关键设计决策

1. **多进程架构**：一个 supervisor + 多个 worker，进程隔离
2. **文件系统状态通信**：通过 `daemon-state.json` 文件进行状态共享（非 Unix 域套接字）
3. **与 BRIDGE_MODE 强绑定**：守护进程最常见的用途是提供远程控制服务
4. **CLI 子命令路由**：`daemon` 子命令和 `--daemon-worker` 参数在 `cli.tsx` 中路由
5. **Worker 环境变量**：supervisor 通过环境变量（`DAEMON_WORKER_*`）向 worker 传递配置

## 四、使用方式

```bash
# 启用守护进程模式
FEATURE_DAEMON=1 FEATURE_BRIDGE_MODE=1 bun run dev

# 启动守护进程
claude daemon start

# 查看状态
claude daemon status

# 停止守护进程
claude daemon stop

# 以特定 worker 启动（通常由 supervisor 自动调用）
claude --daemon-worker=remoteControl
```

## 五、文件索引

| 文件 | 职责 |
|------|------|
| `src/daemon/main.ts` | Supervisor 主进程：子命令分发、Worker 生命周期管理、退避重启 |
| `src/daemon/workerRegistry.ts` | Worker 入口：remoteControl worker 实现 |
| `src/daemon/state.ts` | Daemon 状态管理：PID 文件读写、状态查询 |
| `src/entrypoints/cli.tsx` | CLI 路由 |
| `src/commands.ts` | 命令注册（双重门控） |

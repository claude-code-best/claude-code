# Task 001: daemon status / stop

> 来源: [stub-recovery-design-1-4.md](../features/stub-recovery-design-1-4.md) 第 1 项
> 优先级: P0 (首选实现项)
> 工作量: 小
> 状态: DONE

## 目标

让 `claude daemon status` 和 `claude daemon stop` 在任意 CLI 进程中都能正确工作，不依赖 TUI 内存态。

## 背景

- `start` 路径已有完整 supervisor + worker 生命周期 (`src/daemon/main.ts`, `src/daemon/workerRegistry.ts`)
- `status` / `stop` 目前只是占位输出 (`src/daemon/main.ts:49`)
- `/remote-control-server` 有自己的命令内 UI 状态，但只维护当前进程内的 `daemonProcess`，不适合跨进程管理

## 实现方案

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/daemon/state.ts` | daemon 状态文件读写模块 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/daemon/main.ts` | `start` 写入状态文件；`status`/`stop` 调用 state 模块 |
| `src/commands/remoteControlServer/remoteControlServer.tsx` | 读取同一份状态文件（轻量改动） |

### 状态文件

路径: `~/.claude/daemon/remote-control.json`

```json
{
  "pid": 12345,
  "cwd": "/path/to/project",
  "startedAt": "2026-04-12T10:00:00Z",
  "workerKinds": ["bridge", "rcs"],
  "lastStatus": "running"
}
```

### status 逻辑

1. 读取状态文件
2. 用进程探测验证 pid 是否存活
3. 输出 `running` / `stopped` / `stale`
4. stale 时自动清理状态文件

### stop 逻辑

1. 读取 pid
2. 发送 `SIGTERM`
3. 等待退出（超时兜底）
4. 超时后 `SIGKILL`
5. 清理状态文件

## 验证步骤

- [ ] `claude daemon start` 正常启动并写入状态文件
- [ ] 新开终端执行 `claude daemon status`，显示 `running`
- [ ] 执行 `claude daemon stop`，daemon 正常退出
- [ ] 再次执行 `claude daemon status`，返回 `stopped` 或 `stale cleaned`
- [ ] Windows 下 stop 超时兜底正常工作

## 风险

- Windows 信号模型和 Unix 不同，`stop` 需要超时兜底
- 当前设计默认单 supervisor，不处理多实例并发

## 依赖

无外部依赖，可独立实施。

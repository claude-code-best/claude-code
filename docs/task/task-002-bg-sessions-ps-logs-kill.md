# Task 002: BG_SESSIONS — ps / logs / kill

> 来源: [stub-recovery-design-1-4.md](../features/stub-recovery-design-1-4.md) 第 2 项
> 优先级: P1
> 工作量: 中等
> 状态: DONE
> 阶段: Phase 2A (MVP)

## 目标

把 `ps` / `logs` / `kill` 做成真正有用的 session 管理命令。不在第一阶段补完 `attach` / `--bg`。

## 背景

- fast-path 已接好 (`src/entrypoints/cli.tsx:218`)
- session registry 已有真实实现 (`src/utils/concurrentSessions.ts`)
- `exit` 在 bg session 内已会 `tmux detach-client` (`src/commands/exit/exit.tsx:20`)
- CLI handler 仍全空 (`src/cli/bg.ts`)
- task summary 仍然是 stub (`src/utils/taskSummary.ts`)

## 实现方案

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/cli/bg.ts` | 实现 `ps` / `logs` / `kill` handler |
| `src/utils/concurrentSessions.ts` | 扩展以便后续 attach/--bg 使用 |
| `src/utils/taskSummary.ts` | 补充基础实现 |

### 复用模块

- `src/utils/sessionStorage.ts` — session 存储
- `src/utils/udsClient.ts` — UDS 通信

### ps 命令

- 从 registry 读取 live sessions
- 展示: pid, kind, sessionId, cwd, name, startedAt, bridgeSessionId
- 如果有 activity/status，一并展示

### logs 命令

- 支持按 `sessionId` / `pid` / `name` 查找
- 优先复用本地 transcript/log 读取能力
- 如果 registry 里存在 `logPath`，支持 tail 文件

### kill 命令

- 解析目标 session
- 发退出信号
- 清理 stale registry

## 验证步骤

- [ ] `ps` 能列出当前 live sessions
- [ ] `logs <sessionId|pid|name>` 能输出对应日志
- [ ] `kill <sessionId|pid|name>` 能结束目标 session 并清理 registry
- [ ] 无 live session 时各命令有明确提示

## Phase 2B (后续)

- [ ] 实现 `attach`
- [ ] 实现 `--bg`
- [ ] 实现 `taskSummary` 的中途状态更新

### 为什么拆分

- 现有 registry 记录了 `pid / sessionId / name / logPath`
- 但没有可靠的 tmux attach target
- `attach` 和 `--bg` 需要补启动/附着元数据设计，不是简单补 handler

## 风险

- `attach` / `--bg` 第二阶段需要 tmux 元数据设计
- Windows 下 tmux 路径需要明确降级策略

## 依赖

- Task 001 (daemon 状态管理可复用模式，但非硬性依赖)

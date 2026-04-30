# Daemon 重构设计方案

> 分支: `feat/integrate-5-branches`
> 基于: `f41745cb` (= main `11bb3f62` 内容)
> 日期: 2026-04-13

## 一、问题概述

### 1.1 命令结构散乱

当前后台进程相关的命令分布在三个不同的位置，没有统一的命名空间：

| 命令 | 注册位置 | 入口 |
|------|---------|------|
| `claude daemon start/status/stop` | `cli.tsx` 快速路径 L203 | `daemon/main.ts` |
| `claude ps` | `cli.tsx` 快速路径 L220 | `cli/bg.ts` |
| `claude logs <x>` | `cli.tsx` 快速路径 L232 | `cli/bg.ts` |
| `claude attach <x>` | `cli.tsx` 快速路径 L236 | `cli/bg.ts` |
| `claude kill <x>` | `cli.tsx` 快速路径 L238 | `cli/bg.ts` |
| `claude --bg` | `cli.tsx` 快速路径 L244 | `cli/bg.ts` |
| `claude new/list/reply` | `cli.tsx` 快速路径 L250 | `cli/handlers/templateJobs.ts` |
| `claude rollback` | `main.tsx` Commander.js L6525 | `cli/rollback.ts` |
| `claude up` | `main.tsx` Commander.js L6511 | `cli/up.ts` |

**问题**:
- `ps/logs/attach/kill` 与 `daemon` 逻辑上都是后台进程管理，但互不关联
- 这些命令都**只有 CLI 入口**，REPL 里输入 `/daemon` 或 `/ps` 不存在
- `new/list/reply` 是模板任务系统的顶级命令，容易与其他命令冲突（特别是 `list`）

### 1.2 Windows 不支持

`--bg` 和 `attach` 硬依赖 tmux：
- `bg.ts:handleBgFlag()` 第一步就检查 tmux，不可用直接报错退出
- `bg.ts:attachHandler()` 用 `tmux attach-session`，无 tmux 替代方案
- Windows (包括 VS Code 终端) 完全无法使用后台会话功能

### 1.3 无 REPL 入口

对比 `/mcp` 的双注册模式：
- **CLI**: `claude mcp serve/add/remove/list` (Commander.js, `main.tsx:5760`)
- **REPL**: `/mcp enable/disable/reconnect` (slash command, `commands/mcp/index.ts`)

`daemon`/`bg`/`job` 系列只有 CLI 快速路径，REPL 中完全不可用。

## 二、目标

1. **层级化命令结构**: 参照 `/mcp` 模式，将后台管理收归 `/daemon`，模板任务收归 `/job`
2. **跨平台后台会话**: Windows / macOS / Linux 都能启动、附着、终止后台会话
3. **双注册**: CLI (`claude daemon ...`) + REPL (`/daemon ...`) 同时可用
4. **向后兼容**: 旧命令保留但输出 deprecation 提示

## 三、命令结构设计

### 3.1 `/daemon` — 后台进程管理

合并 daemon supervisor + bg sessions 为统一命名空间：

```
claude daemon <subcommand>     ← CLI 入口 (cli.tsx 快速路径)
/daemon <subcommand>           ← REPL 入口 (slash command, local-jsx)

子命令:
  status                       综合状态面板 (daemon + 所有会话)
  start [--dir <path>]         启动 daemon supervisor
  stop                         停止 daemon
  bg [args...]                 启动后台会话
  attach [target]              附着到后台会话
  logs [target]                查看会话日志
  kill [target]                终止会话
  (无参数)                     等同于 status
```

**CLI 快速路径路由** (`cli.tsx`):
```typescript
// 新: 统一入口
if (feature('DAEMON') && args[0] === 'daemon') {
  const sub = args[1] || 'status'
  switch (sub) {
    case 'start': case 'stop': case 'status':
      await daemonMain([sub, ...args.slice(2)])
      break
    case 'bg':
      await bg.handleBgStart(args.slice(2))
      break
    case 'attach': case 'logs': case 'kill':
      await bg[`${sub}Handler`](args[2])
      break
  }
}

// 向后兼容 (deprecated)
if (feature('BG_SESSIONS') && ['ps','logs','attach','kill'].includes(args[0])) {
  console.warn(`[deprecated] Use: claude daemon ${args[0] === 'ps' ? 'status' : args[0]}`)
  // ... delegate to daemon subcommand
}
```

**REPL 斜杠命令** (`commands/daemon/index.ts`):
```typescript
const daemon = {
  type: 'local-jsx',
  name: 'daemon',
  description: 'Manage background sessions and daemon',
  argumentHint: '[status|start|stop|bg|attach|logs|kill]',
  isEnabled: () => feature('DAEMON') || feature('BG_SESSIONS'),
  load: () => import('./daemon.js'),
} satisfies Command
```

### 3.2 `/job` — 模板任务管理

```
claude job <subcommand>        ← CLI 入口
/job <subcommand>              ← REPL 入口

子命令:
  list                         列出模板和活跃任务
  new <template> [args]        从模板创建任务
  reply <id> <text>            回复任务
  status <id>                  查看任务状态
  (无参数)                     等同于 list
```

### 3.3 独立命令 (不变)

```
claude up                      保持顶级 (简短的 bootstrap 命令)
claude rollback [target]       保持顶级 (低频运维命令)
```

## 四、跨平台后台引擎

### 4.1 引擎抽象

```typescript
// src/cli/bg/engine.ts
export interface BgEngine {
  readonly name: string

  /** 当前平台是否可用 */
  available(): Promise<boolean>

  /** 启动后台会话 */
  start(opts: BgStartOptions): Promise<BgStartResult>

  /** 附着到后台会话（blocking） */
  attach(session: SessionEntry): Promise<void>
}

export interface BgStartOptions {
  sessionName: string
  args: string[]
  env: Record<string, string | undefined>
  logPath: string
  cwd: string
}

export interface BgStartResult {
  pid: number
  sessionName: string
  logPath: string
  engineUsed: string
}
```

### 4.2 三种引擎实现

| 引擎 | 平台 | 启动方式 | attach 方式 |
|------|------|---------|------------|
| TmuxEngine | macOS/Linux (有 tmux) | `tmux new-session -d` | `tmux attach-session` |
| DetachedEngine | Windows / 无 tmux 的 macOS/Linux | `spawn({ detached, stdio→logFile })` | `tail -f` 日志文件 |

#### DetachedEngine 详细设计

**启动 (`start`)**:
```typescript
// 1. 打开日志文件 fd
const logFd = fs.openSync(logPath, 'a')
// 2. detached spawn, stdout/stderr 重定向到日志
const child = spawn(process.execPath, execArgs, {
  detached: true,
  stdio: ['ignore', logFd, logFd],
  env,
  cwd,
})
child.unref()
fs.closeSync(logFd)
// 3. 写 sessions/<PID>.json
```

**附着 (`attach`)**:
```typescript
// 跨平台 tail -f 实现
// 1. 读取已有日志内容输出到 stdout
// 2. fs.watch(logPath) 监听变化
// 3. 每次变化读取新增内容
// 4. Ctrl+C 退出 tail（不杀后台进程）
```

#### 引擎选择逻辑

```typescript
// src/cli/bg/engines/index.ts
export async function selectEngine(): Promise<BgEngine> {
  if (process.platform === 'win32') {
    return new DetachedEngine()
  }

  const tmux = new TmuxEngine()
  if (await tmux.available()) {
    return tmux
  }

  return new DetachedEngine()
}
```

### 4.3 SessionEntry 扩展

```typescript
interface SessionEntry {
  // ... 现有字段
  engine: 'tmux' | 'detached'   // 新增: 记录使用的引擎
  tmuxSessionName?: string       // tmux 引擎才有
  logPath?: string               // 两种引擎都有
}
```

`attach` 时根据 `session.engine` 选择对应的 attach 策略。

## 五、文件变更清单

### 新增文件 (10 个)

```
src/cli/bg/engine.ts                   BgEngine 接口定义
src/cli/bg/engines/tmux.ts             TmuxEngine (从 bg.ts 提取)
src/cli/bg/engines/detached.ts         DetachedEngine (新实现)
src/cli/bg/engines/index.ts            引擎选择 + re-export
src/cli/bg/tail.ts                     跨平台日志 tail (用于 detached attach)
src/commands/daemon/index.ts           /daemon REPL 斜杠命令注册
src/commands/daemon/daemon.tsx         /daemon 子命令路由 + status UI
src/commands/job/index.ts              /job REPL 斜杠命令注册
src/commands/job/job.tsx               /job 子命令路由 + UI
docs/features/daemon-restructure-design.md  本设计文档
```

### 修改文件 (6 个)

```
src/cli/bg.ts                          重构: handler 函数改为调用 BgEngine
src/entrypoints/cli.tsx                快速路径: daemon 统一入口 + 向后兼容
src/commands.ts                        注册 /daemon 和 /job 斜杠命令
src/daemon/main.ts                     daemonMain() 增加 bg/ps/logs 子命令分发
src/main.tsx                           Commander.js: 可选注册 daemon/job 子命令
src/cli/handlers/templateJobs.ts       适配 /job 入口 (可能不需改)
```

### 不动的文件

```
src/daemon/state.ts                    daemon PID 状态管理 (无需改)
src/jobs/state.ts                      job 状态管理 (无需改)
src/jobs/templates.ts                  模板发现 (无需改)
src/jobs/classifier.ts                 任务分类器 (无需改)
src/cli/rollback.ts                    保持顶级命令 (无需改)
src/cli/up.ts                          保持顶级命令 (无需改)
```

## 六、可行性分析

### 6.1 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|---------|
| cli.tsx 快速路径修改影响启动性能 | 低 | 仅改路由逻辑，import 仍然 lazy |
| DetachedEngine 的 attach 在 Windows 上 fs.watch 不可靠 | 中 | 使用轮询 fallback (setInterval + fs.stat) |
| 向后兼容的 deprecation 可能破坏脚本 | 低 | 旧命令保持可用，仅输出 stderr 警告 |
| REPL 中 /daemon bg 需要 spawn 子进程 | 中 | 参考 /assistant 的 NewInstallWizard (已有 spawn 先例) |
| tsc 类型兼容 | 低 | 接口定义清晰，不引入 any |

### 6.2 工作量估计

| Task | 文件数 | 复杂度 |
|------|--------|--------|
| Task 013: BgEngine 抽象 + 引擎实现 | 5 新增 + 1 修改 | 中 |
| Task 014: /daemon 命令层级化 | 3 新增 + 3 修改 | 中 |
| Task 015: /job 命令层级化 | 2 新增 + 2 修改 | 低 |
| Task 016: 向后兼容 + 测试 | 0 新增 + 2 修改 | 低 |

### 6.3 依赖关系

```
Task 013 (BgEngine) ← 无依赖，可独立开发
Task 014 (/daemon)  ← 依赖 Task 013 (引擎选择)
Task 015 (/job)     ← 无依赖，可与 013 并行
Task 016 (兼容)     ← 依赖 Task 014 + 015
```

## 七、设计决策记录

### D1: 为什么 daemon + bg sessions 合为一个命名空间？

用户视角：都是"后台运行的东西"。分开会导致 `claude daemon status` 看 supervisor + `claude ps` 看会话，割裂感强。合并后 `claude daemon status` 一次性展示 supervisor 状态 + 所有会话列表。

### D2: 为什么 rollback/up 不收入 daemon？

它们本质是**版本管理/环境初始化**，不是后台进程管理。`claude up` 是同步阻塞的 setup 脚本，不涉及 daemon 或后台会话。保持顶级更直观。

### D3: 为什么 DetachedEngine 的 attach 用 tail 而不是 IPC？

1. 日志文件是最简单的跨平台方案，无需额外依赖
2. UDS Pipe IPC 系统 (usePipeIpc) 设计用于实例间通信，不是终端附着
3. tmux attach 的体验（完整 PTY）无法在纯 detached 模式下复制，tail 是最诚实的替代

### D4: 为什么不用 Windows Terminal 的 tab/pane API？

Windows Terminal 的 `wt.exe` 新窗口/标签功能不够通用——用户可能在 VS Code、ConEmu、cmder 等终端中。detached + log 是唯一跨终端方案。

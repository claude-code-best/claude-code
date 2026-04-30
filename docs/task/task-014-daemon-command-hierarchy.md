# Task 014: /daemon 命令层级化

> 设计文档: [daemon-restructure-design.md](../features/daemon-restructure-design.md) § 三.1
> 依赖: Task 013 (BgEngine 抽象)
> 分支: `feat/integrate-5-branches`

## 目标

将散落的 `daemon start/stop/status` + `ps/logs/attach/kill` + `--bg` 统一收归 `/daemon` 命名空间，实现 CLI + REPL 双注册。

## 背景

当前这些命令注册在两个互不关联的位置:
- `cli.tsx:203-212`: `daemon [start|status|stop]` → `daemon/main.ts`
- `cli.tsx:217-246`: `ps|logs|attach|kill|--bg` → `cli/bg.ts`

需要合并为统一的 `claude daemon <subcommand>` 入口，并新增 REPL `/daemon` 斜杠命令。

## 文件清单

### 新增

| 文件 | 说明 |
|------|------|
| `src/commands/daemon/index.ts` | `/daemon` REPL 斜杠命令注册 (type: local-jsx) |
| `src/commands/daemon/daemon.tsx` | `/daemon` 子命令路由 + status UI 组件 |

### 修改

| 文件 | 变更 |
|------|------|
| `src/entrypoints/cli.tsx` | 统一 daemon 快速路径: `daemon <sub>` 路由到对应 handler。旧命令 `ps/logs/attach/kill` 保留但输出 deprecation 警告后代理 |
| `src/commands.ts` | 注册 `/daemon` 斜杠命令 (feature-gated: DAEMON \|\| BG_SESSIONS) |
| `src/daemon/main.ts` | `daemonMain()` 扩展: 支持 `bg/attach/logs/kill/ps` 子命令 (委托给 bg.ts handlers) |

## 实现方案

### 1. CLI 快速路径统一 (`cli.tsx`)

**改前** (两段独立路由):
```typescript
// 段 1: daemon
if (feature('DAEMON') && args[0] === 'daemon') {
  await daemonMain(args.slice(1))
}
// 段 2: bg sessions
if (feature('BG_SESSIONS') && ['ps','logs','attach','kill'].includes(args[0])) {
  // ...switch/case
}
```

**改后** (统一入口):
```typescript
// 统一 daemon 入口 — 合并 daemon supervisor + bg sessions
if (
  (feature('DAEMON') || feature('BG_SESSIONS')) &&
  args[0] === 'daemon'
) {
  profileCheckpoint('cli_daemon_path')
  const { enableConfigs } = await import('../utils/config.js')
  enableConfigs()
  const { initSinks } = await import('../utils/sinks.js')
  initSinks()
  const { daemonMain } = await import('../daemon/main.js')
  await daemonMain(args.slice(1))
  return
}

// --bg 快捷方式 → daemon bg
if (
  feature('BG_SESSIONS') &&
  (args.includes('--bg') || args.includes('--background'))
) {
  profileCheckpoint('cli_daemon_path')
  const { enableConfigs } = await import('../utils/config.js')
  enableConfigs()
  const bg = await import('../cli/bg.js')
  await bg.handleBgStart(args.filter(a => a !== '--bg' && a !== '--background'))
  return
}

// 向后兼容: ps/logs/attach/kill → daemon <sub> (deprecated)
if (
  feature('BG_SESSIONS') &&
  ['ps', 'logs', 'attach', 'kill'].includes(args[0] ?? '')
) {
  const mapped = args[0] === 'ps' ? 'status' : args[0]
  console.error(`[deprecated] Use: claude daemon ${mapped} ${args.slice(1).join(' ')}`.trim())
  const { enableConfigs } = await import('../utils/config.js')
  enableConfigs()
  const { daemonMain } = await import('../daemon/main.js')
  await daemonMain([args[0]!, ...args.slice(1)])
  return
}
```

### 2. daemonMain 扩展 (`daemon/main.ts`)

```typescript
export async function daemonMain(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status'

  switch (subcommand) {
    // --- Supervisor 管理 ---
    case 'start':
      await runSupervisor(args.slice(1))
      break
    case 'stop':
      await handleDaemonStop()
      break

    // --- 会话管理 (委托给 bg.ts) ---
    case 'status':
    case 'ps':
      await showUnifiedStatus()  // 新: daemon 状态 + 会话列表
      break
    case 'bg':
      const bg = await import('../cli/bg.js')
      await bg.handleBgStart(args.slice(1))
      break
    case 'attach':
      const bg2 = await import('../cli/bg.js')
      await bg2.attachHandler(args[1])
      break
    case 'logs':
      const bg3 = await import('../cli/bg.js')
      await bg3.logsHandler(args[1])
      break
    case 'kill':
      const bg4 = await import('../cli/bg.js')
      await bg4.killHandler(args[1])
      break

    case '--help': case '-h': case 'help':
      printHelp()
      break
    default:
      console.error(`Unknown daemon subcommand: ${subcommand}`)
      printHelp()
      process.exitCode = 1
  }
}
```

### 3. 统一状态面板 (`showUnifiedStatus`)

```typescript
async function showUnifiedStatus(): Promise<void> {
  // 1. Daemon supervisor 状态
  const daemonResult = queryDaemonStatus()
  console.log('=== Daemon Supervisor ===')
  switch (daemonResult.status) {
    case 'running':
      console.log(`  Status: running (PID: ${daemonResult.state!.pid})`)
      console.log(`  Workers: ${daemonResult.state!.workerKinds.join(', ')}`)
      break
    case 'stopped':
      console.log('  Status: stopped')
      break
    case 'stale':
      console.log('  Status: stale (cleaned up)')
      break
  }

  // 2. 后台会话列表
  console.log('\n=== Background Sessions ===')
  const bg = await import('../cli/bg.js')
  await bg.psHandler([])
}
```

### 4. REPL 斜杠命令注册

**`src/commands/daemon/index.ts`**:
```typescript
import type { Command } from '../../commands.js'
import { feature } from 'bun:bundle'

const daemon = {
  type: 'local-jsx',
  name: 'daemon',
  description: 'Manage background sessions and daemon',
  argumentHint: '[status|start|stop|bg|attach|logs|kill]',
  isEnabled: () => {
    if (feature('DAEMON')) return true
    if (feature('BG_SESSIONS')) return true
    return false
  },
  load: () => import('./daemon.js'),
} satisfies Command

export default daemon
```

**`src/commands/daemon/daemon.tsx`**:
```typescript
export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const parts = args.trim().split(/\s+/)
  const sub = parts[0] || 'status'

  switch (sub) {
    case 'status':
    case 'ps':
      // 调用 showUnifiedStatus，捕获输出
      // 返回文本结果
      break
    case 'bg':
      // REPL 中启动后台会话
      break
    case 'start':
    case 'stop':
    case 'attach':
    case 'logs':
    case 'kill':
      // 委托给对应 handler
      break
    default:
      onDone(`Unknown: ${sub}. Use: status|start|stop|bg|attach|logs|kill`)
      return null
  }
}
```

**`src/commands.ts`** 添加:
```typescript
// 条件导入
const daemonCmd =
  feature('DAEMON') || feature('BG_SESSIONS')
    ? require('./commands/daemon/index.js').default
    : null

// COMMANDS 数组中添加
...(daemonCmd ? [daemonCmd] : []),
```

### 5. 更新 help 文本 (`daemon/main.ts`)

```
Claude Code Daemon — background process management

USAGE
  claude daemon [subcommand]

SUBCOMMANDS
  status      Show daemon and session status (default)
  start       Start the daemon supervisor
  stop        Stop the daemon
  bg          Start a background session
  attach      Attach to a background session
  logs        Show session logs
  kill        Kill a session
  help        Show this help

REPL
  /daemon [subcommand]    Same commands available in interactive mode
```

## 验证清单

- [ ] `claude daemon` (无参数) 显示统一状态面板
- [ ] `claude daemon status` 显示 supervisor + 会话列表
- [ ] `claude daemon start/stop` 与当前行为一致
- [ ] `claude daemon bg` 启动后台会话 (调用 BgEngine)
- [ ] `claude daemon attach/logs/kill <target>` 功能正常
- [ ] `claude ps` 输出 deprecation 警告 + 正常工作
- [ ] `claude logs/attach/kill` 同上
- [ ] `claude --bg` 快捷方式正常
- [ ] REPL 中 `/daemon` 可用，tab 补全显示
- [ ] REPL 中 `/daemon status` 显示状态信息
- [ ] tsc --noEmit 零错误
- [ ] bun test 通过

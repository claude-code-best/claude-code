# Task 013: BgEngine 跨平台后台引擎抽象

> 设计文档: [daemon-restructure-design.md](../features/daemon-restructure-design.md) § 四
> 依赖: 无
> 分支: `feat/integrate-5-branches`

## 目标

将 `src/cli/bg.ts` 中硬编码的 tmux 逻辑提取为引擎抽象层，实现 TmuxEngine + DetachedEngine，使后台会话功能在 Windows / macOS / Linux 上都能工作。

## 背景

当前 `bg.ts` 中 `handleBgFlag()` 和 `attachHandler()` 直接调用 tmux 命令。Windows 上 `--bg` 直接报错退出。需要一个引擎抽象层，根据平台和可用工具自动选择最佳方案。

## 文件清单

### 新增

| 文件 | 说明 |
|------|------|
| `src/cli/bg/engine.ts` | BgEngine 接口 + BgStartOptions/BgStartResult 类型 |
| `src/cli/bg/engines/tmux.ts` | TmuxEngine: 从 `bg.ts` 提取 tmux 相关逻辑 |
| `src/cli/bg/engines/detached.ts` | DetachedEngine: spawn({ detached }) + logFile 重定向 |
| `src/cli/bg/engines/index.ts` | selectEngine() 自动选择 + re-export |
| `src/cli/bg/tail.ts` | 跨平台日志 tail: fs.watch + 轮询 fallback |

### 修改

| 文件 | 变更 |
|------|------|
| `src/cli/bg.ts` | `handleBgFlag()` 改为调用 `selectEngine().start()`；`attachHandler()` 改为调用 `engine.attach()` |

## 实现方案

### 1. BgEngine 接口 (`src/cli/bg/engine.ts`)

```typescript
export interface BgEngine {
  readonly name: string
  available(): Promise<boolean>
  start(opts: BgStartOptions): Promise<BgStartResult>
  attach(session: SessionEntry): Promise<void>
}

export interface BgStartOptions {
  sessionName: string
  args: string[]         // CLI args (去除 --bg)
  env: Record<string, string | undefined>
  logPath: string
  cwd: string
}

export interface BgStartResult {
  pid: number
  sessionName: string
  logPath: string
  engineUsed: 'tmux' | 'detached'
}
```

### 2. TmuxEngine (`src/cli/bg/engines/tmux.ts`)

从 `bg.ts:handleBgFlag()` 和 `bg.ts:attachHandler()` 提取:
- `available()`: `execFileNoThrow('tmux', ['-V'])` 返回 code === 0
- `start()`: `tmux new-session -d -s <name> <cmd>`
- `attach()`: `tmux attach-session -t <session.tmuxSessionName>`

### 3. DetachedEngine (`src/cli/bg/engines/detached.ts`)

```typescript
export class DetachedEngine implements BgEngine {
  readonly name = 'detached'

  async available(): Promise<boolean> {
    return true  // 总是可用
  }

  async start(opts: BgStartOptions): Promise<BgStartResult> {
    const logFd = openSync(opts.logPath, 'a')
    const child = spawn(process.execPath, [process.argv[1]!, ...opts.args], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: opts.env,
      cwd: opts.cwd,
    })
    child.unref()
    closeSync(logFd)

    return {
      pid: child.pid!,
      sessionName: opts.sessionName,
      logPath: opts.logPath,
      engineUsed: 'detached',
    }
  }

  async attach(session: SessionEntry): Promise<void> {
    // 委托给 tail.ts
    await tailLog(session.logPath!)
  }
}
```

### 4. 日志 Tail (`src/cli/bg/tail.ts`)

```typescript
/**
 * 跨平台实时日志输出。Ctrl+C 退出，不杀后台进程。
 *
 * 策略:
 * 1. 读取已有内容输出
 * 2. fs.watch() 监听文件变化 (主方案)
 * 3. 如果 fs.watch 不可靠 (某些 Windows 网络驱动器)，fallback 到 500ms 轮询
 */
export async function tailLog(logPath: string): Promise<void>
```

### 5. 引擎选择 (`src/cli/bg/engines/index.ts`)

```typescript
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

### 6. bg.ts 重构

`handleBgFlag()` 改名为 `handleBgStart()`，内部逻辑:
```typescript
export async function handleBgStart(args: string[]): Promise<void> {
  const engine = await selectEngine()
  const sessionName = `claude-bg-${randomUUID().slice(0, 8)}`
  const logPath = join(getClaudeConfigHomeDir(), 'sessions', 'logs', `${sessionName}.log`)

  const result = await engine.start({
    sessionName,
    args: filteredArgs,
    env: { ...process.env, CLAUDE_CODE_SESSION_KIND: 'bg', ... },
    logPath,
    cwd: process.cwd(),
  })

  console.log(`Background session started: ${result.sessionName}`)
  console.log(`  Engine: ${result.engineUsed}`)
  console.log(`  Log: ${result.logPath}`)
  console.log(`  Use \`claude daemon attach ${result.sessionName}\` to reconnect.`)
}
```

`attachHandler()` 根据 `session.engine` 字段选择引擎:
```typescript
export async function attachHandler(target: string | undefined): Promise<void> {
  // ... 找到 session
  if (session.engine === 'tmux' && session.tmuxSessionName) {
    const tmux = new TmuxEngine()
    await tmux.attach(session)
  } else {
    const detached = new DetachedEngine()
    await detached.attach(session)
  }
}
```

## SessionEntry 扩展

`sessions/<PID>.json` 新增 `engine` 字段:

```json
{
  "pid": 12345,
  "engine": "detached",
  "logPath": "~/.claude/sessions/logs/claude-bg-a1b2c3d4.log",
  "sessionId": "...",
  "cwd": "..."
}
```

兼容旧格式: 如果 `engine` 字段缺失，检查 `tmuxSessionName` 存在则为 `tmux`，否则为 `detached`。

## 验证清单

- [ ] Windows: `claude daemon bg` 启动后台会话，无 tmux 依赖
- [ ] Windows: `claude daemon attach <name>` 以 tail 模式附着，Ctrl+C 退出不杀进程
- [ ] macOS/Linux (有 tmux): 行为与当前一致
- [ ] macOS/Linux (无 tmux): 自动 fallback 到 detached 引擎
- [ ] `claude daemon status` 正确显示 engine 类型
- [ ] 旧格式 session JSON (无 engine 字段) 兼容
- [ ] tsc --noEmit 零错误
- [ ] bun test 通过

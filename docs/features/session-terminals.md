# 会话终端（Session Terminals）— 持久化 PTY 侧边栏

> 状态：传输可靠性方案已实现 · Feature flag：`SESSION_TERMINALS` · 更新：2026-07-14

为每个会话（对话）提供**与会话强绑定的持久化 PTY 终端**。模型通过一组终端工具执行多轮、长周期、跨终端的任务；用户在 Web 界面（Chat / Code 两种外壳通用）的右侧终端栏里实时看到一切，并可随时亲自介入敲键盘。

## 1. 动机与定位

`Bash` 工具是**一次性**的：每次调用新起进程，无环境延续（cd/venv/ssh 全部丢失），不适合：

- **多轮任务**：激活 venv → 装依赖 → 跑训练 → 看日志，跨越多个对话轮次
- **长周期命令**：构建、部署、迁移 —— 模型需要"边等边看"，并决定是否介入
- **交互式程序**：ssh、数据库 shell、向导式 CLI（需要对提示作答）
- **跨终端场景**：集群部署（每台机器一个 ssh 终端）+ 独立监控终端（tail/watch）

会话终端 = tmux 之于人类。**终端生命周期与会话进程一致**，模型与用户共享同一批终端。

## 2. 架构

```
┌──────────── 浏览器（Chat/Code 外壳通用） ────────────┐
│ SessionDetail                    右侧终端栏（xterm.js）│
│  对话流                            [main][deploy-a]… │
└───────▲──────────────────────────────────┬──────────┘
   SSE  │ live_event（无游标）       POST   │ /live-events（command_id）
        │                                  ▼
┌────────────────────────────── RCS ──────────────────────────────────────────┐
│ 持久通道：对话/权限事件 + delivery ACK；实时通道：全部 terminal_* / interrupt │
└───────▲──────────────────────────────────┬──────────────────────────────┘
    POST │ worker/live-events              │ SSE worker_command（无 id）
        │                                  ▼
┌────────────── 会话进程（bridge 子进程 或 REPL attach）──────────────┐
│ RemoteIO/StructuredIO ⇄ TerminalManager ⇄ PtyBackend(python3 pty) │
│        ▲                                                          │
│  Terminal / TerminalRead 工具（模型侧入口）                          │
└───────────────────────────────────────────────────────────────────┘
```

**关键决策**

| 决策 | 理由 |
|---|---|
| 终端活在**会话进程**内 | "与对话强绑定"的唯一自然实现；模型工具零 IPC 直达；进程退出终端随之回收 |
| RCS 使用**持久/实时双通道** | 对话事件允许 ACK 后恢复；PTY 原始数据只在线转发、至多一次、不落库、不补发 |
| Code worker 固定使用 **SSE + CCR** | 旧 Session-Ingress WS 会在 Code 会话上以 1002 拒绝；Chat/ACP 的无关 WS 不受影响 |
| PTY 用 **python3 `pty` 包装** | node-pty 在 Bun 1.3.8 下 broken（实测：可收输入回显、子 shell 输出不流动）；python3 macOS/Linux 全平台自带，实测 PASS（真 `/dev/ttys*`、ANSI 完整）。`PtyBackend` 留接口，将来可无缝换回 node-pty / Bun 原生 |
| 输出 **40ms 合帧** | 控制 bus 事件量与 SSE 帧率；xterm.write 天然支持分块 ANSI |

## 3. 模型工具设计

拆成**两个工具**以对齐权限系统：写侧需要授权，读侧 `isReadOnly()` 免确认，模型可以放心高频查看。

### 3.1 `Terminal`（写侧，走权限）

```ts
{
  action: 'open' | 'run' | 'input' | 'keys' | 'signal' | 'resize' | 'close',
  term: string,          // 终端名，如 "main" / "deploy-gpu01" / "monitor"
  // open
  cwd?: string, purpose?: string, cols?: number, rows?: number,
  // run —— 最常用的复合动作：写入命令 + 等待完成/条件
  command?: string,
  wait?: WaitSpec,       // 缺省 { until: 'prompt', timeout_s: 60 }
  // input
  text?: string, enter?: boolean,
  // keys
  keys?: ('enter'|'tab'|'up'|'down'|'left'|'right'|'esc'|'ctrl-c'|'ctrl-d'|'ctrl-z'|'ctrl-r'|'ctrl-l'|'space'|'backspace')[],
  // signal
  signal?: 'SIGINT' | 'SIGTERM' | 'SIGKILL',
}
```

| action | 语义 | 返回 |
|---|---|---|
| `open` | 创建命名持久终端（zsh/bash 登录 shell，注入 OSC 133 提示符标记） | 终端信息 |
| `run` | 写入整行命令并按 `wait` 等待 → **一次调用拿到输出**；命令仍在跑则如实返回 `still_running: true` | 新增输出（截断保护）+ 耗时 + 完成态 + exit code（OSC 133 可得时） |
| `input` | 原样写入文本（交互式问答、REPL 内输入），`enter` 控制是否回车 | 写入确认 + 静默 300ms 后的即时回显 |
| `keys` | 发送特殊键序列（方向键选菜单、Ctrl-C 等） | 同上 |
| `signal` | 向**前台进程组**发信号（SIGINT=打断，SIGKILL=最后手段） | 信号结果 + 随后 2s 输出 |
| `resize` / `close` | 调整尺寸 / 关闭并回收 | — |

### 3.2 `TerminalRead`（只读，免确认）

```ts
{
  action: 'read' | 'wait' | 'list',
  term?: string,
  // read
  mode?: 'new' | 'tail' | 'full',  // new=自上次读取的增量（默认）；tail=末 N 行；full=整个滚动缓冲
  lines?: number,
  // wait —— 等待原语（核心）
  wait?: WaitSpec,
}

type WaitSpec = {
  until: 'prompt' | 'silence' | 'pattern' | 'exit',
  pattern?: string,      // until=pattern：正则，命中即返回（如 "BUILD (SUCCESS|FAILED)|error:"）
  silence_ms?: number,   // until=silence：静默阈值，默认 2000
  timeout_s: number,     // 必填，硬上限；超时不是错误，返回 timed_out: true + 期间输出
}
```

| action | 语义 |
|---|---|
| `read` | 读输出。`new` 有游标（每工具调用方独立），不会重复读；ANSI 已渲染为纯文本 |
| `wait` | 阻塞至条件满足或超时。**返回命中原因 + 期间新输出 + 耗时**。`until:'prompt'` 基于 OSC 133 shell 集成（精确，含 exit code）；无集成时自动降级 silence |
| `list` | 全部终端：名称、purpose、cwd、前台命令、存活、最后活动时间、末 2 行预览 |

**输出截断保护**：单次返回 >8KB 时保留头 2KB + 尾 6KB，中间以 `[... N 行省略，可用 read full 查看 ...]` 替代 —— 防日志刷屏撑爆上下文。

### 3.3 场景手册（写入工具 prompt，模型行为规范）

**① 等待策略速查**

| 命令类型 | 策略 |
|---|---|
| 快命令（<30s：ls/git/pip） | `run` 默认（prompt + 60s） |
| 已知里程碑输出（构建/测试/部署） | `run` + `wait:{until:'pattern', pattern:'里程碑或错误正则', timeout_s: 600}` |
| 未知时长批任务 | `run` + 长超时；超时后进入 **介入决策流程②** |
| 常驻进程（dev server / tail -f / top / watch） | **专用命名终端**跑，**绝不 wait 完成**；转身做别的，之后 `read new` 抽查 |
| 交互式程序（ssh 首连/向导/REPL） | `run` 短超时进入 → `read` 看提示 → `input`/`keys` 作答，循环 |

**② 长任务介入决策**（wait 超时后依次判断）：

1. `read new` 看最新输出——
2. **卡在交互提示**（`[y/N]`、密码、菜单）→ 能确定答案就 `input` 作答；涉及密码/破坏性确认 → **停下问用户**
3. **仍在正常出活**（日志在滚、进度在涨）→ 继续 `wait`，同一命令最多 3 轮，之后向用户汇报进度并询问
4. **疑似挂死**（长时间静默且无完成迹象）→ 报告已见输出，`signal SIGINT`（需要时再 SIGTERM/SIGKILL 升级），检查现场，换策略重试
5. **永远不要**盲目重复同一条挂死命令

**③ 多终端编排规范**（集群部署/监测类任务）：

- 命名即文档：`deploy-web01`、`deploy-web02`、`monitor-nginx`、`db-migrate`
- 每台目标机 **一个专属 ssh 终端**（长连接复用，避免反复握手）
- 部署动作与观测分离：部署终端执行变更；`monitor-*` 终端跑 `kubectl get pods -w`、`tail -f`，用 `read new` 巡检
- 并行推进：A 机在跑长任务时切去操作 B 机，用 `TerminalRead wait pattern` 回头验收
- 收尾：任务完成后 `close` 掉一次性终端，常驻监控终端保留并告知用户

**④ 安全红线**：不在命令行里明文输密码/密钥（引导用户到 Web 终端栏亲自输入）；`rm -rf`、`drop`、生产环境变更类命令先向用户确认；`signal` 只发给自己开的终端。

## 4. 事件协议（SDK 消息扩展）

会话进程 → Web（`POST /v1/code/sessions/:id/worker/live-events`，RCS Web SSE 以无游标 `live_event` 转发）：

```ts
{ type: 'terminal_state', uuid, terminals: [{ id, name, purpose, cwd, cols, rows, alive, stream_id, fg_command, last_activity }] }
{ type: 'terminal_output', uuid, term_id, stream_id, output_seq, data }
{ type: 'terminal_snapshot', uuid, term_id, stream_id, through_output_seq, data }
```

Web → 会话进程（`POST /web/sessions/:id/live-events` → 当前 ready worker SSE generation）：

```ts
{ type: 'terminal_input',  command_id, term_id, data }
{ type: 'terminal_resize', command_id, term_id, cols, rows }
{ type: 'terminal_open',   command_id, name? }
{ type: 'terminal_close',  command_id, term_id }
{ type: 'terminal_sync',   command_id }
```

挂载点：

- **headless（bridge 子进程）**：入站 `src/cli/structuredIO.ts` 未知类型丢弃处之前路由 `terminal_*`；出站由 `src/services/terminal/events.ts` 的 writer 注册表（print.ts 启动时注册 `structuredIO.write`）
- **REPL attach**：入站 `onInboundMessage` 回调；出站 `handle.writeSdkMessages`
- 输入命令由浏览器生成 UUID；失败或结果不确定时不自动重试。worker 在最终 PTY 副作用前以 10 分钟、16384 项 LRU 去重
- 输出、状态与快照同样使用单次实时 POST；请求失败时不进入批量重试队列，由下一次 `terminal_sync` 快照修复缺口
- 输出在每个 `stream_id` 内使用单调 `output_seq`；快照先 flush，并以 `through_output_seq` 建立去重水位线
- 事件量控制：输出合帧 40ms + 单帧上限 16KB；resize 使用 150ms trailing debounce，±1 列抖动等待 500ms 稳定

## 5. PTY 后端

`src/services/terminal/ptyWrapper.py`（内联为 TS 常量，运行时写入临时目录执行）：

```
python3 wrapper.py <shell> [args…]
  · pty.fork 起 shell，双向拷贝 stdio ⇄ pty master
  · SIGWINCH 时从 $CCB_PTY_SIZE_FILE 读 "rows cols" → ioctl(TIOCSWINSZ)
  · 子进程退出码原样透传
```

- shell 选择：`$SHELL` → zsh → bash；`open` 后注入 shell 集成（zsh `precmd`/bash `PROMPT_COMMAND` 输出 `OSC 133;D;<exit>` + `OSC 133;A`），供 `wait until:'prompt'` 与 exit code 采集
- 每终端环形缓冲 **512KB**（渲染前原始 ANSI），另维护 stripAnsi 后的行缓冲用于正则匹配
- 会话进程退出：SIGHUP 全部终端（挂 `registerCleanup`）

## 6. Web UI 规格（Apple Terminal 风格）

**布局**：`SessionDetail` 右侧可拖宽抽屉（默认 440px，320–60% 可调），Chat / Code 两外壳通用。头部工具栏出现「终端」开关按钮（含活跃数角标）。

**渲染**：`@xterm/xterm` + fit addon。每终端一个持久实例（切 tab 不销毁），SSE `terminal_output` 直接 `term.write(data)`；键入 `onData` → POST `terminal_input`；容器 resize → fit → POST `terminal_resize`。

**视觉（对标 macOS Terminal.app Basic 主题）**：

- 标题栏：左侧三枚 12px 圆点（#FF5F57 / #FEBC2E / #28C840，纯装饰）+ 居中终端名 — purpose（SF 风格小字）
- Tab 条：多终端切换；模型正在写入的终端 tab 显示橙色 spark 脉冲，用户输入焦点显示蓝点
- 字体 `SF Mono, JetBrains Mono, Menlo, monospace` 12.5px / 行高 1.4
- 暗色：背景 `#1E1E1E`、文字 `#E8E6E3`、光标块 `#D77757`（品牌橙）；浅色：`#FFFFFF`/`#1A1917`
- ANSI 16 色对齐 macOS Terminal 默认表
- 状态栏（底部细条）：`cwd · 80×24 · 已连接`；断线变黄提示重连
- 空态：居中 Clawd 像素图 + 「模型或你都可以在这里开一个终端」+ 新建按钮

**来源区分**：模型触发的输入在对话流里已有工具卡；终端栏内不回显来源标签，仅 tab 指示灯区分，保持界面纯净。

## 7. 权限与安全

- `Terminal`（写侧）完整走 canUseTool 权限管线：default 模式逐次确认（同名终端可 "always allow"）；`acceptEdits`/`bypassPermissions` 按各自语义放行
- `TerminalRead` 只读免确认
- Web 键盘输入 = 用户本人操作，不经模型权限；但同样能被模型 `read` 到（共享现场）
- 敏感输入：工具 prompt 明确要求模型引导用户在 Web 终端亲自输入密码
- `terminal_input/output/state/snapshot/resize/sync/open/close` 不写入 `session_events`；日志只记录类型、ID、字符数和连接状态，不记录按键或输出正文
- worker 不 ready 时终端只读并显示“终端正在重连，输入未发送”；恢复后只请求一次新快照，不重放旧按键

## 8. 文件清单

| 路径 | 内容 |
|---|---|
| `src/services/terminal/ptyBackend.ts` | python wrapper 封装：spawn/write/resize/signal/kill |
| `src/services/terminal/manager.ts` | TerminalManager 单例：命名终端表、环形缓冲、读游标、等待原语（prompt/silence/pattern/exit）、OSC 133 解析、订阅广播 |
| `src/services/terminal/events.ts` | SDK 消息构造 + 出站 writer 注册表 + 合帧器 |
| `src/services/terminal/inbound.ts` | 入站 `terminal_*` 路由（structuredIO / useReplBridge 共用） |
| `packages/remote-control-server/src/transport/live-events.ts` | worker/Web 双向实时通道与单活动 generation |
| `packages/remote-control-server/src/transport/event-delivery-policy.ts` | 持久与实时事件显式策略表 |
| `packages/remote-control-server/src/persistence/schema.ts` | delivery 状态表及历史 terminal 事件清理迁移 |
| `src/services/terminal/ptyWrapper.py.ts` | wrapper 脚本内联常量 |
| `packages/builtin-tools/src/tools/TerminalTool/` | `Terminal` + `TerminalRead` + prompt.ts（场景手册） |
| `src/tools.ts` | 注册（`feature('SESSION_TERMINALS')` 门控） |
| `web/src/terminal/TerminalPanel.tsx` | 侧边栏（tab/标题栏/状态栏/xterm 实例池） |
| `web/src/terminal/useSessionTerminals.ts` | 消费 SSE terminal_* / 发送 input·resize·sync |
| `web/src/pages/SessionDetail.tsx` | 集成开关与抽屉 |

## 9. 分期

- **V1（本期）**：上述全部 —— 双工具、四种等待、多终端、Web 侧边栏、双向键入、重连恢复（sync + snapshot）
- **V2**：终端录制回放、`Monitor` 工具桥接（输出行→通知）、按 GB 配置的输出降频、Windows（ConPTY）支持、node-pty 后端探测切换

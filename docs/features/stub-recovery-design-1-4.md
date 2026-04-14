# Stub 恢复设计 1-4

> 日期：2026-04-12
> 目标：基于当前代码边界，为下一阶段 4 个 stub/半 stub 命令面给出可实施的设计方案。
> 排序原则：按建议实施顺序排序，不按问题严重性排序。

## 设计原则

- 先做能独立闭环、收益明确、改动边界清晰的项。
- 大项拆成 `MVP` 和 `Phase 2+`，避免一次性掉进大范围恢复。
- 优先复用已有状态、传输层、日志与配置能力，不重造协议。
- 设计以当前仓库实际代码为准，不以旧文档的理想状态为准。

## 1. `claude daemon status` / `claude daemon stop`

### 现状

- `start` 路径已有完整 supervisor + worker 生命周期：
  [src/daemon/main.ts](</e:/Source_code/Claude-code-bast/src/daemon/main.ts:1>)
  [src/daemon/workerRegistry.ts](</e:/Source_code/Claude-code-bast/src/daemon/workerRegistry.ts:1>)
- `status` / `stop` 目前只是占位输出：
  [src/daemon/main.ts](</e:/Source_code/Claude-code-bast/src/daemon/main.ts:49>)
- `/remote-control-server` 有自己的命令内 UI 状态，但只维护当前进程内的 `daemonProcess`，并不适合作为跨进程 CLI 管理基础：
  [src/commands/remoteControlServer/remoteControlServer.tsx](</e:/Source_code/Claude-code-bast/src/commands/remoteControlServer/remoteControlServer.tsx:32>)

### 目标

- 让 `claude daemon status` 和 `claude daemon stop` 在另一个 CLI 进程中也能正确工作。
- 不依赖 TUI 内存态，不要求当前命令进程就是启动 daemon 的那个进程。

### MVP 方案

- 新增 daemon 状态文件，例如：
  `~/.claude/daemon/remote-control.json`
- `start` 时写入：
  - supervisor pid
  - cwd
  - startedAt
  - worker kinds
  - 最近状态
- `status`：
  - 读取状态文件
  - 用现有进程探测能力验证 pid 是否存活
  - 输出 `running / stopped / stale`
  - stale 时自动清理状态文件
- `stop`：
  - 读取 pid
  - 发送 `SIGTERM`
  - 等待退出
  - 超时后 `SIGKILL`
  - 清理状态文件

### 代码范围

- 新增 `src/daemon/state.ts`
- 修改 [src/daemon/main.ts](</e:/Source_code/Claude-code-bast/src/daemon/main.ts:1>)
- 轻量修改 [src/commands/remoteControlServer/remoteControlServer.tsx](</e:/Source_code/Claude-code-bast/src/commands/remoteControlServer/remoteControlServer.tsx:32>)，让 UI 尽量读取同一份状态文件

### 验证

1. `claude daemon start`
2. 新开终端执行 `claude daemon status`
3. 执行 `claude daemon stop`
4. 再次执行 `claude daemon status`，确认返回 `stopped` 或清晰的 `stale cleaned`

### 风险

- Windows 信号模型和 Unix 不同，`stop` 需要超时兜底。
- 当前设计默认单 supervisor，不处理多实例并发。

### 工作量判断

- 小
- 适合作为下一步的首选实现项

## 2. `BG_SESSIONS`

### 现状

- fast-path 已接好：
  [src/entrypoints/cli.tsx](</e:/Source_code/Claude-code-bast/src/entrypoints/cli.tsx:218>)
- session registry 已有真实实现：
  [src/utils/concurrentSessions.ts](</e:/Source_code/Claude-code-bast/src/utils/concurrentSessions.ts:1>)
- `exit` 在 bg session 内已会 `tmux detach-client`：
  [src/commands/exit/exit.tsx](</e:/Source_code/Claude-code-bast/src/commands/exit/exit.tsx:20>)
- 但 CLI handler 仍全空：
  [src/cli/bg.ts](</e:/Source_code/Claude-code-bast/src/cli/bg.ts:1>)
- task summary 仍然是 stub：
  [src/utils/taskSummary.ts](</e:/Source_code/Claude-code-bast/src/utils/taskSummary.ts:1>)

### 目标

- 先把 `ps` / `logs` / `kill` 做成真正有用的 session 管理命令。
- 不在第一阶段就强行补完 `attach` / `--bg`。

### Phase 2A：MVP

- 实现 `ps`
  - 从 registry 读取 live sessions
  - 展示 pid、kind、sessionId、cwd、name、startedAt、bridgeSessionId
  - 如果有 activity/status，则一并展示
- 实现 `logs`
  - 支持按 `sessionId / pid / name` 查找
  - 优先复用本地 transcript/log 读取能力
  - 如果 registry 里存在 `logPath`，支持 tail 文件
- 实现 `kill`
  - 解析目标 session
  - 发退出信号
  - 清理 stale registry

### Phase 2B：后续

- 实现 `attach`
- 实现 `--bg`
- 实现 `taskSummary` 的中途状态更新

### 为什么要拆

- 现有 registry 记录了 `pid / sessionId / name / logPath`
- 但没有可靠的 tmux attach target
- 所以 `attach` 和 `--bg` 不是简单补 handler，而是需要补启动/附着元数据设计

### 代码范围

- 修改 [src/cli/bg.ts](</e:/Source_code/Claude-code-bast/src/cli/bg.ts:1>)
- 修改 [src/utils/concurrentSessions.ts](</e:/Source_code/Claude-code-bast/src/utils/concurrentSessions.ts:1>) 以便后续 attach/--bg 扩展
- 修改 [src/utils/taskSummary.ts](</e:/Source_code/Claude-code-bast/src/utils/taskSummary.ts:1>)
- 复用：
  [src/utils/sessionStorage.ts](</e:/Source_code/Claude-code-bast/src/utils/sessionStorage.ts:3870>)
  [src/utils/udsClient.ts](</e:/Source_code/Claude-code-bast/src/utils/udsClient.ts:1>)

### 验证

1. `ps` 能列出 live sessions
2. `logs <sessionId|pid|name>` 能输出对应日志
3. `kill <sessionId|pid|name>` 能结束目标 session

### 风险

- `attach` / `--bg` 第二阶段需要 tmux 元数据设计
- Windows 下 tmux 路径需要明确降级策略

### 工作量判断

- `ps/logs/kill` 中等
- `attach/--bg` 明显更大，应分阶段

## 3. `TEMPLATES`

### 现状

- 命令入口只有 fast-path：
  [src/entrypoints/cli.tsx](</e:/Source_code/Claude-code-bast/src/entrypoints/cli.tsx:249>)
- handler 是空的：
  [src/cli/handlers/templateJobs.ts](</e:/Source_code/Claude-code-bast/src/cli/handlers/templateJobs.ts:1>)
- `markdownConfigLoader` 已把 `templates` 纳入配置目录：
  [src/utils/markdownConfigLoader.ts](</e:/Source_code/Claude-code-bast/src/utils/markdownConfigLoader.ts:29>)
- `query / stopHooks` 已预留 job classifier 链路：
  [src/query/stopHooks.ts](</e:/Source_code/Claude-code-bast/src/query/stopHooks.ts:103>)
- `jobs/classifier.ts` 仍是 stub：
  [src/jobs/classifier.ts](</e:/Source_code/Claude-code-bast/src/jobs/classifier.ts:1>)

### 目标

- 把 `new / list / reply` 做成可用的模板任务系统。
- 第一阶段不碰复杂的自动分类与自动执行。

### MVP 方案

- 模板来源：
  `.claude/templates/*.md`
- 模板格式：
  复用现有 markdown + frontmatter 解析，不另外设计 DSL
- `list`
  - 列出所有模板
  - 显示模板名、description、路径
- `new <template> [args...]`
  - 解析模板
  - 在 `~/.claude/jobs/<job-id>/` 下创建 job 目录
  - 写入 `template.md`、`input.txt`、`state.json`
  - 返回 job id 与目录
- `reply <job-id> <text>`
  - 将回复写入 `replies.jsonl` 或 `input.txt`
  - 更新 `state.json`

### Phase 2

- 恢复 [src/jobs/classifier.ts](</e:/Source_code/Claude-code-bast/src/jobs/classifier.ts:1>)
- 让带 `CLAUDE_JOB_DIR` 的 job session 在 turn 完成后自动更新 `state.json`
- 再决定是否补自动 job runner

### 为什么要拆

- 当前证据表明这是“template job commands”，不是单纯模板列表
- 但自动 job 运行链路没有足够现成实现，先做文件系统 job lifecycle 更稳

### 代码范围

- 修改 [src/cli/handlers/templateJobs.ts](</e:/Source_code/Claude-code-bast/src/cli/handlers/templateJobs.ts:1>)
- 新增 `src/jobs/state.ts`
- 新增 `src/jobs/templates.ts`
- Phase 2 再改 [src/jobs/classifier.ts](</e:/Source_code/Claude-code-bast/src/jobs/classifier.ts:1>)

### 验证

1. `list` 能列出 `.claude/templates`
2. `new` 能创建 job 目录和状态文件
3. `reply` 能更新 job 内容和状态
4. Phase 2 再验证 classifier 写状态

### 风险

- frontmatter schema 需要先定义最小字段集
- 一旦扩展到“自动运行 job”，范围会明显膨胀

### 工作量判断

- MVP 中等
- 完整 job 系统偏大

## 4. `assistant [sessionId]`

### 现状

- attach 主流程其实已经存在：
  [src/main.tsx](</e:/Source_code/Claude-code-bast/src/main.tsx:4708>)
- 远端 viewer 所需基础模块已存在：
  [src/remote/RemoteSessionManager.ts](</e:/Source_code/Claude-code-bast/src/remote/RemoteSessionManager.ts:1>)
  [src/hooks/useAssistantHistory.ts](</e:/Source_code/Claude-code-bast/src/hooks/useAssistantHistory.ts:1>)
  [src/assistant/sessionHistory.ts](</e:/Source_code/Claude-code-bast/src/assistant/sessionHistory.ts:1>)
- 真正 stub 的主要是：
  [src/assistant/sessionDiscovery.ts](</e:/Source_code/Claude-code-bast/src/assistant/sessionDiscovery.ts:1>)
  [src/assistant/AssistantSessionChooser.ts](</e:/Source_code/Claude-code-bast/src/assistant/AssistantSessionChooser.ts:1>)
  [src/commands/assistant/assistant.ts](</e:/Source_code/Claude-code-bast/src/commands/assistant/assistant.ts:7>)
  [src/assistant/index.ts](</e:/Source_code/Claude-code-bast/src/assistant/index.ts:1>)

### 目标

- 不一次性恢复整个 KAIROS 助手系统。
- 先做“明确 sessionId 的 viewer attach 可用”，再逐步补 discovery / chooser / install。

### Phase 4A：MVP

- 只支持 `claude assistant <sessionId>`
- 对 `claude assistant` 无参数模式，先返回明确提示：
  - 当前版本需要显式 `sessionId`
  - discovery 尚未启用
- 这样可以直接复用现有 attach 分支，不必先恢复 chooser/install wizard

### Phase 4B

- 恢复 `discoverAssistantSessions()`
- 数据来源优先复用现有 sessions / bridge / teleport API，而不是新协议
- 让 `claude assistant` 无参数时能拿到候选 session 列表

### Phase 4C

- 恢复 `AssistantSessionChooser`
- 多 session 时可交互选择

### Phase 4D

- 最后考虑 install wizard 辅助函数
- 这部分属于“没有 session 时如何引导”，不是 attach 核心路径

### 为什么要拆

- attach 渲染层与远端消息通道大部分已经在
- 真正缺的是“如何发现目标 session”和“如何交互选择”
- 如果把 `src/assistant/index.ts` 的整套 KAIROS 正常模式也一起拉进来，范围会失控

### 代码范围

- Phase 4A：
  - [src/main.tsx](</e:/Source_code/Claude-code-bast/src/main.tsx:4708>)
  - [src/commands/assistant/index.ts](</e:/Source_code/Claude-code-bast/src/commands/assistant/index.ts:1>)
- Phase 4B：
  - [src/assistant/sessionDiscovery.ts](</e:/Source_code/Claude-code-bast/src/assistant/sessionDiscovery.ts:1>)
- Phase 4C：
  - [src/assistant/AssistantSessionChooser.ts](</e:/Source_code/Claude-code-bast/src/assistant/AssistantSessionChooser.ts:1>)
- Phase 4D：
  - [src/commands/assistant/assistant.ts](</e:/Source_code/Claude-code-bast/src/commands/assistant/assistant.ts:7>)

### 验证

1. `claude assistant <sessionId>` 能进入 remote viewer
2. 历史懒加载工作正常
3. 无参数模式先给出明确提示
4. 后续阶段再分别验证 discovery / chooser / install

### 风险

- 这是四项里范围最大的
- 一旦把 KAIROS 正常模式整体拉入，会从“viewer attach”膨胀成“完整 assistant mode 恢复”

### 工作量判断

- Phase 4A 中等
- 4A-4D 全做完很大

## 建议执行顺序

1. `claude daemon status` / `claude daemon stop`
2. `BG_SESSIONS` 先做 `ps/logs/kill`
3. `TEMPLATES` 先做 job 文件系统 MVP
4. `assistant [sessionId]` 先做显式 sessionId attach，再补 discovery/chooser/install

## 简短结论

这四项里，最适合立刻实现的是 `daemon status/stop`。`BG_SESSIONS` 和 `TEMPLATES` 适合按 MVP 先补 handler 与文件系统闭环。`assistant [sessionId]` 不能整块硬上，应该按“attach → discovery → chooser → install”拆开恢复。

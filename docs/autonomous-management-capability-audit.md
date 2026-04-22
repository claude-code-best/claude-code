# 当前自治管理能力清单与实现状态审计

审计日期：2026-04-18

范围：本报告只覆盖“自治管理”相关能力，即自动权限判定、后台/守护运行、子代理/团队协调、任务列表、定时/心跳、远程控制、主动循环、自动化运行记录，以及这些能力的辅助通信/监控工具。普通文件读写、基础 REPL、模型兼容层等非自治能力不展开。

状态定义：

- 完整实现：入口、运行时逻辑、持久化或状态管理、失败处理基本闭环。
- 最小实现：核心路径可用，但边界、平台、恢复或体验仍较薄。
- 薄封装：只是把外部服务/API/文本流程包装成工具，主要执行不在本地闭环里完成。
- 占位：入口或接口存在，但核心实现返回空、无动作或仅用于未来扩展。
- 受限：依赖 feature flag、`USER_TYPE === 'ant'`、GrowthBook、OAuth 订阅、策略或平台条件。
- 远端依赖：核心执行依赖 claude.ai/CCR/远端 API，不是本地自足能力。

## 总览结论

当前项目已经具备一套分层自治体系，而不是单个“自治管理”模块：

1. **本地自治执行层**：`/proactive`、Cron、autonomy run/flow、Monitor、后台 Agent、后台 shell/task 输出。
2. **权限自治层**：`auto` permission mode 通过 LLM classifier 判定工具调用，带危险 allow 规则剥离、熔断、模型/设置/计划限制。
3. **多代理协调层**：`AgentTool`、`TeamCreate`、`TeamDelete`、`SendMessage`、任务列表、teammate mailbox、in-process/tmux/iTerm2 后端。
4. **进程/会话管理层**：`daemon` supervisor、`--bg`/background sessions、PID registry、attach/logs/kill。
5. **终端通讯层**：pipes/UDS named pipe、LAN TCP pipe、peer registry、attach/detach/send/history。
6. **远端自治层**：Remote Control bridge、CCR remote session、remote agent isolation、RemoteTrigger API。
7. **KAIROS/Assistant 层**：assistant attach、brief/user message、cron/proactive 结合，assistant team 初始化已完成本地 bootstrap。

成熟度最高的是 **Cron、任务列表、后台 Agent、Agent Teams、pipes/UDS 通讯、auto-mode 权限判定、daemon/bg 基础管理**。Agent Teams 已完成一轮抽离与闭环加固：主 spawn 路径已统一到 `TeammateExecutor`，并补回 `use_splitpane: false` legacy window 路径、iTerm2 setup prompt、Windows Terminal pane/window 后端、in-process kill/cleanup、TeamDelete graceful shutdown request、外部 `--agent-teams` 入口以及端到端生命周期测试。`/autonomy status --deep` 与 `claude autonomy status --deep` 已作为统一本地自治健康入口落地，可汇总 runs/flows、workflow runs、cron、team、pipes registry、daemon/bg session、Remote Control 本地配置、auto-mode 同步状态和 RemoteTrigger 本地审计。`WorkflowTool` 已升级为本地 workflow runner，支持 start/status/list/advance/cancel 和 `.claude/workflow-runs` 状态持久化。`initializeAssistantTeam()` 已实现 assistant 模式的 session-scoped in-process team bootstrap。Remote Control/CCR/RemoteTrigger 应定级为 **完整实现，远端/订阅运行条件**：订阅用户在 OAuth、GrowthBook、policy 满足时可走官方远端路径；self-hosted bridge/RCS 可替代部分控制面。ask-claude 外部审阅已确认当前自治管理可标记 COMPLETE，无阻止完整实现的代码缺口。Windows Terminal、RC/CCR/RemoteTrigger、KAIROS assistant attach 剩余项属于实机/订阅环境验收。

## 能力清单

| 能力 | 具体作用 | 入口 | 实现证据 | 当前状态 | 风险与后续 |
| --- | --- | --- | --- | --- | --- |
| Auto Mode 权限自治 | 用分类器自动判定原本需要确认的工具调用 | `--permission-mode auto`、`--enable-auto-mode`、`auto-mode` 子命令 | `src/main.tsx:1294`, `src/main.tsx:1831`, `src/main.tsx:5144`, `src/utils/permissions/permissions.ts:517`, `src/utils/permissions/yoloClassifier.ts:1015` | 完整实现，受限 | 依赖 `TRANSCRIPT_CLASSIFIER`、模型支持、GrowthBook/设置熔断；PowerShell 默认不进 classifier，除非 `POWERSHELL_AUTO_MODE`。 |
| Auto Mode 配置审计 | 输出默认/有效规则并让模型 critique 用户规则 | `claude auto-mode defaults/config/critique` | `src/main.tsx:5140`, `src/cli/handlers/autoMode.ts:18`, `src/cli/handlers/autoMode.ts:75` | 完整实现，受限 | 只在 `TRANSCRIPT_CLASSIFIER` 开启且 cached state 未 disabled 时注册；critique 依赖 API。 |
| 危险权限剥离与恢复 | 进入 auto 时移除会绕过 classifier 的 allow 规则，退出时恢复 | 权限模式转换内部 | `src/utils/permissions/permissionSetup.ts:510`, `src/utils/permissions/permissionSetup.ts:597`, `src/utils/permissions/permissionSetup.ts:1283` | 完整实现 | 规则识别覆盖 Bash/PowerShell/Agent/tmux 等危险模式，但仍需要持续补充模式库。 |
| 子代理同步执行 | 启动指定 agent，独立系统提示词和工具池，完成后返回结果 | `AgentTool` / legacy `Task` | `src/tools.ts:216`, `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:383`, `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:1066` | 完整实现 | 子代理工具池与权限模式会重组；自定义 agent 的 tools/disallowedTools 需要配置正确。 |
| 后台 Agent | Agent 可异步运行，完成后发 `<task-notification>`，支持输出文件、停止、恢复 | `AgentTool.run_in_background`、agent `background: true`、自动 background | `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:827`, `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:959`, `src/tasks/LocalAgentTask/LocalAgentTask.tsx:214`, `packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:871` | 完整实现 | 进程内生命周期依赖 AppState；输出存放在项目 temp 目录；部分恢复依赖 transcript。 |
| Agent worktree isolation | 给 Agent 创建临时 git worktree，完成后无改动自动清理，有改动保留 | `AgentTool.isolation = "worktree"` | `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:861`, `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:921` | 完整实现，受限 | 需要 git 或 hook 支持；有改动时保留 worktree，用户/后续 agent 需处理清理。 |
| Remote agent isolation | Agent 任务丢到 CCR 远端环境执行 | `AgentTool.isolation = "remote"` | `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:667`, `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:679`, `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:691` | 远端依赖，受限 | `USER_TYPE === 'ant'` 路径；依赖 remote eligibility、OAuth、CCR；本地只注册 remote task 与输出路径。 |
| Fork subagent | 省略 `subagent_type` 时继承父上下文，强制后台 async，使用 cache-identical prompt | `AgentTool`，`FORK_SUBAGENT` | `packages/builtin-tools/src/tools/AgentTool/forkSubagent.ts:19`, `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:478`, `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:812` | 完整实现，受限 | feature gate 控制；递归 fork 被拒绝；所有 agent spawn 会被 force async。 |
| Agent Teams / Swarm | 创建团队、spawn teammate、共享任务列表和 mailbox | `TeamCreate`、`AgentTool(name/team_name)`、`TeamDelete` | `src/tools.ts:249`, `packages/builtin-tools/src/tools/TeamCreateTool/TeamCreateTool.ts:92`, `packages/builtin-tools/src/tools/shared/spawnMultiAgent.ts:334`, `packages/builtin-tools/src/tools/TeamDeleteTool/TeamDeleteTool.ts:90` | 完整实现 | 主 spawn 路径已统一到 `TeammateExecutor`；TeamDelete 支持 graceful shutdown request 与可选等待；外部 `--agent-teams` 已注册；仍受 external killswitch 和真实终端后端可用性影响。 |
| In-process teammate | 在同进程用 AsyncLocalStorage 隔离 teammate，上报任务状态 | swarm backend | `src/utils/swarm/spawnInProcess.ts:1`, `src/utils/swarm/spawnInProcess.ts:104`, `src/utils/swarm/spawnInProcess.ts:344`, `src/utils/swarm/inProcessRunner.ts:1`, `src/utils/swarm/__tests__/spawnInProcess.test.ts:28` | 完整实现 | 适合无 tmux/iTerm 场景；TeamsDialog 已按 agentId kill/cleanup；已有真实 spawnInProcess + mailbox smoke；不能再 spawn background agents；依赖 leader 进程存活。 |
| tmux/iTerm2/Windows Terminal teammate | 通过 pane/backend 启动独立 CLI teammate | Agent team spawn、`--teammate-mode windows-terminal` | `packages/builtin-tools/src/tools/shared/spawnMultiAgent.ts:334`, `src/utils/swarm/backends/PaneBackendExecutor.ts:99`, `src/utils/swarm/backends/TmuxBackend.ts:152`, `src/utils/swarm/backends/WindowsTerminalBackend.ts:1`, `src/utils/swarm/backends/registry.ts:426`, `src/main.tsx:4617` | 完整实现到最小实现，平台受限 | `use_splitpane: false` 已恢复到 tmux separate-window 和 Windows Terminal new-window 路径；iTerm2 setup prompt 已接回；Windows Terminal 通过 `wt split-pane` 启动 teammate，支持 auto 检测和显式 `windows-terminal` 模式，并用 pid 文件 best-effort kill，但 wt.exe 不提供稳定 pane id/hide/show API。 |
| Teammate/Agent 通信 | 向 teammate、后台 agent、UDS/bridge/TCP peer 发送消息、广播、计划批准、shutdown | `SendMessageTool` | `src/tools.ts:247`, `packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:520`, `packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:849`, `packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:755` | 完整实现，受限 | 跨 bridge/TCP 消息需要显式确认且仅支持 plain text；structured messages 仅本 team。 |
| Pipes / UDS / LAN 终端通讯 | 多个 CLI/终端实例互传消息、attach/detach、主从控制、历史查看、LAN TCP peer | `/peers`、`/who`、`/attach`、`/detach`、`/send`、`/pipes`、`/pipe-status`、`/history`、`/claim-main`、`SendMessageTool` | `src/commands.ts:122`, `src/utils/pipeTransport.ts:1`, `src/utils/pipeRegistry.ts:1`, `src/hooks/usePipeIpc.ts:1`, `packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:789`, `packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:812`, `src/utils/pipeStatus.ts:1` | 完整实现，平台/权限受限 | UDS/named pipe 和 LAN TCP 均有实现；跨机器 TCP/bridge 发送需要显式确认；`/autonomy status --deep` 已汇总 registry。 |
| 本地任务列表 Task V2 | 创建/读取/更新/列出任务，支持 owner、blocks/blockedBy、hook、锁 | `TaskCreate/Get/Update/List` 工具；`claude task` ant-only CLI | `src/tools.ts:239`, `src/utils/tasks.ts:284`, `packages/builtin-tools/src/tools/TaskCreateTool/TaskCreateTool.ts:62`, `packages/builtin-tools/src/tools/TaskUpdateTool/TaskUpdateTool.ts:212`, `src/main.tsx:5338` | 完整实现，部分受限 | 工具层 interactive 默认可用，non-interactive 需 `CLAUDE_CODE_ENABLE_TASKS`；CLI `task` 是 `USER_TYPE === 'ant'`。 |
| 任务输出与停止 | 读取后台任务输出、停止 background task | `TaskOutputTool`、`TaskStopTool` | `src/tools.ts:217`, `src/tools.ts:231`, `packages/builtin-tools/src/tools/TaskOutputTool/TaskOutputTool.tsx:151`, `packages/builtin-tools/src/tools/TaskStopTool/TaskStopTool.ts:72` | 完整实现，受限 | `TaskOutputTool` 对 ant 禁用且标记 deprecated，推荐直接 `Read` 输出文件；Stop 只对 AppState 中 running task 生效。 |
| Cron 定时自治 | 定时 enqueue prompt，支持 one-shot/recurring/session-only/durable | `CronCreate/Delete/List` 工具 | `src/tools.ts:31`, `packages/builtin-tools/src/tools/ScheduleCronTool/CronCreateTool.ts:52`, `src/utils/cronScheduler.ts:142`, `src/hooks/useScheduledTasks.ts:43`, `src/cli/print.ts:2775` | 完整实现 | Cron 只在进程运行时触发；durable 写 `.claude/scheduled_tasks.json`，missed one-shot 需要用户确认后执行。 |
| Cron 持久化与调度锁 | 文件任务持久化、调度锁、防双触发、jitter、过期 | `.claude/scheduled_tasks.json` | `src/utils/cronTasks.ts:1`, `src/utils/cronTasks.ts:161`, `src/utils/cronScheduler.ts:347`, `src/utils/cronScheduler.ts:396` | 完整实现 | 5 字段 cron 子集；本地时区；recurring 默认 7 天后最终触发并删除，permanent 只供 assistant 内建任务。 |
| Proactive 自治循环 | 每 30 秒注入 `<tick>`，让模型空闲时继续做事或 Sleep | `/proactive`、`--proactive`、KAIROS | `src/commands/proactive.ts:17`, `src/proactive/useProactive.ts:33`, `src/proactive/index.ts:37`, `src/main.tsx:4556` | 完整实现，受限 | 依赖 `PROACTIVE` 或 `KAIROS`；tick 会因 loading、plan mode、UI、队列暂停；API error 会 contextBlocked。 |
| Sleep 控制节奏 | proactive 模式下模型主动 sleep，支持中断 | `SleepTool` | `src/tools.ts:26`, `packages/builtin-tools/src/tools/SleepTool/SleepTool.ts:54` | 完整实现，受限 | 只有 `PROACTIVE` 或 `KAIROS` 构建会加载；proactive 关闭时 sleep 立即中断。 |
| Autonomy run 记录 | 对 proactive tick、scheduled task、managed flow step 建立 queued/running/completed/failed 记录 | `/autonomy`、内部 queue | `src/utils/autonomyRuns.ts:109`, `src/utils/autonomyRuns.ts:608`, `src/commands/autonomy.ts:117` | 完整实现 | 写 `.claude/autonomy/runs.json`；最多保留 200 条；是审计/恢复辅助，不直接驱动工具权限。 |
| Autonomy CLI / panel / deep status | 汇总本地自治健康状态，并管理 runs/flows | `/autonomy` 面板、`/autonomy ...`、`claude autonomy status/runs/flows/flow`、`claude autonomy status --deep` | `src/utils/autonomyCommandSpec.ts:1`, `src/commands/autonomy.ts:1`, `src/commands/autonomyPanel.tsx:1`, `src/cli/handlers/autonomy.ts:1`, `src/main.tsx:5162`, `src/utils/autonomyStatus.ts:1`, `src/utils/workflowRuns.ts:1`, `src/utils/pipeStatus.ts:1`, `src/utils/remoteControlStatus.ts:1`, `src/cli/handlers/__tests__/autonomy.test.ts:1` | 完整实现 | `/autonomy` 无参数走独立 local-jsx 面板并显示 14 个基础子项，覆盖 Auto mode、Runs、Flows、Cron、Workflow runs、Teams、Pipes、Runtime、Remote Control、RemoteTrigger 等 deep status sections；slash 与 CLI 共用 `autonomyCommandSpec` 和 handler；命令面板 `argumentHint`、usage、CLI 子命令描述集中管理；CLI 支持 status/runs/flows/flow detail/cancel/resume；CLI resume 会创建/恢复 run 并打印可执行 prompt，不依赖 REPL 内存队列。 |
| Autonomy authority / heartbeat | 自动 turn 注入 `.claude/autonomy/AGENTS.md`、`HEARTBEAT.md` authority，并启动 managed flow | 自动 turn 构造路径 | `src/utils/autonomyAuthority.ts:14`, `src/utils/autonomyAuthority.ts:375`, `src/utils/autonomyAuthority.ts:425`, `src/utils/autonomyRuns.ts:696` | 完整实现 | 仅 proactive tick 会消费 due heartbeat；managed flow 是本地文件状态机，需自动 turn 持续触发推进。 |
| Managed autonomy flows | HEARTBEAT step flow 的 queued/running/completed/blocked/cancelled 状态机 | `/autonomy flow ...` | `src/utils/autonomyFlows.ts:414`, `src/utils/autonomyFlows.ts:506`, `src/commands/autonomy.ts:37` | 最小实现到完整之间 | 状态和队列清晰；实际 step 执行仍通过普通 prompt/agent loop 完成，不是独立 workflow runner。 |
| Monitor 长驻命令 | 后台运行 tail/watch/poll 等长命令，并输出到任务文件 | `MonitorTool` | `src/tools.ts:43`, `packages/builtin-tools/src/tools/MonitorTool/MonitorTool.tsx:44`, `packages/builtin-tools/src/tools/MonitorTool/MonitorTool.tsx:130` | 完整实现，受限 | `MONITOR_TOOL` feature；复用 Bash 权限；命令可有副作用，模型需正确选择非交互命令。 |
| WorkflowTool | 执行并跟踪 `.claude/workflows` 中的 Markdown/YAML workflow | `WorkflowTool` | `src/tools.ts:254`, `packages/builtin-tools/src/tools/WorkflowTool/WorkflowTool.ts:20`, `packages/builtin-tools/src/tools/WorkflowTool/WorkflowTool.ts:269`, `src/utils/workflowRuns.ts:113`, `packages/builtin-tools/src/tools/WorkflowTool/__tests__/WorkflowTool.test.ts:21` | 完整实现 | 支持 start/status/list/advance/cancel，状态写入 `.claude/workflow-runs` 并进入 `/autonomy status --deep`；当前 runner 负责步骤状态推进，具体步骤动作仍由 agent 按返回提示执行。 |
| Daemon supervisor | `daemon start/stop/status` 管理长期 worker，崩溃重启、backoff、parking | `claude daemon ...` | `src/entrypoints/cli.tsx:181`, `src/daemon/main.ts:39`, `src/daemon/main.ts:216`, `src/daemon/state.ts:61` | 最小实现 | 当前 supervisor 固定只拉 `remoteControl` worker；状态文件以 `remote-control` 命名，不是泛化 worker manager。 |
| Daemon worker registry | 内部 `--daemon-worker=<kind>` 分派 worker | `--daemon-worker=remoteControl` | `src/entrypoints/cli.tsx:119`, `src/daemon/workerRegistry.ts:25`, `src/daemon/workerRegistry.ts:48` | 最小实现 | 只实现 `remoteControl`，未知 kind 直接 permanent error。 |
| Background sessions | 后台启动 CLI 会话，支持 status/logs/attach/kill，Windows 用 detached，Unix 优先 tmux | `--bg`、`--background`、`daemon bg/attach/logs/kill` | `src/entrypoints/cli.tsx:197`, `src/cli/bg.ts:281`, `src/cli/bg/engines/index.ts:5`, `src/cli/bg/engines/detached.ts:16`, `src/cli/bg/engines/tmux.ts:7` | 完整实现 | detached engine 无交互 TTY，要求 `-p/--print` 或 pipe；tmux 返回 pid 0，依赖子进程注册 PID 文件。 |
| Session registry | 所有顶层会话写 PID json，支持 ps/status、并发会话统计 | `~/.claude/sessions/<pid>.json` | `src/utils/concurrentSessions.ts:55`, `src/main.tsx:3070`, `src/cli/bg.ts:16` | 完整实现 | teammate/subagent 跳过注册；WSL 对 Windows PID 存活检查保守。 |
| Remote Control bridge | 本机作为 claude.ai/code 远控环境，poll work、spawn session、支持 same-dir/worktree/capacity | `claude remote-control|rc|remote|sync|bridge`、`--remote-control/--rc` | `src/entrypoints/cli.tsx:131`, `src/bridge/bridgeMain.ts:2002`, `src/bridge/bridgeMain.ts:2451`, `src/bridge/bridgeMain.ts:2914` | 完整实现，远端/订阅运行条件 | 订阅用户满足 OAuth/profile scope/org policy/GrowthBook 时可用；self-hosted bridge 可绕过官方订阅 gate；远端不可达时是运行条件失败，不是本地占位。 |
| Bridge headless daemon | daemon worker 中无 TUI 运行 Remote Control，预创建 session，可多 session | `daemon start` -> worker -> `runBridgeHeadless` | `src/daemon/main.ts:216`, `src/daemon/workerRegistry.ts:48`, `src/bridge/bridgeMain.ts:2800`, `src/bridge/bridgeMain.ts:2928` | 完整实现，远端/订阅运行条件 | trust 未接受、HTTP 非 localhost、worktree 不可用等会 permanent error；auth/token 是关键运行风险。 |
| Remote session / teleport | 本地创建或恢复 CCR remote session，CLI 可进入 remote TUI | `--remote`、`--teleport` | `src/main.tsx:4033`, `src/main.tsx:4044`, `src/main.tsx:4080`, `src/main.tsx:4157` | 完整实现，远端/订阅运行条件 | 依赖 `allow_remote_sessions` policy、OAuth、远端后端 gate；非 remote TUI 时只打印链接并退出。 |
| RemoteTrigger | 管理远端 scheduled remote agent triggers，并记录本地调用审计 | `RemoteTriggerTool` | `src/tools.ts:39`, `packages/builtin-tools/src/tools/RemoteTriggerTool/RemoteTriggerTool.ts:48`, `packages/builtin-tools/src/tools/RemoteTriggerTool/RemoteTriggerTool.ts:151`, `src/utils/remoteTriggerAudit.ts:28`, `src/utils/autonomyStatus.ts:136` | 完整实现，远端/订阅运行条件；本地审计完整 | 订阅/OAuth/policy/GrowthBook 满足时可走官方远端触发；本地已记录 success/failure、status、error、audit_id 到 `.claude/remote-trigger-audit.jsonl`。 |
| KAIROS assistant attach | 连接到运行中的 assistant/bridge session，viewer-only REPL | `claude assistant [sessionId]` | `src/main.tsx:829`, `src/main.tsx:5197`, `src/main.tsx:3880`, `src/assistant/sessionDiscovery.ts:17` | 最小实现，远端依赖，受限 | discovery 走 Sessions API；无 session 时触发安装向导；具体 installer 不在本次展开。 |
| KAIROS assistant prompt addendum | 加载 `~/.claude/agents/assistant.md` 到系统提示词 | `--assistant` / KAIROS gate | `src/assistant/index.ts:42`, `src/main.tsx:2719` | 最小实现 | 文件不存在则空字符串；没有校验或默认内容。 |
| Assistant team initialization | assistant 模式预创建 session-scoped in-process team | `initializeAssistantTeam()` | `src/assistant/index.ts:27`, `src/main.tsx:1491`, `src/assistant/__tests__/index.test.ts:34` | 完整实现，受限 | 生成 assistant team file、leader teamContext、team task list；仍受 KAIROS/assistant gate 控制。 |
| Brief/User message | 自治任务主动向用户发送可见消息/附件 | `BriefTool` / legacy `SendUserMessage`、`--brief` | `src/tools.ts:13`, `packages/builtin-tools/src/tools/BriefTool/BriefTool.ts:89`, `packages/builtin-tools/src/tools/BriefTool/BriefTool.ts:150` | 完整实现，受限 | 依赖 `KAIROS` 或 `KAIROS_BRIEF`、opt-in 或 assistant mode；附件需路径校验和 bridge 上传路径。 |
| Push notification / PR subscription / review artifact | KAIROS 周边通知与 webhook | `PushNotificationTool`、`SubscribePRTool`、`ReviewArtifactTool` | `src/tools.ts:51`, `src/tools.ts:56`, `src/tools.ts:263` | 受限/未完全审计 | 本次只确认入口和 gate，未展开实现；属于 KAIROS 辅助而非核心自治调度。 |

## 深度调用链分组

### 1. 权限自治：auto mode

入口层：

- CLI 允许 `--permission-mode <mode>`，并在 `TRANSCRIPT_CLASSIFIER` 开启时注册 `--enable-auto-mode`。
- Ant-only 老别名 `--delegate-permissions`、`--afk` 会映射到 `permissionMode: auto`。
- `auto-mode defaults/config/critique` 是独立配置检查命令，不直接触发权限判定。

核心链路：

1. `initialPermissionModeFromCLI()` 解析 CLI、settings 和 bypass/auto 熔断。
2. 进入 auto 时 `transitionPermissionMode()` 设置 `autoModeActive` 并调用 `stripDangerousPermissionsForAutoMode()`。
3. 工具权限 `hasPermissionsToUseTool()` 对原本 `ask` 的调用进入 auto 分支。
4. 先走 fast path：安全工具 allowlist、`acceptEdits` 能放行的普通编辑。
5. 否则 `classifyYoloAction()` 构造 system prompt + 历史工具轨迹 + 当前 action，调用 `sideQuery()` 做 classifier。
6. classifier parse 失败、无 tool use、API 错误默认 fail closed，返回 block。

关键边界：

- `PowerShellTool` 默认不走 auto classifier，除非 `POWERSHELL_AUTO_MODE`。
- 安全检查若 `classifierApprovable` 为 false，不允许 auto 绕过。
- auto availability 由 settings、GrowthBook `tengu_auto_mode_config`、模型支持、fast-mode breaker 共同决定。
- 子代理 handoff 也可在 auto 模式下再跑一次 classifier，防止子代理输出危险结果。

### 2. 多代理自治：Agent + Team + Task

AgentTool 有四条主要路径：

1. 同步子代理：直接 `runAgent()`，结束后 `finalizeAgentTool()`。
2. 异步子代理：`registerAsyncAgent()` 后 fire-and-forget `runAsyncAgentLifecycle()`，完成时写 task notification。
3. worktree 子代理：先 `createAgentWorktree()`，结束后无改动清理、有改动保留。
4. remote 子代理：Ant-only 路径，`teleportToRemote()` 创建 CCR session，然后注册 remote task。

Team/swarm 叠加在 AgentTool 之上：

- `TeamCreate` 写 team file，注册 leader，重置团队 task list。
- `AgentTool` 发现 `team_name + name` 时走 `spawnTeammate()`，而不是普通子代理。
- `spawnTeammate()` 现已完成抽离：主链路统一调用 `getTeammateExecutor(true)`，后端差异由 `InProcessBackend` / `PaneBackendExecutor` / `TmuxBackend` 承接，`spawnMultiAgent.ts` 只保留 team file、AppState、输出组装等产品层职责。
- teammate 可通过 tmux/iTerm2 pane、tmux separate-window legacy 路径或 in-process runner 执行。
- `TaskCreate/Update/List/Get` 作为团队共享任务板；`TaskUpdate` 会自动设置 owner，并通过 mailbox 通知新 owner。
- `SendMessage` 提供 teammate DM、广播、shutdown request/response、plan approval response，也能给后台 agent 续写 prompt 或从 transcript 恢复。
- `TeamDelete` 遇到 active teammate 时会优先通过 executor 发送 graceful shutdown request，然后阻止目录清理，避免直接删除仍在运行的 team。

关键边界：

- `isAgentSwarmsEnabled()`：Ant 默认开；外部需要 env/flag + GrowthBook gate；`--agent-teams` 已注册为外部合法 CLI flag。
- in-process teammate 不能 spawn background agents，也不能嵌套 spawn teammate。
- `TeamDelete` 会请求 active 成员 graceful shutdown，并可通过 `wait_ms` 等待成员退出/idle 后继续清理。
- Windows 原生已有 `WindowsTerminalBackend` 最小实现：用 `wt split-pane` 启动 teammate，`use_splitpane: false` 时用 `wt -w -1 new-tab` 打开独立 Windows Terminal 窗口，`--teammate-mode windows-terminal` 可显式启用，并通过临时 pid 文件支持 best-effort kill。由于 wt.exe 没有稳定 pane id/hide/show API，真实 pane 生命周期仍需 smoke 和 UI 降级文案。

### 3. 时间自治：Cron + proactive + autonomy records

Cron 是最成熟的本地自治调度：

- `CronCreate` 校验 5 字段 cron、next run、MAX_JOBS 50。
- 默认 session-only；`durable: true` 写 `.claude/scheduled_tasks.json`。
- `createCronScheduler()` 在 REPL、print/SDK、daemon dir 模式复用。
- 文件任务用 `.claude/scheduled_tasks.lock` 竞态锁避免多会话重复触发。
- recurring 任务写 `lastFiredAt` 并 jitter；one-shot 触发后删除。
- missed one-shot 在下一次启动时只提示，要求 AskUserQuestion 确认后执行。

Proactive 是“空闲自治循环”：

- `/proactive` 打开后，每 30 秒准备 `<tick>` prompt。
- REPL hook 在 loading、plan mode、local UI、已有队列时延后。
- print/headless 模式也有 tick 注入逻辑。
- `SleepTool` 让模型主动等待，并在 proactive 关闭或用户中断时提前返回。

Autonomy records 是审计层：

- `createAutonomyQueuedPrompt()` 会调用 `prepareAutonomyTurnPrompt()` 注入 authority。
- 每个自动 prompt 都写 `.claude/autonomy/runs.json`。
- `HEARTBEAT.md` 可定义 interval 和 steps；proactive tick 会收集 due tasks 并启动 managed flow。
- `/autonomy` 能查看 runs/flows，取消或恢复等待中的 flow。

关键边界：

- Cron 不是系统级 daemon，除非有 REPL/print/daemon scheduler 在跑。
- durable cron 只恢复文件任务，session-only 死于进程退出。
- managed flow 的 step 执行仍是 prompt 队列，不是独立工作流执行引擎。

### 4. 进程自治：daemon 与 background sessions

daemon namespace 统一两类东西：

- Supervisor：`daemon start/stop/status` 管理 `remoteControl` worker。
- Background sessions：`daemon bg/attach/logs/kill` 管理后台 CLI 会话。

实现情况：

- `daemon start` 写 `~/.claude/daemon/remote-control.json`，spawn `--daemon-worker=remoteControl`。
- worker 崩溃会指数退避重启，快速失败超过阈值会 parking。
- `daemon status` 同时显示 supervisor 和 `~/.claude/sessions` 里的 background sessions。
- `--bg/--background` 是到 `daemon bg` 的快捷入口。
- Windows 或无 tmux 时使用 detached engine；detached 要求 `-p/--print` 或 pipe，因为没有交互 TTY。

关键边界：

- worker registry 目前只支持 `remoteControl`。
- supervisor 没有通用任务队列或多 worker 配置文件，更多是 remote-control 长驻包装。
- `tmux` engine 启动时返回 pid 0，真实 PID 依赖子进程自身 `registerSession()`。

### 5. 远端自治：Remote Control / CCR / RemoteTrigger

Remote Control / CCR / RemoteTrigger 是完整实现的远端自治能力，运行条件是订阅、OAuth、GrowthBook、组织 policy 和远端服务可达：

- `cli.tsx` fast-path 在 `BRIDGE_MODE` 下拦截 `remote-control|rc|remote|sync|bridge`。
- 先检查 OAuth/bridge token、GrowthBook entitlement、版本、组织 policy。
- `bridgeMain()` 注册 bridge environment 后进入 poll loop，按 `spawnMode` 和 `capacity` 接收远端 work。
- multi-session 支持 `same-dir` 和 `worktree`，worktree 需要 git 或 hooks。
- daemon worker 可用 `runBridgeHeadless()` 无 TUI 长驻远控。

Remote session / teleport：

- `--remote "task"` 创建 CCR session，可根据 gate 只打印链接或进入 remote TUI。
- `--teleport` 恢复远端 session。
- 需要 `allow_remote_sessions` policy。

RemoteTrigger：

- 是对 `/v1/code/triggers` 的 HTTP wrapper，支持 list/get/create/update/run。
- 依赖 `tengu_surreal_dali`、policy、OAuth、org UUID；这类依赖对订阅用户是可用性条件，不等于本地功能缺失。
- 每次调用都会写 `.claude/remote-trigger-audit.jsonl`，成功和失败都会保留 action、trigger id、HTTP status 或错误、`audit_id`。
- `/autonomy status --deep` 会读取最近 RemoteTrigger 审计记录，避免模型把远端调用结果和本地自治健康状态混在一起。

关键边界：

- 这些能力不是本地自足自治，但调用链不是占位；远端 API、订阅、组织策略、token scope 是运行前提。
- self-hosted bridge/RCS 可以替代 Remote Control 的部分本地 dispatch、poll、heartbeat 需求；官方 CCR/RemoteTrigger 仍按订阅路径走。
- 本项目内的判断应写成“完整实现，远端/订阅运行条件”，而不是“未实现”或“薄壳”。

### 6. 终端通讯：pipes / UDS / LAN

项目内有一套独立于 Agent Teams 的终端通讯能力：

- `PipeServer` / `PipeClient` 使用 UDS 或 Windows named pipe 进行 NDJSON 消息通信，协议包含 ping/pong、attach/detach、prompt、stream、tool_start、tool_result、done、permission_request/response/cancel、chat/cmd 等消息类型。
- `pipeRegistry` 管理 main/sub CLI 实例、机器 ID、pipeName、TCP port、LAN visibility，并通过 lock file 处理并发注册。
- `/pipes` 展示 registry、选择/取消选择 pipe、显示 LAN peers；`/pipe-status` 显示 master/sub 控制状态；`/attach`、`/detach`、`/send`、`/history`、`/claim-main` 提供主从控制和消息流。
- `SendMessageTool` 支持 `uds:`、`tcp:`、`bridge:` 地址；UDS 本机消息可直接发，TCP/LAN 和 bridge 需要显式用户确认。
- `/autonomy status --deep` 和 `claude autonomy status --deep` 已加入 `## Pipes` 区块，读取 pipe registry，显示 main/sub/tcp 状态。

关键边界：

- pipes 是完整实现，不是占位；它和 teammate mailbox 是两条不同通讯面。
- TCP/LAN 跨机器消息有安全边界，必须保留显式确认。
- deep status 只读 registry，不主动探活或建立连接；实时 alive 状态仍由 `/pipes` 和 `/pipe-status` 更适合展示。

### 7. Autonomy 命令面板与 CLI 参数路由

`/autonomy` 现在按 `docs/slash-command-mcp-routing.md` 中描述的分层方式处理：

- 第一层仍由 `slashCommandParsing.ts` 拆出 `commandName=autonomy` 和原始 `args`。
- 命令定义在 `src/commands/autonomy.ts`，类型为 `local-jsx`，并通过 `argumentHint` 把参数形态显示给命令面板。
- 无参数 `/autonomy` 路由到 `src/commands/autonomyPanel.tsx`，显示独立面板和子项，不直接把 status 文本塞进对话区域。
- 参数规格集中在 `src/utils/autonomyCommandSpec.ts`，包含命令名、描述、usage、CLI 子命令描述和 `parseAutonomyArgs()`。
- slash command 和 CLI handler 均复用同一份 parser/handler，避免 `/autonomy` 与 `claude autonomy` 各自维护参数分支。
- CLI 侧仍由 Commander 注册子命令，但名称、描述、usage 从 `AUTONOMY_CLI` 读取。

子命令映射：

| 输入 | 路由目标 | 说明 |
| --- | --- | --- |
| `/autonomy` | `<AutonomyPanel>` | 独立面板，展示 14 个基础子项：Overview、Full deep status、Auto mode、Runs summary、Recent runs、Flows summary、Recent flows、Cron、Workflow runs、Teams、Pipes、Runtime、Remote Control、RemoteTrigger；并追加最近 flow 子项 |
| `/autonomy status` / `claude autonomy status` | `getAutonomyStatusText()` | runs + flows 概览 |
| `/autonomy status --deep` / `claude autonomy status --deep` | `formatAutonomyDeepStatus()` | 全量本地自治健康状态 |
| `/autonomy runs [limit]` / `claude autonomy runs [limit]` | `getAutonomyRunsText()` | 最近 runs |
| `/autonomy flows [limit]` / `claude autonomy flows [limit]` | `getAutonomyFlowsText()` | 最近 flows |
| `/autonomy flow <id>` / `claude autonomy flow <id>` | `getAutonomyFlowText()` | flow detail |
| `/autonomy flow cancel <id>` / `claude autonomy flow cancel <id>` | `cancelAutonomyFlowText()` | 取消 flow |
| `/autonomy flow resume <id>` / `claude autonomy flow resume <id>` | `resumeAutonomyFlowText()` | slash 入 REPL 队列；CLI 打印可执行 prompt |

### 8. KAIROS/Assistant

已实现部分：

- `claude assistant [sessionId]` 可 attach 到运行中的 bridge session。
- 无 session 时走 assistant install wizard，安装后提示稍后重试。
- `--assistant` 会强制 assistant mode，跳过 gate，供 Agent SDK daemon 使用。
- assistant mode 会加载 `~/.claude/agents/assistant.md` 作为系统提示词附加内容。
- assistant/KAIROS 与 Brief、Cron、Proactive、Remote Control 有耦合。
- `initializeAssistantTeam()` 会创建 session-scoped assistant team file、leader teamContext、team task list，并设置 leader task list id，使 assistant mode 可直接用 `Agent(name)` 路径 spawn in-process teammates。

关键边界：

- KAIROS 受 build flag 与 `tengu_kairos_assistant` runtime gate 控制。
- assistant attach/discovery 依赖 Sessions API。
- assistant mode 的默认 team 已实现本地 bootstrap；真实 assistant/KAIROS attach 场景仍需要 smoke 验证。

## 受限矩阵

| 限制类型 | 影响能力 | 证据 |
| --- | --- | --- |
| Build feature flag | `TRANSCRIPT_CLASSIFIER`、`BRIDGE_MODE`、`DAEMON`、`BG_SESSIONS`、`KAIROS`、`PROACTIVE`、`MONITOR_TOOL`、`FORK_SUBAGENT`、`UDS_INBOX` 等 | `build.ts:13`, `scripts/dev.ts:26`, `src/tools.ts:26`, `src/entrypoints/cli.tsx:124` |
| `USER_TYPE === 'ant'` | task CLI、remote agent isolation、some tools、PowerShell auto-mode branches、REPLTool 等 | `src/main.tsx:4522`, `src/main.tsx:5337`, `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:667`, `src/tools.ts:16` |
| GrowthBook / policy | auto mode、Remote Control、RemoteTrigger、Brief、agent teams external killswitch、cron durable gate | `src/utils/permissions/permissionSetup.ts:1091`, `src/bridge/bridgeEnabled.ts:32`, `packages/builtin-tools/src/tools/RemoteTriggerTool/RemoteTriggerTool.ts:57`, `packages/builtin-tools/src/tools/BriefTool/BriefTool.ts:89` |
| OAuth / subscription | Remote Control、RemoteTrigger、remote sessions、assistant discovery | `src/entrypoints/cli.tsx:156`, `src/bridge/bridgeEnabled.ts:74`, `packages/builtin-tools/src/tools/RemoteTriggerTool/RemoteTriggerTool.ts:78`, `src/assistant/sessionDiscovery.ts:17` |
| Platform / network | tmux/iTerm/Windows Terminal teammate、background attach、UDS/named pipe、LAN TCP pipes | `src/cli/bg/engines/index.ts:5`, `src/utils/swarm/backends/registry.ts:108`, `src/main.tsx:1582`, `src/utils/pipeTransport.ts:122`, `src/utils/pipeRegistry.ts:1` |
| Session lifetime | session-only cron、in-process teammate、AppState background tasks | `src/utils/cronTasks.ts:188`, `src/utils/swarm/spawnInProcess.ts:1`, `src/tasks/LocalAgentTask/LocalAgentTask.tsx:137` |

订阅/远端类状态说明：

- **订阅可用且实现完整**：Remote Control、RemoteTrigger、remote session、KAIROS assistant discovery 等在 claude.ai subscription、full-scope OAuth、对应 GrowthBook gate、组织 policy 允许时可以走官方路径。
- **可自建替代**：Remote Control 的部分 dispatch/poll/heartbeat 场景可用 self-hosted bridge/RCS 替代；Workflow/Cron/Agent Teams/Task V2 已是本地状态机，不依赖官方远端。
- **不可本地伪造**：RemoteTrigger 的官方远端 trigger 执行、CCR remote session、assistant/channel 后端语义不能只靠本地代码等价复刻；当前只能本地记录审计、暴露状态和提供 self-hosted 旁路能力。

## 测试覆盖证据

已发现的直接相关测试：

- Cron：`src/utils/__tests__/cron.test.ts`、`cronScheduler.baseline.test.ts`、`cronTasks.baseline.test.ts`
- Autonomy：`src/utils/__tests__/autonomyAuthority.test.ts`、`autonomyFlows.test.ts`、`autonomyRuns.test.ts`、`src/commands/__tests__/autonomy.test.ts`
- Autonomy panel / CLI：`src/commands/__tests__/autonomy.test.ts` 覆盖无参数面板；`src/cli/handlers/__tests__/autonomy.test.ts` 覆盖 `status`、`--deep`、`flows`、`flow` detail、`flow cancel`、`flow resume`。
- Autonomy command spec：`src/utils/__tests__/autonomyCommandSpec.test.ts` 覆盖命令面板 `argumentHint` 和 slash/CLI 共享 parser。
- Proactive：`src/proactive/__tests__/state.baseline.test.ts`、`src/commands/__tests__/proactive.baseline.test.ts`
- Daemon/bg：`src/daemon/__tests__/daemonMain.test.ts`、`src/daemon/__tests__/state.test.ts`、`src/cli/bg/__tests__/detached.test.ts`
- Permissions：`src/utils/permissions/__tests__/PermissionMode.test.ts`、`permissions.test.ts`、`dangerousPatterns.test.ts`
- Agent utilities：`packages/builtin-tools/src/tools/AgentTool/__tests__/agentToolUtils.test.ts`
- Agent Teams 加固：`src/utils/swarm/__tests__/agentTeamsLifecycle.test.ts`、`src/utils/swarm/backends/__tests__/PaneBackendExecutor.test.ts`、`src/utils/swarm/backends/__tests__/WindowsTerminalBackend.test.ts`、`src/utils/swarm/__tests__/spawnInProcess.test.ts`（真实 in-process task + mailbox smoke 和 kill）、`src/utils/swarm/__tests__/spawnUtils.test.ts`、`src/utils/__tests__/teamDiscovery.test.ts`、`packages/builtin-tools/src/tools/shared/__tests__/spawnMultiAgent.test.ts`
- RemoteTrigger 审计：`src/utils/__tests__/remoteTriggerAudit.test.ts`、`packages/builtin-tools/src/tools/RemoteTriggerTool/__tests__/RemoteTriggerTool.test.ts`
- Pipes deep status：`src/utils/__tests__/pipeStatus.test.ts`、`src/commands/__tests__/autonomy.test.ts`
- Remote Control local status：`src/utils/__tests__/remoteControlStatus.test.ts`、`src/commands/__tests__/autonomy.test.ts`
- 外部审阅：`.omx/artifacts/claude-claude-autonomy-status-deep-agent-teams-pipes-uds-lan-remote-2026-04-18T03-15-17-181Z.md`，ask-claude 判定 `COMPLETE`，无阻塞性代码缺口。

测试缺口：

- Remote Control/bridge/RemoteTrigger 的端到端依赖远端 API；当前项目调用链完整，本地单测覆盖 parsing/state/部分 auth 分支、本地配置状态和本地审计记录，真实订阅路径需要实机/账号环境验证。
- KAIROS assistant install/discovery 的真实远端流程未在本报告中确认有完整 e2e；本地 assistant team bootstrap 已有单元测试覆盖。
- WorkflowTool runner 已有 `packages/builtin-tools/src/tools/WorkflowTool/__tests__/WorkflowTool.test.ts` 覆盖 start/advance/list/cancel，并由 `src/commands/__tests__/autonomy.test.ts` 覆盖 deep status workflow-runs 区块；仍缺真实 agent 执行步骤的端到端 smoke。
- Team/swarm 的主代码路径已补回归测试；真实 tmux/iTerm2/Windows Terminal 分屏仍受平台影响，需要手动 smoke 或后续平台 e2e。

## 主要缺口与建议

1. **自治管理代码层面可标记完整**
   ask-claude 外部审阅与本地验证结论一致：当前没有阻止标记完整实现的代码缺口。剩余项应进入验收/优化队列，而不是继续归为未完成实现。

2. **Assistant team 初始化已完成本地 bootstrap**
   `initializeAssistantTeam()` 已返回完整 teamContext 并写入 team file / task list。剩余工作是做真实 assistant/KAIROS attach 场景 smoke，确认 daemon/bridge session 中的 `Agent(name)` 能直接复用该 team context。

3. **WorkflowTool 已升级为本地 runner，并纳入 deep status**
   当前已支持从 `.claude/workflows/<name>.md|yaml` 解析步骤，创建 `.claude/workflow-runs/<runId>.json`，并提供 `start/status/list/advance/cancel`。`/autonomy status --deep` 已增加 workflow-runs 专区。剩余增强点是更严格的 YAML schema、重试策略、step 失败原因记录和真实 agent 执行步骤 smoke。

4. **daemon supervisor 目前不是通用自治调度器**
   只固定管理 `remoteControl` worker。若要“自治管理中心”，需要 worker config、worker registry 扩展、任务队列、健康检查、日志分层和 restart policy 配置化。

5. **Remote Control/CCR/RemoteTrigger 是完整实现，后续是观测和分流**
   当前应按“完整实现，远端/订阅运行条件”归类。剩余工作不是补核心执行，而是把官方订阅路径、policy 拒绝、token/scope 错误、self-hosted bridge/RCS 替代路径在 status/错误提示里拆清楚。

6. **权限自治依赖 classifier 可用性**
   设计上 fail closed 是对的，但在长自治链路中会频繁中断。建议把 classifier unavailable 的用户可恢复路径、重试策略和降级提示作为一等状态暴露给 `/autonomy` 或 status UI。

7. **跨平台团队体验仍需真机验证**
   目前已强化 in-process teammate，恢复 tmux split-pane / separate-window 路径与 iTerm2 setup prompt，并新增 Windows Terminal 后端。Windows Terminal 后端的限制来自 wt.exe 本身：可 launch split pane/new window，但没有稳定 pane id/hide/show 查询面；当前 kill 通过 teammate shell pid 文件 best-effort 完成，后续应做 Windows 真机 smoke 并把不可用的 hide/show/isActive 明确降级。

8. **状态分散已初步收束**
   相关状态仍分布在 AppState、`~/.claude/sessions`、`~/.claude/daemon`、`~/.claude/tasks`、`.claude/scheduled_tasks.json`、`.claude/autonomy/*.json`、team files、temp task output、`.claude/remote-trigger-audit.jsonl`、pipe registry。`/autonomy status --deep` 与 `claude autonomy status --deep` 已提供本地只读汇总入口；后续可继续补 CCR/Remote Control 的更细远端会话健康状态。

## 最终分类

完整实现：

- Auto mode 权限判定与安全剥离
- 子代理同步/后台执行
- Agent Teams / Swarm 主闭环（TeamCreate、executor-backed spawn、Task V2、SendMessage、TeamDelete shutdown request/wait）
- Assistant team initialization
- 本地任务列表与任务依赖
- Cron 调度、持久化、锁、jitter
- Proactive tick 与 Sleep
- Autonomy run/flow 记录
- Autonomy deep status (`/autonomy status --deep`)
- Workflow runner 与 workflow-runs deep status (`WorkflowTool` start/status/list/advance/cancel；slash + full CLI autonomy status/runs/flows/flow management)
- RemoteTrigger 本地审计记录与 deep status 汇总
- Pipes / UDS / LAN 终端通讯与 deep status 汇总
- Remote Control bridge / CCR remote session / RemoteTrigger 官方远端路径（完整实现，远端/订阅运行条件）与本地配置/deep status 汇总
- Background sessions
- Session registry
- SendMessage/team mailbox
- Monitor 长驻命令

最小实现：

- Daemon supervisor/worker registry
- KAIROS assistant attach
- Managed autonomy flows
- WindowsTerminalBackend 原生 Windows 分屏/新窗口后端

薄封装/远端依赖：

- Remote agent isolation
- Brief 附件发送的远端可见性路径

未完全展开：

- PushNotification、SubscribePR、ReviewArtifact 的内部实现。本报告只确认它们是 KAIROS/自治辅助入口且受 feature gate 控制，没有逐行审计其 API 协议。
- Bridge poll loop 的所有 session spawn 分支。已确认注册、poll、capacity、headless worker、spawn mode 主链路，未逐个展开 bridge session 子状态机。

# 本地 RCS 一键启动、能力清单与流式消息设计

## 背景

当前本地 Remote Control 开发流程要求用户分别启动 Remote Control Server
和 Bridge Worker，并手工让 `RCS_API_KEYS` 与
`CLAUDE_BRIDGE_OAUTH_TOKEN` 保持一致。仓库中的 `bun run rcs` 只启动
RCS 服务端，但名称容易让人误以为完整链路已经就绪；REPL 中的
`/remote-control-server` 实际管理的又是 daemon-backed Bridge Worker，进一步
混淆了“服务端”和“执行 Worker”。

功能发现也存在两个问题：feature 是否被编译、是否还需要运行时配置、如何
使用对应功能没有统一入口；`FEATURE_<NAME>=0` 目前仍会因为只检查变量名而
启用 feature。模型 API 内部已经使用 streaming，但 RCS 启动的 CLI 子进程未
请求 partial message，RCS Web 主聊天链路也忽略 `partial_assistant`，所以用户
只能在最终完整消息到达后看到模型回复。

## 目标

- 为个人本地开发提供一个前台命令，同时管理 RCS、Bridge Worker 和可选的
  Vite Web 开发服务。
- 本地默认不再要求手工复制 transport key；provider API key 仍由现有 provider
  配置系统负责并持久化。
- 明确区分 RCS Server 与 Bridge Worker，同时保留兼容入口。
- 提供可机器读取的能力清单，解释编译状态、运行时激活条件和使用方式。
- 修正 `FEATURE_*` 环境变量真值语义，并用回归测试锁定 Remote Control 必需
  feature 的默认编译状态。
- 复用现有模型 streaming 和 100ms 文本快照机制，让 RCS Web 实时展示正文，
  同时避免把 token 级事件写入持久化数据库。

## 非目标

- 不把 RCS Server 与 Bridge Worker 合并进同一运行时进程。
- 不把新的本地启动命令改造成后台 daemon；它是一个可观察、可用 Ctrl-C
  结束的前台 supervisor。
- 不改变公网、多用户 RCS 的部署和密钥管理约束。
- 不由启动器接管、打印或复制 Anthropic、OpenAI、Gemini、Grok 等 provider
  密钥。
- 第一版不流式展示 thinking、tool input JSON 或其他敏感/结构化增量。
- 不持久化 partial message；最终 `assistant` 事件仍是历史恢复的唯一权威来源。

## 选定方案

新增独立 Bun 前台编排器，而不是扩展现有 daemon，也不合并 RCS 和 Bridge 的
业务进程。编排器只负责子进程生命周期、临时 transport secret、健康检查、
日志聚合和失败清理。RCS 与 Bridge 仍可独立部署、独立测试，也保持生产架构
边界。

### 命令面

根 `package.json` 提供以下脚本：

| 命令 | 行为 |
| --- | --- |
| `bun run rcs:local` | 启动 RCS + Bridge Worker；仅在 Web `dist/index.html` 缺失时先构建 Web |
| `bun run rcs:dev` | 启动 RCS + Bridge Worker + Vite Web 开发服务 |
| `bun run rcs:server` | 只启动 RCS Server，适用于分离部署和故障排查 |
| `bun run rcs:worker` | 只启动 Bridge Worker，沿用显式 `CLAUDE_BRIDGE_*` 配置 |
| `bun run rcs` | 兼容别名，等价于 `rcs:server` |

`rcs:local` 是文档中的推荐个人入口。`rcs:server` 和 `rcs:worker` 是高级入口，
不会偷偷启动另一侧进程。`rcs:dev` 使用 Vite 的 URL 作为 Web 开发入口；RCS
仍在自己的端口提供 API 和 session ingress。

REPL 命令以 `/remote-control-worker` 作为主要名称，因为它管理的是持久 Bridge
Worker，不是 RCS Server。旧 `/remote-control-server` 继续作为兼容别名，并在
帮助或成功提示中引导到新名称，避免破坏已有习惯和脚本。

### 本地启动生命周期

编排器按以下顺序执行：

1. 解析本地配置和 transport secret。
2. `rcs:local` 检查 Web `dist/index.html`；缺失时执行一次 Web production build，
   已存在则不重复构建。`rcs:dev` 跳过这一步并启动 Vite。
3. 启动 RCS Server，逐行转发 stdout/stderr，并添加 `[rcs]` 前缀。
4. 轮询 RCS `/health`，默认最多等待 15 秒。只有健康检查成功后才启动 Bridge，
   避免 Bridge 在服务端尚未监听时进入无意义的重连循环。
5. 启动 Bridge Worker，注入相同的 RCS URL 和 transport secret；日志使用
   `[worker]` 前缀。开发 Web 日志使用 `[web]` 前缀。
6. 打印可访问 URL 和启动模式，但不打印完整 secret。

这些本地脚本默认让 RCS 绑定 `127.0.0.1`，降低开发默认密钥或误配置对局域网
的暴露；RCS package 本身的生产部署配置不在本次改变。用户仍可显式设置
`RCS_HOST`、`RCS_PORT` 和 `CLAUDE_BRIDGE_BASE_URL`。当监听地址是 `0.0.0.0`
时，Bridge 的本机连接地址默认仍使用 `127.0.0.1`；显式 Base URL 优先。

编排器监听 `SIGINT` 和 `SIGTERM`。Ctrl-C 或终止信号到达时，只向本次启动且
由编排器记录 PID 的存活子进程发送温和终止信号，等待短暂 grace period，再
强制结束仍未退出的这些子进程，并保留合理的 signal exit semantics。健康检查
超时、端口占用、Web 构建失败，或任一关键子进程意外退出时，编排器关闭其余
子进程并以非零状态退出，避免留下半套服务，也不按端口或进程名误杀已有进程。

### 密钥与配置边界

本地 unified 模式中：

- 若未设置 `RCS_API_KEYS`，编排器每次启动生成一个 32-byte、base64url 编码的
  随机 secret，同时注入 RCS 的 `RCS_API_KEYS` 和 Bridge 的
  `CLAUDE_BRIDGE_OAUTH_TOKEN`。
- 若显式设置 `RCS_API_KEYS`，服务端保留全部逗号分隔 key，Bridge 使用第一个
  非空 key；这支持额外 Worker 使用其余 key。显式设置为空或没有有效 key 时
  直接报错，不降级到固定测试 key。
- `CLAUDE_BRIDGE_BASE_URL` 由编排器根据本地 RCS 地址生成，用户显式设置时优先。
- unified 模式总是给 Worker 子进程注入由上述规则选出的 OAuth token，从而覆盖
  当前 shell 中可能残留的、不匹配的 `CLAUDE_BRIDGE_OAUTH_TOKEN`。
- secret 只存在于父进程和子进程环境中；普通日志只说明来源和 key 数量，不输出
  完整值。

模型 provider key 与 transport secret 保持严格分离。Anthropic/OpenAI/Gemini/
Grok 等凭据继续通过现有 `/login`、provider 设置页或用户 settings 持久化；
Bridge 创建会话时继续应用安全的持久化 provider 设置。一键启动不要求每次重填
模型 key，也不把 provider key 写进项目脚本。

## Feature 语义与能力清单

### 环境变量真值规则

`scripts/dev.ts`、`build.ts` 和 Vite feature 插件复用同一个解析函数：

- `1`、`true`、`yes`、`on`（忽略大小写）表示启用；
- `0`、`false`、`no`、`off` 表示禁用，即使该 feature 在默认集合中也移除；
- 未识别的非空值不再被当作启用，给出清晰警告并忽略；
- 未设置的 feature 使用 `DEFAULT_BUILD_FEATURES`。

这使 `FEATURE_X=0` 真正可用于关闭默认 feature，也让三条构建链路得出一致结果。

### 必要默认 feature

本次不引入“流式传输 feature”：模型请求已原生设置 `stream: true`，RCS partial
展示属于链路完整性，不应再被一个隐藏开关关闭。

默认构建集合继续包含并由测试锁定：

- `BRIDGE_MODE`：自托管 Remote Control 和 Bridge Worker 的编译门；
- `SESSION_TERMINALS`：RCS Code 会话终端能力；
- `DAEMON`：保留已有 daemon-backed 持久 Worker 与兼容 REPL 管理入口。

测试只锁定完成 Remote Control 主工作流确实必要的默认项，不把整个 feature
列表冻结，其他实验功能仍可独立增删。

### `capabilities` 命令

新增 `ccb capabilities`；开发态可用 `bun run dev capabilities`。默认输出适合人
阅读，`--json` 输出稳定结构，供脚本、诊断和文档校验使用。

构建和 dev 启动在编译时注入最终 feature 名单，例如
`MACRO.COMPILED_FEATURES`。命令读取该 manifest，而不是运行时遍历
`feature()`；这样既符合 Bun 要求 `feature()` 只能直接出现在条件位置的限制，
也能准确描述已构建产物，不能被启动产物时临时设置的 `FEATURE_*` 伪装。

每项能力至少包含：

- `name`：稳定能力名或 feature 名；
- `compiled`：代码是否存在于当前产物；
- `activation`：`always`、`runtime-config`、`environment` 或
  `not-compiled`；
- `usage`：主要命令、参数或环境变量；
- `description`：一句话用途。

常用能力维护人工可读 metadata；仅存在于 manifest、尚无 metadata 的 feature
也必须显示编译状态，避免清单悄悄漏项。至少为 Remote Control、daemon、session
terminals、provider、headless output 和 model streaming 提供使用说明。流式说明
明确区分：交互式/RCS 自动使用 streaming；headless 若要逐事件输出，使用
`--print --verbose --output-format stream-json --include-partial-messages`。

## RCS 流式消息链路

### Worker 输出

RCS 创建的 CLI 子进程固定加入 `--include-partial-messages`，保留已有
`--print --verbose --input-format stream-json --output-format stream-json`。
底层 provider 仍由现有 API 适配层产生 Anthropic 兼容 stream events。

`CCRClient` 已经把同一 content block 的 `text_delta` 在 100ms 窗口内合并为
full-so-far snapshot。该累加器被提取为共享逻辑，由 CCR v2 和 legacy Hybrid
Bridge writer 共同使用；不能把 legacy 的原始 token fragment 直接标记成
snapshot。共享机制继续作为节流和重连友好语义，并为快照补充当前 API message
ID、content block index 和 parent tool scope。快照是替换语义，不是可重复追加
的 token fragment。

### RCS 投递策略

`stream_event` 被归类为 worker live event：

- 通过 `/worker/live-events` 发送；
- 不进入重试型 durable uploader，不写 `session_events` / SQLite；
- 只投递给当前已连接的 Web SSE subscriber；
- 最终完整 `assistant` 仍走 durable `/worker/events`，负责历史、usage、tool block
  和断线恢复。

服务端把支持的正文 snapshot 规范化为 Web `partial_assistant` live event。转换
逻辑同时覆盖 CCR v2 和仍受支持的 legacy Bridge ingress，输出稳定的
`message_id`、`block_index`、`content`、`parent_tool_use_id` 和 snapshot 标记。
非 `text_delta` stream events 第一版不进入聊天正文。

### Web 归并

主 RCS chat adapter 和兼容 SSE transport 都订阅命名为 `live_event` 的 SSE 帧，
并把 `partial_assistant` 交给同一 reducer 语义。live frame 不推进 durable
`highWaterSeq`，也不写进 durable event 去重集合。

reducer 使用 API message ID 作为 assistant entry 的首选身份，UUID 作为 fallback：

- 第一个 snapshot 创建一条临时 assistant entry；
- 后续相同 message ID + block index 的 snapshot 原位替换文本；
- 重复或较短的旧 snapshot 不得回退已显示内容；
- 最终 durable `assistant` 到达时，以完整 content blocks 替换同 message ID 的
  临时 entry，再处理 usage 和 tool block；
- 若客户端断线错过全部 partial，最终事件按现有方式正常创建完整消息。

因此，断线可能丢失“正在打字”的动画，但不会丢失答案，也不会在最终事件到达时
把完整文本追加两遍。历史加载从不依赖 partial state。

## 失败处理与可观察性

- Web build 失败：不启动 RCS/Worker，输出失败命令和退出码。
- RCS 在健康检查前退出或超时：输出最近的 RCS 日志上下文，清理已启动进程。
- Bridge 鉴权失败：Bridge 的明确 401 原因保留，编排器停止 RCS/Vite 并非零退出。
- Vite 或任一关键子进程意外退出：停止整套本地 stack，避免 UI 看似可用但无法
  执行任务。
- partial live POST 失败：允许丢弃，不进入无限重试；最终 durable assistant 仍
  修复视图。
- final durable event 失败：继续沿用现有重试和错误诊断，不能用 partial 成功
  掩盖持久投递失败。

## 测试设计

实施采用测试先行，覆盖以下层次：

### 启动编排器

- 未设置 key 时生成强随机 secret，并向 RCS/Bridge 注入同一个值；日志不泄漏。
- 显式多 key 时服务端收到全部 key，Bridge 选择第一个有效 key。
- `rcs:local` 仅在 dist 缺失时构建，`rcs:dev` 启动 Vite。
- RCS 健康后才启动 Worker。
- 健康超时、build 失败、子进程异常退出和 signal shutdown 都会清理兄弟进程并
  返回正确状态。

### Feature 与能力清单

- 真值/假值/大小写/未知值解析；特别回归 `FEATURE_X=0`。
- dev、Bun build 和 Vite 共用解析结果。
- 默认集合包含 `BRIDGE_MODE`、`SESSION_TERMINALS`、`DAEMON`。
- text 与 JSON capabilities 输出包含编译状态、激活方式和流式 headless 用法。

### 流式传输

- Bridge session 参数包含 `--include-partial-messages`。
- accumulator 生成带 message ID 的 full-so-far snapshot。
- `stream_event` 走 live endpoint，不进入 durable event uploader 和 SQLite。
- 服务端拒绝不受支持的 live 类型，接受并规范化正文 partial。
- Web reducer 覆盖首次 snapshot、同 block 替换、旧 snapshot 不回退、多 block、
  final reconciliation、无 partial 的 final fallback 和 usage 去重。
- chat adapter 同时消费 durable `message` 与 transient `live_event` SSE 帧。

### 完成验证

- 运行新增和受影响的 focused tests。
- 运行 `bun run typecheck`，必须为零错误。
- 运行仓库的完整检查脚本；若仓库实际脚本名与文档中的 `test:all` 不一致，以
  `package.json` 中现有 full-check 脚本为准并记录结果。
- 构建 CLI 和 RCS Web，验证 capabilities manifest 与 production bundle 一致。
- 手工 smoke test `rcs:local`：一个终端启动、浏览器创建会话、正文逐步显示、
  Ctrl-C 后无遗留子进程。

## 文档与兼容迁移

- README 的本地 Remote Control 快速开始改为首推 `bun run rcs:local`，删除必须
  打开两个终端和复制测试 key 的主流程；保留 server/worker 分离部署示例。
- RCS README 和 feature 文档说明 provider key 与 transport secret 的区别、
  本地 loopback 默认、`rcs:dev`、capabilities 和 headless stream-json 参数。
- CLI/REPL 帮助文字统一使用 Server、Worker、local stack 三个术语。
- `bun run rcs` 与 `/remote-control-server` 在本次继续兼容；不做删除，只提供迁移
  提示。

## 验收标准

1. 新用户在 provider 已配置的前提下，只运行 `bun run rcs:local` 就能打开 Web
   Remote Control 并创建可执行会话，无需第二个终端或手工同步 transport key。
2. Ctrl-C 能关闭 RCS 和 Bridge，不遗留后台进程；关键子进程失败不会留下半套
   stack。
3. `ccb capabilities` 能准确解释当前构建的 Remote Control、默认 feature 和
   流式用法；`FEATURE_X=0` 不再启用 feature。
4. production 默认构建始终包含 `BRIDGE_MODE`、`SESSION_TERMINALS`、`DAEMON`。
5. RCS Web 在模型产生正文增量时按约 100ms 的窗口节流刷新快照；最终消息不
   重复，partial 不写 SQLite，刷新或重连后仍能从最终 durable event 恢复完整
   答案。
6. focused tests、typecheck、完整检查和相关构建全部通过，且不覆盖工作区中与本
   任务无关的既有改动。

# 多实例漫游（Multi-Instance Roaming）— 跨设备实例切换与会话归属

> 状态：规划 · 更新：2026-07-13 · 关联：`bridge-mode.md`、`remote-control-self-hosting.md`、`session-terminals.md`

用户在多台设备（工作站、笔记本、服务器、k8s 跳板机）上各跑一个 `ccb remote-control` 实例，全部接入同一个自托管 RCS。本文回答三个问题：**用户如何在实例之间切换**、**对话记录应不应该都存在 RCS 上**、**远程链路还有哪些坑**。

## 1. 现状盘点（已经具备的能力）

身份层级已在 bridge-mode 中定稿：

```text
账户 → 设备(device_id) → 工作区(workspace_key) → 逻辑环境(environment_id) → 连接租约(lease) → 会话(session)
```

| 能力 | 状态 | 位置 |
|---|---|---|
| 设备稳定注册（device_id 持久化、lease fencing） | ✅ | `bridgeIdentity.ts` + `services/environment.ts` |
| 环境元数据（device_name/machine_name/directory/branch/gitRepoUrl） | ✅ | `store.ts` EnvironmentRecord |
| 会话事件全量持久化（SQLite，重启可回放） | ✅ | `persistence/database.ts` |
| Web 端环境选择器 | ✅ | `web/src/shell/EnvPicker.tsx`、`NewSessionDialog` |
| 会话改绑到另一环境 | ✅（半成品） | `POST /web/sessions/:id/rebind` |
| CCR v2 transcript 上存 + 恢复水合 | ✅（v2 独有） | `setInternalEventWriter` / `hydrateFromCCRv2InternalEvents` |
| 环境/会话掉线监测 | ✅（2026-07-13 修复误判） | `services/disconnect-monitor.ts` |

## 2. 实例切换的用户旅程（目标设计）

### 2.1 设备即环境，环境即入口

- 每台设备的 `ccb remote-control` 注册一个（或按工作区多个）逻辑环境；`device_name` 默认 hostname。
- Web 侧边栏的环境列表 = "我的设备"列表，带在线状态（active / disconnected / offline）与当前目录、git 仓库标签。
- **新会话**：在 EnvPicker 选目标设备 → 会话通过 work-dispatch 派发到该设备的 bridge，由它 spawn 会话进程。这条链路已通。

### 2.2 切换的三种语义（必须区分，不能混为一谈）

| 场景 | 语义 | 方案 |
|---|---|---|
| ① 换设备**看**同一会话 | 只读漫游 | 已支持：任何浏览器连 RCS 即可回放历史 + 实时 SSE。无需任何迁移 |
| ② 在设备 A 的会话里**继续对话** | 会话跟随 worker | 已支持：会话进程活在设备 A，用户在哪个浏览器发消息都行 |
| ③ 把会话**搬到**设备 B 继续跑 | 会话迁移 | 半成品，是本规划的核心增量（见 2.3） |

关键认知：**会话进程状态（消息上下文、PTY 终端、工作区文件）活在 worker 设备上**。①② 天然跨设备；③ 需要显式迁移协议。

### 2.3 会话迁移（rebind）补全方案

现有 `rebindSessionEnvironment` 只改了绑定关系并重新派发 work item，缺三件事：

1. **上下文水合**：目标设备的新会话进程必须能重建对话上下文。
   - v2 路线（推荐）：强制启用 CCR v2 internal events 作为 transcript 存储；新 worker 用 `hydrateFromCCRv2InternalEvents()` 拉取全量消息历史。RCS 的事件日志只用于 UI 回放，internal events 才是"可继续对话"的真源。
   - v1 兜底：从 RCS 事件日志重建 user/assistant 消息序列（有损：thinking/tool 状态不完整），迁移后提示"上下文由服务器历史重建"。
2. **工作区校验**：迁移前比对源/目标环境的 `gitRepoUrl` + `branch`。仓库不同 → 阻断并提示；仓库相同但工作树脏 → 警告。绝对路径不可比（不同设备路径不同），以 `workspace_key` 的 git remote 分量为准。
3. **终端与后台任务不可迁移**：PTY、后台 Bash、子代理都随旧进程死亡。迁移确认框必须明示"N 个终端 / M 个后台任务将被终止"，数据来自 `terminal_state` 与 task 遥测。
4. **fencing**：迁移 = `incrementEpoch(sessionId)` + 旧 worker 收到 fence 后自杀，防止双 worker 同写一个会话（workerEpoch 机制已有，接上即可）。

### 2.4 CLI 侧切换

Web 是主要切换界面，CLI 补一个对称入口：

```bash
ccb rc sessions                 # 列出 RCS 上我的会话（含所在设备）
ccb rc attach <session-id>      # 在本机 REPL attach 到远程会话（只读镜像 + 发消息）
ccb rc pull <session-id>        # = 迁移：把会话搬到本机继续（走 2.3 协议）
```

## 3. 对话记录要不要都存 RCS？—— 分层存储策略

**结论：分三层，不是"全存"也不是"全不存"。**

| 层 | 内容 | 存 RCS？ | 理由 |
|---|---|---|---|
| L1 UI 事件流 | user/assistant/system/control/result | ✅ 已实现，保持 | 跨设备回放、审计、离线查看的基础；体量小 |
| L2 Transcript（internal events） | 完整 SDK 消息（含 tool_use 原始输入输出） | ✅ 建议对 remote-control 会话默认开启（CCR v2） | 会话迁移/断点续聊的唯一真源；仅 bridge 会话，本地纯 `claude` 会话不上传 |
| L3 高频瞬态流 | `terminal_output` / `terminal_snapshot`、`stream_event` 增量 | ❌ **不应持久化**（当前在存，需要改） | 见 4.2：一个会话实测写入 223 条空 terminal_state；终端原始 ANSI 流回放价值低、体量大，bus 内存转发即可，重连恢复走 `terminal_sync` 快照 |

配套必须做**保留策略**（当前 `persistence/database.ts` 没有任何 prune）：

- 事件表按会话滚动上限（如 L1 每会话 2 万条）+ 全局 TTL（如 90 天）；归档会话可导出 JSONL 后清理。
- `terminal_state` 只保留每会话最后一条（它是全量状态，历史无意义）。
- 隐私边界：RCS 是自托管单用户部署，代码片段集中存储可接受；但多租户模式（`RCS_SINGLE_USER=0`）下 L2 必须按 owner UUID 隔离查询（现有 uuidAuth 已隔离，保持）。

## 4. 远程链路问题排查清单

### 4.1 已定位并修复（2026-07-13）

**worker 假离线导致终端侧边栏消失（本次主 bug 的根因）**

- 现象：模型明明建了终端，Web 侧边栏不显示"终端" tab。
- 链路：v1 WS 会话的入站事件**从不刷新** `session.updatedAt` → disconnect-monitor 在 2×`RCS_DISCONNECT_TIMEOUT`（默认 10 分钟）后把活着的 worker 判为 `worker_status: offline` → 前端 `supportsTerminal = sessionCanRun && tools含Terminal`，offline 直接隐藏终端 tab 并断开终端 SSE 订阅；且 offline 事件持久化、永不恢复，刷新页面也一样。
- 实锤：生产会话 `session_5b1ca782…` 16:06 开始，16:16:39 被判 offline，16:44 模型还在成功创建终端 `openvpn-inspection` 并流式输出——worker 全程在线。
- 修复：
  - `services/session.ts` 新增 `markSessionWorkerAlive()`：touch updatedAt + 把 stale offline 翻回 `online`（重新武装去重，让下次真离线能再发事件）；
  - `transport/ws-handler.ts`：WS open 即标活；每个入站帧（含 keep_alive）按 15s 节流标活；导出 `hasActiveSessionConnection()`；
  - `services/disconnect-monitor.ts`：有活跃 WS 的会话直接跳过离线判定。
- 历史修复回顾（7 月 10–11 日已修，属同一症状的前序根因）：init 元数据被 RCS 剥离（`tools` 丢失 → tab 永不出现）；权限批准响应缺 `updatedInput` 导致 CLI zod 拒绝（工具永远跑不起来）；`Terminal` 曾是延迟工具、模型拿不到 schema（已加入 CORE_TOOLS）。

### 4.2 已确认存在、建议尽快处理

1. **终端流写爆 SQLite**：`publishSessionEvent` 对所有类型无差别 `commitEvent`。终端 40ms 合帧输出 + 每分钟 state 心跳全部落盘且无清理。方案见 §3 L3 + 保留策略。
2. **Web SSE 重连全量回放**：`createSSEStream` 无 Last-Event-ID 时从 seq 0 回放整个事件日志；长会话（数千事件）经 WAN 重连时既慢又费流量。方案：首屏走 `/history` 分页 + SSE 只从 `from_sequence_num` 开始（前端已带 Last-Event-ID，补齐首连游标即可）。
3. **单 WS 抢占无告警**：同一 session 第二条 WS 会静默顶掉第一条（`cleanupBySession` replace）。两台设备误 attach 同一会话时表现为"另一台莫名断流"。方案：顶替时向旧连接发 close reason `superseded_by_new_connection`，CLI 侧提示。

### 4.3 需要持续关注的风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 反向代理空闲超时 | bridge keep_alive 默认 120s，Envoy/nginx 常见 60s idle timeout 会掐 WS | 自托管文档注明 `proxy_read_timeout ≥ 300s`；或调 `session_keepalive_interval_v2_ms` |
| CLI/RCS 版本漂移 | init 带 `claude_code_version`，但两端无协商；旧 CLI 对新 RCS（或反之）的 schema 差异只能靠 zod 报错兜底 | RCS 记录并在 Web 环境卡片上显示各设备 CLI 版本，差异过大黄条提醒 |
| SQLite 单写者 | RCS 单进程假设；数据库放 NFS/网络盘会锁损坏 | 文档写明 `RCS_DB_PATH` 必须本地盘 |
| 时钟偏移 | 所有超时判定用 RCS 服务器时钟，设备时钟不参与 | 无需处理，保持现状即可（注意别引入客户端时间戳判活） |
| 密钥分发 | 多设备共用 `RCS_API_KEYS` 静态 key；泄露即全线失守 | 每设备独立 key（配置已支持逗号分隔多 key）；泄露时单独吊销 |

## 5. 分期

- **P0（本次已完成）**：假离线修复 + 回归测试。
- **P1**：终端流不落盘 + 事件保留策略 + SSE 增量重连。
- **P2**：rebind 补全（水合/工作区校验/fencing/确认框），`ccb rc attach|pull`。
- **P3**：环境卡片版本显示、superseded 连接告警、每设备独立 key 引导。

# KAIROS — 永不关机的 Claude

> 源码位置：`src/assistant/`、`src/proactive/`、`src/services/autoDream/`
> 编译开关：`feature('KAIROS')`、`feature('KAIROS_BRIEF')`、`feature('KAIROS_CHANNELS')`
> 远程开关：GrowthBook `tengu_kairos`

关掉终端 Claude 还在运行的持久助手模式。KAIROS 是 Claude Code 中最复杂的隐藏功能之一。

---

## 核心概念

KAIROS 让 Claude 从"一次性对话工具"变成"持久运行的 AI 助手"：

- 关闭终端后 Claude 仍在后台运行
- 每天自动写日志
- 晚上自动"做梦"整理记忆
- 没人说话时自己找活干
- 命令超 15 秒自动丢后台

---

## 激活流程

定义在 `src/main.tsx`（约第 1054-1092 行），需要通过五层检查：

```
1. feature('KAIROS')          ← 编译时 flag
2. settings.assistant: true   ← .claude/settings.json
3. 目录信任状态检查            ← 防恶意仓库劫持
4. tengu_kairos               ← GrowthBook 远程开关
5. setKairosActive(true)      ← 全局状态激活
```

`--assistant` CLI 参数可跳过远程开关检查（用于 Agent SDK daemon 模式）。

全局状态存储在 `src/bootstrap/state.ts`：
- `kairosActive: boolean`（默认 `false`）
- `getKairosActive()` / `setKairosActive(true)`

---

## 跨会话持久运行

### 会话恢复

`src/utils/conversationRecovery.ts` 中使用 `feature('KAIROS')` 条件导入 `BriefTool` 和 `SendUserFileTool`。在反序列化会话时识别这些工具的结果为"终端工具结果"，判断 turn 是正常完成还是被中断。

### 持久 Cron 任务

关键在 `.claude/scheduled_tasks.json`。标记为 `permanent: true` 的任务不受 7 天自动过期限制：

- `catch-up`：恢复中断的工作
- `morning-checkin`：每日早间签到
- `dream`：记忆整合

### 会话历史 API

`src/assistant/sessionHistory.ts` 通过 OAuth API 加载远程会话历史，使用 `v1/sessions/{sessionId}/events` 端点，支持分页拉取。

---

## 做梦机制（Dream）

KAIROS 最精巧的子系统——后台运行的子代理，将分散的会话记忆整合为持久的结构化知识。

### 触发条件（三层门控，由廉到贵）

定义在 `src/services/autoDream/autoDream.ts`：

```
1. 时间门控：距上次整合超过 24 小时（minHours）
2. 会话门控：至少 5 个新会话（minSessions）
3. 锁门控：没有其他进程正在整合
```

阈值通过 GrowthBook `tengu_onyx_plover` 远程配置动态控制。

### 四阶段整合流程

定义在 `src/services/autoDream/consolidationPrompt.ts`：

| 阶段 | 动作 |
|------|------|
| **Orient** | 列出记忆目录、读取 `MEMORY.md` 索引、浏览已有主题文件 |
| **Gather** | 从每日日志、已有记忆、JSONL transcript 中搜集新信号 |
| **Consolidate** | 合并新信号到主题文件，转换相对日期为绝对日期，删除过时事实 |
| **Prune** | 更新 `MEMORY.md` 索引，保持在行数和大小限制内 |

### 锁机制

`src/services/autoDream/consolidationLock.ts`：

- 使用 `.consolidate-lock` 文件
- 文件 mtime = `lastConsolidatedAt`
- 文件内容 = 持有者 PID
- 支持 PID 存活检查（1 小时超时）
- double-write 后 re-read 验证防竞争

### 每日日志

路径由 `src/memdir/paths.ts` 的 `getAutoMemDailyLogPath()` 计算：

```
<autoMemPath>/logs/YYYY/MM/YYYY-MM-DD.md
```

### UI 呈现

- Footer pill 标签显示 **"dreaming"**
- `src/components/tasks/DreamDetailDialog.tsx` 提供专门的详情对话框
- 支持查看实时进度和手动中止
- `Shift+Down` 打开后台任务对话框

---

## 主动模式（Proactive Mode）

没人说话时 Claude 自己找活干。

### 核心状态

`src/proactive/index.ts` 维护三个状态：

| 状态 | 说明 |
|------|------|
| `active` | 是否激活 |
| `paused` | 是否暂停（用户按 Esc 取消时暂停，下次输入恢复） |
| `contextBlocked` | API 错误时阻塞 tick，防止 tick-error-tick 死循环 |

### 激活方式

- `--proactive` CLI 参数
- `CLAUDE_CODE_PROACTIVE` 环境变量
- 受 `feature('PROACTIVE') || feature('KAIROS')` 保护

### 系统提示

激活后追加：

```
# Proactive Mode

You are in proactive mode. Take initiative -- explore, act, and make progress
without waiting for instructions.

Start by briefly greeting the user.

You will receive periodic <tick> prompts. These are check-ins. Do whatever
seems most useful, or call Sleep if there's nothing to do.
```

### SleepTool 集成

设置中的 `minSleepDurationMs` 和 `maxSleepDurationMs` 控制 Sleep 持续时间范围，节流 proactive tick 频率。没活干就 Sleep 等着。

---

## 后台任务管理

### Cron 调度器

`src/utils/cronScheduler.ts`：

- 每 1 秒 tick 一次（`CHECK_INTERVAL_MS = 1000`）
- 使用 chokidar 监视 `.claude/scheduled_tasks.json`
- 支持调度器锁（`src/utils/cronTasksLock.ts`），防止多实例重复触发
- 锁探测间隔 5 秒，持有者崩溃时自动接管

### 任务类型

| 类型 | 说明 |
|------|------|
| 一次性（`recurring: false`） | 触发后自动删除，支持错过任务检测 |
| 循环（`recurring: true`） | 触发后重新调度，默认 7 天过期 |
| 永久（`permanent: true`） | 不受过期限制（KAIROS 专用） |
| 会话级（`durable: false`） | 仅内存中，进程退出即消失 |

### Jitter 防雷群机制

`src/utils/cronJitterConfig.ts`：

- 循环任务：基于 taskId 的确定性延迟（interval 的 10%，上限 15 分钟）
- 一次性任务：在 :00 和 :30 施加最多 90 秒提前量
- 运维可在事故期间推送配置变更，60 秒内全客户端生效

---

## 关键源码文件

| 文件 | 职责 |
|------|------|
| `src/bootstrap/state.ts` | KAIROS 全局状态 |
| `src/assistant/index.ts` | 助手模式入口 |
| `src/assistant/sessionHistory.ts` | 远程会话历史 API |
| `src/proactive/index.ts` | 主动模式状态管理 |
| `src/services/autoDream/autoDream.ts` | Auto-Dream 引擎 |
| `src/services/autoDream/consolidationPrompt.ts` | 整合提示（四阶段） |
| `src/services/autoDream/consolidationLock.ts` | 整合锁 |
| `src/services/autoDream/config.ts` | Dream 配置 |
| `src/tasks/DreamTask/DreamTask.ts` | Dream 任务定义 |
| `src/utils/cronScheduler.ts` | Cron 调度器 |
| `src/utils/cronTasks.ts` | Cron 任务持久化 |
| `src/skills/bundled/dream.ts` | `/dream` Skill（存根） |

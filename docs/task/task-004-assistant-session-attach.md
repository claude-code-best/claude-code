# Task 004: assistant [sessionId] — 分阶段恢复

> 来源: [stub-recovery-design-1-4.md](../features/stub-recovery-design-1-4.md) 第 4 项
> 优先级: P3
> 工作量: Phase 4A 中等，4A-4D 全做完很大
> 状态: Phase 4A DONE, 4B-4D TODO

## 目标

不一次性恢复整个 KAIROS 助手系统。先做"明确 sessionId 的 viewer attach 可用"，再逐步补 discovery / chooser / install。

## 背景

- attach 主流程已存在 (`src/main.tsx:4708`)
- 远端 viewer 所需基础模块已存在:
  - `src/remote/RemoteSessionManager.ts`
  - `src/hooks/useAssistantHistory.ts`
  - `src/assistant/sessionHistory.ts`
- 真正 stub 的主要是:
  - `src/assistant/sessionDiscovery.ts`
  - `src/assistant/AssistantSessionChooser.tsx`
  - `src/commands/assistant/assistant.tsx:7`
  - `src/assistant/index.ts`

## 分阶段实现

### Phase 4A: MVP — 显式 sessionId attach

**修改文件:**

| 文件 | 改动 |
|------|------|
| `src/main.tsx` | 确保 attach 分支可用 |
| `src/commands/assistant/index.ts` | 实现显式 sessionId 参数入口 |

**行为:**
- `claude assistant <sessionId>` — 进入 remote viewer
- `claude assistant` (无参数) — 返回明确提示: 当前版本需要显式 sessionId，discovery 尚未启用

**验证:**
- [ ] `claude assistant <sessionId>` 能进入 remote viewer
- [ ] 历史懒加载工作正常
- [ ] 无参数模式给出明确提示

### Phase 4B: session discovery

**修改文件:**

| 文件 | 改动 |
|------|------|
| `src/assistant/sessionDiscovery.ts` | 恢复 `discoverAssistantSessions()` |

**行为:**
- 数据来源优先复用现有 sessions / bridge / teleport API，不新增协议
- `claude assistant` 无参数时能拿到候选 session 列表

**验证:**
- [ ] 无参数调用能列出可用 sessions
- [ ] 数据来源复用现有通道

### Phase 4C: session chooser

**修改文件:**

| 文件 | 改动 |
|------|------|
| `src/assistant/AssistantSessionChooser.ts` | 恢复交互式选择器 |

**行为:**
- 多 session 时可交互选择

**验证:**
- [ ] 多个 session 时弹出选择器
- [ ] 选择后正确 attach

### Phase 4D: install wizard

**修改文件:**

| 文件 | 改动 |
|------|------|
| `src/commands/assistant/assistant.ts` | 恢复 install wizard 辅助函数 |

**行为:**
- 没有 session 时如何引导用户

**验证:**
- [ ] 无可用 session 时引导用户创建/连接

## 为什么拆分

- attach 渲染层与远端消息通道大部分已在
- 真正缺的是"如何发现目标 session"和"如何交互选择"
- 如果把 `src/assistant/index.ts` 的整套 KAIROS 正常模式也一起拉进来，范围会失控

## 风险

- 这是四项里范围最大的
- 一旦把 KAIROS 正常模式整体拉入，会从"viewer attach"膨胀成"完整 assistant mode 恢复"

## 依赖

- Task 002 的 session registry 模式可复用

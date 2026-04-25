# Agent 通讯修复 Jira Task

- 版本：v1.0
- 生成日期：2026-04-25
- 来源：由按文件执行清单、Claude 交叉验证意见整理合并
- 范围：ACP Agent / Bridge / Remote Control Server / REPL Hook 生命周期
- 使用方式：这是唯一执行任务文档；每个 `JIRA-*` 小节可直接拆成一个 Jira issue，字段保持统一，便于复制或二次导入。

---

## 方案性质

本文档是目标状态式执行方案，不是临时补丁清单。每张 ticket 必须交付明确的代码终态、测试覆盖和回归边界；不得只用局部 workaround 掩盖问题。

---

## 执行总则

1. 先边界安全，后内部优化：先修 WS 入站大小与输入校验，避免线上风险扩大。
2. 单文件可回滚：每个文件内修改保持内聚，便于回滚与 bisect。
3. 不改协议语义，只修实现缺陷：除 `resource_link` 表达形式统一外，不改变主流程契约。
4. 每个文件必须有验收输出：要么测试用例，要么日志/指标验证。
5. 发布前必须确认协议层行为无回归：`stopReason` 决策与 `sessionUpdate` 发送顺序保持稳定。

---

## Epic

### JIRA-EPIC-001：提升 Agent 通讯链路稳定性与边界安全

- Issue Type：Epic
- Priority：P0
- Owner：核心通讯 / 后端网关 / QA
- Scope：ACP Agent、ACP Bridge、Remote Control Server、REPL 初始化生命周期
- Goal：修复长会话资源泄漏、补齐 WebSocket 入站边界、统一 prompt 转换、收敛类型风险，并补充关键回归测试。

#### Epic 验收标准

- `bun run typecheck` 0 error。
- P0 WebSocket 超大消息拒绝逻辑已实现并覆盖测试。
- ACP bridge abort listener 生命周期无累积。
- prompt 转换实现单源化。
- settings/defaultMode 能真实影响 ACP permission mode，且 `_meta.permissionMode` 保持最高优先级。
- REPL 目标 hook suppress 清理完成，timer cleanup 完整。

---

## P0 Tickets

### JIRA-001：为 session ingress WebSocket 补齐消息大小限制

- Issue Type：Bug
- Priority：P0
- Story Points：3
- Owner：后端/网关
- Files：
  - `packages/remote-control-server/src/routes/v1/session-ingress.ts`
- 后续票：JIRA-008（同文件 P1 类型与 decode path 收尾）

#### 参考代码位置

- `packages/remote-control-server/src/routes/v1/session-ingress.ts:100-106`

#### 背景

`session-ingress` 当前缺少 WebSocket message size limit。ACP 路由已有类似限制，两个入口边界不一致，可能导致大包占用内存或绕过入口保护。

#### 实施要求

- 新增 `MAX_WS_MESSAGE_SIZE = 10 * 1024 * 1024`，与 ACP 路由的 10MB 上限保持一致。
- 在 `onMessage` decode 后优先检查 payload size。
- 超限时执行 `ws.close(1009, "message too large")`。
- 日志记录 `sessionId`、payload size、limit。
- 对 `string`、`ArrayBuffer`、`Uint8Array` 进行统一 decode 分流。
- 非支持类型直接拒绝并记录，不进入业务 handler。

#### 验收标准

- 11MB payload 被 1009 close。
- 1KB 合法 payload 仍正常进入 handler。
- 非支持类型 payload 不进入 handler。
- 不改变 URL、auth、session 解析逻辑。

#### 回归范围

- Remote Control Server session ingress WebSocket。
- 正常会话消息转发。
- WebSocket close code 行为。

#### 风险等级

- 中。入口逻辑变更可能影响特殊客户端 payload 类型。

#### 必须验证

- 在 `packages/remote-control-server/src/__tests__/routes.test.ts` 增加 session-ingress WebSocket 大包、小包、坏类型 payload 用例。
- 运行 `bun run typecheck`。

---

### JIRA-002：修复 ACP bridge abort listener 生命周期泄漏

- Issue Type：Bug
- Priority：P0
- Story Points：3
- Owner：核心通讯
- Files：
  - `src/services/acp/bridge.ts`

#### 参考代码位置

- `src/services/acp/bridge.ts:576-585`

#### 背景

ACP bridge 的 `Promise.race` abort 分支注册 listener 后缺少完整 cleanup。长会话或高频 next 场景可能出现 listener 累积。

#### 实施要求

- 将 abort race 改为可清理监听器写法。
- 注册 listener 后保留 handler 引用。
- `sdkMessages.next()` 先返回时必须 `removeEventListener`。
- abort、throw、return 等路径都在 `finally` 中清理。
- 不改变 `stopReason` 决策逻辑。
- 不改变 `sessionUpdate` 发送顺序。

#### 验收标准

- 模拟 10k 次 next 且不 abort，listener 不增长。
- abort 场景仍返回 `cancelled`。
- 原有 streaming/session update 行为无回归。

#### 回归范围

- ACP bridge streaming loop。
- 用户取消请求。
- SDK generator 异常路径。

#### 风险等级

- 中。异步控制流变更需要覆盖取消与异常路径。

#### 必须验证

- 新增 listener cleanup 单元测试。
- 运行 `bun run typecheck`。

---

## P1 Tickets

### JIRA-003：优化 ACP agent pending prompt 队列为 O(1) 出队

- Issue Type：Task
- Priority：P1
- Story Points：5
- Owner：核心通讯
- Files：
  - `src/services/acp/agent.ts`

#### 参考代码位置

- `src/services/acp/agent.ts:332-339`

#### 背景

当前 pending prompt 队列使用 `Map + sort` 获取下一项，排队量上升时会带来不必要的排序成本。

#### 实施要求

- 改为 `queue: string[]` + `pendingMap: Map<string, PendingPrompt>` 组合。
- 入队执行 `queue.push(id)` 与 `pendingMap.set(id, prompt)`。
- 出队从队首惰性跳过已取消项。
- 取消只从 `pendingMap` 删除，不做数组中间删除。
- 保持现有取消语义和出队顺序。

#### 验收标准

- 1000 pending prompt 场景下出队顺序正确。
- 已取消 prompt 不会被 resolve。
- 出队不再依赖全量 sort。
- 1000 排队场景下出队耗时低于旧实现；测试记录旧实现复杂度风险和新实现 O(1) 出队路径。
- 行为与旧实现兼容。

#### 回归范围

- ACP prompt queue。
- 并发 prompt 请求。
- prompt cancel / resolve 边界。

#### 风险等级

- 中。队列结构变更可能引入取消边界问题。

#### 必须验证

- 新增 queue 顺序与取消测试。
- 对 1000 prompt 场景做性能断言或日志记录。

---

### JIRA-004：接入真实 settings 读取并校验 ACP permission mode

- Issue Type：Bug
- Priority：P1
- Story Points：3
- Owner：核心通讯
- Files：
  - `src/services/acp/agent.ts`

#### 参考代码位置

- `src/services/acp/agent.ts:465-467`

#### 背景

`getSetting()` 当前未真正接入项目配置，导致默认 permission mode 配置无法按预期生效。

#### 实施要求

- 接入项目现有 settings/config 读取逻辑。
- 仅接受合法 permission mode 枚举值。
- 非法值 fallback 到 `default`。
- `_meta.permissionMode` 继续保持最高优先级。
- 不改变外部协议字段。

#### 验收标准

- settings/defaultMode 能影响默认 permission mode。
- `_meta.permissionMode` 能覆盖 settings。
- 非法 settings 值不会传播到运行时。
- 类型检查通过。

#### 回归范围

- ACP agent session 初始化。
- 权限模式同步。
- 客户端 `_meta` 覆盖逻辑。

#### 风险等级

- 中。配置优先级错误会影响权限行为。

#### 必须验证

- 新增 defaultMode / `_meta.permissionMode` 优先级测试。
- 运行 `bun run typecheck`。

---

### JIRA-005：单源化 ACP prompt 转换逻辑

- Issue Type：Refactor
- Priority：P1
- Story Points：5
- Owner：核心通讯
- Files：
  - `src/services/acp/agent.ts`
  - `src/services/acp/bridge.ts`
  - `src/services/acp/promptConversion.ts`（新增）

#### 参考代码位置

- `src/services/acp/agent.ts:754-758`
- `src/services/acp/agent.ts:764-785`
- `src/services/acp/bridge.ts:522-537`

#### 背景

ACP agent 与 bridge 存在重复 prompt 转换逻辑，`resource_link` 等 block 的输出策略容易分叉。

#### 实施要求

- 新增共享转换模块 `src/services/acp/promptConversion.ts`。
- `agent.ts` 与 `bridge.ts` 改为调用共享转换函数。
- 删除 `bridge.ts` 中 `promptToQueryContent` 的真实实现；如导出仍需保留，则只允许保留调用共享函数的 wrapper。
- `resource_link` 输出改为稳定纯文本元信息，禁止 markdown link。
- 保持其他 block 转换语义不变。

#### 验收标准

- 全仓库仅保留一个真实 prompt 转换实现。
- 相同 input block 在 agent/bridge 输出一致。
- `resource_link` 不再输出 `[name](uri)` 形式。
- 相关测试覆盖转换一致性。

#### 回归范围

- ACP prompt input。
- bridge query content。
- resource link prompt 表达。

#### 风险等级

- 中。文本格式变化可能影响下游 prompt 快照或断言。

#### 必须验证

- 新增 shared conversion 单元测试。
- 全仓库搜索重复转换函数。
- 运行 `bun run typecheck`。

---

### JIRA-006：治理 REPL onInit effect 依赖并补齐 timer cleanup

- Issue Type：Task
- Priority：P1
- Story Points：3
- Owner：终端 UI
- Files：
  - `src/screens/REPL.tsx`

#### 参考代码位置

- `src/screens/REPL.tsx:654-662`
- `src/screens/REPL.tsx:4996-5005`

#### 背景

REPL 中目标初始化 effect 存在 hook dependency suppress，warm-up timer 也需要显式 cleanup，避免频繁挂载/卸载时留下悬挂任务。

#### 实施要求

- 整理 `onInit` 生命周期，使用稳定引用或 effect 内联。
- 移除目标段 `exhaustive-deps` suppress。
- 保持 unmount cleanup 行为不变。
- warm-up effect 中记录 timeout id。
- cleanup 中执行 `clearTimeout(timeoutId)`。
- 保留 `alive` 判定作为并发保护。

#### 验收标准

- 目标段不再需要 hooks lint suppress。
- 高频打开/关闭搜索栏无悬挂 timer 增长。
- REPL 初始化行为无回归。

#### 回归范围

- REPL 初始化。
- 搜索栏 warm-up。
- 组件卸载 cleanup。

#### 风险等级

- 中。React effect 依赖治理可能改变初始化时机。

#### 必须验证

- 运行 lint/typecheck。
- 手动或测试覆盖 REPL mount/unmount。

---

### JIRA-007：收敛 ACP route WebSocket 事件 any 类型

- Issue Type：Task
- Priority：P1
- Story Points：2
- Owner：后端/网关
- Files：
  - `packages/remote-control-server/src/routes/acp/index.ts`

#### 参考代码位置

- `packages/remote-control-server/src/routes/acp/index.ts:108-146`

#### 背景

ACP route 中 WebSocket 事件和 socket 参数存在 `any`，降低编译期保护。

#### 实施要求

- 定义最小 WebSocket 事件类型：open/message/close/error。
- 将 `_evt: any`、`evt: any`、`ws: any` 替换为窄类型。
- 不改变 payload decode 与大小检查策略。
- 不改变现有 handler 行为。

#### 验收标准

- 编译期能捕获错误事件字段访问。
- 现有 WebSocket 行为不变。
- `bun run typecheck` 通过。

#### 回归范围

- ACP WebSocket route。
- message decode。
- close/error handler。

#### 风险等级

- 低。类型收敛为主。

#### 必须验证

- 运行 `bun run typecheck`。
- 保留现有测试通过。

---

### JIRA-008：收敛 session ingress WebSocket 事件类型与 decode path

- Issue Type：Task
- Priority：P1
- Story Points：3
- Owner：后端/网关
- Files：
  - `packages/remote-control-server/src/routes/v1/session-ingress.ts`
- 前置依赖：JIRA-001 已合并

#### 参考代码位置

- `packages/remote-control-server/src/routes/v1/session-ingress.ts:100-106`

#### 背景

在完成 P0 size guard 后，session ingress 仍需要进一步收敛事件类型与 decode path，减少隐式类型风险。

#### 实施要求

- 定义或复用最小 WebSocket message event 类型。
- 将 message decode 分支集中到一个小函数。
- 保持 P0 size guard 与 close code 语义。
- 不改变 auth/session 解析。

#### 验收标准

- decode path 单一清晰。
- 不支持 payload 类型有明确拒绝路径。
- `bun run typecheck` 通过。

#### 回归范围

- Session ingress WebSocket message handling。
- P0 大包拒绝逻辑。

#### 风险等级

- 低到中。与 P0 同文件，注意避免重复改动冲突。

#### 必须验证

- 与 JIRA-001 同批测试。
- 运行 `bun run typecheck`。

---

## QA Tickets

### JIRA-009：补充 ACP 通讯回归测试

- Issue Type：Test
- Priority：P1
- Story Points：5
- Owner：QA/核心通讯
- Files：
  - `src/services/acp/agent.ts`
  - `src/services/acp/bridge.ts`
  - `src/services/acp/promptConversion.ts`
  - `src/services/acp/__tests__/agent.test.ts`
  - `src/services/acp/__tests__/bridge.test.ts`
  - `src/services/acp/__tests__/promptConversion.test.ts`

#### 覆盖场景

- 长会话 10k turn，无 abort listener 累积。
- prompt queue 1000 并发排队，取消/出队顺序正确。
- settings/defaultMode 与 `_meta.permissionMode` 优先级正确。
- `resource_link` 转换在 agent 与 bridge 输出一致。

#### 验收标准

- 新增测试在本地稳定通过。
- 不依赖真实网络或外部服务。
- 测试 mock 遵守仓库规范，只 mock 有副作用链路。

#### 回归范围

- ACP bridge。
- ACP agent。
- prompt conversion。
- permission mode resolution。

#### 风险等级

- 中。异步测试可能有稳定性问题，需要避免时间敏感断言。

#### 必须验证

- 运行相关 `bun test`。
- 运行 `bun run typecheck`。

---

### JIRA-010：补充 Remote Control Server WebSocket 入站回归测试

- Issue Type：Test
- Priority：P1
- Story Points：3
- Owner：QA/后端
- Files：
  - `packages/remote-control-server/src/__tests__/routes.test.ts`
  - `packages/remote-control-server/src/routes/v1/session-ingress.ts`

#### 覆盖场景

- 11MB session ingress payload 被 1009 close（与 10MB 上限对齐）。
- 合法小 payload 正常进入 handler。
- 非支持 payload 类型被拒绝。
- 日志或可观测输出包含 sessionId、payload size、limit。

#### 验收标准

- 11MB payload 被 1009 close（与 10MB 上限对齐）。
- 新增测试稳定通过。
- 不启动真实外部服务。
- 不改变现有 route public contract。

#### 回归范围

- RCS session ingress route。
- WebSocket message handling。
- close code 行为。

#### 风险等级

- 中。测试需要适配现有 WebSocket/mock 基础设施。

#### 必须验证

- 运行 RCS package 相关测试。
- 运行 `bun run typecheck`。

---

## 推荐执行顺序

执行节奏与原计划保持一致：先完成 P0 全部改动和冒烟验证，再启动 P1 改造；测试票可穿插执行，但不得绕过 P0 gate。

1. JIRA-001：先封入口大包风险。
2. JIRA-002：修长会话 listener 生命周期。
3. JIRA-010：补 RCS 入站测试，锁住 P0 行为。
4. JIRA-003：优化 pending prompt queue。
5. JIRA-004：接入 settings/defaultMode。
6. JIRA-005：单源化 prompt 转换。
7. JIRA-009：补 ACP 回归测试。
8. JIRA-006：治理 REPL effect/timer。
9. JIRA-007：收敛 ACP route 类型。
10. JIRA-008：收敛 session ingress 类型与 decode path。

---

## Release Checklist

- [ ] `bun run typecheck` 0 error
- [ ] P0 tickets 已合并并测试通过
- [ ] ACP 回归测试通过
- [ ] RCS WebSocket 入站测试通过
- [ ] prompt conversion 单源化已通过代码搜索确认
- [ ] permission mode 优先级测试通过
- [ ] 协议层行为无回归（stopReason 决策、sessionUpdate 发送顺序）
- [ ] REPL hook/timer 改动通过 lint/typecheck
- [ ] 最终变更说明包含风险与未覆盖项

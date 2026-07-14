# 浏览器 Session 模型切换与端到端加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用当前 Session 环境的真实供应商目录替换硬编码模型菜单，让新对话清楚展示默认模型、旧对话保持最后成功模型，并完成兼容、安全和重启恢复验收。

**Architecture:** Session API 的 `model_selection` 是浏览器初始状态；环境脱敏目录提供可选项；`session_model_changed` SSE 事件是切换后的权威状态。控件发送结构化 `set_session_model`，不做模型乐观切换；运行回合中禁用切换。旧 Worker 没有 capability 时保留 Alias 菜单和 `set_model`。

**Tech Stack:** React、RCSChatAdapter、Session event reducer、Hono/SSE、Bun test、浏览器构建与集成验收脚本。

## 任务 1：让浏览器 Session 状态理解结构化模型快照和权威事件

**文件：**

- 修改：`packages/remote-control-server/web/src/types/index.ts`
- 修改：`packages/remote-control-server/web/src/lib/types.ts`
- 修改：`packages/remote-control-server/web/src/lib/session-event-reducer.ts`
- 修改：`packages/remote-control-server/web/src/lib/rcs-chat-adapter.ts`
- 修改：`packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts`
- 修改：`packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts`

**接口：**

```ts
export interface SessionModelSelection {
  providerId: string
  modelProfileId: string
  resolvedModelId: string
  providerConfigRevision: number
  updatedAt: number
  availability?: 'available' | 'archived' | 'missing' | 'legacy'
}
```

- `Session.model_selection` 使用 API snake_case，加载时转换为 UI 类型。
- `SessionEventState.modelSelection` 由 `session_model_changed` 或唯一恢复的 init 更新。
- Adapter 增加 `onSessionModelChange` 和 `setSessionModel(ref, revision)`。

- [ ] 1.1 写 reducer 失败测试：权威成功事件更新、失败/请求事件不更新、旧事件回放保持最后一条、重复 operation ID 幂等、普通 `system/init.model` 只作为 legacy display。

```ts
expect(state.modelSelection).toMatchObject({
  providerId: 'custom-openai',
  modelProfileId: 'model-b',
  resolvedModelId: 'remote-b',
  providerConfigRevision: 8,
})
```

- [ ] 1.2 写 Adapter 失败测试，断言结构化请求 payload 和新 operation ID，并确认旧 `setModel('sonnet')` 不变。

```ts
await adapter.setSessionModel(
  { providerId: 'p1', modelProfileId: 'm1' },
  7,
)
expect(sent.request).toMatchObject({
  subtype: 'set_session_model', provider_id: 'p1', model_profile_id: 'm1',
  expected_provider_config_revision: 7,
})
expect(sent.request.operation_id).toMatch(UUID_PATTERN)
```

- [ ] 1.3 运行测试并确认失败。

```bash
bun test packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts
```

预期：结构化模型状态和方法不存在。

- [ ] 1.4 扩展 payload normalize/read helpers，显式读取模型字段，不能把任意 raw 对象扩展到状态。`session_model_change_failed` 只保存最近错误码供 UI 显示，保留旧 selection。

- [ ] 1.5 `setSessionModel()` 只等待 control response；Adapter 的模型状态只能由 `handleEvent()` 处理权威事件触发。成功 control response 的 data 不直接调用 `onSessionModelChange`。

- [ ] 1.6 `RCSChatAdapter.init(signal, { live, initialModelSelection })` 接收 API 持久 selection 作为基线，历史中的更新事件再按 seqNum 覆盖；不能依赖 localStorage。

- [ ] 1.7 运行测试和 Web typecheck。

```bash
bun test packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts
bun run --cwd packages/remote-control-server typecheck
```

预期：全部通过。

- [ ] 1.8 提交。

```bash
git add packages/remote-control-server/web/src/types/index.ts packages/remote-control-server/web/src/lib/types.ts packages/remote-control-server/web/src/lib/session-event-reducer.ts packages/remote-control-server/web/src/lib/rcs-chat-adapter.ts packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts
git commit -m "feat: track authoritative session model state"
```

## 任务 2：实现可搜索、按供应商分组的 Session 模型选择器

**文件：**

- 新建：`packages/remote-control-server/web/src/components/providers/SessionModelSelector.tsx`
- 新建：`packages/remote-control-server/web/src/lib/session-model-options.ts`
- 新建：`packages/remote-control-server/web/src/__tests__/session-model-options.test.ts`
- 新建：`packages/remote-control-server/web/src/__tests__/session-model-selector.test.tsx`
- 修改：`packages/remote-control-server/web/src/components/SessionControlBar.tsx`
- 修改：`packages/remote-control-server/web/src/pages/SessionDetail.tsx`

**数据规则：**

- 可选：Provider/Model 都 `enabled=true`、`archived=false`、策略允许，且 auth configured。
- 分组：Provider displayName；搜索匹配 provider 名、model displayName、remoteModelId 和 alias。
- 当前历史项即使归档、停用或目录缺失仍显示在顶部，但 disabled 且带状态标签。
- 运行时 `turnState === 'running'` 或已有模型 operation pending 时禁止切换。
- 新 capability 不可用时显示四项 legacy Alias 并走旧 `set_model`。

- [ ] 2.1 写纯 options 失败测试，覆盖过滤、分组、搜索、稳定排序、历史归档项、missing legacy、重复 remote ID 不合并和旧 Worker fallback。

```ts
expect(buildSessionModelOptions(catalog, current).groups.map(g => g.providerId)).toEqual(['anthropic', 'custom-openai'])
expect(buildSessionModelOptions(catalog, archivedCurrent).current?.availability).toBe('archived')
```

- [ ] 2.2 写 SSR 失败测试：搜索框、分组标题、remote ID、当前勾选、不可用标签、运行中禁用提示和 legacy options。

- [ ] 2.3 运行测试并确认失败。

```bash
bun test packages/remote-control-server/web/src/__tests__/session-model-options.test.ts packages/remote-control-server/web/src/__tests__/session-model-selector.test.tsx
```

预期：模块不存在。

- [ ] 2.4 实现纯 options builder，不在组件内散落过滤规则。当前 selection 与目录匹配必须同时比较 providerId/modelProfileId；只比较 resolved ID 会把不同 Provider 错认成同一模型。

- [ ] 2.5 实现 `SessionModelSelector`。选择后进入 pending，只发送结构化请求，不立即改变勾选；当 `selection` prop 变成目标项时清 pending；control error、`session_model_change_failed` 或 15 秒未见权威事件时显示中文错误并保留旧项。

- [ ] 2.6 修改 `SessionControlBar`：删除 `MODEL_OPTIONS` 和把 remote ID 猜成 opus/sonnet/haiku 的 effect；模型区域委托新组件。权限和思考控件保持原逻辑。

- [ ] 2.7 修改 `SessionDetail`：

- 用 `session.environment_id` 调 `useProviderCatalog`。
- API `model_selection` 作为 Adapter 初始值。
- `onSessionModelChange` 同步 state，并立即调用 `apiFetchSession()` 校验 RCS 已持久化相同 selection；短暂时序差异只触发一次 250ms 延迟重读。
- `runtime.turnState === 'running'` 单独传给模型选择器，而不是禁用全部 Session 控件。
- 新 Worker capability 允许结构化切换；旧 Worker仅允许 legacy alias。

- [ ] 2.8 运行 selector、control bar 相邻测试、Adapter 测试和 typecheck。

```bash
bun test packages/remote-control-server/web/src/__tests__/session-model-options.test.ts packages/remote-control-server/web/src/__tests__/session-model-selector.test.tsx packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts
bun run --cwd packages/remote-control-server typecheck
```

预期：全部通过。

- [ ] 2.9 提交。

```bash
git add packages/remote-control-server/web/src/components/providers/SessionModelSelector.tsx packages/remote-control-server/web/src/lib/session-model-options.ts packages/remote-control-server/web/src/__tests__/session-model-options.test.ts packages/remote-control-server/web/src/__tests__/session-model-selector.test.tsx packages/remote-control-server/web/src/components/SessionControlBar.tsx packages/remote-control-server/web/src/pages/SessionDetail.tsx
git commit -m "feat: select session models from provider catalog"
```

## 任务 3：所有新建对话入口展示并复制环境默认模型

**文件：**

- 修改：`packages/remote-control-server/src/__tests__/routes.test.ts`
- 修改：`packages/remote-control-server/src/routes/web/chat.ts`
- 修改：`packages/remote-control-server/web/src/api/client.ts`
- 修改：`packages/remote-control-server/web/src/__tests__/api-client.test.ts`
- 修改：`packages/remote-control-server/web/src/components/NewSessionDialog.tsx`
- 修改：`packages/remote-control-server/web/src/pages/CodeHome.tsx`
- 修改：`packages/remote-control-server/web/src/pages/ChatHome.tsx`
- 新建：`packages/remote-control-server/web/src/components/providers/DefaultModelSummary.tsx`
- 新建：`packages/remote-control-server/web/src/__tests__/new-session-model-summary.test.tsx`

**行为：**

- Generic `/web/sessions`、Code product session 和 Chat product session 都由服务端从实际选中的 runtime environment 复制默认快照。
- 浏览器只展示解析结果，不把 model selection 放进 create request。
- 默认变化后已经创建的 Session 不变。

- [ ] 3.1 扩展路由失败测试：`GET /web/chat/runtime-default` 返回服务端实际会选择的 Chat runtime 环境 ID 和脱敏默认模型；没有可用 Chat runtime 时返回 409；响应不含凭据字段。

- [ ] 3.2 写 SSR 失败测试：选择环境后显示“新对话将使用 供应商 / 模型”；无默认显示“使用 CLI 默认模型”；ChatHome 显示自动选择的 Chat runtime 默认；不出现模型下拉框。

```ts
expect(markup).toContain('新对话将使用')
expect(markup).toContain('自定义 OpenAI / Reasoner')
expect(markup).not.toContain('选择模型')
```

- [ ] 3.3 运行测试并确认失败。

```bash
bun test packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/web/src/__tests__/api-client.test.ts packages/remote-control-server/web/src/__tests__/new-session-model-summary.test.tsx
```

预期：Chat runtime default 路由/API 和三个创建入口摘要不存在。

- [ ] 3.4 在 `routes/web/chat.ts` 增加 `GET /chat/runtime-default`，调用服务端与 `createChatProductSession()` 相同的 `selectChatRuntimeEnvironment(accountId)` helper，返回 `{environment_id, default_model}`。浏览器增加 `apiFetchChatRuntimeDefault()`；不能在浏览器复刻环境排序。

- [ ] 3.5 实现 `DefaultModelSummary` 复用 catalog type guard，支持 `valid/unverified/invalid` 状态；invalid default 属于协议错误，显示警告并说明服务端将拒绝，不让浏览器替换。

- [ ] 3.6 在 `NewSessionDialog`、`CodeHome`、`ChatHome` 显示摘要。ChatHome 使用 `apiFetchChatRuntimeDefault()` 的结果；环境或目录变化后重新请求，不从浏览器 `environments` 数组猜测。

- [ ] 3.7 创建请求类型不增加 `model_id`/`provider_id`；新增测试断言 body 里没有这些键。

- [ ] 3.8 运行服务、路由、摘要和 typecheck。

```bash
bun test packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/web/src/__tests__/new-session-model-summary.test.tsx packages/remote-control-server/web/src/__tests__/api-client.test.ts
bun run --cwd packages/remote-control-server typecheck
```

预期：全部通过。

- [ ] 3.9 提交。

```bash
git add packages/remote-control-server/src/routes/web/chat.ts packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/web/src/api/client.ts packages/remote-control-server/web/src/__tests__/api-client.test.ts packages/remote-control-server/web/src/components/NewSessionDialog.tsx packages/remote-control-server/web/src/pages/CodeHome.tsx packages/remote-control-server/web/src/pages/ChatHome.tsx packages/remote-control-server/web/src/components/providers/DefaultModelSummary.tsx packages/remote-control-server/web/src/__tests__/new-session-model-summary.test.tsx
git commit -m "feat: show defaults when creating sessions"
```

## 任务 4：完善旧 Worker 降级、Revision 冲突和不可用历史状态

**文件：**

- 修改：`packages/remote-control-server/web/src/lib/session-model-options.ts`
- 修改：`packages/remote-control-server/web/src/components/providers/SessionModelSelector.tsx`
- 修改：`packages/remote-control-server/web/src/pages/ProviderSettingsPage.tsx`
- 修改：`packages/remote-control-server/web/src/__tests__/session-model-options.test.ts`
- 修改：`packages/remote-control-server/web/src/__tests__/provider-settings-page.test.tsx`
- 修改：`packages/remote-control-server/src/services/provider-web.ts`
- 修改：`packages/remote-control-server/src/__tests__/routes.test.ts`

**降级矩阵：**

| Capability | Provider 页面 | Session 模型菜单 |
|---|---|---|
| 无 `provider_model_catalog_v1` | 从旧 `capabilities.provider` 只读展示 | Default/Opus/Sonnet/Haiku + 旧 `set_model` |
| 有 catalog，无 `provider_runtime_switch_v1` | 可管理目录（若 catalogWrite） | 目录只读，禁止跨 Provider；可继续 legacy alias |
| 有 runtime switch，无 persistence | 可管理 | 结构化切换禁用，提示升级 Worker |
| 三项齐全 | 完整管理 | 完整动态切换 |

- [ ] 4.1 写失败测试覆盖四行矩阵，确认旧 Worker 不看到可点击的新增/认证/设默认，也不会收到 `set_session_model`。

- [ ] 4.2 写 revision conflict 失败测试：打开菜单后目录 revision 变化，Worker 返回 stale；浏览器刷新目录、保留旧 selection、提示重新选择，不能自动用同 ID 重试。

- [ ] 4.3 写不可用失败测试：Provider 被归档、Model 被归档、认证失效、目录缺失四种状态有不同标签；当前项可见但不能再次选择。

- [ ] 4.4 运行测试并确认失败。

```bash
bun test packages/remote-control-server/web/src/__tests__/session-model-options.test.ts packages/remote-control-server/web/src/__tests__/session-model-selector.test.tsx packages/remote-control-server/web/src/__tests__/provider-settings-page.test.tsx packages/remote-control-server/src/__tests__/routes.test.ts
```

预期：部分降级/冲突用例失败。

- [ ] 4.5 实现 capability decision 纯函数，Provider 页面和 Session 选择器共同使用；禁止在两个组件分别猜 boolean。

```ts
type ProviderFeatureMode = 'legacy-readonly' | 'catalog-readonly' | 'catalog-manage' | 'full'
```

- [ ] 4.6 RCS GET catalog 返回 `features` 和 `stale`；mutation 在 Worker 缺少写 capability 时 409 `provider_management_unsupported`，不能只靠按钮隐藏保护。

- [ ] 4.7 stale revision 只刷新并要求用户重选；operation ID 不能复用。认证失效时可在 Provider 页面重新认证，但 Session 选择器不触发认证弹窗，避免切换与秘密流程耦合。

- [ ] 4.8 运行测试和 typecheck。

```bash
bun test packages/remote-control-server/web/src/__tests__/session-model-options.test.ts packages/remote-control-server/web/src/__tests__/session-model-selector.test.tsx packages/remote-control-server/web/src/__tests__/provider-settings-page.test.tsx packages/remote-control-server/src/__tests__/routes.test.ts
bun run --cwd packages/remote-control-server typecheck
```

预期：全部通过。

- [ ] 4.9 提交。

```bash
git add packages/remote-control-server/web/src/lib/session-model-options.ts packages/remote-control-server/web/src/components/providers/SessionModelSelector.tsx packages/remote-control-server/web/src/pages/ProviderSettingsPage.tsx packages/remote-control-server/web/src/__tests__/session-model-options.test.ts packages/remote-control-server/web/src/__tests__/session-model-selector.test.tsx packages/remote-control-server/web/src/__tests__/provider-settings-page.test.tsx packages/remote-control-server/src/services/provider-web.ts packages/remote-control-server/src/__tests__/routes.test.ts
git commit -m "feat: degrade provider controls for legacy workers"
```

## 任务 5：完成重启、隔离和密钥边界集成验收

**文件：**

- 新建：`packages/remote-control-server/src/__tests__/provider-model-lifecycle.test.ts`
- 新建：`src/bridge/__tests__/providerModelLifecycle.test.ts`
- 新建：`scripts/verify-provider-secret-boundary.ts`
- 修改：`package.json`
- 修改：`docs/superpowers/specs/2026-07-14-browser-provider-model-management-design.md`

**验收场景：**

1. 环境 A 添加 OpenAI-compatible Provider 和两个自定义 remote model ID。
2. 通过 Secret Control 配置测试密钥；RCS DB/事件/日志不含明文。
3. 验证并设 model A 为默认；创建 Session 1，Work 使用 A。
4. Session 1 空闲时切 model B，收到权威事件后持久化 B。
5. 改环境默认为 B（或另一个 model C）；Session 1 仍为 B，之后 Session 2 使用新默认。
6. 关闭并重新创建 RCS database/store，Session 1 仍为 B。
7. 重连 Worker，Work 仍携带 Session 1 的 B，不读取当前默认。
8. 环境 B 使用完全不同目录，任何操作不影响环境 A。
9. 归档 Session 1 当前模型，浏览器仍显示历史选择且标记不可用。
10. 激活失败、认证失败、revision conflict 都保留旧运行时/Session 行。

- [ ] 5.1 先写 RCS 生命周期失败测试，使用临时 SQLite 和真实 route/service 层，不 mock `storeUpdateSession`；断言创建、默认变化、切换确认、RCS 重启和双环境隔离。

- [ ] 5.2 写 Bridge 生命周期失败测试，mock 远程客户端但使用真实 resolver/runtime service/session runner；断言两个 Session 子进程环境不同、失败回滚、重连参数一致。

- [ ] 5.3 运行测试并确认至少重启或隔离断言失败。

```bash
bun test packages/remote-control-server/src/__tests__/provider-model-lifecycle.test.ts src/bridge/__tests__/providerModelLifecycle.test.ts
```

预期：未接齐的生命周期断言失败；修复只能修改负责该行为的生产模块，不在测试中放宽断言。

- [ ] 5.4 修复集成暴露的缺口，保持最小改动；每个修复先增加最小回归断言。

- [ ] 5.5 实现 `verify-provider-secret-boundary.ts`：创建唯一 canary credential，完整跑 Secret Relay，然后扫描临时 RCS SQLite 的所有 TEXT/BLOB、捕获日志、HTTP JSON 和 Session events。脚本只输出命中位置/字段名，不输出 canary 本身。

```json
{
  "scripts": {
    "test:provider-model-lifecycle": "bun test packages/remote-control-server/src/__tests__/provider-model-lifecycle.test.ts src/bridge/__tests__/providerModelLifecycle.test.ts && bun run scripts/verify-provider-secret-boundary.ts"
  }
}
```

- [ ] 5.6 运行生命周期和秘密边界验收。

```bash
bun run test:provider-model-lifecycle
```

预期：退出码 `0`，输出包含 `provider secret boundary: clean`，不打印 canary。

- [ ] 5.7 运行所有新增测试、现有相邻回归、类型检查和 Web 构建。

```bash
bun test src/services/providerRegistry/__tests__ src/services/providerAuth/__tests__ src/services/providerRuntime/__tests__ src/bridge/__tests__ packages/remote-control-server/src/__tests__ packages/remote-control-server/web/src/__tests__
bun run typecheck
bun run --cwd packages/remote-control-server typecheck
bun run --cwd packages/remote-control-server build:web
git diff --check
```

预期：全部通过。若全库存在实施前已记录的无关失败，必须同时提供基线命令结果和所有目标测试通过证据，不得静默忽略新失败。

- [ ] 5.8 把设计文档状态从“等待用户审阅”更新为“已实现并通过验收”，仅在本任务全部命令真实通过后执行。

- [ ] 5.9 提交集成验收。

```bash
git add packages/remote-control-server/src/__tests__/provider-model-lifecycle.test.ts src/bridge/__tests__/providerModelLifecycle.test.ts scripts/verify-provider-secret-boundary.ts package.json docs/superpowers/specs/2026-07-14-browser-provider-model-management-design.md
git commit -m "test: verify provider model lifecycle"
```

## 最终验证与收尾

- [ ] 使用 `superpowers:verification-before-completion` 重新执行任务 5.6 和 5.7，读取退出码和完整失败摘要，不能引用早先缓存结果。

- [ ] 使用 `superpowers:requesting-code-review` 检查全部四阶段的需求覆盖和安全边界；解决阻塞问题并重新验证。

- [ ] 使用 `superpowers:finishing-a-development-branch` 向用户提供合并、PR 或保留分支选项；未获授权不推送远端。

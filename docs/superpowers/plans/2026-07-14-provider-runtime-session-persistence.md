# 供应商运行时与 Session 模型持久化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个 RCS Session 以自己的供应商/模型快照启动、切换和恢复，且跨供应商切换失败时不污染旧运行时或其他 Session。

**Architecture:** RCS 在 Session 行中持久化创建时或最后成功确认的模型快照，并通过 Work payload 交给 Bridge；Bridge 为每个独立子进程生成专用环境和显式 `--model`；子进程内的 `ProviderRuntimeService` 在请求边界原子激活不可变快照，统一切换 provider override、环境投影、兼容规则和缓存。只有 `session_model_changed` 权威事件能更新 RCS Session 行。

**Tech Stack:** TypeScript、Bun、SQLite migration、Claude SDK control schema、Bridge NDJSON、现有 OpenAI/Gemini/Grok/Anthropic API adapters。

## 任务 1：定义不可变运行时快照和子进程环境投影

**文件：**

- 新建：`src/services/providerRuntime/types.ts`
- 新建：`src/services/providerRuntime/resolveSnapshot.ts`
- 新建：`src/services/providerRuntime/__tests__/resolveSnapshot.test.ts`
- 修改：`src/utils/model/providers.ts`
- 修改：`src/utils/model/__tests__/providers.test.ts`

**接口：**

```ts
export type ProviderRuntimeSnapshot = Readonly<{
  providerId: string
  modelProfileId: string
  resolvedModelId: string
  providerConfigRevision: number
  apiProvider: APIProvider
  compatRule?: CompatRule
  environmentTemplate: Readonly<Record<string, string | undefined>>
  credentialSourceEnvName?: string
  credentialTargetEnvName?: string
}>
```

- `resolveProviderRuntimeSnapshot(configuration, selection)` 验证 revision、供应商、模型、认证和托管 allowlist 后返回快照。
- `projectRuntimeEnvironment(snapshot, baseEnv)` 只改供应商相关键，返回新对象。
- `getAPIProvider()` 优先读取进程内 runtime override；无 override 时保持现有 settings/env 行为。

- [ ] 1.1 写失败测试，覆盖九种 ProviderKind 到现有 `APIProvider` 的映射、精确 `resolvedModelId`、无关全局 `OPENAI_MODEL` 不覆盖选择、托管模型拒绝和输入不可变。

```ts
test('uses the session model instead of global provider model variables', () => {
  const snapshot = resolveProviderRuntimeSnapshot(configuration, {
    providerId: 'custom-openai', modelProfileId: 'model-b',
    resolvedModelId: 'remote-b', providerConfigRevision: 4, updatedAt: 1,
  }, { OPENAI_MODEL: 'global-model' })
  const childEnv = projectRuntimeEnvironment(snapshot, {
    OPENAI_MODEL: 'global-model', CUSTOM_OPENAI_API_KEY: 'secret-value',
  })
  expect(snapshot.resolvedModelId).toBe('remote-b')
  expect(childEnv.OPENAI_MODEL).toBe('remote-b')
  expect(JSON.stringify(snapshot)).not.toContain('secret-value')
  expect(Object.isFrozen(snapshot)).toBe(true)
})
```

- [ ] 1.2 运行测试并确认失败。

```bash
bun test src/services/providerRuntime/__tests__/resolveSnapshot.test.ts src/utils/model/__tests__/providers.test.ts
```

预期：`providerRuntime` 模块不存在。

- [ ] 1.3 实现 ProviderKind 映射。

```ts
const API_PROVIDER_BY_KIND: Record<ProviderKind, APIProvider> = {
  anthropic: 'firstParty',
  'anthropic-compatible': 'firstParty',
  'openai-compatible': 'openai',
  chatgpt: 'openai',
  gemini: 'gemini',
  grok: 'grok',
  bedrock: 'bedrock',
  vertex: 'vertex',
  foundry: 'foundry',
}
```

环境投影必须先清空所有互斥 selector 和主模型键，再只设置目标供应商需要的值：`CLAUDE_CODE_USE_*`、`ANTHROPIC_*`、`OPENAI_*`、`GEMINI_*`、`GROK_*`。认证只通过 `credentialSourceEnvName` 在投影时从本地 base env 读取并写入 `credentialTargetEnvName`；冻结快照只保存环境变量名和非秘密模板，不携带密钥值。

- [ ] 1.4 在 `providers.ts` 增加受控 override。

```ts
let runtimeProviderOverride: APIProvider | null = null
export function setRuntimeProviderOverride(provider: APIProvider | null): void {
  runtimeProviderOverride = provider
}
export function getAPIProvider(settings = getInitialSettings()): APIProvider {
  if (runtimeProviderOverride) return runtimeProviderOverride
  // 保留现有解析逻辑
}
```

该 override 只存在于每 Session 独立 CLI 子进程；Bridge 父进程不得调用 setter。

- [ ] 1.5 运行测试和类型检查。

```bash
bun test src/services/providerRuntime/__tests__/resolveSnapshot.test.ts src/utils/model/__tests__/providers.test.ts
bun run typecheck
```

预期：全部通过。

- [ ] 1.6 提交。

```bash
git add src/services/providerRuntime/types.ts src/services/providerRuntime/resolveSnapshot.ts src/services/providerRuntime/__tests__/resolveSnapshot.test.ts src/utils/model/providers.ts src/utils/model/__tests__/providers.test.ts
git commit -m "feat: resolve immutable provider runtime snapshots"
```

## 任务 2：实现原子运行时激活、缓存替换和生产兼容规则

**文件：**

- 新建：`src/services/providerRuntime/runtimeService.ts`
- 新建：`src/services/providerRuntime/__tests__/runtimeService.test.ts`
- 修改：`src/services/api/openai/client.ts`
- 修改：`src/services/api/grok/client.ts`
- 修改：`src/utils/model/modelStrings.ts`
- 修改：`src/services/api/openai/index.ts`
- 新建：`src/services/api/openai/__tests__/providerCompat.test.ts`

**接口：**

- `activate(selection, options): Promise<RuntimeActivationResult>` 只在 `turnState === 'idle'` 时执行。
- `getActiveProviderRuntimeSnapshot()` 返回当前冻结快照。
- `clearProviderDerivedCaches()` 清 OpenAI/Grok client 和 modelStrings；Gemini/Anthropic 没有对应进程缓存时不伪造清理函数。
- `getActiveCompatRule()` 给 OpenAI request builder 使用。

- [ ] 2.1 写失败测试，证明成功激活一次更新全部状态、失败回滚 provider/env/cache/快照、运行中返回 `runtime_busy`、重复 operationId 不重复激活。

```ts
test('rolls back every runtime surface when client validation fails', async () => {
  await service.activate(selectionA, idle)
  deps.validateClient.mockRejectedValueOnce(new Error('bad endpoint'))
  const result = await service.activate(selectionB, idle)
  expect(result).toEqual({ ok: false, code: 'endpoint_unreachable' })
  expect(service.current()?.providerId).toBe('provider-a')
  expect(deps.restoreEnvironment).toHaveBeenCalled()
  expect(deps.setProviderOverride).toHaveBeenLastCalledWith('openai')
})
```

- [ ] 2.2 运行测试并确认失败。

```bash
bun test src/services/providerRuntime/__tests__/runtimeService.test.ts
```

预期：模块不存在。

- [ ] 2.3 实现两阶段激活。

1. Prepare：解析/校验目标，保存旧快照和所有相关环境键，不改活动状态。
2. Commit：应用环境、provider override、清缓存、构建目标客户端；全部成功后发布新快照。
3. Rollback：任一步抛错则恢复旧环境、override、缓存和快照。

错误统一映射为设计中的结构化错误码；日志只包含 provider/model ID 和错误码。

- [ ] 2.4 为 `modelStrings.ts` 增加生产可用的明确失效函数。

```ts
export function clearModelStringsCache(): void {
  setModelStringsState(null)
}
```

确认并发 `ensureModelStringsInitialized()` 与失效不会把旧 Provider 的异步 Bedrock 结果写回新状态；使用 runtime revision 捕获，revision 不一致时丢弃结果。

- [ ] 2.5 在 OpenAI 生产请求路径应用活动 compat rule。

```ts
const requestBody = buildOpenAIRequestBody({ /* existing args */ })
const compatibleBody = applyCompatRule(
  requestBody as Record<string, unknown>,
  getActiveCompatRule() ?? 'permissive',
)
await getOpenAIClient(/* existing options */).chat.completions.create(
  compatibleBody as ChatCompletionCreateParamsStreaming,
  { signal },
)
```

ChatGPT Responses path不应用 OpenAI-compatible 规则。测试必须证明 DeepSeek/Groq 字段被按矩阵剔除，`permissive` 保持字段。

- [ ] 2.6 运行运行时、API、兼容矩阵测试和类型检查。

```bash
bun test src/services/providerRuntime/__tests__/runtimeService.test.ts src/services/providerRegistry/__tests__/providerCompatMatrix.test.ts src/services/api/openai/__tests__/providerCompat.test.ts
bun run typecheck
```

预期：全部通过。

- [ ] 2.7 提交。

```bash
git add src/services/providerRuntime/runtimeService.ts src/services/providerRuntime/__tests__/runtimeService.test.ts src/services/api/openai/client.ts src/services/api/grok/client.ts src/utils/model/modelStrings.ts src/services/api/openai/index.ts src/services/api/openai/__tests__/providerCompat.test.ts
git commit -m "feat: activate provider runtimes atomically"
```

## 任务 3：给 RCS Session 增加可空模型快照和 SQLite 迁移

**文件：**

- 修改：`packages/remote-control-server/src/persistence/schema.ts`
- 修改：`packages/remote-control-server/src/persistence/types.ts`
- 修改：`packages/remote-control-server/src/persistence/database.ts`
- 修改：`packages/remote-control-server/src/store.ts`
- 修改：`packages/remote-control-server/src/types/api.ts`
- 修改：`packages/remote-control-server/src/services/session.ts`
- 修改：`packages/remote-control-server/src/__tests__/persistence.test.ts`
- 修改：`packages/remote-control-server/src/__tests__/services.test.ts`

**接口：**

```ts
export interface SessionModelSelection {
  providerId: string
  modelProfileId: string
  resolvedModelId: string
  providerConfigRevision: number
  updatedAt: number
}
```

数据库列：`model_provider_id`、`model_profile_id`、`model_resolved_id`、`model_config_revision`、`model_updated_at_ms`，全部可空且必须全空或全非空。

- [ ] 3.1 写迁移失败测试：从 version 5 数据库升级、旧行全空、新行往返恢复、重复 migrate 幂等。

```ts
test('version 6 persists an atomic session model snapshot', () => {
  db.upsertSession({ ...sessionInput, modelSelection: {
    providerId: 'custom-openai', modelProfileId: 'm2',
    resolvedModelId: 'remote-m2', providerConfigRevision: 7, updatedAt: 123,
  }})
  expect(db.getSession(sessionInput.id)?.modelSelection).toEqual({
    providerId: 'custom-openai', modelProfileId: 'm2',
    resolvedModelId: 'remote-m2', providerConfigRevision: 7, updatedAt: 123,
  })
})
```

- [ ] 3.2 运行目标测试并确认失败。

```bash
bun test packages/remote-control-server/src/__tests__/persistence.test.ts packages/remote-control-server/src/__tests__/services.test.ts
```

预期：类型或断言因缺少 `modelSelection` 失败。

- [ ] 3.3 增加 `VERSION_6_SCHEMA` 和迁移记录。

```sql
ALTER TABLE sessions ADD COLUMN model_provider_id TEXT;
ALTER TABLE sessions ADD COLUMN model_profile_id TEXT;
ALTER TABLE sessions ADD COLUMN model_resolved_id TEXT;
ALTER TABLE sessions ADD COLUMN model_config_revision INTEGER;
ALTER TABLE sessions ADD COLUMN model_updated_at_ms INTEGER;
CREATE INDEX IF NOT EXISTS session_events_type_latest
  ON session_events(session_id, type, seq_num DESC);
```

SQLite 无法通过后加 `CHECK` 覆盖旧表，因此完整性在 `RcsDatabase.upsertSession()` 和 `toSession()` 中校验；出现部分空列时抛出 `invalid persisted session model selection`，不能猜值。

- [ ] 3.4 把数据库扁平列映射封装成 `toSessionModelSelection(row)`；API 使用 snake_case 对象：

```ts
model_selection: {
  provider_id: string
  model_profile_id: string
  resolved_model_id: string
  provider_config_revision: number
  updated_at: number
} | null
```

`storeUpdateSession` 的允许 patch 字段加入 `modelSelection`，其更新必须与 `updatedAt` 同一次 upsert。

- [ ] 3.5 运行测试和 RCS typecheck。

```bash
bun test packages/remote-control-server/src/__tests__/persistence.test.ts packages/remote-control-server/src/__tests__/services.test.ts
bun run --cwd packages/remote-control-server typecheck
```

预期：全部通过。

- [ ] 3.6 提交。

```bash
git add packages/remote-control-server/src/persistence/schema.ts packages/remote-control-server/src/persistence/types.ts packages/remote-control-server/src/persistence/database.ts packages/remote-control-server/src/store.ts packages/remote-control-server/src/types/api.ts packages/remote-control-server/src/services/session.ts packages/remote-control-server/src/__tests__/persistence.test.ts packages/remote-control-server/src/__tests__/services.test.ts
git commit -m "feat: persist session model snapshots"
```

## 任务 4：创建 Session 时复制环境默认值并通过 Work/Bridge 启动

**文件：**

- 新建：`packages/remote-control-server/src/services/provider-catalog.ts`
- 新建：`packages/remote-control-server/src/__tests__/provider-catalog.test.ts`
- 修改：`packages/remote-control-server/src/routes/web/sessions.ts`
- 修改：`packages/remote-control-server/src/routes/v1/sessions.ts`
- 修改：`packages/remote-control-server/src/services/product-session.ts`
- 修改：`packages/remote-control-server/src/services/work-dispatch.ts`
- 修改：`packages/remote-control-server/src/types/api.ts`
- 修改：`packages/remote-control-server/src/__tests__/routes.test.ts`
- 修改：`packages/remote-control-server/src/__tests__/services.test.ts`
- 修改：`packages/remote-control-server/src/__tests__/work-dispatch.test.ts`
- 修改：`src/bridge/types.ts`
- 修改：`src/bridge/bridgeMain.ts`
- 修改：`src/bridge/sessionRunner.ts`
- 新建：`src/bridge/__tests__/sessionRunnerModel.test.ts`

**接口：**

- `readEnvironmentProviderCatalog(capabilities)` 严格解析脱敏 capability；无/旧/非法 capability 返回 unsupported，不抛出到会话 API。
- `resolveDefaultSessionModel(environment)` 返回复制后的 `SessionModelSelection | null`。
- `SessionWorkData.model_selection?` 使用 snake_case 传输完整快照。
- `SessionSpawnOpts.modelSelection?` 与 `providerEnvironment?` 仅用于当前子进程。

- [ ] 4.1 写失败测试，证明 generic、Code product 和 Chat product 三种新 Session 都从它们实际绑定的环境复制创建时默认值；修改环境 capability 后旧 Session 不变，新 Session 使用新默认。

```ts
test('copies the environment default exactly once', async () => {
  const first = await postSession({ environment_id: env.id })
  updateEnvironmentDefault(env.id, modelB)
  const second = await postSession({ environment_id: env.id })
  expect(first.model_selection?.model_profile_id).toBe('model-a')
  expect(getSession(first.id)?.model_selection?.model_profile_id).toBe('model-a')
  expect(second.model_selection?.model_profile_id).toBe('model-b')
})
```

- [ ] 4.2 写 Work/Bridge 失败测试：重连使用 Session 自己的快照，`sessionRunner` 同时添加 `--model remote-id` 和目标 provider 环境，父 `process.env` 未改变。

```ts
expect(spawnArgs).toContainValues(['--model', 'remote-m2'])
expect(spawnOptions.env?.OPENAI_MODEL).toBe('remote-m2')
expect(process.env.OPENAI_MODEL).toBe(originalOpenAIModel)
```

- [ ] 4.3 运行测试并确认失败。

```bash
bun test packages/remote-control-server/src/__tests__/provider-catalog.test.ts packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts src/bridge/__tests__/sessionRunnerModel.test.ts
```

预期：默认解析、Work 字段和 spawn 参数均缺失。

- [ ] 4.4 实现创建逻辑。`POST /web/sessions` 和 `/v1/sessions` 在调用 `createSession()` 前，从请求环境读取 capability 并传 `model_selection`；`createCodeProductSession()` 从已验证的目标环境复制默认；`createChatProductSession()` 先确定实际 Chat runtime，再从同一个环境对象复制默认。请求体自带模型值一律忽略，防止浏览器伪造跨环境引用。

若 capability 不支持或 default 为 null，Session 保持 null，沿用 CLI 默认。

- [ ] 4.5 在 `pollWork()` 只序列化 Session 已持久化快照，不重新读取环境默认。

```ts
model_selection: session.modelSelection && {
  provider_id: session.modelSelection.providerId,
  model_profile_id: session.modelSelection.modelProfileId,
  resolved_model_id: session.modelSelection.resolvedModelId,
  provider_config_revision: session.modelSelection.providerConfigRevision,
  updated_at: session.modelSelection.updatedAt,
}
```

- [ ] 4.6 Bridge 收到 Work 后从本地 v2 配置解析快照和专用环境；revision 过旧但 ID/remote ID 仍精确一致时允许恢复并标记 stale，定义不一致时停止 Work 并上报结构化错误，绝不回退当前默认。

- [ ] 4.7 `sessionRunner.ts` 在参数数组加入显式模型，在 `env` 对象最后合并专用环境：

```ts
...(opts.modelSelection ? ['--model', opts.modelSelection.resolvedModelId] : []),
// env
...opts.providerEnvironment,
```

确保 `providerEnvironment` 在桥接 token/transport 变量之前或按 allowlist 合并，不能覆盖 `CLAUDE_CODE_SESSION_ACCESS_TOKEN`、`CLAUDE_CODE_USE_CCR_V2` 等 Bridge 安全键。

- [ ] 4.8 运行目标测试、Bridge 测试和两个 typecheck。

```bash
bun test packages/remote-control-server/src/__tests__/provider-catalog.test.ts packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/services.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts src/bridge/__tests__/sessionRunnerModel.test.ts src/bridge/__tests__/productRuntime.test.ts
bun run typecheck
bun run --cwd packages/remote-control-server typecheck
```

预期：全部通过。

- [ ] 4.9 提交。

```bash
git add packages/remote-control-server/src/services/provider-catalog.ts packages/remote-control-server/src/__tests__/provider-catalog.test.ts packages/remote-control-server/src/routes/web/sessions.ts packages/remote-control-server/src/routes/v1/sessions.ts packages/remote-control-server/src/services/product-session.ts packages/remote-control-server/src/services/work-dispatch.ts packages/remote-control-server/src/types/api.ts packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/services.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts src/bridge/types.ts src/bridge/bridgeMain.ts src/bridge/sessionRunner.ts src/bridge/__tests__/sessionRunnerModel.test.ts
git commit -m "feat: launch sessions with persisted models"
```

## 任务 5：增加结构化 `set_session_model` 和权威确认事件

**文件：**

- 修改：`src/entrypoints/sdk/controlSchemas.ts`
- 修改：`src/entrypoints/sdk/__tests__/controlSchemas.test.ts`
- 修改：`src/bridge/bridgeMessaging.ts`
- 修改：`src/bridge/replBridge.ts`
- 修改：`src/hooks/useReplBridge.tsx`
- 修改：`src/cli/print.ts`
- 修改：`src/bridge/__tests__/bridgeMessaging.test.ts`
- 新建：`src/services/providerRuntime/__tests__/sessionControl.test.ts`
- 修改：`packages/remote-control-server/src/services/transport.ts`
- 新建：`packages/remote-control-server/src/services/session-model.ts`
- 新建：`packages/remote-control-server/src/__tests__/session-model.test.ts`

**接口：**

```ts
type SetSessionModelRequest = {
  subtype: 'set_session_model'
  provider_id: string
  model_profile_id: string
  expected_provider_config_revision: number
  operation_id: string
}
```

- Worker 成功响应 data 包含实际 `provider_id`、`model_profile_id`、`resolved_model_id`、`provider_config_revision`。
- Worker 额外写入 `session_model_changed` SDK system event，使用 `operation_id` 去重。
- RCS 只从该权威 inbound event 更新 Session。

- [ ] 5.1 写 Schema 失败测试，拒绝空 ID、负 revision 和缺失 operation ID，同时继续接受旧 `set_model`。

- [ ] 5.2 写 Bridge 失败测试：回调未注册返回 error；异步激活成功后才发送 success；激活失败发送结构化 code；handler 抛错也必须响应。

```ts
expect(writes.at(-1)).toMatchObject({
  response: { subtype: 'error', error: 'authentication_required' },
})
```

- [ ] 5.3 写 RCS 失败测试：浏览器发请求不会改 Session；收到匹配环境的 `session_model_changed` 才更新；重复 event/operation 不重复更新；失败事件不更新。

- [ ] 5.4 运行测试并确认失败。

```bash
bun test src/entrypoints/sdk/__tests__/controlSchemas.test.ts src/bridge/__tests__/bridgeMessaging.test.ts src/services/providerRuntime/__tests__/sessionControl.test.ts packages/remote-control-server/src/__tests__/session-model.test.ts
```

预期：新 subtype 和服务不存在。

- [ ] 5.5 把 `handleServerControlRequest` 改为 `async Promise<void>`，增加：

```ts
onSetSessionModel?: (
  request: SetSessionModelRequest,
) => Promise<RuntimeActivationResult>
```

transport data callback 使用 `void handleServerControlRequest(...).catch(...)`，内部保证任一路径写一次 control response。

- [ ] 5.6 `useReplBridge.tsx` 和 print mode 都调用同一 `ProviderRuntimeService.activate()`；激活前从当前 turn state 判断 idle。成功后更新 `mainLoopModelForSession` 并写权威事件，旧 `set_model` 保留现有 alias 行为，不允许借旧请求跨 Provider。

- [ ] 5.7 在 RCS `publishSessionEvent()` 提交非重复 inbound `session_model_changed` 后调用 `reconcileConfirmedSessionModel()`；校验字段、Session 环境 capability 和 operation ID，再原子 `storeUpdateSession({ modelSelection })`。

- [ ] 5.8 运行目标测试、相邻 Bridge/transport 测试和 typecheck。

```bash
bun test src/entrypoints/sdk/__tests__/controlSchemas.test.ts src/bridge/__tests__/bridgeMessaging.test.ts src/bridge/__tests__/remoteInterruptHandling.test.ts src/services/providerRuntime/__tests__ packages/remote-control-server/src/__tests__/session-model.test.ts packages/remote-control-server/src/__tests__/event-bus.test.ts
bun run typecheck
bun run --cwd packages/remote-control-server typecheck
```

预期：全部通过。

- [ ] 5.9 提交。

```bash
git add src/entrypoints/sdk/controlSchemas.ts src/entrypoints/sdk/__tests__/controlSchemas.test.ts src/bridge/bridgeMessaging.ts src/bridge/replBridge.ts src/hooks/useReplBridge.tsx src/cli/print.ts src/bridge/__tests__/bridgeMessaging.test.ts src/services/providerRuntime/__tests__/sessionControl.test.ts packages/remote-control-server/src/services/transport.ts packages/remote-control-server/src/services/session-model.ts packages/remote-control-server/src/__tests__/session-model.test.ts
git commit -m "feat: switch session providers with confirmation"
```

## 任务 6：恢复旧 Session、重启校准和能力开关

**文件：**

- 修改：`packages/remote-control-server/src/persistence/database.ts`
- 修改：`packages/remote-control-server/src/services/session-model.ts`
- 修改：`packages/remote-control-server/src/services/work-dispatch.ts`
- 修改：`packages/remote-control-server/src/__tests__/session-model.test.ts`
- 修改：`packages/remote-control-server/src/__tests__/work-dispatch.test.ts`
- 修改：`src/bridge/initReplBridge.ts`
- 修改：`src/bridge/__tests__/bridgeIdentity.test.ts`

**接口：**

- `getLatestSessionInitEvent(sessionId)` 使用倒序索引查询最近 `system/init`，不扫描全部历史。
- `recoverLegacySessionModel(session, catalog, initEvent)` 只在唯一匹配时返回持久化候选；多/零匹配返回只读 legacy 展示值。
- capability flags 在功能真实可用后置为 `true`。

- [ ] 6.1 写失败测试覆盖：唯一 remote ID 恢复、重复 ID 不恢复、无 init 不套当前默认、已持久化快照优先、重连 Work 保持旧快照、运行时 init 与 Session 不一致时校准。

```ts
test('never assigns the current default to an ambiguous legacy session', () => {
  const result = recoverLegacySessionModel(sessionWithoutSnapshot, catalogWithDuplicateRemoteId, init('same-id'))
  expect(result.persistedSelection).toBeNull()
  expect(result.legacyResolvedModelId).toBe('same-id')
})
```

- [ ] 6.2 运行测试并确认失败。

```bash
bun test packages/remote-control-server/src/__tests__/session-model.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts src/bridge/__tests__/bridgeIdentity.test.ts
```

预期：恢复逻辑和 capability flag 断言失败。

- [ ] 6.3 使用任务 3 的 `VERSION_6_SCHEMA` 创建的 `session_events(session_id, type, seq_num DESC)` 索引实现 `getLatestSessionInitEvent()`；SQL 先按 `type='system'` 倒序取候选，应用层严格解析 JSON 并筛选 normalized payload `subtype='init'`。

- [ ] 6.4 Work dispatch 对 null snapshot 尝试一次唯一恢复；只有唯一匹配才持久化。无法恢复时 Work 不携带模型，让 CLI 沿用其旧默认，同时 API 返回 legacy display 字段供计划四展示。

- [ ] 6.5 处理启动校准：CLI 的 init capability 增加结构化实际 provider/model；RCS 收到后若能验证到同环境目录，按权威值更新；仅有旧 `model` 字符串时遵循唯一匹配规则。

- [ ] 6.6 将 capability 标识改为真实状态：

```ts
capabilities.session_model_persistence_v1 = true
capabilities.provider_runtime_switch_v1 = true
```

旧 `capabilities.provider` 和旧 `set_model` 仍保留。

- [ ] 6.7 运行目标测试、RCS 持久化/Work 全组、Bridge 测试和 typecheck。

```bash
bun test packages/remote-control-server/src/__tests__/persistence.test.ts packages/remote-control-server/src/__tests__/session-model.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts src/bridge/__tests__ src/services/providerRuntime/__tests__
bun run typecheck
bun run --cwd packages/remote-control-server typecheck
git diff --check
```

预期：全部通过。

- [ ] 6.8 提交。

```bash
git add packages/remote-control-server/src/persistence/database.ts packages/remote-control-server/src/services/session-model.ts packages/remote-control-server/src/services/work-dispatch.ts packages/remote-control-server/src/__tests__/session-model.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts src/bridge/initReplBridge.ts src/bridge/__tests__/bridgeIdentity.test.ts
git commit -m "feat: restore persisted session models"
```

## 阶段验证

- [ ] 运行模型、运行时、Bridge、RCS 持久化和 Work 回归集。

```bash
bun test src/services/providerRegistry/__tests__ src/services/providerRuntime/__tests__ src/utils/model/__tests__/providers.test.ts src/bridge/__tests__ packages/remote-control-server/src/__tests__/persistence.test.ts packages/remote-control-server/src/__tests__/services.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts packages/remote-control-server/src/__tests__/session-model.test.ts
```

预期：全部通过。

- [ ] 运行两级类型检查和 diff 检查。

```bash
bun run typecheck
bun run --cwd packages/remote-control-server typecheck
git diff --check
```

预期：退出码均为 `0`。

- [ ] 使用 `superpowers:requesting-code-review` 核查跨供应商回滚、Session 隔离、旧会话恢复和事件权威性；阻塞问题处理完成后进入计划三。

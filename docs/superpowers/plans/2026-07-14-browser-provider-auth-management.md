# 浏览器供应商与认证管理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把只读的模型供应商页面改成按运行环境隔离的完整管理界面，并通过结构化命令复用本地现有 OAuth、API Key/Bearer 和云凭据实现。

**Architecture:** 浏览器只调用 RCS Web API；RCS 验证账号对环境的所有权并把非秘密命令放入现有环境命令队列；Worker 执行本地 Provider Catalog/Auth 服务并返回脱敏结果。OAuth 在 Worker 内后台运行；明文 API Key 只在浏览器内存和 Worker 内存出现，通过一次性 ECDH/HKDF/AES-GCM Secret Relay 穿过 RCS，Relay 不写 SQLite。

**Tech Stack:** Hono、Bun SQLite、Bridge Work protocol、React、Bun test、P-256 ECDH、HKDF-SHA-256、AES-256-GCM、WebCrypto/Node Crypto。

## 任务 1：扩展持久环境命令协议和 Provider 命令执行器

**文件：**

- 修改：`packages/remote-control-server/src/domain/product.ts`
- 修改：`packages/remote-control-server/src/persistence/schema.ts`
- 修改：`packages/remote-control-server/src/persistence/database.ts`
- 修改：`packages/remote-control-server/src/persistence/types.ts`
- 修改：`packages/remote-control-server/src/services/environment-command.ts`
- 修改：`packages/remote-control-server/src/services/work-dispatch.ts`
- 修改：`packages/remote-control-server/src/types/api.ts`
- 修改：`packages/remote-control-server/src/__tests__/persistence.test.ts`
- 修改：`packages/remote-control-server/src/__tests__/work-dispatch.test.ts`
- 修改：`src/bridge/types.ts`
- 修改：`src/bridge/bridgeMain.ts`
- 新建：`src/services/providerRegistry/environmentCommands.ts`
- 新建：`src/services/providerRegistry/__tests__/environmentCommands.test.ts`

**接口：**

持久命令 kind 增加：

```ts
'get_provider_catalog'
'save_provider_profile'
'archive_provider_profile'
'save_model_profile'
'archive_model_profile'
'set_default_model'
'validate_provider_model'
'begin_provider_auth'
'get_provider_auth_status'
'submit_provider_auth_code'
'cancel_provider_auth'
'remove_provider_auth'
'refresh_provider_auth'
'begin_provider_secret'
```

所有修改 payload 包含 `operationId` 和 `expectedRevision`；认证状态命令包含 `authOperationId`，不包含 Token 或密钥。

- [ ] 1.1 写 migration 失败测试：从 version 6 升级时保留已存在的四类环境命令，能插入每个新 kind，迁移重复执行幂等。

```ts
test('version 7 preserves old commands and permits provider commands', () => {
  db.createEnvironmentCommand(providerCommand('get_provider_catalog'))
  expect(db.getEnvironmentCommand('cmd-provider')?.kind).toBe('get_provider_catalog')
})
```

- [ ] 1.2 写 Work 失败测试：每个 Provider command 精确映射为 snake_case Work data，结果完成后 RCS 从 Worker 返回的 `catalog` 更新环境 capability，但不复制未知字段。

- [ ] 1.3 写 Worker 失败测试：命令路由到 `ProviderCatalogService`，expected revision 冲突、校验错误和成功结果都返回结构化对象。

```ts
expect(await executeProviderEnvironmentCommand({
  type: 'set_default_model', operation_id: 'op-1', expected_revision: 4,
  model: { provider_id: 'p1', model_profile_id: 'm1' },
})).toMatchObject({ kind: 'set_default_model', catalog: { revision: 5 } })
```

- [ ] 1.4 运行目标测试并确认失败。

```bash
bun test packages/remote-control-server/src/__tests__/persistence.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts src/services/providerRegistry/__tests__/environmentCommands.test.ts
```

预期：新 kind 不在 union/SQLite CHECK/Worker switch 中。

- [ ] 1.5 增加 `VERSION_7_SCHEMA`，通过重建表扩展 SQLite CHECK，并在一个 transaction 内复制数据。

```sql
ALTER TABLE environment_commands RENAME TO environment_commands_v6;
CREATE TABLE environment_commands (/* 现有列，新 CHECK kind 列表 */);
INSERT INTO environment_commands SELECT * FROM environment_commands_v6;
DROP TABLE environment_commands_v6;
CREATE INDEX environment_commands_pending
  ON environment_commands(environment_id, state, created_at_ms);
```

不得使用没有 CHECK 的宽松表；迁移前后行数在测试中相等。

- [ ] 1.6 扩展 RCS/Bridge `EnvironmentCommandWorkData` discriminated union 和 `environmentCommandToWork()` exhaustiveness。使用 `assertNever`，新增 kind 未处理时 typecheck 必须失败。

- [ ] 1.7 实现 `executeProviderEnvironmentCommand()`。所有目录 mutation 调用计划一的服务；每个成功结果都包含最新脱敏 `catalog`。`validate_provider_model` 只向目标 Endpoint 发最小本地请求，使用目标 runtime snapshot，不改变活动 Session。

- [ ] 1.8 在 `completeEnvironmentCommand()` 对已验证的 Provider result 更新 `environment.capabilities.provider_model_catalog_v1`；保留其他 capability 键，不信任浏览器 payload。

- [ ] 1.9 运行测试和两级 typecheck。

```bash
bun test packages/remote-control-server/src/__tests__/persistence.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts src/services/providerRegistry/__tests__/environmentCommands.test.ts src/bridge/__tests__/productRuntime.test.ts
bun run typecheck
bun run --cwd packages/remote-control-server typecheck
```

预期：全部通过。

- [ ] 1.10 提交。

```bash
git add packages/remote-control-server/src/domain/product.ts packages/remote-control-server/src/persistence/schema.ts packages/remote-control-server/src/persistence/database.ts packages/remote-control-server/src/persistence/types.ts packages/remote-control-server/src/services/environment-command.ts packages/remote-control-server/src/services/work-dispatch.ts packages/remote-control-server/src/types/api.ts packages/remote-control-server/src/__tests__/persistence.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts src/bridge/types.ts src/bridge/bridgeMain.ts src/services/providerRegistry/environmentCommands.ts src/services/providerRegistry/__tests__/environmentCommands.test.ts
git commit -m "feat: add provider environment commands"
```

## 任务 2：增加所有权受控的 RCS Provider Web API

**文件：**

- 新建：`packages/remote-control-server/src/routes/web/providers.ts`
- 新建：`packages/remote-control-server/src/services/provider-web.ts`
- 修改：`packages/remote-control-server/src/index.ts`
- 修改：`packages/remote-control-server/src/__tests__/routes.test.ts`
- 修改：`packages/remote-control-server/src/__tests__/services.test.ts`

**接口：**

```text
GET    /web/environments/:environmentId/providers
POST   /web/environments/:environmentId/providers
PATCH  /web/environments/:environmentId/providers/:providerId
POST   /web/environments/:environmentId/providers/:providerId/archive
POST   /web/environments/:environmentId/providers/:providerId/models
PATCH  /web/environments/:environmentId/providers/:providerId/models/:modelId
POST   /web/environments/:environmentId/providers/:providerId/models/:modelId/archive
POST   /web/environments/:environmentId/providers/default
POST   /web/environments/:environmentId/providers/:providerId/models/:modelId/validate
POST   /web/environments/:environmentId/providers/:providerId/auth/begin
GET    /web/environments/:environmentId/provider-auth/:authOperationId
POST   /web/environments/:environmentId/provider-auth/:authOperationId/code
POST   /web/environments/:environmentId/provider-auth/:authOperationId/cancel
DELETE /web/environments/:environmentId/providers/:providerId/auth
POST   /web/environments/:environmentId/providers/:providerId/auth/refresh
```

- [ ] 2.1 写失败路由测试，覆盖环境所有权、离线 409、非法 body 400、revision 冲突 409、command timeout 504 和成功脱敏响应。

```ts
expect(await requestAsOwner('GET', `/web/environments/${otherEnv.id}/providers`)).toHaveStatus(403)
expect(JSON.stringify(await createProviderResponse.json())).not.toContain('api_key')
```

- [ ] 2.2 运行测试并确认失败。

```bash
bun test packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/services.test.ts
```

预期：路由返回 404。

- [ ] 2.3 在 `provider-web.ts` 实现统一 guard：环境必须属于当前 `accountId` 且 status 为 active。单用户模式仍使用相同 account 规则，不因固定 UUID 绕过环境隔离。

- [ ] 2.4 每个 mutation 只构造 allowlisted 命令 payload；`operation_id` 可由浏览器提供 UUID，缺失时 RCS 生成；字段使用显式拾取，禁止 `...body` 直接转发。

- [ ] 2.5 错误映射固定为：

- `provider_revision_conflict` → 409，并返回最新脱敏 catalog。
- `provider_not_found`/`model_not_found` → 404。
- `authentication_required`、`model_not_allowed`、验证失败 → 422。
- 环境离线 → 409。
- 环境命令超时 → 504。

- [ ] 2.6 在 `index.ts` 和测试 app 挂载新路由；GET 优先返回一次 `get_provider_catalog` 权威结果，命令超时时可回退环境 capability，但响应增加 `stale: true` 且禁止写操作。

- [ ] 2.7 运行路由测试和 RCS typecheck。

```bash
bun test packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/services.test.ts
bun run --cwd packages/remote-control-server typecheck
```

预期：全部通过。

- [ ] 2.8 提交。

```bash
git add packages/remote-control-server/src/routes/web/providers.ts packages/remote-control-server/src/services/provider-web.ts packages/remote-control-server/src/index.ts packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/services.test.ts
git commit -m "feat: expose provider management web api"
```

## 任务 3：定义浏览器目录类型、API Client 和状态 Hook

**文件：**

- 修改：`packages/remote-control-server/web/src/types/index.ts`
- 修改：`packages/remote-control-server/web/src/api/client.ts`
- 新建：`packages/remote-control-server/web/src/hooks/useProviderCatalog.ts`
- 新建：`packages/remote-control-server/web/src/lib/provider-catalog-model.ts`
- 修改：`packages/remote-control-server/web/src/__tests__/api-client.test.ts`
- 新建：`packages/remote-control-server/web/src/__tests__/provider-catalog-model.test.ts`

**接口：**

- Web types 镜像脱敏 capability，不定义任何 `apiKey`/`token` 值字段。
- Hook 输入 `environmentId | null`，输出 `{catalog, loading, stale, error, mutate, refresh}`。
- `mutate()` 自动附加当前 revision 和 UUID operation ID，409 时保存服务端最新目录并返回 conflict。

- [ ] 3.1 写 API 失败测试，逐个断言 HTTP method/path/body，特别确认 API key 不属于普通目录 mutation 类型。

```ts
await client.apiSetDefaultProviderModel('env-1', {
  provider_id: 'p1', model_profile_id: 'm1', expected_revision: 2,
  operation_id: 'op-1', allow_unverified: false,
})
expect(fetchMock.lastUrl).toContain('/web/environments/env-1/providers/default?')
```

- [ ] 3.2 写纯状态模型失败测试：切换环境取消旧请求、旧响应不覆盖新环境、mutation conflict 更新 revision、stale catalog 禁用写入。

- [ ] 3.3 运行测试并确认失败。

```bash
bun test packages/remote-control-server/web/src/__tests__/api-client.test.ts packages/remote-control-server/web/src/__tests__/provider-catalog-model.test.ts
```

预期：新 API 和 model 不存在。

- [ ] 3.4 增加显式 API 函数；Provider ID、Model ID、Auth Operation ID 都使用 `encodeURIComponent`。

- [ ] 3.5 实现纯 `ProviderCatalogModel`，Hook 只负责 React 生命周期。每次环境变化创建 AbortController 和递增 request generation；只有 generation 匹配才提交结果。

- [ ] 3.6 对 catalog 做运行时形状校验；出现秘密样式键（`api_key`、`token`、`secret`）时整份响应拒绝并显示协议错误，不能静默忽略。

- [ ] 3.7 运行 Web 测试和 RCS typecheck（Web 由同一 tsconfig 覆盖）。

```bash
bun test packages/remote-control-server/web/src/__tests__/api-client.test.ts packages/remote-control-server/web/src/__tests__/provider-catalog-model.test.ts
bun run --cwd packages/remote-control-server typecheck
```

预期：全部通过。

- [ ] 3.8 提交。

```bash
git add packages/remote-control-server/web/src/types/index.ts packages/remote-control-server/web/src/api/client.ts packages/remote-control-server/web/src/hooks/useProviderCatalog.ts packages/remote-control-server/web/src/lib/provider-catalog-model.ts packages/remote-control-server/web/src/__tests__/api-client.test.ts packages/remote-control-server/web/src/__tests__/provider-catalog-model.test.ts
git commit -m "feat: add provider catalog web client"
```

## 任务 4：实现按环境隔离的供应商和模型 CRUD 界面

**文件：**

- 修改：`packages/remote-control-server/web/src/pages/ProviderSettingsPage.tsx`
- 新建：`packages/remote-control-server/web/src/components/providers/ProviderCard.tsx`
- 新建：`packages/remote-control-server/web/src/components/providers/ProviderEditorDialog.tsx`
- 新建：`packages/remote-control-server/web/src/components/providers/ModelEditorDialog.tsx`
- 新建：`packages/remote-control-server/web/src/components/providers/ProviderPresetPicker.tsx`
- 新建：`packages/remote-control-server/web/src/components/providers/providerForm.ts`
- 新建：`packages/remote-control-server/web/src/__tests__/provider-settings-page.test.tsx`
- 修改：`packages/remote-control-server/web/src/App.tsx`

**界面要求：**

- 顶部环境选择器；环境切换立即换目录，不能合并不同机器的供应商。
- 默认模型摘要明确“只影响之后新建的对话”。
- 支持 Claude/Anthropic compatible/OpenAI compatible/ChatGPT/Gemini/Grok/Bedrock/Vertex/Foundry/国内预设/完全自定义入口。
- 一个 Provider 展开后显示全部模型及默认、remote ID、能力、启用、归档、验证状态。
- 写操作在 stale/旧 Worker/离线/正在提交时禁用。

- [ ] 4.1 写纯表单失败测试，覆盖各 kind 显示字段、国内预设 Endpoint/建议模型、手工模型始终可选、Base URL 校验和秘密不进入普通 form output。

- [ ] 4.2 写 SSR 失败测试，覆盖环境选择、空状态、默认提示、九类 provider 标签、多模型行、归档历史项和 capability gate 的只读提示。

```ts
expect(markup).toContain('只影响之后新建的对话')
expect(markup).toContain('手工输入模型 ID')
expect(markup).not.toContain('sk-test-secret')
```

- [ ] 4.3 运行测试并确认失败。

```bash
bun test packages/remote-control-server/web/src/__tests__/provider-settings-page.test.tsx
```

预期：组件或新交互不存在。

- [ ] 4.4 实现 `providerForm.ts` 纯转换：表单只生成非秘密 `ProviderProfile`/`ModelProfile` mutation；认证按钮进入任务 5/6 的独立流程。

- [ ] 4.5 实现新增/编辑向导：类型或预设 → Endpoint/compat → 模型建议/发现/手工输入 → 保存 → 可选验证/设默认。未验证设默认必须二次确认；invalid 不显示设默认按钮。

- [ ] 4.6 实现归档保护：当前默认项要求先选择替代项或明确清空；已被历史 Session 引用的项仍只发送 archive，不显示永久删除。

- [ ] 4.7 删除当前“向任意现有 Session 发送自然语言连通性提示”的 `requestTest()`；验证按钮必须调用 `validate_provider_model` Web API，并把结构化结果显示在模型行。

- [ ] 4.8 `App.tsx` 不再把 `sessions/onOpenSession` 传给 Provider 页面，只传环境和 `workspace.refresh`；页面数据来源统一为 `useProviderCatalog`。

- [ ] 4.9 运行页面、API、路由和 typecheck。

```bash
bun test packages/remote-control-server/web/src/__tests__/provider-settings-page.test.tsx packages/remote-control-server/web/src/__tests__/api-client.test.ts packages/remote-control-server/src/__tests__/routes.test.ts
bun run --cwd packages/remote-control-server typecheck
```

预期：全部通过。

- [ ] 4.10 提交。

```bash
git add packages/remote-control-server/web/src/pages/ProviderSettingsPage.tsx packages/remote-control-server/web/src/components/providers packages/remote-control-server/web/src/__tests__/provider-settings-page.test.tsx packages/remote-control-server/web/src/App.tsx
git commit -m "feat: manage providers and models in browser"
```

## 任务 5：提取并接入本地 OAuth、Device Flow 和云凭据状态机

**文件：**

- 新建：`src/services/providerAuth/types.ts`
- 新建：`src/services/providerAuth/authService.ts`
- 新建：`src/services/providerAuth/__tests__/authService.test.ts`
- 修改：`src/services/providerRegistry/environmentCommands.ts`
- 修改：`src/components/ConsoleOAuthFlow.tsx`
- 新建：`packages/remote-control-server/web/src/components/providers/ProviderAuthDialog.tsx`
- 新建：`packages/remote-control-server/web/src/lib/provider-auth-model.ts`
- 新建：`packages/remote-control-server/web/src/__tests__/provider-auth-model.test.ts`

**接口：**

```ts
type ProviderAuthMethod =
  | 'claude-subscription-oauth'
  | 'anthropic-console-oauth'
  | 'chatgpt-device-oauth'
  | 'api-key'
  | 'bearer-token'
  | 'aws-iam'
  | 'gcp-adc'
  | 'azure-ad'
  | 'proxy'

type ProviderAuthOperationStatus = {
  operationId: string
  state: 'starting' | 'waiting' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
  authorizationUrl?: string
  userCode?: string
  expiresAt: number
  errorCode?: string
}
```

状态对象绝不包含 access/refresh/device token；ChatGPT 的 `deviceCode` 只留在 Worker operation 内存中，浏览器只得到 `userCode` 和 verification URL。

- [ ] 5.1 写 Auth Service 失败测试：Claude subscription/Console 两种 `OAuthService` 参数、ChatGPT device polling、手工授权码、取消、过期、重复查询、成功后 secure storage 状态更新。

- [ ] 5.2 写云凭据失败测试：AWS/GCP/Azure 只执行固定 allowlist action；payload 中出现 command/args/shell 字段时拒绝；proxy/helper 只检测状态。

```ts
expect(() => service.refresh({ method: 'aws-iam', action: 'aws-refresh' })).not.toThrow()
expect(() => service.refresh({ method: 'aws-iam', command: 'rm -rf /' } as never)).toThrow('invalid_auth_refresh_request')
```

- [ ] 5.3 写浏览器状态模型失败测试：显示授权 URL/用户码、按建议间隔轮询、关闭对话框时 cancel、完成后刷新 catalog、错误只展示 `errorCode` 映射文案。

- [ ] 5.4 运行测试并确认失败。

```bash
bun test src/services/providerAuth/__tests__/authService.test.ts packages/remote-control-server/web/src/__tests__/provider-auth-model.test.ts
```

预期：模块不存在。

- [ ] 5.5 实现 Worker 内存 operation store：最多 32 项，15 分钟 TTL；每项含 AbortController、目标 provider 和私有 flow state。OAuth Promise 在后台运行，命令立即返回 waiting 状态。

- [ ] 5.6 Claude OAuth 复用 `OAuthService.startOAuthFlow()` 和 `installOAuthTokens()`；ChatGPT 复用 `requestChatGPTDeviceCode()`/`completeChatGPTDeviceLogin()`；不要复制 Token exchange 代码。把 Console UI 改为调用相同 service adapter，保持现有 TUI 行为。

- [ ] 5.7 云认证 refresh allowlist 只包含代码内枚举：

- `aws-refresh`：清 AWS credential cache 并调用现有 status manager/probe。
- `gcp-refresh`：清 GCP credential cache并重新 probe ADC。
- `azure-refresh`：重新构建现有 `DefaultAzureCredential` probe。

不得接收或调用浏览器提供的 shell 字符串。

- [ ] 5.8 实现 `ProviderAuthDialog`：OAuth/Device 显示本地 Worker 返回的信息；API Key/Bearer 跳到任务 6；IAM 显示 profile/project/tenant 的脱敏状态和固定刷新按钮。

- [ ] 5.9 运行 Auth、Provider command、浏览器状态和 typecheck。

```bash
bun test src/services/providerAuth/__tests__/authService.test.ts src/services/providerRegistry/__tests__/environmentCommands.test.ts packages/remote-control-server/web/src/__tests__/provider-auth-model.test.ts
bun run typecheck
bun run --cwd packages/remote-control-server typecheck
```

预期：全部通过。

- [ ] 5.10 提交。

```bash
git add src/services/providerAuth src/services/providerRegistry/environmentCommands.ts src/components/ConsoleOAuthFlow.tsx packages/remote-control-server/web/src/components/providers/ProviderAuthDialog.tsx packages/remote-control-server/web/src/lib/provider-auth-model.ts packages/remote-control-server/web/src/__tests__/provider-auth-model.test.ts
git commit -m "feat: manage provider authentication flows"
```

## 任务 6：实现一次性 Secret Control 加密 Relay

**文件：**

- 新建：`src/services/providerAuth/secretControl.ts`
- 新建：`src/services/providerAuth/__tests__/secretControl.test.ts`
- 修改：`src/services/providerRegistry/environmentCommands.ts`
- 修改：`src/bridge/types.ts`
- 修改：`src/bridge/bridgeMain.ts`
- 修改：`src/bridge/bridgeApi.ts`
- 新建：`packages/remote-control-server/src/services/secret-relay.ts`
- 新建：`packages/remote-control-server/src/routes/web/provider-secrets.ts`
- 修改：`packages/remote-control-server/src/routes/v1/environments.work.ts`
- 修改：`packages/remote-control-server/src/services/work-dispatch.ts`
- 修改：`packages/remote-control-server/src/index.ts`
- 新建：`packages/remote-control-server/src/__tests__/secret-relay.test.ts`
- 新建：`packages/remote-control-server/web/src/lib/secret-control.ts`
- 新建：`packages/remote-control-server/web/src/__tests__/secret-control.test.ts`
- 修改：`packages/remote-control-server/web/src/components/providers/ProviderAuthDialog.tsx`

**协议：**

1. `begin_provider_secret` 持久环境命令让 Worker 创建 P-256 临时密钥对和目标 provider operation，返回 public JWK、operation ID、environment ID、5 分钟 expiresAt。
2. 浏览器生成 P-256 临时密钥对，与 Worker public key ECDH 得到 shared secret。
3. HKDF-SHA-256：随机 16-byte salt，info 为 UTF-8 `real-agentic/provider-secret/v1`，输出 256-bit AES key。
4. AES-256-GCM：随机 12-byte IV；AAD 是规范 JSON `{"environmentId","operationId","expiresAt"}`；明文只包含 `{credential}`。
5. 浏览器提交自己的 public JWK、salt、iv、ciphertext、operationId、expiresAt。
6. RCS 只在内存 Relay 保存密文 envelope，Worker 下次 poll 取走；首次取走即删除。
7. Worker 验证环境、operation、时间和一次性状态后解密，调用现有 settings/secure storage writer，最后销毁私钥和明文 buffer。

- [ ] 6.1 先写共享测试向量：固定 Worker/Browser 私钥、salt、IV、AAD、明文，浏览器加密结果必须能由 Worker 解密。

```ts
expect(await workerDecrypt(browserEncrypt('sk-test', vector), vector)).toBe('sk-test')
```

- [ ] 6.2 写安全失败测试：错误 environment/op/AAD、过期、重放、篡改 ciphertext、超大 envelope、非 P-256 JWK、重复领取、Worker 重启后的失效全部拒绝。

- [ ] 6.3 写 RCS 失败测试：Relay 不调用任何 persistence method；poll 返回密文后内存条目消失；result route 只保存脱敏状态；日志捕获不含固定测试密钥。

- [ ] 6.4 运行测试并确认失败。

```bash
bun test src/services/providerAuth/__tests__/secretControl.test.ts packages/remote-control-server/src/__tests__/secret-relay.test.ts packages/remote-control-server/web/src/__tests__/secret-control.test.ts
```

预期：三个模块不存在。

- [ ] 6.5 实现 Worker `SecretControlService`。操作 Map 最多 16 项、TTL 5 分钟、成功/失败/取消/过期都立即删除私钥；同 operation 只允许一次 decrypt 尝试。目标 envName 在 begin 时从本地 ProviderProfile 固定，envelope 不能覆盖。

- [ ] 6.6 实现 RCS `SecretRelayStore`。只保存在进程内，最大 envelope 32 KiB，每环境最多 8 项，TTL 5 分钟。不得写 `environment_commands.result_json`、Session event 或普通 logger。

Web 路由：

```text
POST /web/environments/:environmentId/providers/:providerId/auth/secret/begin
POST /web/environments/:environmentId/provider-secrets/:operationId
GET  /web/environments/:environmentId/provider-secrets/:operationId
```

最后一个 GET 只返回 `pending|succeeded|failed|expired` 和 errorCode，不返回 envelope。

- [ ] 6.7 扩展 Work union 增加 `provider_secret`，但该类型来自内存 Relay，不进入 `EnvironmentCommandKind`/SQLite。`pollWork()` 优先取已排队密文；Worker 完成走 `/work/:id/result` 时 route 先查 Relay operation，再查持久命令。

- [ ] 6.8 浏览器 `encryptProviderSecret()` 只接受调用栈中的字符串，返回 envelope 后调用方立即清空 React state。组件输入设置 `autoComplete="off"`、`spellCheck={false}`，不写 localStorage/sessionStorage，不把值拼进 Error。

- [ ] 6.9 Secret 成功后 Worker 调计划一 `providerSettingsWriter`，返回 `{configured:true, source:'settings'}` 并触发新 catalog；API key 与 bearer 按 profile scheme 写对应本地来源。

- [ ] 6.10 运行安全测试、路由/Work 回归、两个 typecheck和静态泄露扫描。

```bash
bun test src/services/providerAuth/__tests__/secretControl.test.ts packages/remote-control-server/src/__tests__/secret-relay.test.ts packages/remote-control-server/web/src/__tests__/secret-control.test.ts packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts
bun run typecheck
bun run --cwd packages/remote-control-server typecheck
rg -n "credential|ciphertext|apiKey|token" packages/remote-control-server/src/services/secret-relay.ts packages/remote-control-server/src/routes/web/provider-secrets.ts
```

预期：测试/typecheck 通过；静态扫描只命中密文字段、长度限制或显式拒绝断言，不存在明文日志/持久化。

- [ ] 6.11 提交。

```bash
git add src/services/providerAuth/secretControl.ts src/services/providerAuth/__tests__/secretControl.test.ts src/services/providerRegistry/environmentCommands.ts src/bridge/types.ts src/bridge/bridgeMain.ts src/bridge/bridgeApi.ts packages/remote-control-server/src/services/secret-relay.ts packages/remote-control-server/src/routes/web/provider-secrets.ts packages/remote-control-server/src/routes/v1/environments.work.ts packages/remote-control-server/src/services/work-dispatch.ts packages/remote-control-server/src/index.ts packages/remote-control-server/src/__tests__/secret-relay.test.ts packages/remote-control-server/web/src/lib/secret-control.ts packages/remote-control-server/web/src/__tests__/secret-control.test.ts packages/remote-control-server/web/src/components/providers/ProviderAuthDialog.tsx
git commit -m "feat: relay provider secrets end to end encrypted"
```

## 阶段验证

- [ ] 运行 Provider/Auth/Bridge/RCS/Web 目标回归集。

```bash
bun test src/services/providerRegistry/__tests__ src/services/providerAuth/__tests__ src/bridge/__tests__ packages/remote-control-server/src/__tests__/persistence.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/secret-relay.test.ts packages/remote-control-server/web/src/__tests__/api-client.test.ts packages/remote-control-server/web/src/__tests__/provider-catalog-model.test.ts packages/remote-control-server/web/src/__tests__/provider-settings-page.test.tsx packages/remote-control-server/web/src/__tests__/provider-auth-model.test.ts packages/remote-control-server/web/src/__tests__/secret-control.test.ts
```

预期：全部通过。

- [ ] 运行类型、浏览器构建和 diff 检查。

```bash
bun run typecheck
bun run --cwd packages/remote-control-server typecheck
bun run --cwd packages/remote-control-server build:web
git diff --check
```

预期：全部退出码为 `0`。

- [ ] 使用 `superpowers:requesting-code-review`，要求重点审查环境所有权、命令字段 allowlist、OAuth Token 边界、Secret Relay 不持久化和密码学参数；解决阻塞问题后进入计划四。

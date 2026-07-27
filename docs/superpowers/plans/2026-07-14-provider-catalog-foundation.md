# 供应商目录与配置基础实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把仅支持 OpenAI-compatible 数组的 Provider Registry 演进为版本化、多供应商、多模型、可并发修改且只输出脱敏状态的本地目录服务。

**Architecture:** `providers.json` 只保存非秘密配置和认证引用；Loader 兼容旧数组并在内存迁移；`ProviderCatalogService` 是所有写操作的唯一入口，负责 Revision、幂等、默认值和软归档约束；Capability Builder 合并持久配置与现有 settings/env 认证检测结果后只产生脱敏快照。

**Tech Stack:** TypeScript、Zod、Bun test、原子文件写入、现有 settings/auth/providerRegistry 模块。

## 任务 1：定义 v2 领域类型和严格 Schema

**文件：**

- 修改：`src/services/providerRegistry/types.ts`
- 新建：`src/services/providerRegistry/__tests__/types.test.ts`

**接口：**

- 输入：旧 `ProviderConfig` 仍供 `switcher.ts` 在迁移期使用。
- 输出：`ProviderConfigurationV2`、`ProviderProfile`、`ModelProfile`、`ModelRef`、`AuthReference`、`RedactedProviderModelCatalog`。
- 不变量：持久类型不允许出现 `apiKey`、`token`、`secret` 字段；用户 ID 使用 kebab-case；一个模型的稳定 ID 与 `remoteModelId` 分离。

- [ ] 1.1 写失败测试，覆盖合法 v2、非法默认引用、非法秘密字段和全部供应商/认证枚举。

```ts
import { describe, expect, test } from 'bun:test'
import { ProviderConfigurationV2Schema } from '../types.js'

describe('ProviderConfigurationV2Schema', () => {
  test('accepts a multi-model provider without secret material', () => {
    const parsed = ProviderConfigurationV2Schema.parse({
      version: 2,
      revision: 3,
      defaultModel: { providerId: 'custom-openai', modelProfileId: 'reasoner' },
      providers: [{
        id: 'custom-openai',
        displayName: '自定义 OpenAI',
        kind: 'openai-compatible',
        baseUrl: 'https://llm.example/v1',
        auth: { scheme: 'api-key', source: 'settings', envName: 'CUSTOM_OPENAI_API_KEY' },
        compatRule: 'strict-openai',
        enabled: true,
        archived: false,
        models: [{
          id: 'reasoner', displayName: 'Reasoner', remoteModelId: 'reasoner-v7',
          enabled: true, archived: false,
          validation: { status: 'unverified' },
        }],
      }],
    })
    expect(parsed.revision).toBe(3)
  })

  test('rejects persisted secret values and dangling defaults', () => {
    const value = {
      version: 2, revision: 0,
      defaultModel: { providerId: 'missing', modelProfileId: 'missing' },
      providers: [], apiKey: 'must-not-be-stored',
    }
    expect(ProviderConfigurationV2Schema.safeParse(value).success).toBe(false)
  })
})
```

- [ ] 1.2 运行测试并确认因导出不存在而失败。

```bash
bun test src/services/providerRegistry/__tests__/types.test.ts
```

预期：失败包含 `ProviderConfigurationV2Schema` 不存在或解析器未定义。

- [ ] 1.3 在 `types.ts` 实现以下公开类型和 `superRefine` 默认引用校验。

```ts
export const ProviderKindSchema = z.enum([
  'anthropic', 'anthropic-compatible', 'openai-compatible', 'chatgpt',
  'gemini', 'grok', 'bedrock', 'vertex', 'foundry',
])
export const AuthSchemeSchema = z.enum([
  'oauth', 'api-key', 'bearer', 'aws-iam', 'gcp-adc', 'azure-ad', 'proxy',
])
export const AuthSourceSchema = z.enum([
  'secure-storage', 'settings', 'environment', 'helper', 'cloud-chain',
])
export const ModelRefSchema = z.object({
  providerId: z.string().regex(/^[a-z0-9-]+$/),
  modelProfileId: z.string().regex(/^[a-z0-9-]+$/),
}).strict()
```

`ProviderConfigurationV2Schema` 必须 `.strict()`，并验证 `defaultModel` 指向存在、`enabled=true`、`archived=false` 且 `validation.status !== 'invalid'` 的模型。`CompatRuleSchema` 保留现有值；旧 `LegacyProviderConfigSchema` 单独导出，不能让 `openai-compat` 混入 v2。

- [ ] 1.4 运行测试和类型检查。

```bash
bun test src/services/providerRegistry/__tests__/types.test.ts
bun run typecheck
```

预期：两条命令退出码均为 `0`。

- [ ] 1.5 提交。

```bash
git add src/services/providerRegistry/types.ts src/services/providerRegistry/__tests__/types.test.ts
git commit -m "feat: define versioned provider catalog"
```

## 任务 2：兼容加载旧数组并只在显式保存时升级

**文件：**

- 修改：`src/services/providerRegistry/loader.ts`
- 修改：`src/services/providerRegistry/__tests__/loader.test.ts`

**接口：**

- `loadProviderConfiguration(): ProviderLoadResult` 返回 `{ configuration, sourceFormat, error? }`。
- `loadProviders()` 暂时继续返回旧 `ProviderConfig[]`，供未迁移的 `/providers` TUI 与 `switcher.ts` 使用。
- `saveProviderConfiguration(configuration, expectedRevision)` 原子写 v2，并拒绝旧 Revision。

- [ ] 2.1 扩展失败测试，证明旧数组迁移生成稳定模型 ID、读取不改写文件、v2 保留 Revision、显式保存才写 v2。

```ts
test('migrates a legacy array in memory without rewriting it', async () => {
  const path = join(tmpDir, 'providers.json')
  writeFileSync(path, JSON.stringify([{
    id: 'myendpoint', kind: 'openai-compat',
    baseUrl: 'https://my.api/v1', apiKeyEnv: 'MY_API_KEY',
    defaultModel: 'my-model', compatRule: 'permissive',
  }]))
  const before = readFileSync(path, 'utf8')
  const { loadProviderConfiguration } = await import('../loader.js')
  const result = loadProviderConfiguration()
  expect(result.sourceFormat).toBe('legacy-array')
  expect(result.configuration.providers[0]?.models[0]).toMatchObject({
    id: 'my-model', remoteModelId: 'my-model',
  })
  expect(readFileSync(path, 'utf8')).toBe(before)
})
```

- [ ] 2.2 运行目标测试并确认失败。

```bash
bun test src/services/providerRegistry/__tests__/loader.test.ts
```

预期：新增迁移和 Revision 用例失败，旧用例仍能执行。

- [ ] 2.3 实现 `migrateLegacyProviders()`；模型 ID 使用可复现 slug，冲突时追加短 SHA-256，而不是随机 ID。

```ts
export type ProviderLoadResult = {
  configuration: ProviderConfigurationV2
  sourceFormat: 'missing' | 'legacy-array' | 'v2'
  error?: string
}
```

缺失或空文件生成 `version: 2, revision: 0` 的内存目录；内置 Cerebras/Groq/Qwen/DeepSeek 通过同一迁移函数形成 v2 视图。读取错误继续回退内置值并返回诊断，不抛异常。

- [ ] 2.4 把原子写入临时文件改到目标文件同目录，写入模式 `0o600`，`fsync` 后 `renameSync`；Revision 必须从 `expectedRevision` 精确递增到 `expectedRevision + 1`。

```ts
export class ProviderRevisionConflictError extends Error {
  constructor(readonly current: ProviderConfigurationV2) {
    super('provider configuration revision conflict')
  }
}
```

保存前重新读取磁盘，避免进程缓存造成 lost update；写入成功后更新缓存，写入失败保持旧缓存。

- [ ] 2.5 运行目标测试、旧 switcher 测试和类型检查。

```bash
bun test src/services/providerRegistry/__tests__/loader.test.ts src/services/providerRegistry/__tests__/switcher.test.ts
bun run typecheck
```

预期：全部通过，旧 `loadProviders()` 行为没有回归。

- [ ] 2.6 提交。

```bash
git add src/services/providerRegistry/loader.ts src/services/providerRegistry/__tests__/loader.test.ts
git commit -m "feat: migrate provider registry to v2"
```

## 任务 3：实现 Revision、幂等和软归档目录服务

**文件：**

- 新建：`src/services/providerRegistry/catalogService.ts`
- 新建：`src/services/providerRegistry/__tests__/catalogService.test.ts`
- 修改：`src/services/providerRegistry/loader.ts`

**接口：**

```ts
export type CatalogMutation =
  | { type: 'save_provider'; provider: ProviderProfile }
  | { type: 'archive_provider'; providerId: string }
  | { type: 'save_model'; providerId: string; model: ModelProfile }
  | { type: 'archive_model'; providerId: string; modelProfileId: string }
  | { type: 'set_default'; model: ModelRef | null; allowUnverified?: boolean }

export type CatalogMutationRequest = {
  operationId: string
  expectedRevision: number
  mutation: CatalogMutation
}
```

- [ ] 3.1 写失败测试：同一 Operation ID 不重复增加 Revision、不同 payload 复用 ID 报冲突、归档被引用项只改标记、默认模型约束正确。

```ts
test('replays an operation without applying it twice', () => {
  const first = service.mutate(request)
  const replay = service.mutate(request)
  expect(replay).toEqual(first)
  expect(service.read().revision).toBe(1)
})

test('requires a replacement before archiving the default model', () => {
  expect(() => service.mutate(archiveDefault)).toThrow('default_model_conflict')
})
```

- [ ] 3.2 运行测试并确认失败。

```bash
bun test src/services/providerRegistry/__tests__/catalogService.test.ts
```

预期：模块不存在。

- [ ] 3.3 实现纯函数 `applyCatalogMutation(current, mutation)`，再由服务负责磁盘和 Operation 缓存。

Operation 缓存键是 `operationId`，值包含规范化请求 SHA-256 和结果；最多保留 256 项。相同 ID、不同哈希返回 `provider_operation_conflict`。进程重启后的幂等由 expected Revision 兜底：旧 Revision 返回当前目录，不重复写入。

- [ ] 3.4 实现软归档规则。

- 供应商和模型不提供物理删除 mutation。
- 归档供应商时把 `archived=true`、`enabled=false`，保留模型。
- 归档模型时保留 ID、远程 ID 和验证信息。
- 当前默认项必须先清空默认值或在同一次 `set_default` 操作选择替代项。
- `invalid` 模型不能设默认；`unverified` 只有 `allowUnverified=true` 才可设默认。

- [ ] 3.5 运行测试和类型检查。

```bash
bun test src/services/providerRegistry/__tests__/catalogService.test.ts src/services/providerRegistry/__tests__/loader.test.ts
bun run typecheck
```

预期：全部通过。

- [ ] 3.6 提交。

```bash
git add src/services/providerRegistry/catalogService.ts src/services/providerRegistry/loader.ts src/services/providerRegistry/__tests__/catalogService.test.ts
git commit -m "feat: add provider catalog mutation service"
```

## 任务 4：提取现有设置保存和认证状态检测的无界面服务

**文件：**

- 新建：`src/services/providerRegistry/existingProviderDetector.ts`
- 新建：`src/services/providerRegistry/__tests__/existingProviderDetector.test.ts`
- 新建：`src/services/providerRegistry/providerSettingsWriter.ts`
- 新建：`src/services/providerRegistry/__tests__/providerSettingsWriter.test.ts`
- 修改：`src/components/ConsoleOAuthFlow.tsx`

**接口：**

- `detectExistingProviderProfiles(settings, env): DetectedProviderProfile[]` 只返回引用和布尔状态。
- `saveCompatibleProviderSettings(input)` 复用当前 `updateSettingsForSource`、`clearOpenAIClientCache` 和 ChatGPT auth 清理语义。
- Console UI 改为调用 writer，不再内嵌 Anthropic/OpenAI/Gemini/国内预设的保存副作用。

- [ ] 4.1 写检测失败测试，覆盖 Anthropic compatible、OpenAI compatible、Gemini、Grok、ChatGPT OAuth、Bedrock、Vertex、Foundry 和代理/Helper 来源。

```ts
test('redacts every detected credential source', () => {
  const profiles = detectExistingProviderProfiles({}, {
    OPENAI_API_KEY: 'sk-secret', OPENAI_BASE_URL: 'https://api.example/v1',
    CLAUDE_CODE_USE_BEDROCK: '1', AWS_PROFILE: 'dev',
  })
  expect(JSON.stringify(profiles)).not.toContain('sk-secret')
  expect(profiles.find(p => p.kind === 'openai-compatible')?.auth).toEqual({
    scheme: 'api-key', source: 'environment', envName: 'OPENAI_API_KEY', configured: true,
  })
})
```

- [ ] 4.2 写 writer 失败测试，断言移除旧互斥环境变量、保存新值并触发正确缓存清理。

```ts
test('switches from ChatGPT OAuth to OpenAI compatible atomically', async () => {
  await saveCompatibleProviderSettings({
    kind: 'openai-compatible', baseUrl: 'https://api.example/v1',
    credential: 'secret', models: ['m1'],
  }, deps)
  expect(deps.update).toHaveBeenCalledWith('userSettings', expect.objectContaining({ modelType: 'openai' }))
  expect(deps.clearOpenAI).toHaveBeenCalledTimes(1)
  expect(deps.removeChatGPT).toHaveBeenCalledTimes(1)
})
```

- [ ] 4.3 运行测试并确认失败。

```bash
bun test src/services/providerRegistry/__tests__/existingProviderDetector.test.ts src/services/providerRegistry/__tests__/providerSettingsWriter.test.ts
```

预期：两个新模块不存在。

- [ ] 4.4 实现 detector，读取值但只输出 `configured`、`source`、`envName`、可选 `expiresAt`/`lastErrorCode`；禁止把原值扩展进对象。

检测顺序与现有运行时一致：托管/进程环境 > settings env > secure storage/OAuth > cloud chain。检测到的系统项使用稳定 ID，例如 `detected-anthropic`、`detected-chatgpt`、`detected-gemini`、`detected-bedrock`。

- [ ] 4.5 实现 writer 并把 `ConsoleOAuthFlow.tsx` 四段保存逻辑收敛为调用它；保持当前 TUI 字段、文案和行为不变。

- [ ] 4.6 运行 Provider writer/detector 测试和类型检查。

```bash
bun test src/services/providerRegistry/__tests__/existingProviderDetector.test.ts src/services/providerRegistry/__tests__/providerSettingsWriter.test.ts
bun run typecheck
```

预期：全部通过。

- [ ] 4.7 提交。

```bash
git add src/services/providerRegistry/existingProviderDetector.ts src/services/providerRegistry/providerSettingsWriter.ts src/services/providerRegistry/__tests__/existingProviderDetector.test.ts src/services/providerRegistry/__tests__/providerSettingsWriter.test.ts src/components/ConsoleOAuthFlow.tsx
git commit -m "refactor: share provider settings services"
```

## 任务 5：生成稳定且完全脱敏的目录 Capability

**文件：**

- 新建：`src/services/providerRegistry/catalogCapability.ts`
- 新建：`src/services/providerRegistry/__tests__/catalogCapability.test.ts`
- 修改：`src/bridge/initReplBridge.ts`
- 修改：`src/bridge/__tests__/bridgeIdentity.test.ts`

**接口：**

```ts
export type ProviderModelCatalogCapability = {
  version: 1
  revision: number
  defaultModel: ModelRef | null
  providers: RedactedProviderProfile[]
  features: {
    catalogWrite: boolean
    sessionPersistence: boolean
    runtimeSwitch: boolean
    secretControl: boolean
  }
}
```

- [ ] 5.1 写失败测试：Capability 合并用户配置与检测项、密钥值不出现、同一输入序列化稳定、归档项仍上报以解析旧 Session。

```ts
test('never exposes credential values', () => {
  const capability = buildProviderCatalogCapability(configuration, detected)
  const json = JSON.stringify(capability)
  expect(json).not.toContain('sk-live-secret')
  expect(json).not.toContain('accessToken')
  expect(capability.providers[0]?.auth.configured).toBe(true)
})
```

- [ ] 5.2 运行测试并确认失败。

```bash
bun test src/services/providerRegistry/__tests__/catalogCapability.test.ts src/bridge/__tests__/bridgeIdentity.test.ts
```

预期：Capability Builder 不存在或 Bridge 仍上报旧 `configs` 形状。

- [ ] 5.3 实现 Builder。对检测项和文件项按稳定 ID 合并；文件项的显示配置优先，检测项只补认证状态。排序固定为未归档/归档、显示名、ID。

- [ ] 5.4 在 `initReplBridge.ts` 把当前 `capabilities.provider` 替换为：

```ts
capabilities.provider_model_catalog_v1 = buildProviderCatalogCapability(
  loadProviderConfiguration().configuration,
  detectExistingProviderProfiles(getSettings_DEPRECATED(), process.env),
)
capabilities.session_model_persistence_v1 = false
capabilities.provider_runtime_switch_v1 = false
```

保留旧 `capabilities.provider` 一整个兼容周期，其值由同一目录反向投影成旧 `configs`，不能继续独立读取。

- [ ] 5.5 运行测试、类型检查和秘密字段静态扫描。

```bash
bun test src/services/providerRegistry/__tests__ src/bridge/__tests__/bridgeIdentity.test.ts
bun run typecheck
rg -n 'apiKey|accessToken|refreshToken|secret' src/services/providerRegistry/catalogCapability.ts
```

预期：测试和 typecheck 通过；最后一条只允许命中显式拒绝/脱敏断言，不允许把秘密字段赋给 Capability。

- [ ] 5.6 提交。

```bash
git add src/services/providerRegistry/catalogCapability.ts src/services/providerRegistry/__tests__/catalogCapability.test.ts src/bridge/initReplBridge.ts src/bridge/__tests__/bridgeIdentity.test.ts
git commit -m "feat: publish redacted provider catalog capability"
```

## 阶段验证

- [ ] 运行完整 Provider Registry 测试。

```bash
bun test src/services/providerRegistry/__tests__
```

预期：全部通过。

- [ ] 运行根类型检查和格式检查。

```bash
bun run typecheck
git diff --check
```

预期：退出码为 `0`。

- [ ] 使用 `superpowers:requesting-code-review` 检查 v2 兼容、默认引用、Revision、软归档与脱敏边界；解决阻塞问题后再进入计划二。

# 浏览器模型供应商与模型管理设计

日期：2026-07-14
状态：已批准，等待实施
范围：Remote Control 浏览器界面、RCS 持久化与控制平面、本地 Worker 模型供应商运行时

## 1. 目标

在浏览器中集成项目现有的模型供应商、认证和自定义模型能力，同时保留当前各认证实现及其本地安全边界。

最终系统必须允许用户：

1. 查看当前 CLI 支持的全部模型供应商和认证方式。
2. 在浏览器中新增、编辑、验证、启用、归档并保存供应商配置和模型配置。
3. 为每个运行环境选择一个默认启用模型。
4. 新建对话时使用创建当时的环境默认模型。
5. 在当前对话所属运行环境允许的模型之间切换。
6. 浏览器刷新、RCS 重启、Worker 重启或会话重连后，仍能恢复每个对话最后一次成功启用的供应商和模型。
7. 修改环境默认模型后，旧对话继续使用此前选定的模型。
8. RCS 不存储、不返回模型供应商的原始凭据。

## 2. 非目标

本设计不做以下事情：

- 替换现有 Claude、ChatGPT、API Key、凭据 Helper、AWS、GCP 或 Azure 认证实现。
- 把云厂商凭据链或操作系统 Keychain 迁移到 RCS。
- 允许浏览器配置绕过托管的 `availableModels` 或宿主管理的供应商策略。
- 改变正在执行的模型请求。模型切换只在请求边界生效。
- 保证已归档或供应商已下线的远程模型永远可调用。系统只保留选择记录并明确报告不可用，不静默替换模型。
- 在不同机器间设置同一个全局供应商默认值。默认模型按运行环境隔离，因为凭据和 Endpoint 都属于本地环境。

## 3. 当前机制与缺口

浏览器已经具备端到端的 `set_model` 控制链路。`RCSChatAdapter` 可以发送任意模型字符串，REPL Bridge 也能把它应用到当前会话。但浏览器可见的模型选择器目前只硬编码了 `default`、`opus`、`sonnet` 和 `haiku`。

当前模型供应商页面是只读的。它读取启动时上报的 capability 快照，只展示 OpenAI-compatible 注册项和一个 `key_configured` 布尔值，无法创建配置、执行指定供应商的验证、切换供应商或设置默认模型。

当前供应商注册表是一个 `openai-compat` 数组，无法表达原生 Anthropic、ChatGPT OAuth、Gemini、Grok、Bedrock、Vertex、Foundry、多模型、认证来源和环境默认模型。

RCS 的 Session 持久化结构没有供应商或模型选择。新建会话请求和 Work Item 也不携带模型，因此仅依靠浏览器本地存储无法在 Worker 重启后恢复模型。

供应商路由和模型选择当前分散在设置、环境变量、会话覆盖、供应商注册表，以及缓存的客户端和模型字符串中。跨供应商切换必须由一个统一的运行时激活服务完成，并由该服务统一负责缓存失效。

## 4. 方案比较

### 4.1 浏览器本地保存模型目录和默认值

把供应商配置、模型配置和默认值放进 `localStorage`，然后调用现有 `set_model`。

不采用。该方案只对当前浏览器有效，无法恢复重启后的 Worker，不能建立服务端的新会话默认值，也不能可靠执行跨供应商切换。

### 4.2 RCS 集中保存配置和凭据

由 RCS 统一存储供应商定义、默认值、会话选择、OAuth Token 和 API Key。

不采用。该方案扩大了凭据泄露范围，无法忠实表达操作系统 Keychain 和云厂商默认凭据链，还会形成第二套认证实现。

### 4.3 本地环境为配置权威、RCS 持久化会话状态

本地 Worker 管理供应商配置、认证引用、模型验证和运行时激活；RCS 缓存脱敏后的环境模型目录，并持久化默认模型引用和每个 Session 的模型快照；浏览器负责管理和控制界面。

采用此方案。它能够保留现有认证行为、支持多机器环境、避免会话间污染，并在重启后恢复会话状态。

## 5. 状态模型与来源真相

系统明确区分三类模型状态。

### 5.1 环境默认模型

每个运行环境最多有一个 `defaultModelRef`。它保存在本地供应商配置中，并随脱敏后的模型目录上报给 RCS。

修改默认模型只影响修改后新建的 Session，绝不批量修改已有 Session。

### 5.2 Session 持久化模型

创建 Session 时，RCS 解析该环境当前默认模型，并把供应商和模型快照复制到 Session 记录中。此后该 Session 不再跟随环境默认值变化。

用户在会话中成功切换模型后，Session 记录更新为新模型快照。

### 5.3 运行时实际模型

正在运行的 CLI 子进程上报它真正启用的供应商和解析后的模型。该上报是运行时权威确认。RCS 只有收到此确认后才更新 Session 持久化记录。

模型选择优先级固定为：

1. Session 最后一次成功确认的模型。
2. 从旧 Session 历史中恢复出的模型。
3. Session 创建时或旧会话首次恢复时复制的环境默认模型。
4. CLI 现有默认模型解析结果。

浏览器 `localStorage` 不是状态来源，只允许保存搜索文本、折叠状态等纯界面偏好。

## 6. 配置模型

### 6.1 供应商配置文件

把 `~/.claude/providers.json` 演进为向后兼容的版本化文档。

```ts
interface ProviderConfigurationV2 {
  version: 2
  revision: number
  defaultModel: ModelRef | null
  providers: ProviderProfile[]
}
```

Loader 同时接受：

- 旧版 OpenAI-compatible 供应商数组。
- v2 对象。

读取旧格式时只在内存中迁移。只有用户通过浏览器或 CLI 明确保存成功后，才以 v2 格式原子写回文件。

### 6.2 供应商配置

```ts
type ProviderKind =
  | 'anthropic'
  | 'anthropic-compatible'
  | 'openai-compatible'
  | 'chatgpt'
  | 'gemini'
  | 'grok'
  | 'bedrock'
  | 'vertex'
  | 'foundry'

interface ProviderProfile {
  id: string
  displayName: string
  kind: ProviderKind
  baseUrl?: string
  auth: AuthReference
  compatRule?: string
  enabled: boolean
  archived: boolean
  models: ModelProfile[]
}
```

供应商 ID 是稳定标识符。修改显示名称不会改变 ID。

国内模型预设以 OpenAI-compatible 配置保存，并附带预设 Endpoint、兼容规则和模型建议，不引入单独的运行时协议。

### 6.3 认证引用

```ts
type AuthScheme =
  | 'oauth'
  | 'api-key'
  | 'bearer'
  | 'aws-iam'
  | 'gcp-adc'
  | 'azure-ad'
  | 'proxy'

type AuthSource =
  | 'secure-storage'
  | 'settings'
  | 'environment'
  | 'helper'
  | 'cloud-chain'

interface AuthReference {
  scheme: AuthScheme
  source: AuthSource
  envName?: string
}
```

本地配置文件只保存认证引用。OAuth Token、API Key、Helper 输出和云厂商凭据继续保存在当前认证方式已有的存储或来源中。

脱敏目录额外上报 `configured`、`expiresAt`、`lastErrorCode` 等运行状态。这些是 capability 元数据，不是密钥。

### 6.4 模型配置

```ts
interface ModelProfile {
  id: string
  displayName: string
  remoteModelId: string
  enabled: boolean
  archived: boolean
  aliases?: string[]
  capabilities?: {
    tools?: boolean
    vision?: boolean
    thinking?: boolean
    contextWindow?: number
    maxOutputTokens?: number
  }
  validation: {
    status: 'unverified' | 'valid' | 'invalid'
    checkedAt?: number
    errorCode?: string
  }
}
```

模型 ID 在所属供应商内保持稳定。`remoteModelId` 是最终发送给远程供应商的精确模型值。

模型可以通过三种方式添加：

1. 供应商支持时，从模型列表 API 获取。
2. 从内置建议中选择。
3. 手工输入任意模型 ID。

手工输入始终可用。模型发现失败不影响保存一个尚未验证的模型。

### 6.5 模型引用与 Session 快照

```ts
interface ModelRef {
  providerId: string
  modelProfileId: string
}

interface SessionModelSelection {
  providerId: string
  modelProfileId: string
  resolvedModelId: string
  providerConfigRevision: number
  updatedAt: number
}
```

`resolvedModelId` 在创建 Session 或切换模型时复制到 Session 中，用于保存当时真正选定的模型。后来编辑模型配置不会静默改变旧对话。只有用户在会话选择器中再次选择该模型，Session 才会采用更新后的模型定义。

供应商认证和 Endpoint 不复制进 Session，因为凭据轮换和安全修复必须对已有 Session 继续生效。

## 7. 浏览器支持的供应商和认证方式

浏览器供应商向导提供当前登录和供应商流程已有的全部入口：

- Claude 订阅 OAuth。
- Anthropic Console/API Key。
- Anthropic-compatible Endpoint。
- OpenAI-compatible Endpoint。
- ChatGPT 订阅/Device OAuth。
- Gemini API。
- Grok API。
- Amazon Bedrock。
- Google Vertex AI。
- Microsoft Foundry。
- 国内模型预设。
- 完全自定义的兼容供应商。

供应商向导步骤：

1. 选择运行环境。
2. 选择供应商类型或预设。
3. 配置该供应商支持的 Endpoint 字段。
4. 选择并完成现有认证方式。
5. 通过发现、建议或手工输入添加模型。
6. 验证并保存。
7. 可选择将一个启用模型设为环境默认模型。

浏览器通过结构化 Worker 命令调用本地现有认证实现，不复制 Token 交换、刷新、凭据链或安全存储逻辑。

### 7.1 OAuth

Worker 启动现有 OAuth 或 Device Flow，只返回授权 URL、设备码、脱敏进度和最终状态。Token 由现有实现保存在本地，永不返回给浏览器或 RCS。

### 7.2 API Key 和 Bearer Token

密钥不能作为聊天消息或普通、可记录日志的控制消息发送。

使用专用 Secret Control 交换：

1. Worker 上报短期有效的接收公钥和 Operation ID。
2. 浏览器使用该公钥加密密钥。
3. RCS 只转发密文，不记录、不持久化。
4. Worker 在内存中解密，并调用当前供应商对应的保存路径。
5. 返回值只包含状态和脱敏元数据。

密钥交换使用临时 P-256 ECDH 密钥、HKDF-SHA-256 和 AES-256-GCM，浏览器侧使用 WebCrypto，Worker 使用对应的 Crypto API。Operation ID 和 Environment ID 作为附加认证数据。接收密钥五分钟后过期，只允许一次成功操作，并在成功、失败或过期后删除。浏览器发送自身临时公钥、IV、密文、Operation ID 和过期时间；RCS 得不到可用于推导共享密钥的材料。浏览器密钥录入功能启用前，必须通过协议测试向量、重放、过期和日志脱敏测试。

### 7.3 AWS、GCP 和 Azure

浏览器检测并刷新已有 AWS Profile/STS、Google ADC 和 Azure 凭据链状态。浏览器只能触发已配置且在允许列表中的认证刷新动作，不能提交任意 Shell 命令。

### 7.4 宿主和企业策略

宿主管理的供应商变量和托管设置始终优先。托管配置在浏览器中只读。浏览器进行模型验证或激活前必须调用现有模型允许列表检查。

## 8. 浏览器供应商页面

页面顶部先选择运行环境，因为供应商配置和凭据属于具体环境。

页面包括：

1. 默认模型摘要：供应商、模型、验证状态，并明确说明修改只影响新会话。
2. 供应商卡片：协议、Endpoint、认证来源和状态、启用模型数量、兼容规则、最近验证结果。
3. 可展开的模型表格：默认标记、显示名称、远程模型 ID、能力、启用状态、验证状态。
4. 新增、编辑、验证、启用、停用、归档、认证、重新认证和设为默认等操作。

被 Session 引用的供应商或模型只允许软归档，不能物理删除。归档项不出现在新选择中，但旧 Session 仍能解析和显示。

每个环境最多有一个默认启用模型。停用或归档当前默认模型时，必须先选择替代模型，或明确确认该环境不再使用浏览器管理的默认值。

未验证模型允许保存。验证失败的模型不能设为默认。未验证模型只有经过明确的二次确认后才能设为默认。

## 9. 新建 Session 行为

新建 Session API 在服务端和 Worker 边界解析默认模型，不信任浏览器本地值，从而保证浏览器以外的客户端也获得一致行为。

创建流程：

1. 浏览器选择环境并创建 Session。
2. RCS 读取该环境最新的脱敏模型目录和默认值。
3. RCS 在同一个逻辑操作中把 `SessionModelSelection` 快照写入新 Session。
4. Work Item 把该选择传给 Worker。
5. Worker 解析本地供应商配置，为子进程构建独立的环境覆盖，并使用精确模型启动 CLI。
6. CLI 在初始化元数据中上报实际供应商和模型。
7. RCS 对比实际上报值和 Session 快照并完成校准。

第一版新建会话窗口只展示将使用的默认模型，不再增加一个完整模型选择器。用户进入会话后可以立即切换。

修改环境默认模型绝不批量更新已有 Session。

## 10. Session 模型切换

会话控制栏把硬编码的四项菜单替换为可搜索、按供应商分组的模型选择器，数据来自该 Session 所属环境的脱敏模型目录。

只有已启用、未归档且策略允许的模型可以选择。当前 Session 的历史模型即使后来被归档或不可用，也继续显示。

模型切换使用结构化控制请求：

```ts
interface SetSessionModelRequest {
  providerId: string
  modelProfileId: string
  expectedProviderConfigRevision: number
  operationId: string
}
```

切换顺序：

1. RCS 验证 Session 所有权和环境绑定关系。
2. Worker 验证配置 Revision 和目标模型在本地存在。
3. Worker 检查策略和认证就绪状态。
4. 子进程运行时在下一个请求边界应用不可变的供应商和模型快照。
5. 子进程发送 `model_changed`，包含实际供应商和解析后的模型。
6. RCS 收到确认后才持久化新 Session 模型。
7. 浏览器收到权威事件后更新当前选项。

模型正在流式输出时禁止切换，避免同一轮中的主请求、工具、Side Query 或子代理观察到不同的供应商快照。

激活失败时，旧运行时和 Session 记录保持不变。错误使用结构化错误码：

- `provider_not_found`
- `model_not_found`
- `authentication_required`
- `authentication_failed`
- `model_not_allowed`
- `endpoint_unreachable`
- `protocol_incompatible`
- `stale_provider_revision`
- `runtime_switch_failed`

## 11. 运行时激活

新增统一的 Provider Runtime Service。只有该服务可以把供应商和模型选择转换成请求配置。

该服务必须：

1. 解析供应商配置和精确的 Session 模型快照。
2. 构建供应商特定的客户端参数，不依赖会覆盖会话选择的全局主模型环境变量。
3. 在生产请求构建器中真正应用兼容规则。
4. 失效或替换 OpenAI/Grok Client、模型字符串缓存、能力缓存和其他供应商派生缓存。
5. 发布不可变的运行时配置 Revision。
6. 任一激活步骤失败时继续保留旧运行时。

每个 RCS Session 已运行在独立 CLI 子进程中，因此供应商切换只改变该 Session 子进程，不影响同环境中的其他 Session。

启动 Session 时，Bridge 父进程构建子进程专用的环境覆盖并显式传入模型，不能通过修改父进程供应商状态产生副作用。

## 12. RCS 持久化和协议变更

### 12.1 Session 持久化

为 Session 增加以下类型化字段：

- `modelProviderId`
- `modelProfileId`
- `modelResolvedId`
- `modelConfigRevision`
- `modelUpdatedAt`

SQLite 迁移采用可空的增量字段，现有 Session 行继续有效。

### 12.2 Work 协议

Session Work Data 增加持久化模型选择。重连或 Worker 重启时使用 Session 自己的选择，不再重新读取当前环境默认模型。

### 12.3 环境 Capability

新增脱敏且带 Revision 的 Capability：

```ts
interface ProviderModelCatalogCapability {
  version: 1
  revision: number
  defaultModel: ModelRef | null
  providers: RedactedProviderProfile[]
}
```

Worker 重连以及每次供应商或默认模型修改成功后，重新上报该 Capability。

### 12.4 结构化命令和事件

新增环境命令：

- `get_provider_catalog`
- `save_provider_profile`
- `archive_provider_profile`
- `save_model_profile`
- `archive_model_profile`
- `set_default_model`
- `validate_provider_model`
- `begin_provider_auth`
- `remove_provider_auth`

新增 Session 控制命令 `set_session_model`，并增加事件：

- `provider_catalog_changed`
- `provider_auth_changed`
- `default_model_changed`
- `session_model_changing`
- `session_model_changed`
- `session_model_change_failed`

所有修改操作都携带幂等 Operation ID 和预期 Revision。

## 13. 并发和状态校准

供应商配置使用乐观并发控制：

- 浏览器提交 `expectedRevision`。
- 旧版本修改返回冲突和最新脱敏目录。
- 本地原子写入成功后 Revision 只递增一次。
- RCS 只根据 Worker 确认更新缓存。

Session 切换同样使用 Operation ID。重复投递返回原操作结果，不重复切换。

如果子进程已切换模型，但 RCS 在持久化前失败，则下一次初始化或 `session_model_changed` 事件根据实际运行时校准 Session。RCS 不能只根据浏览器请求伪造成功确认。

如果 RCS 中的 Session 模型不存在于 Worker 新上报的模型目录中，该选择继续保留并标记为不可用，不能替换成新默认模型。

## 14. 旧数据迁移

### 14.1 供应商配置

旧版 OpenAI-compatible 注册项转换为供应商配置，并用 `defaultModel` 生成一个模型配置。环境密钥引用和兼容规则保持不变。

已有 settings/env 登录配置作为检测到的供应商展示，不复制到新的密钥存储。

### 14.2 现有 Session

对于没有结构化模型记录的 Session：

1. 检查最后一条持久化 `system/init` 中的模型。
2. 能唯一匹配时关联到已上报的供应商和模型配置。
3. 无法唯一匹配时创建仅存在于内存中的 Legacy 选择，保留原始模型 ID。
4. 只有成功完成唯一恢复，或用户首次成功切换后，才写入结构化 Session 选择。

迁移不能把曾上报不同模型的历史 Session 静默改成当前环境默认模型。

## 15. 向后兼容

Worker 上报以下能力标识：

- `provider_model_catalog_v1`
- `session_model_persistence_v1`
- `provider_runtime_switch_v1`

连接旧 Worker 时：

- 供应商页面保持只读。
- Session 页面回退到当前 Alias 选择器和旧版 `set_model` 请求。
- 禁止跨供应商切换。
- 现有 Session 和命令继续运行。

CLI 继续接受只包含模型字符串的旧版 `set_model`，新的结构化控制为增量能力。

## 16. 安全要求

1. RCS 数据库、事件历史、日志、错误、分析数据和 Capability 中都不能出现供应商原始密钥。
2. 浏览器密钥输入不能进入 `localStorage`、应用管理的表单历史或错误遥测。
3. Secret Control 密文必须一次性、短期有效、绑定 Environment ID 和 Operation ID，并具备重放保护。
4. OAuth Token 永不经过 RCS。
5. 云认证刷新命令必须预先配置并进入允许列表，浏览器不能提供命令字符串。
6. 验证和激活模型前必须检查托管供应商策略和 `availableModels`。
7. Base URL 必须验证，请求由本地 Worker 发出而不是 RCS 发出，现有代理和企业路由策略继续生效。
8. 所有认证展示值只能是脱敏元数据。

## 17. 测试策略

### 17.1 单元测试

- 旧版供应商数组迁移到 v2。
- v2 Schema 验证和原子保存。
- 稳定的供应商/模型 ID 和软归档语义。
- 默认值必须指向启用且未验证失败的模型。
- Session 快照序列化和优先级。
- 供应商 Revision 冲突和幂等 Operation ID。
- 托管模型允许列表。
- 错误和 Capability 脱敏。
- 构建运行时快照时不受全局主模型环境变量干扰。
- 供应商相关缓存替换和失败回滚。

### 17.2 集成测试

- 添加每种供应商并保存一个或多个模型。
- 完成或检测每种现有认证方式。
- 设置环境默认模型并创建 Session。
- 修改默认值后确认旧 Session 不变。
- 在同一供应商内和不同供应商间切换 Session 模型。
- 刷新浏览器后保持选择。
- 重启 RCS 后保持选择。
- 重启或重连 Worker 后使用同一选择启动 Session。
- 认证、验证或激活失败时保留旧运行时。
- 归档已选模型后保持历史 Session 展示和恢复。
- 两个环境使用不同模型目录和默认值。
- 两个浏览器并发修改时返回 Revision 冲突。

### 17.3 端到端验收流程

1. 通过浏览器添加一个 OpenAI-compatible 供应商。
2. 添加两个自定义远程模型 ID。
3. 完成认证，并确认 RCS 持久化和日志中没有原始密钥。
4. 验证两个模型，把第一个设为环境默认模型。
5. 新建 Session，确认第一次请求使用第一个模型。
6. 把 Session 切换到第二个模型，确认下一次请求使用第二个模型。
7. 修改环境默认模型。
8. 刷新浏览器、重启 RCS 并重连 Worker。
9. 确认旧 Session 仍使用第二个模型。
10. 再创建一个 Session，确认它使用新的环境默认模型。

## 18. 交付顺序

### 阶段一：领域模型和迁移基础

- 增加 v2 供应商配置类型和旧格式 Loader。
- 增加 Session 模型字段和 SQLite 迁移。
- 增加脱敏模型目录和 Session 模型类型。
- 增加 Revision、幂等和软归档规则。

### 阶段二：本地供应商服务和协议

- 在统一的本地服务后实现供应商和模型 CRUD。
- 实现脱敏 Capability 上报和环境命令。
- 通过结构化命令复用当前认证实现。
- 增加精确的供应商和模型验证。
- 增加 Secret Control 协议和安全测试。

### 阶段三：运行时激活

- 实现不可变的供应商运行时快照。
- 把兼容规则接入生产请求构建器。
- 替换或失效供应商派生客户端和缓存。
- 增加结构化跨供应商 Session 切换和失败回滚。
- 增加模型切换确认事件。

### 阶段四：RCS 生命周期持久化

- 创建 Session 时复制环境默认模型。
- 扩展 Work Item 和 Bridge 启动参数。
- 重连和重启后恢复 Session 模型。
- 用运行时确认校准 Session 持久化。
- 增加旧 Session 恢复。

### 阶段五：浏览器供应商管理页面

- 把只读供应商卡片改成按环境隔离的 CRUD。
- 增加供应商/认证向导，以及模型发现和手工添加。
- 增加验证、启用、归档和设置默认操作。
- 增加 Revision 冲突和结构化错误交互。

### 阶段六：浏览器 Session 页面

- 用可搜索、按供应商分组的模型替换硬编码 Alias。
- 展示历史或不可用选择。
- 流式输出期间禁止切换。
- 只有收到权威确认后才持久化。
- 在新建 Session 窗口展示解析后的默认模型。

### 阶段七：加固和发布

- 完成单元、集成、迁移和端到端测试。
- 扫描 API 响应、事件历史、日志和数据库中的密钥泄露。
- 验证旧 Worker 降级行为。
- 先通过 Capability 检查和 Feature Flag 发布，再把 v2 写入设为默认行为。

## 19. 验收标准

只有满足以下全部条件，功能才算完成：

- 浏览器中呈现当前支持的全部供应商和认证方式。
- 用户可以在一个供应商下保存多个自定义模型。
- 每个环境可以选择一个默认启用模型。
- 新 Session 复制当前环境默认模型。
- 默认模型修改不改变已有 Session。
- Session 可以在已启用且策略允许的供应商和模型之间切换。
- 成功切换后，浏览器、RCS 和 Worker 重启都能恢复。
- 切换失败时，运行时和 Session 持久化状态保持不变。
- 模型归档或目录变化后，历史 Session 仍保留最后模型引用。
- 供应商或模型切换不影响同环境中的其他 Session。
- RCS 不持久化、不记录、不返回供应商原始密钥。
- 旧 Worker 继续使用旧版选择器和控制协议运行。

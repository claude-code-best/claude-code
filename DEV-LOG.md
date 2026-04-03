# DEV-LOG

## OpenAI 接口兼容 (2026-04-03)

**分支**: `feature/openai`

在 `/login` 流程中新增 "OpenAI Compatible" 选项，支持 Ollama、DeepSeek、vLLM、One API 等兼容 OpenAI Chat Completions API 的第三方服务。用户通过 `/login` 配置后，所有 API 请求自动走 OpenAI 路径。

**改动文件（10 个，+384 / -134）：**

| 文件 | 变更 |
|------|------|
| `.github/workflows/ci.yml` | CI runner 从 `ubuntu-latest` 改为 `macos-latest` |
| `README.md` | TODO 列表新增 "OpenAI 接口兼容" 条目 |
| `src/components/ConsoleOAuthFlow.tsx` | 新增 `openai_chat_api` OAuth state（含 Base URL / API Key / 3 个模型映射字段）；idle 选择列表新增 "OpenAI Compatible" 选项；完整表单 UI（Tab 切换、Enter 保存）；保存时写入 `modelType: 'openai'` + env 到 settings.json；OAuth 登录时重置 `modelType` 为 `anthropic` |
| `src/services/api/openai/index.ts` | 从直接 `yield* adaptOpenAIStreamToAnthropic()` 改为完整流处理循环：累积 content blocks（text/tool_use/thinking）、按 `content_block_stop` yield `AssistantMessage`、同时 yield `StreamEvent` 用于实时显示；错误处理改用新签名 `createAssistantAPIErrorMessage({ content, apiError, error })` |
| `src/services/api/openai/convertMessages.ts` | 输入类型从 Anthropic SDK `BetaMessageParam[]` 改为内部 `(UserMessage \| AssistantMessage)[]`；通过 `msg.type` 而非 `msg.role` 判断角色；从 `msg.message.content` 读取内容；跳过 `cache_edits` / `server_tool_use` 等内部 block 类型 |
| `src/services/api/openai/modelMapping.ts` | 移除 `OPENAI_MODEL_MAP` JSON 环境变量 + 缓存机制；新增 `getModelFamily()` 按 haiku/sonnet/opus 分类；解析优先级改为：`OPENAI_MODEL` → `ANTHROPIC_DEFAULT_{FAMILY}_MODEL` → `DEFAULT_MODEL_MAP` → 原名透传 |
| `src/services/api/openai/__tests__/convertMessages.test.ts` | 测试输入从裸 `{ role, content }` 改为 `makeUserMsg()` / `makeAssistantMsg()` 包装的内部格式 |
| `src/services/api/openai/__tests__/modelMapping.test.ts` | 测试从 `OPENAI_MODEL_MAP` 改为 `ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL`；新增 3 个 env var override 测试 |
| `src/utils/model/providers.ts` | `getAPIProvider()` 新增最高优先级：从 settings.json `modelType` 字段判断；环境变量 `CLAUDE_CODE_USE_OPENAI` 降为次优先 |
| `src/utils/settings/types.ts` | `SettingsSchema` 新增 `modelType` 字段：`z.enum(['anthropic', 'openai']).optional()` |

**关键设计决策：**

1. **`modelType` 存入 settings.json** — 而非纯环境变量，使 `/login` 配置持久化，重启后仍然生效
2. **复用 `ANTHROPIC_DEFAULT_*_MODEL` 环境变量** — 而非新增 `OPENAI_MODEL_MAP`，与 Custom Platform 共用同一套模型映射配置，减少用户认知负担
3. **流处理双 yield** — 同时 yield `AssistantMessage`（给消费方处理工具调用）和 `StreamEvent`（给 REPL 实时渲染），与 Anthropic 路径行为对齐
4. **OAuth 登录重置 modelType** — 用户切换回官方 Anthropic 登录时自动重置为 `anthropic`，避免残留配置导致请求走错误路径

**配置方式：**

```
/login → 选择 "OpenAI Compatible" → 填写 Base URL / API Key / 模型名称
```

或手动编辑 `~/.claude/settings.json`：

```json
{
  "modelType": "openai",
  "env": {
    "OPENAI_BASE_URL": "http://localhost:11434/v1",
    "OPENAI_API_KEY": "ollama",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "qwen3:32b"
  }
}
```

---

## Enable Remote Control / BRIDGE_MODE (2026-04-03)

**PR**: [claude-code-best/claude-code#60](https://github.com/claude-code-best/claude-code/pull/60)

Remote Control 功能将本地 CLI 注册为 bridge 环境，生成可分享的 URL（`https://claude.ai/code/session_xxx`），允许从浏览器、手机或其他设备远程查看输出、发送消息、审批工具调用。

**改动文件：**

| 文件 | 变更 |
|------|------|
| `scripts/dev.ts` | `DEFAULT_FEATURES` 加入 `"BRIDGE_MODE"`，dev 模式默认启用 |
| `src/bridge/peerSessions.ts` | stub → 完整实现：通过 bridge API 发送跨会话消息，含三层安全防护（trim + validateBridgeId 白名单 + encodeURIComponent） |
| `src/bridge/webhookSanitizer.ts` | stub → 完整实现：正则 redact 8 类 secret（GitHub/Anthropic/AWS/npm/Slack token），先 redact 再截断，失败返回安全占位符 |
| `src/entrypoints/sdk/controlTypes.ts` | 12 个 `any` stub → `z.infer<ReturnType<typeof XxxSchema>>` 从现有 Zod schema 推导类型 |
| `src/hooks/useReplBridge.tsx` | `tengu_bridge_system_init` 默认值 `false` → `true`，使 app 端显示 "active" 而非卡在 "connecting" |

**关键设计决策：**

1. **不改现有代码逻辑** — 只补全 stub、修正默认值、开启编译开关
2. **`tengu_bridge_system_init`** — Anthropic 通过 GrowthBook 给订阅用户推送 `true`，但我们的 build 收不到推送；改默认值是唯一不侵入其他代码的方案
3. **`peerSessions.ts` 认证** — 使用 `getBridgeAccessToken()` 获取 OAuth Bearer token，与 `bridgeApi.ts`/`codeSessionApi.ts` 认证模式一致
4. **`webhookSanitizer.ts` 安全** — fail-closed（出错返回 `[webhook content redacted due to sanitization error]`），不泄露原始内容

**验证结果：**

- `/remote-control` 命令可见且可用
- CLI 连接 Anthropic CCR，生成可分享 URL
- App 端（claude.ai/code）显示 "Remote Control active"
- 手机端（Claude iOS app）通过 URL 连接，双向消息正常

![Remote Control on Mobile](docs/images/remote-control-mobile.png)

---

## GrowthBook 自定义服务器适配器 (2026-04-03)

GrowthBook 功能开关系统原为 Anthropic 内部构建设计，硬编码 SDK key 和 API 地址，外部构建因 `is1PEventLoggingEnabled()` 门控始终禁用。新增适配器模式，通过环境变量连接自定义 GrowthBook 服务器，无配置时所有 feature 读取返回代码默认值。

**修改文件：**

| 文件 | 变更 |
|------|------|
| `src/constants/keys.ts` | `getGrowthBookClientKey()` 优先读取 `CLAUDE_GB_ADAPTER_KEY` 环境变量 |
| `src/services/analytics/growthbook.ts` | `isGrowthBookEnabled()` 适配器模式下直接返回 `true`，绕过 1P event logging 门控 |
| `src/services/analytics/growthbook.ts` | `getGrowthBookClient()` base URL 优先使用 `CLAUDE_GB_ADAPTER_URL` |
| `docs/internals/growthbook-adapter.mdx` | 新增适配器配置文档，含全部 ~58 个 feature key 列表 |

**用法：** `CLAUDE_GB_ADAPTER_URL=https://gb.example.com/ CLAUDE_GB_ADAPTER_KEY=sdk-xxx bun run dev`

---

## Datadog 日志端点可配置化 (2026-04-03)

将 Datadog 硬编码的 Anthropic 内部端点改为环境变量驱动，默认禁用。

**修改文件：**

| 文件 | 变更 |
|------|------|
| `src/services/analytics/datadog.ts` | `DATADOG_LOGS_ENDPOINT` 和 `DATADOG_CLIENT_TOKEN` 从硬编码常量改为读取 `process.env.DATADOG_LOGS_ENDPOINT` / `process.env.DATADOG_API_KEY`，默认空字符串；`initializeDatadog()` 增加守卫：端点或 Token 未配置时直接返回 `false` |
| `docs/telemetry-remote-config-audit.md` | 更新第 1 节，反映新的环境变量配置方式 |

**效果：** 默认不向任何外部发送数据；设置两个环境变量即可接入自己的 Datadog 实例。原有 `DISABLE_TELEMETRY`、privacy level、sink killswitch 等防线保留。

**用法：** `DATADOG_LOGS_ENDPOINT=https://http-intake.logs.datadoghq.com/api/v2/logs DATADOG_API_KEY=xxx bun run dev`

---

## Sentry 错误上报集成 (2026-04-03)

恢复反编译过程中被移除的 Sentry 集成。通过 `SENTRY_DSN` 环境变量控制，未设置时所有函数为 no-op，不影响正常运行。

**新增文件：**

| 文件 | 说明 |
|------|------|
| `src/utils/sentry.ts` | 核心模块：`initSentry()`、`captureException()`、`setTag()`、`setUser()`、`closeSentry()`；`beforeSend` 过滤 auth headers 等敏感信息；忽略 ECONNREFUSED/AbortError 等非 actionable 错误 |

**修改文件：**

| 文件 | 变更 |
|------|------|
| `src/utils/errorLogSink.ts` | `logErrorImpl` 末尾调用 `captureException()`，所有经 `logError()` 的错误自动上报 |
| `src/components/SentryErrorBoundary.ts` | 添加 `componentDidCatch`，React 组件渲染错误上报到 Sentry（含 componentStack） |
| `src/entrypoints/init.ts` | 网络配置后调用 `initSentry()` |
| `src/utils/gracefulShutdown.ts` | 优雅关闭时 flush Sentry 事件 |
| `src/screens/REPL.tsx:2809` | `fireCompanionObserver` 调用增加 `typeof` 防护，BUDDY feature 启用时不报错（TODO: 待实现） |
| `package.json` | devDependencies 新增 `@sentry/node` |

**用法：** `SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx bun run dev`

---

## 默认关闭自动更新 (2026-04-03)

修改 `src/utils/config.ts` — `getAutoUpdaterDisabledReason()`，在原有检查逻辑前插入默认关闭逻辑。未设置 `ENABLE_AUTOUPDATER=1` 时，自动更新始终返回 `{ type: 'config' }` 被禁用。

**启用方式：** `ENABLE_AUTOUPDATER=1 bun run dev`

**原因：** 本项目为逆向工程/反编译版本，自动更新会覆盖本地修改的代码。

**同时新增文档：** `docs/auto-updater.md` — 自动更新机制完整审计，涵盖三种安装类型的更新策略、后台轮询、版本门控、原生安装器架构、文件锁、配置项等。

---

## WebSearch Bing 适配器补全 (2026-04-03)

原始 `WebSearchTool` 仅支持 Anthropic API 服务端搜索（`web_search_20250305` server tool），在非官方 API 端点（第三方代理）下搜索功能不可用。本次改动引入适配器架构，新增 Bing 搜索页面解析作为 fallback。

**新增文件：**

| 文件 | 说明 |
|------|------|
| `src/tools/WebSearchTool/adapters/types.ts` | 适配器接口定义：`WebSearchAdapter`、`SearchResult`、`SearchOptions`、`SearchProgress` |
| `src/tools/WebSearchTool/adapters/apiAdapter.ts` | API 适配器 — 将原有 `queryModelWithStreaming` 逻辑封装为 `ApiSearchAdapter` |
| `src/tools/WebSearchTool/adapters/bingAdapter.ts` | Bing 适配器 — 直接抓取 Bing HTML，正则提取搜索结果 |
| `src/tools/WebSearchTool/adapters/index.ts` | 适配器工厂 — 根据环境变量 / API Base URL 选择后端 |
| `src/tools/WebSearchTool/__tests__/bingAdapter.test.ts` | Bing 适配器单元测试（32 cases：decodeHtmlEntities、extractBingResults、search mock） |
| `src/tools/WebSearchTool/__tests__/bingAdapter.integration.ts` | Bing 适配器集成测试 — 真实网络请求验证 |

**重构文件：**

| 文件 | 变更 |
|------|------|
| `src/tools/WebSearchTool/WebSearchTool.ts` | 从直接调用 API 改为 `createAdapter()` 工厂模式；`isEnabled()` 始终返回 true；删除 ~200 行内联 API 调用逻辑 |
| `src/tools/WebFetchTool/utils.ts` | `skipWebFetchPreflight` 默认值从 `!undefined`（即 true）改为显式 `=== false`，使域名预检默认启用 |

**Bing 适配器关键技术细节：**

1. **反爬绕过**：使用完整 Edge 浏览器请求头（含 `Sec-Ch-Ua`、`Sec-Fetch-*` 等 13 个标头），避免 Bing 返回 JS 渲染的空页面；`setmkt=en-US` 参数强制美式英语市场，避免 IP 地理定位导致的区域化结果（德语论坛、新加坡金价等不相关内容）
2. **URL 解码**（`resolveBingUrl()`）：Bing 返回的重定向 URL（`bing.com/ck/a?...&u=a1aHR0cHM6Ly9...`）中 `u` 参数为 base64 编码的真实 URL，需解码后使用
3. **摘要提取**（`extractSnippet()`）：三级降级策略 — `b_lineclamp` → `b_caption <p>` → `b_caption` 直接文本
4. **HTML 实体解码**（`decodeHtmlEntities()`）：处理 7 种常见 HTML 实体
5. **域过滤**：客户端侧 `allowedDomains` / `blockedDomains` 过滤，支持子域名匹配

**当前状态**：`adapters/index.ts` 中 `createAdapter()` 硬编码返回 `BingSearchAdapter`，跳过了 API/Bing 自动选择逻辑（原逻辑被注释保留）。未来可通过取消注释恢复自动选择。

---

## 移除反蒸馏机制 (2026-04-02)

项目中发现三处 anti-distillation 相关代码，全部移除。

**移除内容：**
- `src/services/api/claude.ts` — 删除 fake_tools 注入逻辑（原第 302-314 行），该代码通过 `ANTI_DISTILLATION_CC` feature flag 在 API 请求中注入 `anti_distillation: ['fake_tools']`，使服务端在响应中混入虚假工具调用以污染蒸馏数据
- `src/utils/betas.ts` — 删除 connector-text summarization beta 注入块及 `SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER` 导入，该机制让服务端缓冲工具调用间的 assistant 文本并摘要化返回
- `src/constants/betas.ts` — 删除 `SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER` 常量定义（原第 23-25 行）
- `src/utils/streamlinedTransform.ts` — 注释从 "distillation-resistant" 改为 "compact"，streamlined 模式本身是有效的输出压缩功能，仅修正描述

---

## Buddy 命令合入 + Feature Flag 规范修正 (2026-04-02)

合入 `pr/smallflyingpig/36` 分支（支持 buddy 命令 + 修复 rehatch），并修正 feature flag 使用方式。

**合入内容（来自 PR）：**
- `src/commands/buddy/buddy.ts` — 新增 `/buddy` 命令，支持 hatch / rehatch / pet / mute / unmute 子命令
- `src/commands/buddy/index.ts` — 从 stub 改为正确的 `Command` 类型导出
- `src/buddy/companion.ts` — 新增 `generateSeed()`，`getCompanion()` 支持 seed 驱动的可复现 rolling
- `src/buddy/types.ts` — `CompanionSoul` 增加 `seed?` 字段

**合并后修正：**
- `src/entrypoints/cli.tsx` — PR 硬编码了 `const feature = (name) => name === "BUDDY"`，违反 feature flag 规范，恢复为标准 `import { feature } from 'bun:bundle'`
- `src/commands.ts` — PR 用静态 `import buddy` 绕过了 feature gate，恢复为 `feature('BUDDY') ? require(...) : null` + 条件展开
- `src/commands/buddy/buddy.ts` — 删除未使用的 `companionInfoText` 函数和多余的 `Roll`/`SPECIES` import
- `CLAUDE.md` — 重写 Feature Flag System 章节，明确规范：代码中统一用 `import { feature } from 'bun:bundle'`，启用走环境变量 `FEATURE_<NAME>=1`

**用法：** `FEATURE_BUDDY=1 bun run dev`

---

## Auto Mode 补全 (2026-04-02)

反编译丢失了 auto mode 分类器的三个 prompt 模板文件，代码逻辑完整但无法运行。

**新增：**
- `yolo-classifier-prompts/auto_mode_system_prompt.txt` — 主系统提示词
- `yolo-classifier-prompts/permissions_external.txt` — 外部权限模板（用户规则替换默认值）
- `yolo-classifier-prompts/permissions_anthropic.txt` — 内部权限模板（用户规则追加）

**改动：**
- `scripts/dev.ts` + `build.ts` — 扫描 `FEATURE_*` 环境变量注入 Bun `--feature`
- `cli.tsx` — 启动时打印已启用的 feature
- `permissionSetup.ts` — `AUTO_MODE_ENABLED_DEFAULT` 由 `feature('TRANSCRIPT_CLASSIFIER')` 决定，开 feature 即开 auto mode
- `docs/safety/auto-mode.mdx` — 补充 prompt 模板章节

**用法：** `FEATURE_TRANSCRIPT_CLASSIFIER=1 bun run dev`

**注意：** prompt 模板为重建产物。

---

## USER_TYPE=ant TUI 修复 (2026-04-02)

`global.d.ts` 声明的全局函数在反编译版本运行时未定义，导致 `USER_TYPE=ant` 时 TUI 崩溃。

修复方式：显式 import / 本地 stub / 全局 stub / 新建 stub 文件。涉及文件：
`cli.tsx`, `model.ts`, `context.ts`, `effort.ts`, `thinking.ts`, `undercover.ts`, `Spinner.tsx`, `AntModelSwitchCallout.tsx`(新建), `UndercoverAutoCallout.tsx`(新建)

注意：
- `USER_TYPE=ant` 启用 alt-screen 全屏模式，中心区域满屏是预期行为
- `global.d.ts` 中剩余未 stub 的全局函数（`getAntModels` 等）遇到 `X is not defined` 时按同样模式处理

---

## /login 添加 Custom Platform 选项 (2026-04-03)

在 `/login` 命令的登录方式选择列表中新增 "Custom Platform" 选项（位于第一位），允许用户直接在终端配置第三方 API 兼容服务的 Base URL、API Key 和三种模型映射，保存到 `~/.claude/settings.json`。

**修改文件：**

| 文件 | 变更 |
|------|------|
| `src/components/ConsoleOAuthFlow.tsx` | `OAuthStatus` 类型新增 `custom_platform` state（含 `baseUrl`、`apiKey`、`haikuModel`、`sonnetModel`、`opusModel`、`activeField`）；`idle` case Select 选项新增 Custom Platform 并排第一位；新增 `custom_platform` case 渲染 5 字段表单（Tab/Shift+Tab 切换、focus 高亮、Enter 跳转/保存）；Select onChange 处理 `custom_platform` 初始状态（从 `process.env` 预填当前值）；`OAuthStatusMessageProps` 类型及调用处新增 `onDone` prop |
| `src/components/ConsoleOAuthFlow.tsx` | 新增 `updateSettingsForSource` import |

**UI 交互：**
- 5 个字段同屏：Base URL、API Key、Haiku Model、Sonnet Model、Opus Model
- 当前活动字段的标签用 `suggestion` 背景色 + `inverseText` 反色高亮
- Tab / Shift+Tab 在字段间切换，各自保留输入值
- 每个字段按 Enter 跳到下一个，最后一个字段 (Opus) 按 Enter 保存
- 模型字段自动从 `process.env` 读取当前配置作为预填值，无值则空
- 保存时调用 `updateSettingsForSource('userSettings', { env })` 写入 settings.json，同时更新 `process.env`

**保存的 settings.json env 字段：**
```json
{
  "ANTHROPIC_BASE_URL": "...",
  "ANTHROPIC_AUTH_TOKEN": "...",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL": "...",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "...",
  "ANTHROPIC_DEFAULT_OPUS_MODEL": "..."
}
```

非空字段才写入，保存后立即生效（`onDone()` 触发 `onChangeAPIKey()` 刷新 API 客户端）。

# DEV-LOG

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

The original `WebSearchTool` only supported Anthropic API server-side search (`web_search_20250305` server tool), making the search feature unavailable on unofficial API endpoints (third-party proxies). This change introduces an adapter architecture with Bing search page parsing as a fallback.

**New files:**

| File | Description |
|------|-------------|
| `src/tools/WebSearchTool/adapters/types.ts` | Adapter interface definitions: `WebSearchAdapter`, `SearchResult`, `SearchOptions`, `SearchProgress` |
| `src/tools/WebSearchTool/adapters/apiAdapter.ts` | API adapter — wraps the existing `queryModelWithStreaming` logic into `ApiSearchAdapter` |
| `src/tools/WebSearchTool/adapters/bingAdapter.ts` | Bing adapter — directly scrapes Bing HTML, extracts search results via regex |
| `src/tools/WebSearchTool/adapters/index.ts` | Adapter factory — selects backend based on environment variables / API Base URL |
| `src/tools/WebSearchTool/__tests__/bingAdapter.test.ts` | Bing adapter unit tests (32 cases: decodeHtmlEntities, extractBingResults, search mock) |
| `src/tools/WebSearchTool/__tests__/bingAdapter.integration.ts` | Bing adapter integration tests — real network request validation |

**Refactored files:**

| File | Changes |
|------|---------|
| `src/tools/WebSearchTool/WebSearchTool.ts` | Changed from direct API calls to `createAdapter()` factory pattern; `isEnabled()` always returns true; removed ~200 lines of inline API call logic |
| `src/tools/WebFetchTool/utils.ts` | `skipWebFetchPreflight` default changed from `!undefined` (i.e., true) to explicit `=== false`, enabling domain preflight checks by default |

**Bing adapter key technical details:**

1. **Anti-scraping bypass**: Uses full Edge browser request headers (including 13 headers like `Sec-Ch-Ua`, `Sec-Fetch-*`, etc.) to prevent Bing from returning JS-rendered empty pages; `setmkt=en-US` parameter forces US English market to avoid IP geolocation-based regional results (German forums, Singapore gold prices, etc.)
2. **URL decoding** (`resolveBingUrl()`): Bing's redirect URLs (`bing.com/ck/a?...&u=a1aHR0cHM6Ly9...`) contain base64-encoded real URLs in the `u` parameter that need to be decoded before use
3. **Snippet extraction** (`extractSnippet()`): Three-tier fallback strategy — `b_lineclamp` → `b_caption <p>` → `b_caption` direct text
4. **HTML entity decoding** (`decodeHtmlEntities()`): Handles 7 common HTML entities
5. **Domain filtering**: Client-side `allowedDomains` / `blockedDomains` filtering with subdomain matching support

**Current status**: `createAdapter()` in `adapters/index.ts` is hardcoded to return `BingSearchAdapter`, skipping the API/Bing auto-selection logic (original logic preserved in comments). Auto-selection can be restored by uncommenting in the future.

---

## Anti-Distillation Mechanism Removal (2026-04-02)

Found three anti-distillation related code sections in the project — all removed.

**Removed content:**
- `src/services/api/claude.ts` — Removed fake_tools injection logic (originally lines 302-314). This code injected `anti_distillation: ['fake_tools']` into API requests via the `ANTI_DISTILLATION_CC` feature flag, causing the server to mix in fake tool calls in responses to pollute distillation data
- `src/utils/betas.ts` — Removed connector-text summarization beta injection block and `SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER` import. This mechanism had the server buffer assistant text between tool calls and return it in summarized form
- `src/constants/betas.ts` — Removed `SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER` constant definition (originally lines 23-25)
- `src/utils/streamlinedTransform.ts` — Changed comment from "distillation-resistant" to "compact". The streamlined mode itself is a valid output compression feature; only the description was corrected

---

## Buddy Command Merge + Feature Flag Convention Fix (2026-04-02)

Merged `pr/smallflyingpig/36` branch (buddy command support + rehatch fix) and fixed feature flag usage patterns.

**Merged content (from PR):**
- `src/commands/buddy/buddy.ts` — New `/buddy` command supporting hatch / rehatch / pet / mute / unmute subcommands
- `src/commands/buddy/index.ts` — Changed from stub to proper `Command` type export
- `src/buddy/companion.ts` — Added `generateSeed()`, `getCompanion()` supports seed-driven reproducible rolling
- `src/buddy/types.ts` — Added `seed?` field to `CompanionSoul`

**Post-merge fixes:**
- `src/entrypoints/cli.tsx` — PR had hardcoded `const feature = (name) => name === "BUDDY"`, violating feature flag conventions. Restored to standard `import { feature } from 'bun:bundle'`
- `src/commands.ts` — PR used static `import buddy` to bypass feature gate. Restored to `feature('BUDDY') ? require(...) : null` + conditional spread
- `src/commands/buddy/buddy.ts` — Removed unused `companionInfoText` function and unnecessary `Roll`/`SPECIES` imports
- `CLAUDE.md` — Rewrote Feature Flag System section with clear conventions: use `import { feature } from 'bun:bundle'` in code, enable via `FEATURE_<NAME>=1` environment variable

**Usage:** `FEATURE_BUDDY=1 bun run dev`

---

## Auto Mode Completion (2026-04-02)

Decompilation lost three prompt template files for the auto mode classifier. Code logic was complete but couldn't run.

**Added:**
- `yolo-classifier-prompts/auto_mode_system_prompt.txt` — Main system prompt
- `yolo-classifier-prompts/permissions_external.txt` — External permissions template (user rules replace defaults)
- `yolo-classifier-prompts/permissions_anthropic.txt` — Internal permissions template (user rules appended)

**Changes:**
- `scripts/dev.ts` + `build.ts` — Scan `FEATURE_*` environment variables and inject as Bun `--feature` flags
- `cli.tsx` — Print enabled features on startup
- `permissionSetup.ts` — `AUTO_MODE_ENABLED_DEFAULT` determined by `feature('TRANSCRIPT_CLASSIFIER')`. Enabling the feature enables auto mode
- `docs/safety/auto-mode.mdx` — Added prompt template section

**Usage:** `FEATURE_TRANSCRIPT_CLASSIFIER=1 bun run dev`

**Note:** Prompt templates are reconstructed artifacts.

---

## USER_TYPE=ant TUI Fix (2026-04-02)

Global functions declared in `global.d.ts` were undefined at runtime in the decompiled version, causing TUI crashes when `USER_TYPE=ant`.

Fix approach: explicit imports / local stubs / global stubs / new stub files. Files involved:
`cli.tsx`, `model.ts`, `context.ts`, `effort.ts`, `thinking.ts`, `undercover.ts`, `Spinner.tsx`, `AntModelSwitchCallout.tsx` (new), `UndercoverAutoCallout.tsx` (new)

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

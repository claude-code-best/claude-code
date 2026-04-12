# Claude Code 远程服务器依赖

> 只列出代码中实际发起网络请求的远程服务。本地服务、npm 包依赖、展示用 URL 不包含在内。

## 总览表

| # | 服务 | 远程端点 | 协议 | 状态 |
|---|---|---|---|---|
| 1 | Anthropic API | `api.anthropic.com` | HTTPS | 默认启用 |
| 2 | AWS Bedrock | `bedrock-runtime.*.amazonaws.com` | HTTPS | 需 `CLAUDE_CODE_USE_BEDROCK=1` |
| 3 | Google Vertex AI | `{region}-aiplatform.googleapis.com` | HTTPS | 需 `CLAUDE_CODE_USE_VERTEX=1` |
| 4 | Azure Foundry | `{resource}.services.ai.azure.com` | HTTPS | 需 `CLAUDE_CODE_USE_FOUNDRY=1` |
| 5 | OAuth (Anthropic) | `platform.claude.com`, `claude.com`, `claude.ai` | HTTPS | 用户登录时 |
| 6 | GrowthBook | `api.anthropic.com` (remoteEval) | HTTPS | 默认启用 |
| 7 | Sentry | 可配置 (`SENTRY_DSN`) | HTTPS | 需设环境变量 |
| 8 | Datadog | 可配置 (`DATADOG_LOGS_ENDPOINT`) | HTTPS | 需设环境变量 |
| 9 | OpenTelemetry Collector | 可配置 (`OTEL_EXPORTER_OTLP_ENDPOINT`) | gRPC/HTTP | 需设环境变量 |
| 10 | 1P Event Logging | `api.anthropic.com/api/event_logging/batch` | HTTPS | 默认启用 |
| 11 | BigQuery Metrics | `api.anthropic.com/api/claude_code/metrics` | HTTPS | 默认启用 |
| 12 | MCP Proxy | `mcp-proxy.anthropic.com` | HTTPS+WS | 使用 MCP 工具时 |
| 13 | MCP Registry | `api.anthropic.com/mcp-registry` | HTTPS | 查询 MCP 服务器时 |
| 14 | Web Search Pages | `www.bing.com`, `search.brave.com` | HTTPS | WebSearch 工具，可通过 `WEB_SEARCH_ADAPTER=bing|brave` 切换 |
| 15 | Google Cloud Storage (更新) | `storage.googleapis.com` | HTTPS | 版本检查 |
| 16 | GitHub Raw (Changelog/Stats) | `raw.githubusercontent.com` | HTTPS | 更新提示 |
| 17 | Claude in Chrome Bridge | `bridge.claudeusercontent.com` | WSS | Chrome 集成 |
| 18 | CCR Upstream Proxy | `api.anthropic.com` | WS | CCR 远程会话 |
| 19 | Voice STT | `api.anthropic.com/api/ws/...` | WSS | Voice Mode |
| 20 | Desktop App Download | `claude.ai/api/desktop/...` | HTTPS | 下载引导 |

---

## 详细说明

### 1. Anthropic Messages API

核心 LLM 推理服务，发送对话消息、接收流式响应。

- **端点**: `https://api.anthropic.com` (生产) / `https://api-staging.anthropic.com` (staging)
- **覆盖**: `ANTHROPIC_BASE_URL` 环境变量
- **认证**: API Key / OAuth Token
- **文件**: `src/services/api/client.ts`, `src/services/api/claude.ts`

### 2. AWS Bedrock

- **端点**: `bedrock-runtime.{region}.amazonaws.com`
- **认证**: AWS 凭证链 / `AWS_BEARER_TOKEN_BEDROCK`
- **文件**: `src/services/api/client.ts:153-190`, `src/utils/aws.ts`

### 3. Google Vertex AI

- **端点**: `{region}-aiplatform.googleapis.com`
- **认证**: `GoogleAuth` + `cloud-platform` scope
- **文件**: `src/services/api/client.ts:228-298`

### 4. Azure Foundry

- **端点**: `https://{resource}.services.ai.azure.com/anthropic/v1/messages`
- **认证**: API Key 或 Azure AD `DefaultAzureCredential`
- **文件**: `src/services/api/client.ts:191-220`

### 5. OAuth

OAuth 2.0 + PKCE 授权码流程。

- **端点**:
  - `https://platform.claude.com/oauth/authorize` — 授权页
  - `https://claude.com/cai/oauth/authorize` — Claude.ai 授权
  - `https://platform.claude.com/v1/oauth/token` — Token 交换
  - `https://api.anthropic.com/api/oauth/claude_cli/create_api_key` — 创建 API Key
  - `https://api.anthropic.com/api/oauth/claude_cli/roles` — 获取角色
  - `https://claude.ai/oauth/claude-code-client-metadata` — MCP 客户端元数据
  - `https://claude.fedstart.com` — FedStart 政府部署
- **文件**: `src/constants/oauth.ts`, `src/services/oauth/`

### 6. GrowthBook (功能开关)

- **端点**: `https://api.anthropic.com/` (remoteEval 模式) 或 `CLAUDE_GB_ADAPTER_URL`
- **SDK Keys**: `sdk-zAZezfDKGoZuXXKe` (外部), `sdk-xRVcrliHIlrg4og4` (ant prod), `sdk-yZQvlplybuXjYh6L` (ant dev)
- **文件**: `src/services/analytics/growthbook.ts`, `src/constants/keys.ts`

### 7. Sentry (错误追踪)

- **激活**: 设置 `SENTRY_DSN` (默认未配置)
- **行为**: 仅错误上报，自动过滤敏感 header
- **文件**: `src/utils/sentry.ts`

### 8. Datadog (日志)

- **激活**: 同时设 `DATADOG_LOGS_ENDPOINT` + `DATADOG_API_KEY` (默认未配置)
- **文件**: `src/services/analytics/datadog.ts`

### 9. OpenTelemetry Collector

- **激活**: `CLAUDE_CODE_ENABLE_TELEMETRY=1` 或 `OTEL_*` 环境变量
- **协议**: gRPC / HTTP / Protobuf，支持 OTLP 和 Prometheus 导出
- **文件**: `src/utils/telemetry/instrumentation.ts`

### 10. 1P Event Logging (内部事件)

- **端点**: `https://api.anthropic.com/api/event_logging/batch`
- **协议**: 批量导出 (10s 间隔, 每批 200 事件)
- **文件**: `src/services/analytics/firstPartyEventLoggingExporter.ts`

### 11. BigQuery Metrics

- **端点**: `https://api.anthropic.com/api/claude_code/metrics`
- **文件**: `src/utils/telemetry/bigqueryExporter.ts`

### 12. MCP Proxy

Anthropic 托管的 MCP 服务器代理。

- **端点**: `https://mcp-proxy.anthropic.com/v1/mcp/{server_id}`
- **认证**: Claude.ai OAuth tokens
- **文件**: `src/services/mcp/client.ts`, `src/constants/oauth.ts`

### 13. MCP Registry

获取官方 MCP 服务器列表。

- **端点**: `https://api.anthropic.com/mcp-registry/v0/servers?version=latest&visibility=commercial`
- **文件**: `src/services/mcp/officialRegistry.ts`

### 14. Web Search Pages

WebSearch 工具支持直接抓取 Bing 搜索结果页面，也支持通过 Brave 的 LLM Context API
获取搜索上下文；可通过 `WEB_SEARCH_ADAPTER=bing|brave` 显式切换后端。

- **Bing 端点**: `https://www.bing.com/search?q={query}&setmkt=en-US`
- **Brave 端点**: `https://api.search.brave.com/res/v1/llm/context?q={query}`
- **文件**:
  - `src/tools/WebSearchTool/adapters/bingAdapter.ts`
  - `src/tools/WebSearchTool/adapters/braveAdapter.ts`

另外还有 Domain Blocklist 查询:
- **端点**: `https://api.anthropic.com/api/web/domain_info?domain={domain}`
- **文件**: `src/tools/WebFetchTool/utils.ts`

### 15. Google Cloud Storage (自动更新)

- **端点**: `https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases`
- **文件**: `src/utils/autoUpdater.ts`

### 16. GitHub Raw Content

- **端点**: `https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md`
- **端点**: `https://raw.githubusercontent.com/anthropics/claude-plugins-official/refs/heads/stats/stats/plugin-installs.json`
- **文件**: `src/utils/releaseNotes.ts`, `src/utils/plugins/installCounts.ts`

### 17. Claude in Chrome Bridge

- **端点**: `wss://bridge.claudeusercontent.com` (生产) / `wss://bridge-staging.claudeusercontent.com` (staging)
- **文件**: `src/utils/claudeInChrome/mcpServer.ts`

### 18. CCR Upstream Proxy

- **端点**: `ws://api.anthropic.com/v1/code/upstreamproxy/ws`
- **激活**: `CLAUDE_CODE_REMOTE=1` + `CCR_UPSTREAM_PROXY_ENABLED=1`
- **文件**: `src/upstreamproxy/upstreamproxy.ts`

### 19. Voice STT

- **端点**: `wss://api.anthropic.com/api/ws/...`
- **文件**: `src/services/voiceStreamSTT.ts`

### 20. Desktop App Download

- **端点**: `https://claude.ai/api/desktop/win32/x64/exe/latest/redirect` (Windows)
- **端点**: `https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect` (macOS)
- **文件**: `src/components/DesktopHandoff.tsx`

---

## Anthropic API 辅助端点汇总

以下端点都挂在 `api.anthropic.com` 上，按功能分类:

| 端点路径 | 用途 | 文件 |
|---|---|---|
| `/api/event_logging/batch` | 事件批量上报 | `src/services/analytics/firstPartyEventLoggingExporter.ts` |
| `/api/claude_code/metrics` | BigQuery 指标导出 | `src/utils/telemetry/bigqueryExporter.ts` |
| `/api/oauth/claude_cli/create_api_key` | 创建 API Key | `src/constants/oauth.ts` |
| `/api/oauth/claude_cli/roles` | 获取用户角色 | `src/constants/oauth.ts` |
| `/api/oauth/accounts/grove` | 通知设置 | `src/services/api/grove.ts` |
| `/api/oauth/organizations/{id}/referral/*` | 推荐活动 | `src/services/api/referral.ts` |
| `/api/oauth/organizations/{id}/overage_credit_grant` | 超额信用 | `src/services/api/overageCreditGrant.ts` |
| `/api/oauth/organizations/{id}/admin_requests` | 管理请求 | `src/services/api/adminRequests.ts` |
| `/api/web/domain_info?domain={}` | 域名安全检查 | `src/tools/WebFetchTool/utils.ts` |
| `/api/claude_code/settings` | 设置同步 | `src/services/settingsSync/index.ts` |
| `/api/claude_code/managed_settings` | 企业托管设置 (1h 轮询) | `src/services/remoteManagedSettings/index.ts` |
| `/api/claude_code/team_memory?repo={}` | 团队记忆同步 | `src/services/teamMemorySync/index.ts` |
| `/api/auth/trusted_devices` | 可信设备注册 | `src/bridge/trustedDevice.ts` |
| `/api/organizations/{id}/claude_code/buddy_react` | Companion 反应 | `src/buddy/companionReact.ts` |
| `/mcp-registry/v0/servers` | MCP 服务器注册表 | `src/services/mcp/officialRegistry.ts` |
| `/v1/files` | 文件上传/下载 | `src/services/api/filesApi.ts` |
| `/v1/sessions/{id}/events` | 会话历史 | `src/assistant/sessionHistory.ts` |
| `/v1/code/triggers` | 远程触发器 | `src/tools/RemoteTriggerTool/RemoteTriggerTool.ts` |
| `/v1/organizations/{id}/mcp_servers` | 组织 MCP 配置 | `src/services/mcp/claudeai.ts` |

## 非 Anthropic 远程域名汇总

| 域名 | 服务 | 协议 |
|---|---|---|
| `bedrock-runtime.*.amazonaws.com` | AWS Bedrock | HTTPS |
| `{region}-aiplatform.googleapis.com` | Google Vertex AI | HTTPS |
| `{resource}.services.ai.azure.com` | Azure Foundry | HTTPS |
| `www.bing.com` | Bing 搜索 | HTTPS |
| `search.brave.com` | Brave 搜索 | HTTPS |
| `storage.googleapis.com` | 自动更新 | HTTPS |
| `raw.githubusercontent.com` | Changelog / 插件统计 | HTTPS |
| `bridge.claudeusercontent.com` | Chrome Bridge | WSS |
| `platform.claude.com` | OAuth 授权页 | HTTPS |
| `claude.com` / `claude.ai` | OAuth / 下载 | HTTPS |
| `claude.fedstart.com` | FedStart OAuth | HTTPS |

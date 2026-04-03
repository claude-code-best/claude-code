# 遥测与远程配置下发系统审计（除 Sentry 外）

## 1. Datadog 日志

**文件**: `src/services/analytics/datadog.ts`

- **端点**: 通过环境变量 `DATADOG_LOGS_ENDPOINT` 配置（默认为空，即禁用）
- **客户端 token**: 通过环境变量 `DATADOG_API_KEY` 配置（默认为空，即禁用）
- **行为**: 批量发送日志（15s flush 间隔，100 条上限），仅限 1P（直连 Anthropic API）用户
- **事件白名单**: `tengu_*` 系列事件（启动、错误、OAuth、工具调用等 ~35 种）
- **基线数据**: 收集 model、platform、arch、version、userBucket（用户 hash 到 30 个桶）等
- **仅限**: `NODE_ENV === 'production'`
- **配置示例**: `DATADOG_LOGS_ENDPOINT=https://http-intake.logs.datadoghq.com/api/v2/logs DATADOG_API_KEY=xxx bun run dev`

## 2. 1P 事件日志（BigQuery）

**文件**: `src/services/analytics/firstPartyEventLogger.ts` + `firstPartyEventLoggingExporter.ts`

- **端点**: `https://api.anthropic.com/api/event_logging/batch`（staging 可切换）
- **行为**: 使用 OpenTelemetry SDK 的 `BatchLogRecordProcessor`，批量导出到 Anthropic 自有的 BQ 管道
- **数据**: 完整事件 metadata（session、model、env context、用户数据、subscription type 等）
- **弹性**: 本地磁盘持久化失败事件（JSONL），二次退避重试，最多 8 次尝试
- **Proto schema**: 事件序列化为 `ClaudeCodeInternalEvent` / `GrowthbookExperimentEvent` protobuf 格式
- **Auth fallback**: 401 时自动去掉 auth header 重试

## 3. GrowthBook 远程 Feature Flags / 动态配置

**文件**: `src/services/analytics/growthbook.ts`

- **服务端**: `https://api.anthropic.com/`（remote eval 模式）
- **行为**: 启动时拉取全量 feature flags，每 6h（外部用户）/ 20min（ant）定时刷新
- **磁盘缓存**: feature values 写入 `~/.claude.json` 的 `cachedGrowthBookFeatures`
- **用途**:
  - 控制 Datadog 开关（`tengu_log_datadog_events`）
  - 控制事件采样率（`tengu_event_sampling_config`）
  - 控制 sink killswitch（`tengu_frond_boric`）
  - 控制 BQ batch 配置（`tengu_1p_event_batch_config`）
  - 控制版本上限/自动更新 kill switch
  - 控制远程管理设置的安全检查 gate
- **用户属性**: 发送 deviceId, sessionId, organizationUUID, accountUUID, email, subscriptionType 等

## 4. Remote Managed Settings（企业远程配置下发）

**文件**: `src/services/remoteManagedSettings/index.ts`

- **端点**: `{BASE_API_URL}/api/claude_code/settings`
- **行为**: 企业用户配置下发，支持 ETag/304 缓存，每小时后台轮询
- **安全**: 变更包含"危险设置"时弹窗让用户确认
- **适用**: API key 用户全部可拉取；OAuth 用户仅 Enterprise/C4E/Team
- **Fail-open**: 请求失败时使用本地缓存，无缓存则跳过

## 5. Settings Sync（设置同步）

**文件**: `src/services/settingsSync/index.ts`

- **端点**: `{BASE_API_URL}/api/claude_code/user_settings`
- **行为**: CLI 上传本地设置/memory 到远程；CCR 模式从远程下载
- **同步内容**: userSettings、userMemory、projectSettings、projectMemory
- **Feature gate**: `UPLOAD_USER_SETTINGS` / `DOWNLOAD_USER_SETTINGS`
- **文件大小限制**: 500KB/文件

## 6. OpenTelemetry 三方遥测

**文件**: `src/utils/telemetry/instrumentation.ts`

- **行为**: 完整的 OTEL SDK 初始化，支持 metrics / logs / traces 三种信号
- **协议**: gRPC / http-json / http-protobuf（通过 `OTEL_EXPORTER_OTLP_PROTOCOL` 选择）
- **exporter**: console / otlp / prometheus
- **触发**: `CLAUDE_CODE_ENABLE_TELEMETRY=1` 环境变量
- **增强 trace**: `feature('ENHANCED_TELEMETRY_BETA')` + GrowthBook gate `enhanced_telemetry_beta`

## 7. BigQuery Metrics Exporter（内部指标）

**文件**: `src/utils/telemetry/bigqueryExporter.ts`

- **端点**: `https://api.anthropic.com/api/claude_code/metrics`
- **行为**: 定期（5min 间隔）导出 OTel metrics 到内部 BQ
- **适用**: API 客户、C4E/Team 订阅者
- **组织级 opt-out**: 通过 `checkMetricsEnabled()` API 查询（见下方第 8 项）

## 8. 组织级 Metrics Opt-out 查询

**文件**: `src/services/api/metricsOptOut.ts`

- **端点**: `https://api.anthropic.com/api/claude_code/organizations/metrics_enabled`
- **行为**: 查询组织是否启用了 metrics，二级缓存（内存 1h + 磁盘 24h）
- **作用**: 控制 BigQuery metrics exporter 是否导出

## 9. Startup Profiling

**文件**: `src/utils/startupProfiler.ts`

- **行为**: 采样启动性能数据（100% ant / 0.5% 外部），通过 `logEvent('tengu_startup_perf')` 上报
- **详细模式**: `CLAUDE_CODE_PROFILE_STARTUP=1` 输出完整性能报告到文件

## 10. Beta Session Tracing

**文件**: `src/utils/telemetry/betaSessionTracing.ts`

- **行为**: 详细调试 trace，发送 system prompt、model output、tool schema 等
- **触发**: `ENABLE_BETA_TRACING_DETAILED=1` + `BETA_TRACING_ENDPOINT`
- **外部用户**: SDK/headless 模式自动启用，交互模式需要 GrowthBook gate `tengu_trace_lantern`

## 11. Bridge Poll Config（远程轮询间隔配置）

**文件**: `src/bridge/pollConfig.ts`

- **行为**: 从 GrowthBook 拉取 bridge 轮询间隔配置（`tengu_bridge_poll_interval_config`）
- **控制**: 单会话和多会话的各种 poll interval

## 12. Plugin/MCP 遥测

**文件**: `src/utils/plugins/fetchTelemetry.ts`

- **行为**: 记录 plugin/marketplace 的网络请求（安装计数、marketplace clone/pull 等）
- **事件**: `tengu_plugin_remote_fetch`，包含 host（已脱敏）、outcome、duration

---

## 全局禁用方式

```bash
# 禁用所有遥测（Datadog + 1P + 调查问卷）
DISABLE_TELEMETRY=1

# 更激进：禁用所有非必要网络（包括自动更新、grove、release notes 等）
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

# 3P 提供商自动禁用
CLAUDE_CODE_USE_BEDROCK=1  # 或 VERTEX/FOUNDRY
```

`src/utils/privacyLevel.ts` 是集中控制点，三个级别：`default < no-telemetry < essential-traffic`。

---

## 数据流架构

```
用户操作 → logEvent()
              ↓
         sink.ts (路由层)
           ↙        ↘
   trackDatadogEvent()   logEventTo1P()
          ↓                      ↓
   Datadog HTTP API     OTel BatchLogRecordProcessor
   (us5.datadoghq.com)       ↓
                    FirstPartyEventLoggingExporter
                             ↓
                    api.anthropic.com/api/event_logging/batch
                             ↓
                    BigQuery (ClaudeCodeInternalEvent proto)
```

GrowthBook 作为独立通道，同时驱动上述两个 sink 的开关和配置。

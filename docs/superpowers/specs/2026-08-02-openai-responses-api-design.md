# 通用 OpenAI Responses API 支持设计

## 目标

为 API Key 驱动的 OpenAI 兼容 Provider 增加原生 Responses API 支持，使上游端点可按配置调用 `/responses`，并将其 SSE 事件适配为现有 Anthropic 内部流事件。

## 配置契约

- `UPSTREAM_API_MODEL=chat_completions`：默认值，沿用 `POST {OPENAI_BASE_URL}/chat/completions`。
- `UPSTREAM_API_MODEL=responses`：新增模式，调用 `POST {OPENAI_BASE_URL}/responses`。
- `OPENAI_MODEL`：始终表示上游模型名称，不承担协议选择职责。
- `OPENAI_BASE_URL`：均为 API 基础地址；Responses 模式下其末尾路径为 `/responses`。
- `OPENAI_API_KEY`：Responses 模式使用 Bearer API key。
- `OPENAI_AUTH_MODE=chatgpt`：保留现有 ChatGPT Subscription 专用路径；其固定请求 ChatGPT Codex Responses endpoint，优先级高于 `UPSTREAM_API_MODEL`。

## 请求选择顺序

1. `OPENAI_AUTH_MODE=chatgpt`：调用既有 ChatGPT OAuth Responses 路径。
2. 否则 `UPSTREAM_API_MODEL=responses`：调用新增的 API-key 通用 Responses 路径。
3. 否则：调用现有 Chat Completions 路径。

未知的 `UPSTREAM_API_MODEL` 值在启动/调用时产生明确错误，不静默回退，避免协议错配重新表现为 `Execution error`。

## 实现边界

### 复用

- `buildResponsesRequest()`：把内部消息和工具转换为 Responses 请求体。
- `parseSSE()`：解析 `text/event-stream`。
- `adaptResponsesStreamToAnthropic()`：将 Responses SSE 事件转换为 Anthropic 内部流事件。
- 既有 `getProxyFetchOptions()`：保留代理、证书和超时行为。

### 新增

新增 API-key Responses 客户端函数：

- URL：`{OPENAI_BASE_URL}/responses`；未配置 base URL 时使用 OpenAI SDK 的默认 API 基础地址对应的 `/responses`。
- Headers：`Authorization: Bearer ${OPENAI_API_KEY}`、`Content-Type: application/json`、`Accept: text/event-stream`。
- 不发送 ChatGPT Subscription 专用 headers（`Origin`、`Referer`、`OpenAI-Beta`、`ChatGPT-Account-Id`）。
- 非 2xx 响应抛出包含 HTTP 状态和有限响应体的错误。

### 可靠性

- Responses stream 在未生成 `response.completed` / `response.incomplete` 时应报出明确的 API 错误。
- OpenAI Chat Completions 流保持原有行为。
- 不修改模型选择、鉴权持久化、工具定义或其他 Provider。

## 测试

1. `UPSTREAM_API_MODEL=responses` 使用 API key 请求 `{baseURL}/responses`。
2. 请求头只包含通用 API-key Responses 所需头，不包含 ChatGPT 专用头。
3. Responses SSE 的 text、tool call、完成事件可生成 assistant 消息。
4. 非 2xx Responses 请求转成可见 API error。
5. `chat_completions` 默认路径仍调用 `chat.completions.create()`。
6. `OPENAI_AUTH_MODE=chatgpt` 仍优先使用 ChatGPT Responses 路径。
7. 未知 `UPSTREAM_API_MODEL` 返回明确配置错误。

## 非目标

- 不支持非 OpenAI Responses 事件规范。
- 不变更 ChatGPT Subscription OAuth 协议。
- 不增加新的模型供应商或修改全局 Provider 优先级。


## 验证记录（2026-08-02）

- `bun test src/services/api/openai/__tests__/upstreamApiMode.test.ts`：3 项通过。
- `bun test src/services/api/openai/__tests__/responsesAdapter.test.ts`：11 项通过。
- `bun test ./src/services/api/openai/__tests__/queryModelOpenAI.isolated.ts`：18 项通过。该文件名不符合 Bun 默认测试文件后缀，须以 `./` 路径形式运行。
- `bun run lint`：通过；仅保留仓库已有的 Biome 配置迁移提示及 `contributors.svg` 大文件警告。
- `bun run typecheck`：未能全绿；当前主工作树仅报告 5 个未改动文件中的既有诊断：`src/services/lsp/passiveFeedback.ts` 1 项、`src/utils/bash/commands.ts` 4 项。本次变更涉及的 `src/services/api/openai` 文件未出现在 TypeScript 诊断中。

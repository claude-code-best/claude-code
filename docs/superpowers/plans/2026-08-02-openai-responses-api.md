# OpenAI Responses API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 通过 `UPSTREAM_API_MODEL=responses` 让 API-key OpenAI Provider 调用通用 `{OPENAI_BASE_URL}/responses` SSE API，同时保留 Chat Completions 和 ChatGPT Subscription 的既有行为。

**Architecture:** 在 OpenAI client 层新增无 ChatGPT 专用认证头的 Responses 流请求函数，复用 `responsesAdapter.ts` 的请求构造、SSE 解析和流适配。`queryModelOpenAI()` 依照 ChatGPT OAuth → 通用 Responses → Chat Completions 的优先级选择传输路径；配置解析集中为可测试的纯函数，未知配置值显式报错。

**Tech Stack:** Bun、TypeScript strict、`bun:test`、OpenAI SDK、Fetch/SSE、Anthropic 内部流事件。

## Global Constraints

- `UPSTREAM_API_MODEL` 的有效值仅为 `chat_completions`（默认）和 `responses`。
- `OPENAI_MODEL` 仅表示上游模型名称。
- `OPENAI_AUTH_MODE=chatgpt` 必须优先于 `UPSTREAM_API_MODEL`，保持现有 ChatGPT OAuth 路径。
- 通用 Responses 模式使用 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL`，不得发送 ChatGPT 专用 headers。
- 生产代码不得使用 `as any`；项目类型检查必须保持零错误。
- 不创建 commit；按仓库约定运行相关 Bun 测试、typecheck、lint。

---

### Task 1: 定义并测试上游协议模式解析

**Files:**
- Create: `src/services/api/openai/upstreamApiMode.ts`
- Create: `src/services/api/openai/__tests__/upstreamApiMode.test.ts`

**Interfaces:**
- Consumes: `process.env.UPSTREAM_API_MODEL`（可选）。
- Produces: `export type UpstreamApiMode = 'chat_completions' | 'responses'` 与 `export function getUpstreamApiMode(value = process.env.UPSTREAM_API_MODEL): UpstreamApiMode`。
- Error contract: 非空未知值抛出 `Error('Invalid UPSTREAM_API_MODEL: <value>. Expected "chat_completions" or "responses".')`。

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test'
import { getUpstreamApiMode } from '../upstreamApiMode.js'

describe('getUpstreamApiMode', () => {
  test('defaults to chat_completions when unset', () => {
    expect(getUpstreamApiMode(undefined)).toBe('chat_completions')
  })

  test('selects responses when explicitly configured', () => {
    expect(getUpstreamApiMode('responses')).toBe('responses')
  })

  test('rejects an unsupported protocol mode', () => {
    expect(() => getUpstreamApiMode('completion')).toThrow(
      'Invalid UPSTREAM_API_MODEL: completion. Expected "chat_completions" or "responses".',
    )
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test src/services/api/openai/__tests__/upstreamApiMode.test.ts
```

Expected: module-not-found failure because `upstreamApiMode.ts` does not exist.

- [x] **Step 3: Write minimal implementation**

```ts
export type UpstreamApiMode = 'chat_completions' | 'responses'

export function getUpstreamApiMode(
  value = process.env.UPSTREAM_API_MODEL,
): UpstreamApiMode {
  if (value === undefined || value === '' || value === 'chat_completions') {
    return 'chat_completions'
  }
  if (value === 'responses') return 'responses'
  throw new Error(
    `Invalid UPSTREAM_API_MODEL: ${value}. Expected "chat_completions" or "responses".`,
  )
}
```

- [x] **Step 4: Run test to verify it passes**

Run:

```bash
bun test src/services/api/openai/__tests__/upstreamApiMode.test.ts
```

Expected: 3 passing tests.

### Task 2: 新增 API-key Responses SSE transport

**Files:**
- Modify: `src/services/api/openai/responsesAdapter.ts`
- Modify: `src/services/api/openai/__tests__/responsesAdapter.test.ts`

**Interfaces:**
- Consumes: `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`getProxyFetchOptions({ forAnthropicAPI: false })`、`ResponsesRequest`。
- Produces: `export async function createOpenAIResponsesStream(params: { request: ResponsesRequest; signal: AbortSignal; fetchOverride?: typeof fetch }): Promise<AsyncIterable<Record<string, unknown>>>`。
- URL contract: base URL 的尾随 `/` 被移除后拼接 `/responses`；无 base URL 时使用 `https://api.openai.com/v1/responses`。
- Header contract: API Key Bearer、JSON Content-Type 和 SSE Accept；不得发送 `Origin`、`Referer`、`OpenAI-Beta`、`ChatGPT-Account-Id`。

- [x] **Step 1: Write the failing tests**

```ts
test('posts API-key Responses requests to the configured responses endpoint', async () => {
  const requests: Request[] = []
  const stream = await createOpenAIResponsesStream({
    request: { model: 'gpt-5.6-sol', input: 'hello', stream: true },
    signal: new AbortController().signal,
    fetchOverride: async input => {
      requests.push(new Request(input))
      return new Response('data: {"type":"response.completed","response":{"status":"completed"}}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    },
  })
  await Array.fromAsync(stream)
  expect(requests[0]?.url).toBe('https://gateway.example/v1/responses')
  expect(requests[0]?.headers.get('Authorization')).toBe('Bearer test-key')
  expect(requests[0]?.headers.get('Origin')).toBeNull()
})

test('throws an actionable error for a non-success Responses response', async () => {
  await expect(
    createOpenAIResponsesStream({
      request: { model: 'gpt-5.6-sol', input: 'hello', stream: true },
      signal: new AbortController().signal,
      fetchOverride: async () => new Response('bad model', { status: 400 }),
    }),
  ).rejects.toThrow('OpenAI Responses API request failed (400): bad model')
})
```

Test setup sets `OPENAI_BASE_URL=https://gateway.example/v1/` and `OPENAI_API_KEY=test-key` before each test, then restores both variables after each test.

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test src/services/api/openai/__tests__/responsesAdapter.test.ts
```

Expected: import failure for `createOpenAIResponsesStream`.

- [x] **Step 3: Write minimal implementation**

Add imports for `getProxyFetchOptions` and `getOpenAIClient`-compatible API configuration helpers only if needed. Implement `createOpenAIResponsesStream` with `fetch`, `process.env.OPENAI_API_KEY`, `process.env.OPENAI_BASE_URL`, `getProxyFetchOptions({ forAnthropicAPI: false })`, and existing `parseSSE(response)`. Use the exact error message asserted above, truncating error text to 500 characters as the existing ChatGPT Responses function does.

- [x] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test src/services/api/openai/__tests__/responsesAdapter.test.ts
```

Expected: all existing adapter tests plus the two Responses transport tests pass.

### Task 3: 依配置路由 queryModelOpenAI 并覆盖优先级

**Files:**
- Modify: `src/services/api/openai/index.ts`
- Modify: `src/services/api/openai/__tests__/queryModelOpenAI.isolated.ts`

**Interfaces:**
- Consumes: `isChatGPTAuthEnabled()`、`getUpstreamApiMode()`、`createChatGPTResponsesStream()`、`createOpenAIResponsesStream()`。
- Produces: 以下优先级的 transport selection：ChatGPT auth → API-key Responses → Chat Completions。
- Error contract: 无效 `UPSTREAM_API_MODEL` 被 `queryModelOpenAI()` 捕获并作为现有 `createAssistantAPIErrorMessage` 输出。

- [x] **Step 1: Write the failing routing tests**

Add mock spies for `createOpenAIResponsesStream` and `getOpenAIClient().chat.completions.create`, then add tests asserting:

```ts
test('uses API-key Responses transport when UPSTREAM_API_MODEL is responses', async () => {
  process.env.UPSTREAM_API_MODEL = 'responses'
  mockIsChatGPTAuthEnabled(false)
  await collectQueryModelOpenAIResult()
  expect(createOpenAIResponsesStreamMock).toHaveBeenCalledTimes(1)
  expect(chatCompletionsCreateMock).not.toHaveBeenCalled()
})

test('prefers ChatGPT Responses transport over UPSTREAM_API_MODEL', async () => {
  process.env.UPSTREAM_API_MODEL = 'responses'
  mockIsChatGPTAuthEnabled(true)
  await collectQueryModelOpenAIResult()
  expect(createChatGPTResponsesStreamMock).toHaveBeenCalledTimes(1)
  expect(createOpenAIResponsesStreamMock).not.toHaveBeenCalled()
})

test('keeps Chat Completions as the default transport', async () => {
  delete process.env.UPSTREAM_API_MODEL
  mockIsChatGPTAuthEnabled(false)
  await collectQueryModelOpenAIResult()
  expect(chatCompletionsCreateMock).toHaveBeenCalledTimes(1)
  expect(createOpenAIResponsesStreamMock).not.toHaveBeenCalled()
})
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test src/services/api/openai/__tests__/queryModelOpenAI.isolated.ts
```

Expected: API-key Responses routing test fails because the current code always reaches Chat Completions when ChatGPT OAuth is disabled.

- [x] **Step 3: Write minimal routing implementation**

In `queryModelOpenAI()`:

```ts
const useChatGPTResponses = isChatGPTAuthEnabled()
const upstreamApiMode = getUpstreamApiMode()
const useApiKeyResponses =
  !useChatGPTResponses && upstreamApiMode === 'responses'
```

Select the existing ChatGPT Responses branch first, then call `createOpenAIResponsesStream({ request: buildResponsesRequest(...), signal, fetchOverride })` for `useApiKeyResponses`, adapting both Results streams through `adaptResponsesStreamToAnthropic()`. Keep the existing `adaptOpenAIStreamToAnthropic(getOpenAIClient().chat.completions.create(...))` branch otherwise.

- [x] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test src/services/api/openai/__tests__/queryModelOpenAI.isolated.ts
bun test src/services/api/openai/__tests__/responsesAdapter.test.ts
bun test src/services/api/openai/__tests__/upstreamApiMode.test.ts
```

Expected: all selected tests pass.

### Task 4: 验证无空流静默失败并完成仓库检查

**Files:**
- Modify: `src/services/api/openai/index.ts`
- Modify: `src/services/api/openai/__tests__/queryModelOpenAI.isolated.ts`
- Modify: `docs/superpowers/specs/2026-08-02-openai-responses-api-design.md`

**Interfaces:**
- Consumes: adapted Responses/Chat Completions event stream completion state.
- Produces: 在没有 `message_stop` 且没有有效 assistant 内容时，`queryModelOpenAI()` 产出含说明的 `createAssistantAPIErrorMessage`，不再导致无上下文的 `Execution error`。

- [x] **Step 1: Write the failing no-event test**

```ts
test('emits an API error when an OpenAI stream ends without a terminal message', async () => {
  mockAdaptedStream([])
  const messages = await collectQueryModelOpenAIResult()
  expect(messages).toContainEqual(
    expect.objectContaining({
      type: 'assistant',
      apiError: 'api_error',
      message: expect.objectContaining({
        content: expect.stringContaining('ended without a terminal message'),
      }),
    }),
  )
})
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
bun test src/services/api/openai/__tests__/queryModelOpenAI.isolated.ts
```

Expected: no matching API error because the current OpenAI path completes without yielding a diagnostic message.

- [x] **Step 3: Write minimal implementation**

Track whether `message_stop` was received while consuming `adaptedStream`. After iteration, if no terminal event occurred and no `partialMessage` can be safely assembled, throw `Error('OpenAI stream ended without a terminal message or assistant content')` so the existing catch emits `createAssistantAPIErrorMessage`.

- [x] **Step 4: Run focused checks**

Run:

```bash
bun test src/services/api/openai/__tests__/queryModelOpenAI.isolated.ts
bun test src/services/api/openai/__tests__/responsesAdapter.test.ts
bun test src/services/api/openai/__tests__/upstreamApiMode.test.ts
bun run typecheck
bun run lint
```

Expected: all commands exit 0.

- [x] **Step 5: Update design documentation verification status**

Append a concise verification section to `docs/superpowers/specs/2026-08-02-openai-responses-api-design.md` recording the focused test commands and their result.

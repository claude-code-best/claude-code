# OpenAI 协议兼容层

## 概述

claude-code 支持通过 OpenAI Chat Completions API（`/v1/chat/completions`）兼容任意 OpenAI 协议端点，包括 Ollama、DeepSeek、vLLM、One API、LiteLLM 等。

核心策略为**流适配器模式**：在 `queryModel()` 中插入提前返回分支，将 Anthropic 格式请求转为 OpenAI 格式，调用 OpenAI SDK，再将 SSE 流转换回 `BetaRawMessageStreamEvent` 格式。下游代码（流处理循环、query.ts、QueryEngine.ts、REPL）**完全不改**。

## 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `CLAUDE_CODE_USE_OPENAI` | 是 | 设为 `1` 启用 OpenAI 后端 |
| `OPENAI_API_KEY` | 是 | API key（Ollama 等可设为任意值） |
| `OPENAI_BASE_URL` | 推荐 | 端点 URL（如 `http://localhost:11434/v1`） |
| `OPENAI_MODEL` | 可选 | 覆盖所有请求的模型名（跳过映射） |
| `OPENAI_DEFAULT_OPUS_MODEL` | 可选 | 覆盖 opus 家族对应的模型（如 `o3`, `o3-mini`, `o1-pro`） |
| `OPENAI_DEFAULT_SONNET_MODEL` | 可选 | 覆盖 sonnet 家族对应的模型（如 `gpt-4o`, `gpt-4.1`） |
| `OPENAI_DEFAULT_HAIKU_MODEL` | 可选 | 覆盖 haiku 家族对应的模型（如 `gpt-4o-mini`, `gpt-4.0-mini`） |
| `OPENAI_ORG_ID` | 可选 | Organization ID |
| `OPENAI_PROJECT_ID` | 可选 | Project ID |

### 使用示例

```bash
# Ollama
CLAUDE_CODE_USE_OPENAI=1 \
OPENAI_API_KEY=ollama \
OPENAI_BASE_URL=http://localhost:11434/v1 \
OPENAI_MODEL=qwen2.5-coder-32b \
bun run dev

# DeepSeek（自动支持 Thinking）
CLAUDE_CODE_USE_OPENAI=1 \
OPENAI_API_KEY=sk-xxx \
OPENAI_BASE_URL=https://api.deepseek.com/v1 \
OPENAI_MODEL=deepseek-chat \
bun run dev

# vLLM
CLAUDE_CODE_USE_OPENAI=1 \
OPENAI_API_KEY=token-abc123 \
OPENAI_BASE_URL=http://localhost:8000/v1 \
OPENAI_MODEL=Qwen/Qwen2.5-Coder-32B-Instruct \
bun run dev

# One API / LiteLLM
CLAUDE_CODE_USE_OPENAI=1 \
OPENAI_API_KEY=sk-your-key \
OPENAI_BASE_URL=https://your-one-api.example.com/v1 \
OPENAI_MODEL=gpt-4o \
bun run dev

# 自定义模型映射（使用家族变量）
CLAUDE_CODE_USE_OPENAI=1 \
OPENAI_API_KEY=sk-xxx \
OPENAI_BASE_URL=https://my-gateway.example.com/v1 \
OPENAI_DEFAULT_SONNET_MODEL="gpt-4o-2024-11-20" \
OPENAI_DEFAULT_HAIKU_MODEL="gpt-4o-mini" \
bun run dev
```

## 架构

### 请求流程

```
queryModel() [claude.ts]
  ├── 共享预处理（消息归一化、工具过滤、媒体裁剪）
  └── if (getAPIProvider() === 'openai')
      └── queryModelOpenAI() [openai/index.ts]
          ├── resolveOpenAIModel()          → 解析模型名
          ├── normalizeMessagesForAPI()      → 共享消息预处理
          ├── toolToAPISchema()              → 构建工具 schema
          ├── anthropicMessagesToOpenAI()    → 消息格式转换
          ├── anthropicToolsToOpenAI()       → 工具格式转换
          ├── openai.chat.completions.create({ stream: true })
          └── adaptOpenAIStreamToAnthropic() → 流格式转换
              ├── delta.reasoning_content    → thinking 块
              ├── delta.content             → text 块
              ├── delta.tool_calls          → tool_use 块
              ├── usage.cached_tokens       → cache_read_input_tokens
              └── yield BetaRawMessageStreamEvent
```

### 模型名解析优先级

`resolveOpenAIModel()` 的解析顺序：

1. `OPENAI_MODEL` 环境变量 → 直接使用，覆盖所有
2. `OPENAI_DEFAULT_{FAMILY}_MODEL` 变量（如 `OPENAI_DEFAULT_SONNET_MODEL`）→ 按模型家族覆盖
3. `ANTHROPIC_DEFAULT_{FAMILY}_MODEL` 变量（向后兼容）
4. 内置默认映射（见下表）
5. 以上都不匹配 → 原名透传

### 内置模型映射

| Anthropic 模型 | OpenAI 映射 |
|---|---|
| `claude-sonnet-4-6` | `gpt-4o` |
| `claude-sonnet-4-5-20250929` | `gpt-4o` |
| `claude-sonnet-4-20250514` | `gpt-4o` |
| `claude-3-7-sonnet-20250219` | `gpt-4o` |
| `claude-3-5-sonnet-20241022` | `gpt-4o` |
| `claude-opus-4-6` | `o3` |
| `claude-opus-4-5-20251101` | `o3` |
| `claude-opus-4-1-20250805` | `o3` |
| `claude-opus-4-20250514` | `o3` |
| `claude-haiku-4-5-20251001` | `gpt-4o-mini` |
| `claude-3-5-haiku-20241022` | `gpt-4o-mini` |

同时会自动剥离 `[1m]` 后缀（Claude 特有的 modifier）。

## 文件结构

### 新增文件

```
src/services/api/openai/
├── client.ts              # OpenAI SDK 客户端工厂（~50 行）
├── convertMessages.ts     # Anthropic → OpenAI 消息格式转换（~190 行）
├── convertTools.ts        # Anthropic → OpenAI 工具格式转换（~70 行）
├── streamAdapter.ts       # SSE 流转换核心，含 thinking + caching（~270 行）
├── modelMapping.ts        # 模型名解析（~60 行）
├── index.ts               # 公共入口 queryModelOpenAI()（~110 行）
└── __tests__/
    ├── convertMessages.test.ts   # 10 个测试
    ├── convertTools.test.ts      # 7 个测试
    ├── modelMapping.test.ts      # 6 个测试
    └── streamAdapter.test.ts     # 14 个测试（含 thinking + caching）
```

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/utils/model/providers.ts` | 添加 `'openai'` provider 类型 + `CLAUDE_CODE_USE_OPENAI` 检查（最高优先级） |
| `src/utils/model/configs.ts` | 每个 ModelConfig 添加 `openai` 键 |
| `src/services/api/claude.ts` | 在 `stripExcessMediaItems()` 后插入 OpenAI 提前返回分支（~8 行） |
| `package.json` | 添加 `"openai": "^4.73.0"` 依赖 |

## 消息转换规则

### Anthropic → OpenAI

| Anthropic | OpenAI |
|---|---|
| `system` prompt（`string[]`） | `role: "system"` 消息（`\n\n` 拼接） |
| `user` + `text` 块 | `role: "user"` 消息 |
| `assistant` + `text` 块 | `role: "assistant"` + `content` |
| `assistant` + `tool_use` 块 | `role: "assistant"` + `tool_calls[]` |
| `user` + `tool_result` 块 | `role: "tool"` + `tool_call_id` |
| `thinking` 块 | 静默丢弃（请求侧） |

### 工具转换

| Anthropic | OpenAI |
|---|---|
| `{ name, description, input_schema }` | `{ type: "function", function: { name, description, parameters } }` |
| `cache_control`, `defer_loading` 等字段 | 剥离 |
| `tool_choice: { type: "auto" }` | `"auto"` |
| `tool_choice: { type: "any" }` | `"required"` |
| `tool_choice: { type: "tool", name }` | `{ type: "function", function: { name } }` |

### 消息转换示例

```
Anthropic:                              OpenAI:
[
  system: ["You are helpful."],         [
                                          { role: "system",
  { role: "user",                          content: "You are helpful." },
    content: [                            { role: "user",
      { type: "text", text: "Run ls" }      content: "Run ls"
    ]                                     },
  },                                      { role: "assistant",
  { role: "assistant",                     content: "I'll check.",
    content: [                            tool_calls: [{
      { type: "text", text: "I'll check."},  id: "tu_123",
      { type: "tool_use",                    type: "function",
        id: "tu_123", name: "bash",          function: {
        input: { command: "ls" } }             name: "bash",
    ]                                           arguments: '{"command":"ls"}'
  },                                      }] }
  { role: "user",                        { role: "tool",
    content: [                              tool_call_id: "tu_123",
      { type: "tool_result",                content: "file1\nfile2"
        tool_use_id: "tu_123",            }
        content: "file1\nfile2"          ]
    ]
  }
]
```

## 流转换规则

### SSE Chunk → Anthropic Event 映射

| OpenAI Chunk | Anthropic Event |
|---|---|
| 首个 chunk | `message_start`（含 usage） |
| `delta.reasoning_content` | `content_block_start(thinking)` + `thinking_delta` |
| `delta.content` | `content_block_start(text)` + `text_delta` |
| `delta.tool_calls` | `content_block_start(tool_use)` + `input_json_delta` |
| `finish_reason: "stop"` | `message_delta(stop_reason: "end_turn")` |
| `finish_reason: "tool_calls"` | `message_delta(stop_reason: "tool_use")` |
| `finish_reason: "length"` | `message_delta(stop_reason: "max_tokens")` |

### 块顺序

当模型返回 `reasoning_content` 时（如 DeepSeek），块顺序与 Anthropic 一致：

```
thinking block (index 0)  ← delta.reasoning_content
text block    (index 1)   ← delta.content
```

或：

```
thinking block (index 0)  ← delta.reasoning_content
tool_use block (index 1)  ← delta.tool_calls
```

无 `reasoning_content` 时：

```
text block    (index 0)   ← delta.content
tool_use block (index 1)  ← delta.tool_calls（如果有）
```

### finish_reason 映射

| OpenAI | Anthropic |
|---|---|
| `stop` | `end_turn` |
| `tool_calls` | `tool_use` |
| `length` | `max_tokens` |
| `content_filter` | `end_turn` |

### 事件序列示例

**纯文本响应**：
```
OpenAI chunks:
  delta.content = "Hello"
  delta.content = " world"
  finish_reason = "stop"

→ Anthropic events:
  message_start       { message: { id, role: 'assistant', usage: {...} } }
  content_block_start { index: 0, content_block: { type: 'text' } }
  content_block_delta { index: 0, delta: { type: 'text_delta', text: 'Hello' } }
  content_block_delta { index: 0, delta: { type: 'text_delta', text: ' world' } }
  content_block_stop  { index: 0 }
  message_delta       { delta: { stop_reason: 'end_turn' } }
  message_stop
```

**Thinking + 文本（DeepSeek 风格）**：
```
OpenAI chunks:
  delta.reasoning_content = "Let me think..."
  delta.reasoning_content = " step by step."
  delta.content = "The answer is 42."
  finish_reason = "stop"

→ Anthropic events:
  message_start       { ... }
  content_block_start { index: 0, content_block: { type: 'thinking', signature: '' } }
  content_block_delta { index: 0, delta: { type: 'thinking_delta', thinking: 'Let me think...' } }
  content_block_delta { index: 0, delta: { type: 'thinking_delta', thinking: ' step by step.' } }
  content_block_stop  { index: 0 }
  content_block_start { index: 1, content_block: { type: 'text' } }
  content_block_delta { index: 1, delta: { type: 'text_delta', text: 'The answer is 42.' } }
  content_block_stop  { index: 1 }
  message_delta       { delta: { stop_reason: 'end_turn' } }
  message_stop
```

**工具调用**：
```
OpenAI chunks:
  delta.tool_calls[0] = { id: 'call_xxx', function: { name: 'bash', arguments: '' } }
  delta.tool_calls[0].function.arguments = '{"comm'
  delta.tool_calls[0].function.arguments = 'and":"ls"}'
  finish_reason = "tool_calls"

→ Anthropic events:
  message_start       { ... }
  content_block_start { index: 0, content_block: { type: 'tool_use', id: 'call_xxx', name: 'bash' } }
  content_block_delta { index: 0, delta: { type: 'input_json_delta', partial_json: '{"comm' } }
  content_block_delta { index: 0, delta: { type: 'input_json_delta', partial_json: 'and":"ls"}' } }
  content_block_stop  { index: 0 }
  message_delta       { delta: { stop_reason: 'tool_use' } }
  message_stop
```

## 功能支持

### Thinking（思维链）

**请求侧**：不需要显式配置。支持思维链的模型（DeepSeek 等）会自动返回 `delta.reasoning_content`。

**响应侧**：`delta.reasoning_content` 被转换为 Anthropic `thinking` content block：

```ts
// content_block_start
{ type: 'content_block_start', index: 0,
  content_block: { type: 'thinking', thinking: '', signature: '' } }

// content_block_delta
{ type: 'content_block_delta', index: 0,
  delta: { type: 'thinking_delta', thinking: 'Let me analyze...' } }
```

thinking block 在 text/tool_use block 之前自动关闭，保持 Anthropic 的块顺序。

### Prompt Caching

**请求侧**：OpenAI 端点使用自动缓存，无需显式设置 `cache_control`。

**响应侧**：OpenAI 的 `usage.prompt_tokens_details.cached_tokens` 被映射到 Anthropic 的 `cache_read_input_tokens`：

```
OpenAI:   usage.prompt_tokens_details.cached_tokens = 800
     ↓
Anthropic: message_start.message.usage.cache_read_input_tokens = 800
```

在 `message_start` 的 usage 中报告缓存命中量。

### 工具调用（Tool Use）

完整支持 OpenAI function calling 格式。所有本地工具（Bash、FileEdit、Grep、Glob、Agent 等）透明工作——它们通过 JSON 输入输出通信，格式无关。

工具参数以 `input_json_delta` 形式流式传输，由下游代码拼接解析。

### 不支持的功能

| 功能 | 策略 |
|---|---|
| Beta Headers | 不发送 |
| Server Tools (advisor) | 不发送 |
| Structured Output | 不发送 |
| Fast Mode / Effort | 不发送 |
| Tool Search / defer_loading | 不启用，所有工具直接发送 |
| Anthropic Signature | thinking block 的 `signature` 字段为空字符串 |
| cache_creation_input_tokens | 始终为 0（OpenAI 不区分创建/读取） |

## 测试

```bash
# 运行所有 OpenAI 适配层测试
bun test src/services/api/openai/__tests__/

# 单独运行
bun test src/services/api/openai/__tests__/streamAdapter.test.ts     # 14 tests（含 thinking + caching）
bun test src/services/api/openai/__tests__/convertMessages.test.ts   # 10 tests
bun test src/services/api/openai/__tests__/convertTools.test.ts      # 7 tests
bun test src/services/api/openai/__tests__/modelMapping.test.ts      # 6 tests
```

当前测试覆盖：**39 tests / 73 assertions / 0 fail**。

### 测试覆盖矩阵

| 功能 | convertMessages | convertTools | streamAdapter | modelMapping |
|---|---|---|---|---|
| 文本消息转换 | ✅ | | | |
| tool_use 转换 | ✅ | | | |
| tool_result 转换 | ✅ | | | |
| thinking 剥离 | ✅ | | | |
| 完整对话流程 | ✅ | | | |
| 工具 schema 转换 | | ✅ | | |
| tool_choice 映射 | | ✅ | | |
| 纯文本流 | | | ✅ | |
| 工具调用流 | | | ✅ | |
| 混合文本+工具 | | | ✅ | |
| finish_reason 映射 | | | ✅ | |
| thinking 流 | | | ✅ | |
| thinking+text 切换 | | | ✅ | |
| thinking+tool_use 切换 | | | ✅ | |
| 块索引正确性 | | | ✅ | |
| cached_tokens 映射 | | | ✅ | |
| OPENAI_MODEL 覆盖 | | | | ✅ |
| 默认模型映射 | | | | ✅ |
| 未知模型透传 | | | | ✅ |
| [1m] 后缀剥离 | | | | ✅ |

## 端到端验证

```bash
# 1. 安装依赖
bun install

# 2. 运行单元测试
bun test src/services/api/openai/__tests__/

# 3. 连接实际端点（以 Ollama 为例）
CLAUDE_CODE_USE_OPENAI=1 \
OPENAI_API_KEY=ollama \
OPENAI_BASE_URL=http://localhost:11434/v1 \
OPENAI_MODEL=qwen2.5-coder-32b \
bun run dev

# 4. 连接 DeepSeek（测试 thinking 支持）
CLAUDE_CODE_USE_OPENAI=1 \
OPENAI_API_KEY=sk-xxx \
OPENAI_BASE_URL=https://api.deepseek.com/v1 \
OPENAI_MODEL=deepseek-reasoner \
bun run dev

# 5. 确认现有测试不受影响
bun test  # 无 CLAUDE_CODE_USE_OPENAI 时走原有路径
```

## 代码统计

| 类别 | 行数 |
|---|---|
| 新增源码 | ~620 行 |
| 新增测试 | ~450 行 |
| 改动现有代码 | ~25 行 |
| **总计** | **~1100 行** |

# Phase 2: Core Conversation Loop Detailed

> How a user message becomes an API request, and how streaming responses and tool calls are handled

## Conversation Loop Overview

```
User inputs "Help me read README.md"
  │
  ▼
REPL.tsx: onSubmit → onQuery → onQueryImpl
  │
  ├── 1. Load context in parallel:
  │     getSystemPrompt() + getUserContext() + getSystemContext()
  │
  ├── 2. buildEffectiveSystemPrompt() — Compose final system prompt
  │
  ├── 3. for await (const event of query({...}))  ★ Core loop
  │     │
  │     │  query.ts: queryLoop()
  │     │    ├── while (true) {
  │     │    │     ├── autocompact / microcompact handling
  │     │    │     ├── deps.callModel() → claude.ts streaming API call
  │     │    │     │     └── for await (message of stream) { yield message }
  │     │    │     │
  │     │    │     ├── Collect tool_use blocks from assistant messages
  │     │    │     │
  │     │    │     ├── needsFollowUp?
  │     │    │     │     ├── true → execute tools → collect results → state = next → continue
  │     │    │     │     └── false → check error recovery → return { reason: 'completed' }
  │     │    │     }
  │     │
  │     └── onQueryEvent(event) — Update UI state
  │
  └── 4. Cleanup: resetLoadingState(), onTurnComplete()
```

### Two Data Paths

| Path | Caller | Description |
|------|--------|-------------|
| **Interactive (REPL)** | REPL.tsx → `query()` | Calls `query()` AsyncGenerator directly |
| **Non-interactive (SDK/print)** | print.ts → `QueryEngine.submitMessage()` → `query()` | Wrapped through QueryEngine, adds session persistence, usage tracking, etc. |

---

## 1. query.ts (1732 lines) — Core Query Loop

**File path**: `src/query.ts`

### 1.1 File Structure

```
query.ts (1732 lines)
├── [0-120]      Import section + feature flag conditional module loading
├── [122-148]    yieldMissingToolResultBlocks() — Generate error tool_result for unpaired tool_use
├── [150-178]    Constants and helpers (MAX_OUTPUT_TOKENS_RECOVERY_LIMIT, isWithheldMaxOutputTokens)
├── [180-198]    QueryParams type definition
├── [200-216]    State type — Mutable state between loop iterations
├── [218-238]    query() — Exported AsyncGenerator, delegates to queryLoop()
├── [240-1732]   queryLoop() — Core while(true) loop
│   ├── [241-306]    State initialization + memory prefetch
│   ├── [307-448]    Loop start: destructure state, message preprocessing (snip/microcompact/context collapse)
│   ├── [449-578]    System prompt building(line 449) + autocompact(line 453) + StreamingToolExecutor init(line 562)
│   ├── [650-866]    ★ deps.callModel()(line 659) + streaming response handling + tool_use collection
│   ├── [896-956]    Error handling (FallbackTriggeredError, generic errors)
│   ├── [1002-1054]  Abort handling (abortController.signal.aborted)
│   ├── [1065-1360]  No followUp: termination/recovery logic
│   │   ├── prompt-too-long recovery
│   │   ├── max_output_tokens recovery (upgrade + multi-turn)
│   │   ├── stop hooks execution
│   │   └── return { reason: 'completed' }
│   └── [1360-1732]  Has followUp: tool execution + next turn preparation
│       ├── Tool execution (streaming or sequential)
│       ├── Attachment injection (queued commands, memory prefetch, skill discovery)
│       ├── maxTurns check
│       └── state = next → continue
```

### 1.2 Entry Point: query() Function (Line 219)

```ts
export async function* query(params: QueryParams):
  AsyncGenerator<StreamEvent | Message | ..., Terminal> {
  const consumedCommandUuids: string[] = []
  const terminal = yield* queryLoop(params, consumedCommandUuids)
  // Notify all consumed queued commands that they're completed
  for (const uuid of consumedCommandUuids) {
    notifyCommandLifecycle(uuid, 'completed')
  }
  return terminal
}
```

`query()` itself is very thin, doing only two things:
1. Delegates to `queryLoop()` for actual logic
2. Notifies queued command lifecycle on normal return

### 1.3 QueryParams (Line 181)

```ts
type QueryParams = {
  messages: Message[]           // Current conversation messages
  systemPrompt: SystemPrompt    // System prompt
  userContext: { [k: string]: string }  // User context (CLAUDE.md, etc.)
  systemContext: { [k: string]: string }  // System context (git status, etc.)
  canUseTool: CanUseToolFn      // Tool permission check function
  toolUseContext: ToolUseContext // Tool execution context
  fallbackModel?: string        // Fallback model
  querySource: QuerySource      // Query source identifier
  maxTurns?: number             // Maximum turn limit
  taskBudget?: { total: number }  // Token budget
}
```

### 1.4 State — Mutable State Between Loop Iterations (Line 204)

```ts
type State = {
  messages: Message[]               // Accumulated message list
  toolUseContext: ToolUseContext     // Tool execution context
  autoCompactTracking: ...          // Auto-compact tracking
  maxOutputTokensRecoveryCount: number  // Output token recovery attempt count
  hasAttemptedReactiveCompact: boolean  // Whether reactive compact has been attempted
  maxOutputTokensOverride: number | undefined  // Output token override
  pendingToolUseSummary: Promise<...>   // Pending tool use summary
  stopHookActive: boolean | undefined   // Whether stop hook is active
  turnCount: number                     // Current turn count
  transition: Continue | undefined      // Why the last iteration continued
}
```

**Key design**: Each `continue` updates all state at once via `state = { ... }`, instead of 9 scattered assignments. The `transition` field records why the loop continued (useful for debugging and testing).

### 1.5 queryLoop() Core Flow (Line 241)

The `while (true)` loop (line 307) — each iteration represents one API call. The loop runs until:
- Model doesn't request tool calls → `return { reason: 'completed' }`
- Interrupted by user → `return { reason: 'aborted_*' }`
- Max turns reached → `return { reason: 'max_turns' }`
- Unrecoverable error → `return { reason: 'model_error' }`

#### Step 1: Message Preprocessing

```
At the start of each iteration:
  ├── Destructure state → messages, toolUseContext, tracking, ...
  ├── getMessagesAfterCompactBoundary() — Only keep messages after compact boundary
  ├── snip handling (feature flag, skipped)
  ├── microcompact handling (feature flag, skipped)
  └── autocompact check — Auto-compress when messages are too long
```

#### Step 2: System Prompt Building (Line 449)

```ts
const fullSystemPrompt = asSystemPrompt(
  appendSystemContext(systemPrompt, systemContext),
)
```

Appends system context (git status, date, etc.) to the system prompt. Note: user context (CLAUDE.md, etc.) is not injected here, but during the `deps.callModel()` call via `prependUserContext(messagesForQuery, userContext)` injected at the front of the message array (line 660).

#### Step 3: Autocompact (Lines 454-543)

Auto-compresses when message history is too long:

```
autocompact flow:
  ├── Check if token count exceeds threshold
  ├── Exceeds → call compact API (use Haiku to summarize history)
  │   ├── yield compactBoundaryMessage  ← Mark compact boundary
  │   └── Update messages to compacted version
  └── Doesn't exceed → continue
```

#### Step 4: Call API (Lines 559-708) — Core

StreamingToolExecutor is initialized at line 562, API call starts at line 659:

```ts
// Line 562: Initialize streaming tool executor
let streamingToolExecutor = useStreamingToolExecution
  ? new StreamingToolExecutor(
      toolUseContext.options.tools, canUseTool, toolUseContext,
    )
  : null

// Line 659: Call API
for await (const message of deps.callModel({
  messages: prependUserContext(messagesForQuery, userContext),  // ← User context injected at front of messages
  systemPrompt: fullSystemPrompt,
  thinkingConfig: toolUseContext.options.thinkingConfig,
  tools: toolUseContext.options.tools,
  signal: toolUseContext.abortController.signal,
  options: { model: currentModel, querySource, fallbackModel, ... }
})) {
  // Process each streaming message (lines 708-866)
}
```

`deps.callModel()` ultimately calls `claude.ts`'s `queryModelWithStreaming()`.

#### Step 5: Streaming Response Handling (Lines 708-866)

Processing logic inside the `for await` loop body (after line 708's `})` to line 866):

```
for await (const message of stream):
  ├── message.type === 'assistant'?
  │   ├── Record to assistantMessages[]
  │   ├── Extract tool_use blocks → toolUseBlocks[]
  │   ├── needsFollowUp = true (if has tool_use)
  │   └── streamingToolExecutor.addTool()  ← Streaming parallel tool execution
  │
  ├── withheld? (prompt-too-long / max_output_tokens)
  │   └── Hold back, don't yield, wait for recovery logic later
  │
  └── yield message  ← Normal yield to upper layer (REPL/QueryEngine)
```

**StreamingToolExecutor**: Starts executing tools (like reading files) while the API is still streaming, without waiting for the stream to end. Tools are added via `addTool()`, completed results retrieved via `getCompletedResults()`.

#### Step 6A: No followUp — Termination/Recovery (Lines 1065-1360)

When the model doesn't request tool calls (`needsFollowUp === false`):

```
No followUp:
  ├── prompt-too-long recovery?
  │   ├── context collapse drain (feature flag, skipped)
  │   ├── reactive compact → compress messages and retry
  │   └── All fail → yield error + return
  │
  ├── max_output_tokens recovery?
  │   ├── First time → upgrade to 64k token limit, continue
  │   ├── Subsequent → inject recovery message ("continue, don't apologize"), continue
  │   └── Over 3 times → yield error + return
  │
  ├── stop hooks execution
  │   ├── preventContinuation? → return
  │   └── blockingErrors? → add errors to messages, continue
  │
  └── return { reason: 'completed' }  ★ Normal end
```

**Recovery message content (line 1229)**:
```
"Output token limit hit. Resume directly — no apology, no recap of what
you were doing. Pick up mid-thought if that is where the cut happened.
Break remaining work into smaller pieces."
```

#### Step 6B: Has followUp — Tool Execution + Next Turn (Lines 1363-1731)

When the model requested tool calls (`needsFollowUp === true`):

```
Has followUp:
  ├── Tool execution (two modes)
  │   ├── streamingToolExecutor? → getRemainingResults() (streaming already started)
  │   └── Otherwise → runTools() (traditional sequential execution)
  │
  ├── for await (const update of toolUpdates):
  │   ├── yield update.message  ← Tool result messages
  │   └── toolResults.push(...)  ← Collect tool results
  │
  ├── Abort check (abortController.signal.aborted)
  │   └── return { reason: 'aborted_tools' }
  │
  ├── Attachment injection
  │   ├── Queued commands (messages submitted from other threads)
  │   ├── Memory prefetch (relevant memory files)
  │   └── Skill discovery prefetch
  │
  ├── maxTurns check
  │   └── Exceeded → yield max_turns_reached + return
  │
  └── state = { messages: [...old, ...assistant, ...toolResults], turnCount: +1 }
      → continue  ★ Return to loop top, make next API call
```

### 1.6 Error Handling and Model Fallback (Lines 897-956)

```
API call error:
  ├── FallbackTriggeredError (529 overloaded)?
  │   ├── Switch to fallbackModel
  │   ├── Clear this turn's assistant/tool messages
  │   ├── yield system message "Switched to X due to high demand for Y"
  │   └── continue (retry entire request)
  │
  └── Other errors
      ├── ImageSizeError/ImageResizeError → yield friendly error + return
      ├── yieldMissingToolResultBlocks() — Patch unpaired tool_results
      └── yield API error message + return
```

### 1.7 Key Design Ideas

| Design | Description |
|--------|-------------|
| **AsyncGenerator pattern** | `query()` is `async function*`, yielding events one by one via `yield`, consumer uses `for await` |
| **while(true) + state object** | Each `continue` builds a new State object, avoiding scattered state mutations |
| **transition field** | Records why the loop continued (`next_turn`, `max_output_tokens_recovery`, `reactive_compact_retry`...), useful for debugging |
| **StreamingToolExecutor** | Executes tools in parallel during API streaming, without waiting for stream to end |
| **Withheld messages** | Recoverable errors are held back first; if recovery succeeds, the error is swallowed; if not, it's yielded |

---

## 2. QueryEngine.ts (1320 lines) — High-Level Orchestrator

**File path**: `src/QueryEngine.ts`

### 2.1 Positioning

QueryEngine is the **upper-level wrapper** for `query()`, mainly used for:
- **Print mode** (`claude -p`): via `ask()` → `QueryEngine.submitMessage()`
- **SDK mode**: External programs calling via SDK
- **REPL doesn't use it**: REPL calls `query()` directly

### 2.2 File Structure

```
QueryEngine.ts (1320 lines)
├── [0-130]      Import section + feature flag conditional modules
├── [131-174]    QueryEngineConfig type definition
├── [185-1202]   QueryEngine class
│   ├── [185-208]    Member variables + constructor
│   ├── [210-1181]   submitMessage() — Core method (~970 lines)
│   │   ├── [210-400]    Argument parsing + processUserInputContext building
│   │   ├── [400-465]    User input handling + session persistence
│   │   ├── [465-660]    Slash command handling + fast return without query needed
│   │   ├── [660-690]    File history snapshots
│   │   ├── [679-1074]   ★ for await (const message of query({...})) — Consuming query()
│   │   └── [1074-1181]  Result extraction + yield result
│   ├── [1183-1202]  interrupt() / getMessages() / setModel() helper methods
├── [1210-1320]  ask() — Convenience wrapper function
```

### 2.3 QueryEngineConfig

```ts
type QueryEngineConfig = {
  cwd: string                    // Working directory
  tools: Tools                   // Tool list
  commands: Command[]            // Slash commands
  mcpClients: MCPServerConnection[]  // MCP server connections
  agents: AgentDefinition[]      // Agent definitions
  canUseTool: CanUseToolFn       // Permission check
  getAppState / setAppState      // Global state get/set
  initialMessages?: Message[]    // Initial messages (resume conversation)
  readFileCache: FileStateCache  // File read cache
  customSystemPrompt?: string    // Custom system prompt
  thinkingConfig?: ThinkingConfig // Thinking mode config
  maxTurns?: number              // Max turns
  maxBudgetUsd?: number          // USD budget cap
  jsonSchema?: Record<...>       // Structured output schema
  // ... more config
}
```

### 2.4 submitMessage() Core Flow

```
submitMessage(prompt)
  │
  ├── 1. Parameter preparation
  │   ├── Destructure config for tools, commands, model, ...
  │   ├── Build wrappedCanUseTool (wraps permission check, tracks denials)
  │   ├── fetchSystemPromptParts() — Get system prompt parts
  │   └── Build processUserInputContext
  │
  ├── 2. User input handling
  │   ├── processUserInput(prompt) — Parse slash commands / plain text
  │   ├── mutableMessages.push(...messagesFromUserInput)
  │   └── recordTranscript(messages) — Persist to JSONL
  │
  ├── 3. yield buildSystemInitMessage() — SDK initialization message
  │
  ├── 4. shouldQuery === false? (local execution result of slash command)
  │   ├── yield command output
  │   ├── yield { type: 'result', subtype: 'success' }
  │   └── return
  │
  ├── 5. ★ for await (const message of query({...}))
  │   │   Consume each message yielded by query()
  │   │
  │   ├── message.type === 'assistant'
  │   │   ├── mutableMessages.push(msg)
  │   │   ├── recordTranscript()  ← fire-and-forget
  │   │   ├── yield* normalizeMessage(msg) — Convert to SDK format
  │   │   └── Capture stop_reason
  │   │
  │   ├── message.type === 'user' (tool results)
  │   │   ├── mutableMessages.push(msg)
  │   │   ├── turnCount++
  │   │   └── yield* normalizeMessage(msg)
  │   │
  │   ├── message.type === 'stream_event'
  │   │   ├── Track usage (message_start/delta/stop)
  │   │   └── includePartialMessages? → yield stream event
  │   │
  │   ├── message.type === 'system'
  │   │   ├── compact_boundary → GC old messages + yield to SDK
  │   │   └── api_error → yield retry info
  │   │
  │   └── maxBudgetUsd check → over budget yields error + return
  │
  └── 6. yield { type: 'result', subtype: 'success', result: textResult }
```

### 2.5 ask() Convenience Function (Line 1211)

```ts
export async function* ask({ prompt, tools, ... }) {
  const engine = new QueryEngine({ ... })
  try {
    yield* engine.submitMessage(prompt)
  } finally {
    setReadFileCache(engine.getReadFileState())
  }
}
```

`ask()` is a one-shot wrapper for `QueryEngine`: create engine → submit message → cleanup. Used by `print.ts` for `--print` mode.

### 2.6 QueryEngine vs REPL Directly Calling query()

| Feature | QueryEngine (SDK/print) | REPL directly calls query() |
|---------|------------------------|---------------------------|
| Session persistence | Auto recordTranscript | Handled by useLogMessages |
| Usage tracking | Internal totalUsage accumulation | Handled by outer cost-tracker |
| Permission denial tracking | Records permissionDenials[] | Direct UI interaction |
| Result format | Yields SDKMessage format | Raw Message format |
| Message GC | Releases old messages after compact_boundary | UI needs to keep complete history |

---

## 3. claude.ts (3420 lines) — API Client

**File path**: `src/services/api/claude.ts`

### 3.1 File Structure

```
claude.ts (3420 lines)
├── [0-260]      Import section (many SDK types, utility functions)
├── [272-331]    getExtraBodyParams() — Build extra request body params
├── [333-502]    Cache-related (getPromptCachingEnabled, getCacheControl, should1hCacheTTL, configureEffortParams, configureTaskBudgetParams)
├── [504-587]    verifyApiKey() — API key validation
├── [589-675]    Message conversion (userMessageToMessageParam, assistantMessageToMessageParam)
├── [677-708]    Options type definition
├── [710-781]    queryModelWithoutStreaming / queryModelWithStreaming — Two public entry points
├── [783-813]    Helper functions (shouldDeferLspTool, getNonstreamingFallbackTimeoutMs)
├── [819-918]    executeNonStreamingRequest() — Non-streaming request helper
├── [920-999]    More helpers (getPreviousRequestIdFromMessages, stripExcessMediaItems)
├── [1018-3420]  ★ queryModel() — Core private function (2400 lines)
│   ├── [1018-1370]   Pre-checks + tool schema building + message normalization + system prompt assembly
│   ├── [1539-1730]   paramsFromContext() — Build API request parameters
│   ├── [1777-2100]   withRetry + streaming API call (anthropic.beta.messages.create + stream)
│   ├── [1941-2300]   Streaming event handling (for await of stream)
│   └── [2300-3420]   Non-streaming fallback + logging, analytics, cleanup
```

### 3.2 Two Public Entry Points

```ts
// Entry 1: Streaming (main path)
export async function* queryModelWithStreaming({
  messages, systemPrompt, thinkingConfig, tools, signal, options
}) {
  yield* withStreamingVCR(messages, async function* () {
    yield* queryModel(messages, systemPrompt, thinkingConfig, tools, signal, options)
  })
}

// Entry 2: Non-streaming (internal use like compact)
export async function queryModelWithoutStreaming({
  messages, systemPrompt, thinkingConfig, tools, signal, options
}) {
  let assistantMessage
  for await (const message of ...) {
    if (message.type === 'assistant') assistantMessage = message
  }
  return assistantMessage
}
```

Both delegate to the internal `queryModel()`. `withStreamingVCR` is a VCR (record/playback) wrapper for debugging.

### 3.3 Options Type (Line 677)

```ts
type Options = {
  getToolPermissionContext: () => Promise<ToolPermissionContext>
  model: string                      // Model name
  toolChoice?: BetaToolChoiceTool    // Force use of specific tool
  isNonInteractiveSession: boolean   // Whether non-interactive mode
  fallbackModel?: string             // Fallback model
  querySource: QuerySource           // Query source
  agents: AgentDefinition[]          // Agent definitions
  enablePromptCaching?: boolean      // Enable prompt caching
  effortValue?: EffortValue          // Reasoning effort level
  mcpTools: Tools                    // MCP tools
  fastMode?: boolean                 // Fast mode
  taskBudget?: { total: number; remaining?: number }  // Token budget
}
```

### 3.4 queryModel() Core Flow (Line 1018)

This is the core of the entire API call, 2400 lines. Key steps:

#### Phase 1: Pre-preparation (Lines 1018-1400)

```
queryModel()
  ├── Off-switch check (global kill switch when Opus is overloaded)
  ├── Beta headers assembly (getMergedBetas)
  │   ├── Base betas
  │   ├── Advisor beta (if enabled)
  │   ├── Tool search beta (if enabled)
  │   ├── Cache scope beta
  │   └── Effort / task budget betas
  │
  ├── Tool filtering
  │   ├── Tool search enabled → only include discovered deferred tools
  │   └── Tool search not enabled → filter out ToolSearchTool
  │
  ├── toolToAPISchema() — Convert each tool to API format
  │
  ├── normalizeMessagesForAPI() — Convert messages to API format
  │   ├── UserMessage → { role: 'user', content: ... }
  │   ├── AssistantMessage → { role: 'assistant', content: ... }
  │   └── Skip system/attachment/progress and other internal message types
  │
  └── Final system prompt assembly
      ├── getAttributionHeader(fingerprint)
      ├── getCLISyspromptPrefix()
      ├── ...systemPrompt
      └── Advisor instructions (if enabled)
```

#### Phase 2: Build Request Parameters — paramsFromContext() (Lines 1539-1730)

```ts
const paramsFromContext = (retryContext: RetryContext) => {
  // ... dynamic beta headers, effort, task budget config ...
  
  // Thinking mode config (adaptive or enabled + budget)
  let thinking = undefined
  if (hasThinking && modelSupportsThinking(options.model)) {
    if (modelSupportsAdaptiveThinking(options.model)) {
      thinking = { type: 'adaptive' }
    } else {
      thinking = { type: 'enabled', budget_tokens: thinkingBudget }
    }
  }

  return {
    model: normalizeModelStringForAPI(options.model),
    messages: addCacheBreakpoints(messagesForAPI, ...),  // Messages with cache markers
    system,                           // System prompt blocks (pre-built)
    tools: allTools,                  // Tool schemas
    tool_choice: options.toolChoice,
    max_tokens: maxOutputTokens,
    thinking,
    ...(temperature !== undefined && { temperature }),
    ...(useBetas && { betas: betasParams }),
    metadata: getAPIMetadata(),
    ...extraBodyParams,
    ...(speed !== undefined && { speed }),  // Fast mode
  }
}
```

#### Phase 3: Streaming API Call (Lines 1779-1858)

```ts
// Wrapped with withRetry for automatic retry handling
const generator = withRetry(
  () => getAnthropicClient({ maxRetries: 0, model, source: querySource }),
  async (anthropic, attempt, context) => {
    const params = paramsFromContext(context)

    // ★ Core API call (line 1823)
    // Uses .create() + stream: true (not .stream())
    // Avoids BetaMessageStream's O(n²) partial JSON parsing overhead
    const result = await anthropic.beta.messages
      .create(
        { ...params, stream: true },
        { signal, ...(clientRequestId && { headers: { ... } }) },
      )
      .withResponse()

    return result.data  // Stream<BetaRawMessageStreamEvent>
  },
  { model, fallbackModel, thinkingConfig, signal, querySource }
)

// Consume withRetry's system error messages (retry notifications, etc.)
let e
do {
  e = await generator.next()
  if (!('controller' in e.value)) yield e.value  // yield API error messages
} while (!e.done)
stream = e.value  // Get final Stream object

// Process streaming events (line 1941)
for await (const part of stream) {
  switch (part.type) {
    case 'message_start':    // Record request_id, usage
    case 'content_block_start':  // New content block starts (text/thinking/tool_use)
    case 'content_block_delta':  // Incremental content → yield stream_event to UI
    case 'content_block_stop':   // Content block complete → yield AssistantMessage
    case 'message_delta':    // stop_reason, usage update
    case 'message_stop':     // Entire message complete
  }
}
```

#### Phase 4: withRetry Retry Strategy

```
withRetry logic:
  ├── 429 (Rate Limit) → Wait for Retry-After then retry
  ├── 529 (Overloaded) → Switch to fallbackModel, throw FallbackTriggeredError
  ├── 500 (Server Error) → Exponential backoff retry
  ├── 408 (Timeout) → Retry
  ├── Other errors → Don't retry, throw directly
  └── Max retry count: Dynamically calculated based on model and error type
```

#### Phase 5: Non-streaming Fallback

When a streaming request fails mid-stream, may fall back to non-streaming:

```
Streaming fails (partial response already received):
  ├── Already received content → yield to upper layer
  ├── Remaining part → fall back to non-streaming request (anthropic.beta.messages.create)
  └── Non-streaming result → convert format and yield
```

### 3.5 Message Conversion Functions

```ts
// UserMessage → API format
userMessageToMessageParam(message, addCache, enablePromptCaching, querySource)
  → { role: 'user', content: [...] }
  // When addCache=true, adds cache_control to last content block

// AssistantMessage → API format
assistantMessageToMessageParam(message, addCache, enablePromptCaching, querySource)
  → { role: 'assistant', content: [...] }
  // thinking/redacted_thinking blocks don't get cache_control
```

### 3.6 Prompt Caching Strategy

```
Caching strategy:
  ├── cache_control: { type: 'ephemeral' }  — Default, 5 minute TTL
  ├── cache_control: { type: 'ephemeral', ttl: '1h' }  — Subscribed users/Ant, 1 hour
  ├── cache_control: { ..., scope: 'global' }  — Cross-session shared (when no MCP tools)
  └── Disable conditions:
      ├── DISABLE_PROMPT_CACHING environment variable
      ├── DISABLE_PROMPT_CACHING_HAIKU (Haiku only)
      └── DISABLE_PROMPT_CACHING_SONNET (Sonnet only)
```

### 3.7 Multi-Provider Support

`getAnthropicClient()` returns different SDK clients based on configuration:

| Provider | Entry | Description |
|----------|-------|-------------|
| Anthropic | Direct API | Default, `api.anthropic.com` |
| AWS Bedrock | Via Bedrock | Uses `@anthropic-ai/bedrock-sdk` |
| Google Vertex | Via Vertex | Uses `@anthropic-ai/vertex-sdk` |
| Azure | Via Azure | Similar to Bedrock wrapper |

Provider selection logic is in `src/utils/model/providers.ts`'s `getAPIProvider()`.

---

## Complete Data Flow: Lifecycle of a Single Tool Call

Using user input "Read README.md" as example:

```
1. REPL.tsx: User presses Enter
   onSubmit("Read README.md")
     └── handlePromptSubmit()
           └── onQuery([userMessage])

2. REPL.tsx: onQueryImpl()
   ├── getSystemPrompt() + getUserContext() + getSystemContext()
   └── for await (event of query({messages, systemPrompt, ...}))

3. query.ts: queryLoop() — Iteration 1
   ├── messagesForQuery = [...messages]  // Contains user message
   ├── deps.callModel({...})
   │     └── claude.ts: queryModel()
   │           ├── Build API parameters
   │           └── anthropic.beta.messages.create({ ...params, stream: true })
   │
   ├── API streaming response:
   │   content_block_start: { type: 'tool_use', name: 'Read', id: 'toolu_123' }
   │   content_block_delta: { input: '{"file_path": "/path/to/README.md"}' }
   │   content_block_stop
   │   message_delta: { stop_reason: 'tool_use' }
   │
   ├── Collected: toolUseBlocks = [{ name: 'Read', id: 'toolu_123', input: {...} }]
   ├── needsFollowUp = true
   │
   ├── Tool execution:
   │   streamingToolExecutor.getRemainingResults()
   │     └── Read tool executes → returns file content
   │   yield toolResultMessage  ← Contains file content
   │
   └── state = { messages: [...old, assistantMsg, toolResultMsg], turnCount: 2 }
       → continue

4. query.ts: queryLoop() — Iteration 2
   ├── messagesForQuery now contains:
   │   [userMsg, assistantMsg(tool_use), userMsg(tool_result)]
   │
   ├── deps.callModel({...})  ← Call API again
   │
   ├── API returns:
   │   content_block_start: { type: 'text' }
   │   content_block_delta: { text: "The contents of README.md are..." }
   │   content_block_stop
   │   message_delta: { stop_reason: 'end_turn' }
   │
   ├── toolUseBlocks = []  ← No tool calls
   ├── needsFollowUp = false
   │
   └── return { reason: 'completed' }  ★ Loop ends

5. REPL.tsx: onQueryEvent(event)
   ├── Update streamingText (typewriter effect)
   ├── Update messages array
   └── Re-render UI
```

---

## Key Design Patterns Summary

| Pattern | Location | Description |
|---------|----------|-------------|
| AsyncGenerator chain passing | query.ts → claude.ts | `yield*` transparently passes events from lower to upper layers, forming an event stream pipeline |
| while(true) + State object | query.ts queryLoop | State passed between loop iterations via immutable State, transition field records the reason |
| StreamingToolExecutor | query.ts | Executes tools in parallel during API streaming, without waiting for stream to end |
| Withheld messages | query.ts | Recoverable errors are held back without yielding; if recovery succeeds, the error is swallowed |
| withRetry | claude.ts | Auto-retry on 429/500/529, 529 triggers model fallback |
| Prompt Caching | claude.ts | Caches system prompts and message history, reducing API token consumption |
| Non-streaming fallback | claude.ts | Falls back to non-streaming to complete remaining portion when streaming fails mid-stream |
| QueryEngine wrapper | QueryEngine.ts | Provides session management, persistence, usage tracking for SDK/print |

## Code to Ignore

| Pattern | Description |
|---------|-------------|
| `feature('REACTIVE_COMPACT')` / `feature('CONTEXT_COLLAPSE')` etc. | All feature flag protected code — all dead code |
| `feature('CACHED_MICROCOMPACT')` | Cached micro-compact — dead code |
| `feature('HISTORY_SNIP')` / `snipModule` | History snipping — dead code |
| `feature('TOKEN_BUDGET')` / `budgetTracker` | Token budget — dead code |
| `feature('BG_SESSIONS')` / `taskSummaryModule` | Background sessions — dead code |
| `process.env.USER_TYPE === 'ant'` | Anthropic internal-only code |
| VCR (withStreamingVCR/withVCR) | Debug record/playback wrapper, doesn't affect normal flow |

# Claude Code Source Code Learning Path

> Source code learning tracker based on the decompiled Claude Code CLI (v2.1.888)
>
> Detailed notes for each phase can be found in the `phase-*.md` files in this directory

## Phase 1: Startup Flow (Entry Chain) ✅

Detailed notes: [phase-1-startup-flow.md](phase-1-startup-flow.md)

Understand the complete path from command-line startup to the user seeing the interactive interface.

- [x] `src/entrypoints/cli.tsx` — True entrypoint, polyfill injection + fast path dispatch
  - [x] Global polyfills: `feature()` always returns false, `MACRO` global object, `BUILD_*` constants
  - [x] Fast path design: checks from lowest to highest overhead, returning early when possible
  - [x] Dynamic import pattern: `await import()` for lazy loading, reducing startup time
  - [x] Final exit: `import("../main.jsx")` → `cliMain()`
- [x] `src/main.tsx` — Commander.js CLI definition, heavy initialization (4683 lines)
  - [x] Three-part structure: helper functions(1-584) → main()(585-856) → run()(884-4683)
  - [x] Side-effect imports: profileCheckpoint, startMdmRawRead, startKeychainPrefetch parallel preloading
  - [x] preAction hook: MDM wait, init(), migrations, remote settings
  - [x] Commander option definitions: 40+ CLI options
  - [x] Action handler (2800 lines): argument parsing → service initialization → showSetupScreens → launchRepl()
  - [x] --print branch goes to print.ts; interactive branch goes to launchRepl() (7 scenario branches)
  - [x] Subcommand registration: mcp/auth/plugin/doctor/update/install etc.
- [x] `src/replLauncher.tsx` — Bridge (22 lines), composes `<App>` + `<REPL>` for terminal rendering
- [x] `src/screens/REPL.tsx` — Interactive REPL interface (5009 lines)
  - [x] Props: commands, tools, messages, systemPrompt, thinkingConfig, etc.
  - [x] 50+ states: messages, inputValue, screen, streamingText, queryGuard, etc.
  - [x] Core data flow: onSubmit → handlePromptSubmit → onQuery → onQueryImpl → query() → onQueryEvent
  - [x] QueryGuard concurrency control: idle → running → idle, prevents duplicate queries
  - [x] Rendering: Transcript mode (read-only history) / Prompt mode (Messages + PermissionRequest + PromptInput)

**Data flow**: `bun run dev` → `package.json scripts.dev` → `bun run src/entrypoints/cli.tsx` → fast path checks → `main.tsx:main()` → `launchRepl()` → `<App><REPL /></App>`

---

## Phase 2: Core Conversation Loop ✅

Detailed notes: [phase-2-conversation-loop.md](phase-2-conversation-loop.md)

Understand how a user message becomes an API request, and how streaming responses and tool calls are handled.

- [x] `src/query.ts` — Core query loop (1732 lines)
  - [x] `query()` AsyncGenerator entry point, delegates to `queryLoop()`
  - [x] `queryLoop()` — while(true) main loop, State object manages iteration state
  - [x] Message preprocessing (autocompact, compact boundary)
  - [x] `deps.callModel()` → streaming API call
  - [x] StreamingToolExecutor — executes tools in parallel during API streaming
  - [x] Tool call loop (tool use → execute → result → continue)
  - [x] Error recovery (prompt-too-long, max_output_tokens upgrade + multi-turn recovery)
  - [x] Model fallback (FallbackTriggeredError → switch to fallbackModel)
  - [x] Withheld message pattern (hold back recoverable errors)
- [x] `src/QueryEngine.ts` — High-level orchestrator (1320 lines)
  - [x] QueryEngine class — one instance per conversation
  - [x] `submitMessage()` — processes user input → calls `query()` → consumes event stream
  - [x] Used for SDK/print mode (REPL calls query() directly)
  - [x] Session persistence (recordTranscript)
  - [x] Usage tracking, permission denial recording
  - [x] `ask()` convenience wrapper function
- [x] `src/services/api/claude.ts` — API client (3420 lines)
  - [x] `queryModelWithStreaming` / `queryModelWithoutStreaming` — two public entry points
  - [x] `queryModel()` — core private function (2400 lines)
  - [x] Request parameter assembly (system prompt, betas, tools, cache control)
  - [x] Anthropic SDK streaming call (`anthropic.beta.messages.stream()`)
  - [x] `BetaRawMessageStreamEvent` event handling (message_start/content_block_*/message_delta/stop)
  - [x] withRetry retry strategy (429/500/529 + model fallback)
  - [x] Prompt Caching strategy (ephemeral/1h TTL/global scope)
  - [x] Multi-provider support (Anthropic / Bedrock / Vertex / Azure)

**Data flow**: REPL.onSubmit → handlePromptSubmit → onQuery → onQueryImpl → `query()` AsyncGenerator → `queryLoop()` while(true) → `deps.callModel()` → `claude.ts queryModel()` → `anthropic.beta.messages.stream()` → streaming events → collect tool_use → execute tools → append results to messages → continue → return when no tool calls

---

## Phase 3: Tool System

Understand how Claude defines, registers, and calls tools. Read the framework first, then pick specific tools.

- [ ] `src/Tool.ts` — Tool interface definition
  - [ ] `Tool` type structure (name, description, inputSchema, call)
  - [ ] `findToolByName`, `toolMatchesName` utility functions
- [ ] `src/tools.ts` — Tool registry
  - [ ] Tool list assembly logic
  - [ ] Conditional loading (feature flags, USER_TYPE)
- [ ] Specific tool implementations (pick 2-3 for deep reading):
  - [ ] `src/tools/BashTool/` — Execute shell commands, most commonly used tool
  - [ ] `src/tools/FileReadTool/` — Read files, simple and intuitive, good for understanding the tool pattern
  - [ ] `src/tools/FileEditTool/` — Edit files, understand diff/patch mechanism
  - [ ] `src/tools/AgentTool/` — Sub-agent mechanism, complex but core

---

## Phase 4: Context and System Prompt

Understand how Claude "knows" project information, user preferences, and other context.

- [ ] `src/context.ts` — System/user context building
  - [ ] Git status injection
  - [ ] CLAUDE.md content loading
  - [ ] Memory files injection
  - [ ] Date, platform, and other environment info
- [ ] `src/utils/claudemd.ts` — CLAUDE.md discovery and loading
  - [ ] Project hierarchy search logic
  - [ ] Multi-level CLAUDE.md merging

---

## Phase 5: UI Layer (Optional Reading by Interest)

Understand the terminal UI rendering mechanism (React/Ink).

- [ ] `src/components/App.tsx` — Root component, Provider injection
- [ ] `src/state/AppState.tsx` — Global state types and Context
- [ ] `src/components/permissions/` — Tool permission approval UI
- [ ] `src/components/messages/` — Message rendering components

---

## Phase 6: Peripheral Systems (Explore as Needed)

- [ ] `src/services/mcp/` — MCP protocol (Model Context Protocol)
- [ ] `src/skills/` — Skills system (slash commands like /commit)
- [ ] `src/commands/` — CLI subcommands
- [ ] `src/tasks/` — Background task system
- [ ] `src/utils/model/providers.ts` — Multi-provider selection logic

---

## Learning Notes

### Key Design Patterns

| Pattern | Location | Description |
|---------|----------|-------------|
| Fast path | cli.tsx | Checks from lowest to highest overhead, reducing unnecessary module loading |
| Dynamic import | cli.tsx / main.tsx | `await import()` lazy loading, optimizing startup time |
| Feature flag | Global | `feature()` always returns false, all internal features disabled |
| React/Ink | UI layer | Uses React component model to render terminal UI |
| Tool loop | query.ts | AI returns tool call → execute → pass result back → continue, until no tool calls |
| AsyncGenerator chain | query.ts → claude.ts | `yield*` transparently passes event stream, forming a pipeline |
| State object | query.ts queryLoop | State passed between loop iterations via immutable State + transition field |
| StreamingToolExecutor | query.ts | Executes tools in parallel during API streaming |
| Withheld messages | query.ts | Holds back recoverable errors; swallows them if recovery succeeds |
| withRetry | claude.ts | Auto-retry on 429/500/529 + model fallback |
| Prompt Caching | claude.ts | Caches system prompts and message history, reducing token consumption |

### Content to Ignore

- `_c()` calls — React Compiler decompilation artifacts
- Code blocks after `feature('...')` — all dead code
- tsc type errors — from decompilation, doesn't affect Bun runtime
- `packages/@ant/` — stub packages, no actual implementation

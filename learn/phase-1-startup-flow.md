# Phase 1: Startup Flow Detailed

> The complete path from `bun run dev` to the user seeing the interactive interface

## Startup Chain Overview

```
bun run dev
  → package.json scripts.dev: "bun run src/entrypoints/cli.tsx"
    → cli.tsx: polyfill injection + fast path checks
      → import("../main.jsx") → cliMain()
        → main.tsx: main() → run()
          → Commander argument parsing → preAction hook
            → action handler: service initialization → showSetupScreens
              → launchRepl()
                → replLauncher.tsx: <App><REPL /></App>
                  → REPL.tsx: render interactive interface, wait for user input
```

---

## 1. cli.tsx (321 lines) — Entry and Fast Path Dispatch

**File path**: `src/entrypoints/cli.tsx`

### 1.1 Global Polyfills (Lines 1-53)

Side-effects executed immediately on module load, running before `main()`.

#### feature() Stub Function (Line 3)

```ts
const feature = (_name: string) => false;
```

In the original Claude Code build, the Bun bundler provides `feature()` via `bun:bundle` for **compile-time feature flags** (similar to C's `#ifdef`). The decompiled version has no build process, so it's defined to always return `false`.

**Effect**: All Anthropic internal feature branches are disabled, including:
- `COORDINATOR_MODE` — Coordinator mode
- `KAIROS` — Assistant mode
- `DAEMON` — Background daemon process
- `BRIDGE_MODE` — Remote control
- `SSH_REMOTE` — SSH remote
- `BG_SESSIONS` — Background sessions
- ... 20+ more flags

#### MACRO Global Object (Lines 4-14)

```ts
globalThis.MACRO = {
    VERSION: "2.1.888",
    BUILD_TIME: new Date().toISOString(),
    FEEDBACK_CHANNEL: "",
    ISSUES_EXPLAINER: "",
    NATIVE_PACKAGE_URL: "",
    PACKAGE_URL: "",
    VERSION_CHANGELOG: "",
};
```

In the original build, Bun inlines these values into the code. Here we simulate injection so that subsequent code can read `MACRO.VERSION`.

#### Build Constants (Lines 16-18)

```ts
BUILD_TARGET = "external";   // Marks as "external" build (not Anthropic internal)
BUILD_ENV = "production";    // Production environment
INTERFACE_TYPE = "stdio";    // Standard input/output mode
```

These three global variables are read throughout the code to distinguish the runtime environment. `"external"` means many `("external" as string) === 'ant'` checks will return false.

#### Environment Patches (Lines 22-33)

- Disables corepack auto pin (prevents polluting package.json)
- Sets Node.js heap memory limit to 8GB in remote mode

#### ABLATION_BASELINE (Lines 40-53)

```ts
if (feature("ABLATION_BASELINE") && ...) { ... }
```

`feature()` returns false, so this **never executes**. Anthropic internal A/B testing code.

### 1.2 main() Function (Lines 60-317)

Design pattern: **Fast path cascading** — checks from lowest to highest overhead, returning immediately on match.

#### Fast Path List

| Priority | Line | Check Condition | Function | Overhead | Executable |
|----------|------|----------------|----------|----------|------------|
| 1 | 64-72 | `--version` / `-v` | Print version and exit | **Zero imports** | Yes |
| 2 | 81-94 | `feature("DUMP_SYSTEM_PROMPT")` | Export system prompt | - | No (flag) |
| 3 | 95-99 | `--claude-in-chrome-mcp` | Chrome MCP service | Dynamic import | Yes |
| 4 | 101-105 | `--chrome-native-host` | Chrome Native Host | Dynamic import | Yes |
| 5 | 108-116 | `feature("CHICAGO_MCP")` | Computer Use MCP | - | No (flag) |
| 6 | 123-127 | `feature("DAEMON")` | Daemon Worker | - | No (flag) |
| 7 | 133-178 | `feature("BRIDGE_MODE")` | Remote control | - | No (flag) |
| 8 | 181-190 | `feature("DAEMON")` | Daemon main process | - | No (flag) |
| 9 | 195-225 | `feature("BG_SESSIONS")` | ps/logs/attach/kill | - | No (flag) |
| 10 | 228-240 | `feature("TEMPLATES")` | Template tasks | - | No (flag) |
| 11 | 244-253 | `feature("BYOC_ENVIRONMENT_RUNNER")` | BYOC runner | - | No (flag) |
| 12 | 258-264 | `feature("SELF_HOSTED_RUNNER")` | Self-hosted runner | - | No (flag) |
| 13 | 267-293 | `--tmux` + `--worktree` | tmux worktree | Dynamic import | Yes |

#### Argument Fixup (Lines 296-307)

```ts
// --update/--upgrade → rewrite as update subcommand
if (args[0] === "--update") process.argv = [..., "update"];
// --bare → set simple mode environment variable
if (args.includes("--bare")) process.env.CLAUDE_CODE_SIMPLE = "1";
```

#### Final Exit (Lines 310-316)

```ts
const { startCapturingEarlyInput } = await import("../utils/earlyInput.js");
startCapturingEarlyInput();           // Capture user input typed ahead of time
const { main: cliMain } = await import("../main.jsx");
await cliMain();                      // Enter main.tsx heavy initialization
```

When all fast paths miss (99% of cases), execution reaches here.

### 1.3 Startup (Line 320)

```ts
void main();
```

`void` means we don't care about the Promise return value.

### 1.4 Key Design Ideas

- **Fast path**: `--version` returns with zero overhead, loading no modules
- **Dynamic import**: `await import()` replaces static imports, each path only loads its own modules
- **Feature flag filtering**: `feature()` returning false turns large amounts of internal code into dead code

---

## 2. main.tsx (4683 lines) — Heavy Initialization and Commander CLI

**File path**: `src/main.tsx`

The largest single file in the project, but with clear structure: **helper functions → main() → run()**.

### 2.1 Import Section (Lines 1-215)

200+ lines of imports, loading nearly every subsystem. The key ones are the first three **side-effect imports** (execute on import):

```ts
// Line 9: Record timestamp
profileCheckpoint('main_tsx_entry');

// Line 16: Start MDM subprocess read (macOS plutil)
startMdmRawRead();

// Line 20: Start keychain prefetch (OAuth token, API key)
startKeychainPrefetch();
```

These three **start subprocesses in parallel** during the import phase, running concurrently with the ~135ms of module loading — **hiding latency through parallelism**.

### 2.2 Helper Functions (Lines 216-584)

| Function | Lines | Purpose |
|----------|-------|---------|
| `logManagedSettings()` | 216 | Log enterprise managed settings to analytics |
| `isBeingDebugged()` | 232 | Detect debug mode, **exits with code 1 for external builds** (line 266) |
| `logSessionTelemetry()` | 279 | Session telemetry (skills, plugins) |
| `getCertEnvVarTelemetry()` | 291 | SSL certificate environment variable collection |
| `runMigrations()` | 326 | Data migrations (model renaming, settings format upgrades, etc.) |
| `prefetchSystemContextIfSafe()` | 360 | Safely prefetch system context after trust relationship established |
| `startDeferredPrefetches()` | 388 | Deferred prefetches after REPL first render |
| `eagerLoadSettings()` | 502 | Pre-load `--settings` argument before init() |
| `initializeEntrypoint()` | 517 | Set `CLAUDE_CODE_ENTRYPOINT` based on run mode |

Also `_pendingConnect`, `_pendingSSH`, `_pendingAssistantChat` — three state variables (lines 542-583) for temporarily storing subcommand parameters.

### 2.3 main() Function (Lines 585-856)

`main()` itself isn't long — after environment detection, it calls `run()`:

```
main()
├── Security settings (NoDefaultCurrentDirectoryInExePath)
├── Signal handling (SIGINT → exit, exit → restore cursor)
├── Feature flag protected special paths (all skipped)
├── Detect -p/--print / --init-only → determine if interactive mode
├── clientType determination (cli / sdk-typescript / remote / github-action, etc.)
├── eagerLoadSettings()
└── await run()  ← Enter the real logic
```

### 2.4 run() Function (Lines 884-4683)

Takes up 3800 lines, the core of the entire file.

#### Commander Init + preAction Hook (Lines 884-967)

```ts
const program = new CommanderCommand()
    .configureHelp(createSortedHelpConfig())
    .enablePositionalOptions();
```

**preAction hook** (runs before all command execution):

```
preAction
├── await ensureMdmSettingsLoaded()         ← Wait for MDM subprocess to complete
├── await ensureKeychainPrefetchCompleted() ← Wait for keychain prefetch to complete
├── await init()                             ← One-time initialization
├── initSinks()                              ← Analytics log sinks
├── runMigrations()                          ← Data migrations
├── loadRemoteManagedSettings()              ← Enterprise remote settings (non-blocking)
└── loadPolicyLimits()                       ← Policy limits (non-blocking)
```

#### Main Command Option Definitions (Lines 968-1006)

Defines 40+ CLI parameters, key ones include:

| Parameter | Purpose |
|-----------|---------|
| `-p, --print` | Non-interactive mode, output and exit |
| `--model <model>` | Specify model (e.g., sonnet, opus) |
| `--permission-mode <mode>` | Permission mode |
| `-c, --continue` | Continue most recent conversation |
| `-r, --resume` | Resume specific conversation |
| `--mcp-config` | MCP server config file |
| `--allowedTools` | Allowed tools list |
| `--system-prompt` | Custom system prompt |
| `--dangerously-skip-permissions` | Skip all permission checks |
| `--output-format` | Output format (text/json/stream-json) |
| `--effort <level>` | Reasoning effort level (low/medium/high/max) |
| `--bare` | Minimal mode |

#### Action Handler (Lines 1006-3808)

Main command execution logic, branching by phase and scenario:

```
action(async (prompt, options) => {
    │
    ├── [1007-1600] Argument parsing and preprocessing
    │   ├── --bare mode
    │   ├── Parse model / permission-mode / thinking / effort
    │   ├── Parse MCP config, tools list, system prompt
    │   └── Initialize tool permission context
    │
    ├── [1600-2220] Service initialization
    │   ├── MCP client connections
    │   ├── Plugin loading + skill initialization
    │   ├── Tool list assembly
    │   └── Initial AppState construction
    │
    ├── [2220-2315] UI initialization (interactive mode)
    │   ├── createRoot() — Create Ink render root node
    │   ├── showSetupScreens() — Trust dialog, OAuth login, onboarding
    │   └── Refresh various services after login
    │
    ├── [2315-2582] Follow-up initialization
    │   ├── LSP manager, plugin version management
    │   ├── Session registration, telemetry logging
    │   └── Telemetry reporting
    │
    ├── [2584-3050] --print non-interactive mode branch
    │   ├── Build headless AppState + store
    │   └── Hand off to print.ts for execution
    │
    └── [3050-3808] Interactive mode: launch REPL (7 branches)
        ├── --continue      → Load most recent conversation → launchRepl()
        ├── DIRECT_CONNECT  → ❌ flag disabled
        ├── SSH_REMOTE      → ❌ flag disabled
        ├── KAIROS assistant → ❌ flag disabled
        ├── --resume <id>   → Resume specific conversation → launchRepl()
        ├── --resume no ID  → Show conversation picker
        └── Default (no args) → launchRepl()  ★ Most common path
})
```

#### Subcommand Registration (Lines 3808-4683)

| Subcommand | Lines | Purpose |
|------------|-------|---------|
| `claude mcp` | 3892 | MCP server management (serve/add/remove/list/get) |
| `claude server` | 3960 | Session server (❌ flag disabled) |
| `claude auth` | 4098 | Auth management (login/logout/status/token) |
| `claude plugin` | 4148 | Plugin management (install/uninstall/list/update) |
| `claude setup-token` | 4267 | Set long-lived auth token |
| `claude agents` | 4278 | List configured agents |
| `claude doctor` | 4346 | Health check |
| `claude update` | 4362 | Check for updates |
| `claude install` | 4394 | Install native build |
| `claude log` | 4411 | View conversation logs (internal) |
| `claude completion` | 4491 | Shell autocompletion |

Finally, parse execution:

```ts
await program.parseAsync(process.argv);
```

### 2.5 main.tsx Learning Tips

- **Don't read it cover to cover**. Remember the three-part structure: helper functions → main() → run()
- Skip all branches where `feature()` returns false — you can ignore 50%+ of the code
- Skip `("external" as string) === 'ant'` branches too (internal build only)
- When you need to dig into a specific feature, search to locate the relevant code section

---

## 3. replLauncher.tsx (22 lines) — Glue Layer

**File path**: `src/replLauncher.tsx`

Extremely simple, does one thing:

```tsx
export async function launchRepl(root, appProps, replProps, renderAndRun) {
  const { App } = await import('./components/App.js');
  const { REPL } = await import('./screens/REPL.js');
  await renderAndRun(root, <App {...appProps}><REPL {...replProps} /></App>);
}
```

- `App` — Global Provider (AppState, Stats, FpsMetrics)
- `REPL` — Interactive interface component
- `renderAndRun` — Renders React element to Ink terminal

Dynamic import maintains the on-demand loading strategy.

---

## 4. REPL.tsx (5009 lines) — Interactive Interface

**File path**: `src/screens/REPL.tsx`

The second-largest file in the project, the interface users interact with directly. One massive React function component.

### 4.1 File Structure

```
REPL.tsx (5009 lines)
├── [1-310]     Import section (150+ imports)
├── [312-525]   Helper components
│   ├── median()               — Math utility function
│   ├── TranscriptModeFooter   — Transcript mode footer bar
│   ├── TranscriptSearchBar    — Transcript search bar
│   └── AnimatedTerminalTitle  — Terminal title animation
├── [527-571]   Props type definition
└── [573-5009]  REPL() component body
    ├── [600-900]   State declarations (50+ useState/useRef/useAppState)
    ├── [900-2750]  Side effects and callbacks (useEffect/useCallback)
    ├── [2750-2860] onQueryImpl — Core: execute API query
    ├── [2860-3030] onQuery — Query guard and concurrency control
    ├── [3030-3145] Query-related helper callbacks
    ├── [3146-3550] onSubmit — User submission handling
    ├── [3550-4395] More side effects and state management
    └── [4396-5009] JSX rendering
```

### 4.2 Props

Passed from main.tsx through launchRepl():

| Prop | Type | Meaning |
|------|------|---------|
| `commands` | `Command[]` | Available slash commands |
| `debug` | `boolean` | Debug mode |
| `initialTools` | `Tool[]` | Initial tool set |
| `initialMessages` | `MessageType[]` | Initial messages (has values when resuming conversation) |
| `pendingHookMessages` | `Promise<...>` | Lazily loaded hook messages |
| `mcpClients` | `MCPServerConnection[]` | MCP server connections |
| `systemPrompt` | `string` | Custom system prompt |
| `appendSystemPrompt` | `string` | Appended system prompt |
| `onBeforeQuery` | `fn` | Pre-query callback, return false to prevent query |
| `onTurnComplete` | `fn` | Turn completion callback |
| `mainThreadAgentDefinition` | `AgentDefinition` | Main thread Agent definition |
| `thinkingConfig` | `ThinkingConfig` | Thinking mode configuration |
| `disabled` | `boolean` | Disable input |

### 4.3 State Management

Three layers:

**Global AppState (read via useAppState selectors):**

```ts
const toolPermissionContext = useAppState(s => s.toolPermissionContext);
const verbose = useAppState(s => s.verbose);
const mcp = useAppState(s => s.mcp);
const plugins = useAppState(s => s.plugins);
const agentDefinitions = useAppState(s => s.agentDefinitions);
```

**Local state (useState):**

```ts
const [messages, setMessages] = useState(initialMessages ?? []);
const [inputValue, setInputValue] = useState('');
const [screen, setScreen] = useState<Screen>('prompt');
const [streamingText, setStreamingText] = useState(null);
const [streamingToolUses, setStreamingToolUses] = useState([]);
// ... 50+ states
```

**Key Refs:**

```ts
const queryGuard = useRef(new QueryGuard()).current;  // Query concurrency control
const messagesRef = useRef(messages);                  // Sync reference for messages (avoids closure issues)
const abortController = ...;                           // Request cancellation controller
const responseLengthRef = useRef(0);                   // Response length tracking
```

### 4.4 Core Data Flow: User Input → API Call

```
User presses Enter
    │
    ▼
onSubmit (line 3146)
    ├── Slash command? → immediate command direct execution or handlePromptSubmit routing
    ├── Empty input? → ignore
    ├── Idle detection → may show "start new conversation?" dialog
    ├── Add to history
    │
    ▼
handlePromptSubmit (external function, src/utils/handlePromptSubmit.ts)
    ├── Slash command → route to corresponding Command handler
    ├── Plain text → build UserMessage, call onQuery()
    │
    ▼
onQuery (line 2860) — Concurrency guard layer
    ├── queryGuard.tryStart() → already querying? queue and wait
    ├── setMessages([...old, ...newMessages]) — append user messages
    ├── onQueryImpl()
    │
    ▼
onQueryImpl (line 2750) — Actually executes API call
    │
    ├── 1. Load context in parallel:
    │   await Promise.all([
    │       getSystemPrompt(),      // Build system prompt
    │       getUserContext(),        // User context
    │       getSystemContext(),      // System context (git, platform, etc.)
    │   ])
    │
    ├── 2. buildEffectiveSystemPrompt() — Compose final system prompt
    │
    ├── 3. for await (const event of query({...}))  ★ Core ★
    │   │   Calls src/query.ts query() AsyncGenerator
    │   │   Streams events
    │   │
    │   └── onQueryEvent(event) — Process each streaming event
    │       ├── Update streamingText (typewriter effect)
    │       ├── Update messages (tool call results)
    │       └── Update inProgressToolUseIDs
    │
    └── 4. Cleanup: resetLoadingState(), onTurnComplete()
```

**Core code (lines 2797-2807)**:

```ts
for await (const event of query({
    messages: messagesIncludingNewMessages,
    systemPrompt,
    userContext,
    systemContext,
    canUseTool,
    toolUseContext,
    querySource: getQuerySourceForREPL()
})) {
    onQueryEvent(event);
}
```

`query()` comes from `src/query.ts`, the core function to study in Phase 2.

### 4.5 QueryGuard Concurrency Control

State machine preventing multiple simultaneous API requests:

```
idle ──tryStart()──▶ running ──end()──▶ idle
                        │
                        └── tryStart() returns null (already running)
                            → new messages queued
```

- `tryStart()` — atomic operation, checks and transitions idle→running, returns generation number
- `end(generation)` — checks generation match then transitions running→idle
- Prevents cancel+resubmit race conditions

### 4.6 JSX Rendering

Two mutually exclusive rendering branches:

#### Transcript Mode (Lines 4396-4493)

Toggle with `v` key, read-only conversation history browsing with search:

```tsx
<KeybindingSetup>
  <AnimatedTerminalTitle />
  <GlobalKeybindingHandlers />
  <ScrollKeybindingHandler />
  <CancelRequestHandler />
  <FullscreenLayout
    scrollable={<Messages />}
    bottom={<TranscriptSearchBar /> or <TranscriptModeFooter />}
  />
</KeybindingSetup>
```

#### Prompt Mode (Lines 4552-5009)

Main interactive interface, top to bottom:

```tsx
<KeybindingSetup>
  <AnimatedTerminalTitle />           // Terminal tab title
  <GlobalKeybindingHandlers />        // Global shortcuts
  <CommandKeybindingHandlers />       // Command shortcuts
  <ScrollKeybindingHandler />         // Scroll shortcuts
  <CancelRequestHandler />           // Ctrl+C cancel
  <MCPConnectionManager>             // MCP connection management
    <FullscreenLayout
      overlay={<PermissionRequest />}  // Permission approval overlay
      scrollable={                     // Scrollable area
        <>
          <Messages />                 // ★ Conversation message rendering
          <UserTextMessage />          // User input placeholder
          {toolJSX}                    // Tool UI
          <SpinnerWithVerb />          // Loading animation
        </>
      }
      bottom={                         // Fixed bottom
        <>
          {/* Various dialogs */}
          <SandboxPermissionRequest />
          <PromptDialog />
          <ElicitationDialog />
          <CostThresholdDialog />
          <FeedbackSurvey />

          {/* ★ User input box */}
          <PromptInput
            onSubmit={onSubmit}
            commands={commands}
            isLoading={isLoading}
            messages={messages}
            // ... 20+ props
          />
        </>
      }
    />
  </MCPConnectionManager>
</KeybindingSetup>
```

### 4.7 REPL.tsx Learning Tips

- The core is just one line: `onSubmit → onQuery → query() → onQueryEvent → update messages`
- The remaining 4000+ lines are UI details: shortcuts, dialogs, animations, edge case handling
- Skip all JSX guarded by `feature('...')`
- Skip `("external" as string) === 'ant'` branches too

---

## Key Design Patterns Summary

| Pattern | Location | Description |
|---------|----------|-------------|
| Fast path | cli.tsx | Checks from lowest to highest overhead, zero-cost handling of simple requests |
| Dynamic import | cli.tsx / main.tsx | `await import()` lazy loading, each path only loads needed modules |
| Side-effect import | main.tsx top | Starts subprocesses in parallel during import phase, hiding latency through parallelism |
| Feature flag | Global | `feature()` always returns false, dead code elimination at compile time |
| preAction hook | main.tsx run() | Unified initialization before Commander.js command execution |
| QueryGuard | REPL.tsx | State machine prevents concurrent API requests, with generation counting to prevent races |
| React/Ink | UI layer | Uses React component model to render terminal UI, supporting fullscreen and virtual scrolling |

## Code Patterns to Ignore

| Pattern | Source | Description |
|---------|--------|-------------|
| `_c(N)` calls | React Compiler | Memoization boilerplate from decompilation |
| Code after `feature('FLAG')` | Bun bundler | All dead code, never executes in current version |
| `("external" as string) === 'ant'` | Build target check | Always false (external !== ant) |
| tsc type errors | Decompilation | `unknown`/`never`/`{}` types, doesn't affect Bun runtime |
| `packages/@ant/` | Stub packages | Empty implementations, only satisfy import dependencies |

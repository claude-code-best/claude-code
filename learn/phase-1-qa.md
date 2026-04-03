# Phase 1 Q&A

## Q1: What exactly does cli.tsx's fast path dispatch do?

**Core idea**: Based on the user's command-line arguments, decide which path to take as early as possible to avoid loading unnecessary code. cli.tsx acts as a lightweight router, handling simple requests in place, and only loading main.tsx when the full CLI is actually needed.

### Scenario Comparison

#### Scenario 1: `claude --version` (fast path hit)

```
cli.tsx main() starts executing
  ├── args = ["--version"]
  ├── Hits line 64: args[0] === "--version" ✅
  ├── console.log("2.1.888 (Claude Code)")
  └── return  ← Exits immediately, zero imports, ~10ms
```

#### Scenario 2: `claude --claude-in-chrome-mcp` (intermediate path hit)

```
cli.tsx main() starts executing
  ├── Line 64: --version? ❌
  ├── Line 75: Load profileCheckpoint (only this one import)
  ├── Line 81: feature("DUMP_SYSTEM_PROMPT") → false ❌
  ├── Line 95: --claude-in-chrome-mcp? ✅ Hit
  ├── await import("../utils/claudeInChrome/mcpServer.js")  ← Only loads this one module
  └── return  ← Didn't load main.tsx's 200+ imports
```

#### Scenario 3: `claude` (no arguments, most common, all miss)

```
cli.tsx main() starts executing
  ├── --version?           ❌
  ├── profileCheckpoint loaded
  ├── feature(DUMP)?       ❌ (feature=false)
  ├── --chrome-mcp?        ❌
  ├── --chrome-native?     ❌
  ├── feature(CHICAGO)?    ❌ (feature=false)
  ├── feature(DAEMON)?     ❌ (feature=false)
  ├── feature(BRIDGE)?     ❌ (feature=false)
  ├── ... all fast paths checked one by one, all miss
  │
  ├── Reaches line 310 ← Final exit
  ├── await import("../main.jsx")  ← Load full CLI (200+ imports, ~135ms)
  └── await cliMain()              ← Enter main.tsx heavy initialization
```

### Performance Comparison

| Approach | `claude --version` time |
|----------|------------------------|
| No fast path (everything goes through main.tsx) | ~200ms (load 200+ imports → init Commander → parse args → print) |
| With fast path (cli.tsx intercepts) | ~10ms (read args → print → exit) |

### feature()'s Acceleration Effect

Many fast paths are guarded by `feature()`:

```ts
if (feature("DAEMON") && args[0] === "daemon") { ... }
```

`feature()` returns false → `&&` short-circuit evaluation → doesn't even check `args[0]`, skips immediately. In the decompiled version these paths effectively don't exist, further accelerating the "all miss → take default path" process.

---

## Q2: What are the specific execution flows for different commands in main.tsx?

All commands go through main() → run(), but within run() they route to different branches via Commander.

### Scenario 1: `claude` (no arguments — start interactive REPL)

The most common scenario, follows the complete main command path:

```
main() (line 585)
  ├── Signal handler registration (SIGINT, exit)
  ├── Feature flag paths all skipped
  ├── isNonInteractive = false (has TTY, no -p)
  ├── clientType = 'cli'
  └── await run()
       │
       ▼
  run() (line 884)
  ├── Commander init + preAction hook + main command option registration
  ├── isPrintMode = false → register all subcommands
  └── program.parseAsync(process.argv)
       │  Commander matches main command, executes preAction first
       ▼
  preAction (line 907)
  ├── await ensureMdmSettingsLoaded()        ← Wait for side-effect import subprocess to finish
  ├── await ensureKeychainPrefetchCompleted() ← Wait for keychain prefetch to complete
  ├── await init()                            ← Telemetry, config, trust
  ├── initSinks()                             ← Analytics logs
  ├── runMigrations()                         ← Data migrations
  └── loadRemoteManagedSettings() / loadPolicyLimits() ← Non-blocking
       │  Then execute action handler
       ▼
  action(undefined, options) (line 1007)     ← prompt = undefined
  ├── [Arg parsing] permissionMode, model, thinkingConfig...
  ├── [Tool loading] tools = getTools(toolPermissionContext)
  ├── [Parallel init]
  │   ├── setup()        ← worktree, CWD
  │   ├── getCommands()  ← Load slash commands
  │   └── getAgentDefinitionsWithOverrides() ← Load agent definitions
  ├── [MCP connections] Connect configured MCP servers
  ├── [Build initial state] initialState = { tools, mcp, permissions, ... }
  │
  ├── [UI init] (interactive mode only)
  │   ├── createRoot()          ← Create Ink render root node
  │   └── showSetupScreens()    ← Trust dialog / OAuth / onboarding
  │
  ├── [Follow-up init] LSP, plugin versions, session registration
  │
  └── Default branch (line 3760) ← No --continue/--resume/--print
      └── await launchRepl(root, {
              initialState
          }, {
              ...sessionConfig,
              initialMessages: undefined  ← Brand new conversation, no history
          }, renderAndRun)
            │
            ▼
          REPL.tsx renders, user sees blank conversation interface
```

### Scenario 2: `echo "explain this" | claude -p` (pipe/non-interactive mode)

```
main() →
  ├── isNonInteractive = true (-p flag + stdin is not TTY)
  ├── clientType = 'sdk-cli'
  └── run()
       │
       ▼
  run()
  ├── Commander init + preAction + main command options
  ├── isPrintMode = true
  │   → ★ Skip all subcommand registration (saves ~65ms)
  └── program.parseAsync()  ← Parse directly, Commander routes to main command action
       │
       ▼
  preAction → init, migrations, etc. (same as Scenario 1)
       │
       ▼
  action("", { print: true, ... })
  ├── inputPrompt = await getInputPrompt("")
  │   ├── stdin.isTTY = false → read data from stdin
  │   ├── Wait up to 3s to read: "explain this"
  │   └── Return "explain this"
  ├── tools = getTools()
  ├── setup() + getCommands() (parallel)
  │
  ├── isNonInteractiveSession = true → take --print branch (line 2584)
  │   ├── applyConfigEnvironmentVariables() ← -p mode implied trust
  │   ├── Build headlessInitialState (no UI)
  │   ├── headlessStore = createStore(headlessInitialState)
  │   │
  │   ├── await import('src/cli/print.js')
  │   └── runHeadless(inputPrompt, ...)  ★ Doesn't go through REPL
  │       ├── Send API request
  │       ├── Stream output to stdout
  │       └── process.exit() when done
  │
  └── ← Doesn't go through createRoot(), showSetupScreens(), launchRepl()
```

**Key differences**:
- After detecting `-p`, subcommand registration is skipped (saves ~65ms)
- No Ink UI created, no `showSetupScreens()` called
- Reads input from stdin (`getInputPrompt` line 857)
- Takes `print.js` path to directly execute query and output to stdout

### Scenario 3: `claude -c` (continue most recent conversation)

```
... main() → run() → preAction → action (first half same as Scenario 1)
       │
       ▼
  action(undefined, { continue: true, ... })
  ├── [Arg parsing + tool loading + parallel init + UI init] (same as Scenario 1)
  │
  ├── options.continue = true → hits line 3101
  │   ├── clearSessionCaches()       ← Clear expired caches
  │   ├── result = await loadConversationForResume()
  │   │   └── Read most recent session JSONL from ~/.claude/projects/<cwd>/
  │   │
  │   ├── result is null? → exitWithError("No conversation found")
  │   │
  │   ├── loaded = await processResumedConversation(result)
  │   │   ├── Parse JSONL → messages[]
  │   │   ├── Restore file history snapshots
  │   │   └── Rebuild initialState
  │   │
  │   └── await launchRepl(root, {
  │           initialState: loaded.initialState
  │       }, {
  │           ...sessionConfig,
  │           initialMessages: loaded.messages,            ★ With history messages
  │           initialFileHistorySnapshots: loaded.fileHistorySnapshots,
  │           initialAgentName: loaded.agentName
  │       }, renderAndRun)
  │         │
  │         ▼
  │       REPL.tsx renders, shows historical conversation, user continues chatting
  │
  └── ← Other branches don't execute
```

**Key difference**: `initialMessages` has values (historical messages), REPL renders previous conversation content on startup.

### Scenario 4: `claude mcp list` (subcommand)

```
main() → run()
       │
       ▼
  run()
  ├── Commander init + preAction hook
  ├── Register main command .action(...)
  ├── isPrintMode = false → register all subcommands
  │   ├── program.command('mcp') (line 3894)
  │   │   ├── mcp.command('serve').action(...)
  │   │   ├── mcp.command('add').action(...)
  │   │   ├── mcp.command('list').action(async () => {  ★
  │   │   │       const { mcpListHandler } = await import('./cli/handlers/mcp.js');
  │   │   │       await mcpListHandler();
  │   │   │   })
  │   │   └── ...
  │   ├── program.command('auth')
  │   ├── program.command('doctor')
  │   └── ...
  │
  └── program.parseAsync(["node", "claude", "mcp", "list"])
       │  Commander matches mcp → list
       ▼
  preAction (line 907)     ← Subcommands also trigger preAction
  ├── await init()
  ├── initSinks()
  ├── runMigrations()
  └── ...
       │
       ▼  Execute the subcommand's own action (doesn't go through main command action)
  mcp list action
  ├── await import('./cli/handlers/mcp.js')
  └── await mcpListHandler()
      ├── Read MCP config (user/project/local three levels)
      ├── Connect to each server for health check
      ├── Format output to terminal
      └── Exit

  ← Main command's action handler doesn't execute at all
  ← No REPL, no Ink UI, no showSetupScreens
```

**Key differences**:
- Commander routes to subcommand, **main command action completely skipped**
- `preAction` still executes (basic initialization needed by all commands)
- Subcommands have their own independent lightweight actions

### Four Scenario Comparison

| | `claude` | `claude -p` | `claude -c` | `claude mcp list` |
|---|---------|------------|------------|-------------------|
| preAction | Executes | Executes | Executes | Executes |
| Main command action | Executes | Executes | Executes | **Skipped** |
| Subcommand registration | Registered | **Skipped** | Registered | Registered |
| showSetupScreens | Executes | **Skipped** | Executes | **Skipped** |
| createRoot (Ink) | Executes | **Skipped** | Executes | **Skipped** |
| Load history messages | No | No | **Yes** | No |
| Final exit point | launchRepl | print.js | launchRepl | Subcommand action |

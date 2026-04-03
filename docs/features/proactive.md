# PROACTIVE — Proactive Mode

> Feature Flag: `FEATURE_PROACTIVE=1` (shares functionality with `FEATURE_KAIROS=1`)
> Implementation Status: All core modules are Stub, wiring complete
> Reference Count: 37

## 1. Feature Overview

PROACTIVE implements a tick-driven autonomous agent. The CLI continues working even when the user is not providing input: it wakes up on a timer to execute tasks, using SleepTool to control pacing. Suitable for long-running background tasks (waiting for CI, monitoring file changes, periodic checks, etc.).

### Relationship with KAIROS

All code checks use `feature('PROACTIVE') || feature('KAIROS')`, meaning:
- Enabling `FEATURE_PROACTIVE=1` alone -> gets proactive capabilities
- Enabling `FEATURE_KAIROS=1` alone -> automatically gets proactive capabilities
- Both enabled -> same effect (no duplication)

## 2. Implementation Architecture

### 2.1 Module Status

| Module | File | Status | Description |
|--------|------|--------|-------------|
| Core Logic | `src/proactive/index.ts` | **Stub** | `activateProactive()`, `deactivateProactive()`, `isProactiveActive() => false` |
| SleepTool Prompt | `src/tools/SleepTool/prompt.ts` | **Complete** | Tool prompt definition (tool name: `Sleep`) |
| Command Registration | `src/commands.ts:62-65` | **Wired** | Dynamic loading of `./commands/proactive.js` |
| Tool Registration | `src/tools.ts:26-28` | **Wired** | SleepTool dynamic loading |
| REPL Integration | `src/screens/REPL.tsx` | **Wired** | Tick-driven logic, placeholders, footer UI |
| System Prompt | `src/constants/prompts.ts:860-914` | **Complete** | Autonomous work behavior instructions (~55 lines of detailed prompt) |
| Session Storage | `src/utils/sessionStorage.ts:4892-4912` | **Wired** | Tick message injection into conversation flow |

### 2.2 System Prompt Content

Autonomous work instructions injected by `getProactiveSection()`:

| Section | Content |
|---------|---------|
| Tick-Driven | `<tick_tag>` prompt keeps alive, includes user's local time |
| Pacing Control | SleepTool controls wait intervals, prompt cache expires in 5 minutes |
| No-Op Rules | When nothing to do, **must** call Sleep, forbidden to output "still waiting" |
| First Wake | Brief greeting, wait for direction (do not proactively explore) |
| Subsequent Wakes | Look for useful work: investigate, verify, check (do not spam user) |
| Bias Toward Action | Read files, search code, commit — no need to ask |
| Terminal Focus | `terminalFocus` field adjusts autonomy level |

### 2.3 Data Flow

```
activateProactive() [needs implementation]
      |
      v
Tick scheduler starts
      |
      +-- Periodically generates <tick_tag> messages
      |   +-- Contains user's current local time
      |   +-- Injected into conversation flow (sessionStorage)
      |
      v
Model processes tick
      |
      +-- Has work to do -> use tools to execute -> may Sleep again
      +-- Nothing to do -> must call SleepTool
      |
      v
SleepTool waits [needs implementation]
      |
      v
Next tick arrives
```

## 3. Content Needing Implementation

| Priority | Module | Effort | Description |
|----------|--------|--------|-------------|
| 1 | `src/proactive/index.ts` | Medium | Tick scheduler, activate/deactivate state machine, pause/resume |
| 2 | `src/tools/SleepTool/SleepTool.ts` | Small | Tool execution (wait specified time then trigger tick) |
| 3 | `src/commands/proactive.js` | Small | `/proactive` slash command handler |
| 4 | `src/hooks/useProactive.ts` | Medium | React hook (referenced by REPL but does not exist) |

## 4. Key Design Decisions

1. **Tick-Driven**: Model controls its own wake frequency via SleepTool, not external event push
2. **No-Op Must Sleep**: Prevents "still waiting" empty messages that waste turns and tokens
3. **Prompt Cache Consideration**: SleepTool prompt mentions cache 5-minute expiry, suggests balancing wait time
4. **Terminal Focus Awareness**: Model adjusts autonomy level based on whether user is watching the terminal

## 5. Usage

```bash
# Enable proactive standalone
FEATURE_PROACTIVE=1 bun run dev

# Enable indirectly via KAIROS
FEATURE_KAIROS=1 bun run dev

# Combined usage
FEATURE_PROACTIVE=1 FEATURE_KAIROS=1 FEATURE_KAIROS_BRIEF=1 bun run dev
```

## 6. File Index

| File | Responsibility |
|------|----------------|
| `src/proactive/index.ts` | Core logic (stub) |
| `src/tools/SleepTool/prompt.ts` | SleepTool tool prompt |
| `src/constants/prompts.ts:860-914` | Autonomous work system prompt |
| `src/screens/REPL.tsx` | REPL tick integration |
| `src/utils/sessionStorage.ts:4892-4912` | Tick message injection |
| `src/components/PromptInput/PromptInputFooterLeftSide.tsx` | Footer UI state |

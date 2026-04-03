# Feature Exploration Plan

> Generated: 2026-04-02
> 89 feature flags identified in the codebase. This document prioritizes them by implementation completeness and exploration value, with a phased roadmap.
>
> **Completed**: BUDDY (completed 2026-04-02), TRANSCRIPT_CLASSIFIER / Auto Mode (completed 2026-04-02)

---

## I. Overview

### By Implementation Status

| Status | Count | Description |
|--------|-------|-------------|
| Implemented/Available | 11 | Code complete; runs when feature is enabled (may require external dependencies like OAuth) |
| Partially Implemented | 8 | Core logic exists but key modules are stubs; needs completion |
| Pure Stub | 15 | All functions/tools return empty values; needs implementation from scratch |
| N/A | 55+ | Internal infrastructure, low-reference utility features, or too much lost in decompilation |

### How to Enable

All features are enabled via environment variables:

```bash
# Single feature
FEATURE_BUDDY=1 bun run dev

# Multiple features combined
FEATURE_KAIROS=1 FEATURE_PROACTIVE=1 FEATURE_FORK_SUBAGENT=1 bun run dev
```

---

## II. Tier 1 — Implemented/Available (Priority Exploration)

### 2.1 KAIROS (Persistent Assistant Mode) — Highest Priority

- **References**: 154 (highest in codebase)
- **Functionality**: Turns the CLI into a persistent background assistant, supporting:
  - Persistent bridge sessions (reuse session across restarts)
  - Background task execution (continues working when user leaves terminal)
  - Push notifications to mobile (on task completion/input needed)
  - Daily memory log + `/dream` knowledge distillation
  - External channel message integration (Slack/Discord/Telegram)
- **Sub-Features**:

| Sub-Feature | Refs | Functionality |
|-------------|------|---------------|
| `KAIROS_BRIEF` | 39 | Brief tool (`SendUserMessage`), structured message output |
| `KAIROS_CHANNELS` | 19 | External channel message integration |
| `KAIROS_PUSH_NOTIFICATION` | 4 | Mobile push notifications |
| `KAIROS_GITHUB_WEBHOOKS` | 3 | GitHub PR webhook subscription |
| `KAIROS_DREAM` | 1 | Nighttime memory distillation |

- **Key Files**: `src/assistant/`, `src/tools/BriefTool/`, `src/services/mcp/channelNotification.ts`, `src/memdir/memdir.ts`
- **External Dependencies**: Anthropic OAuth (claude.ai subscription), GrowthBook feature gating
- **Exploration Command**: `FEATURE_KAIROS=1 FEATURE_KAIROS_BRIEF=1 FEATURE_PROACTIVE=1 bun run dev`

**Exploration Steps**:
1. Enable feature, observe startup behavior changes
2. Test `/assistant`, `/brief` commands
3. Verify BriefTool output mode
4. Try channel message integration
5. Test `/dream` memory distillation

---

### ~~2.2 TRANSCRIPT_CLASSIFIER (Auto Mode Classifier)~~ — Completed

- **References**: 108
- **Functionality**: Uses LLM to classify user intent, implementing auto mode (automatic tool permission decisions)
- **Status**: Prompt template rebuilt, fully functional (completed 2026-04-02)

---

### 2.3 VOICE_MODE (Voice Input)

- **References**: 46
- **Functionality**: Push-to-Talk, audio streaming to Anthropic STT endpoint (Nova 3), real-time transcription display
- **Current Status**: **Fully implemented**, including recording, WebSocket streaming, transcription insertion
- **Key Files**: `src/voice/voiceModeEnabled.ts`, `src/hooks/useVoice.ts`, `src/services/voiceStreamSTT.ts`
- **External Dependencies**: Anthropic OAuth (not API key), macOS native audio or SoX
- **Exploration Command**: `FEATURE_VOICE_MODE=1 bun run dev`
- **Default Shortcut**: Hold spacebar to record

**Exploration Steps**:
1. Confirm OAuth token is available
2. Test hold spacebar to record, release to transcribe
3. Verify real-time interim transcription display
4. Test `/voice` command toggle

---

### 2.4 TEAMMEM (Team Shared Memory)

- **References**: 51
- **Functionality**: GitHub repo-based team shared memory system, `memory/team/` directory bidirectional sync to Anthropic servers
- **Current Status**: **Fully implemented**, including incremental sync, conflict resolution, secret scanning, path traversal protection
- **Key Files**: `src/services/teamMemorySync/` (index, watcher, secretScanner), `src/memdir/teamMemPaths.ts`
- **External Dependencies**: Anthropic OAuth + GitHub remote (`getGithubRepo()`)
- **Exploration Command**: `FEATURE_TEAMMEM=1 bun run dev`

**Exploration Steps**:
1. Confirm project has a GitHub remote
2. Enable and observe `memory/team/` directory creation
3. Test team memory write and sync
4. Verify secret scanning protection

---

### 2.5 COORDINATOR_MODE (Multi-Agent Orchestration)

- **References**: 32
- **Functionality**: CLI becomes an orchestrator, dispatching tasks to multiple workers for parallel execution via AgentTool
- **Current Status**: Core logic implemented, worker agent module is a stub
- **Key Files**: `src/coordinator/coordinatorMode.ts` (system prompt complete), `src/coordinator/workerAgent.ts` (stub)
- **Limitation**: Orchestrator can only use AgentTool/TaskStop/SendMessage; cannot directly operate files
- **Exploration Command**: `FEATURE_COORDINATOR_MODE=1 CLAUDE_CODE_COORDINATOR_MODE=1 bun run dev`

**Exploration Steps**:
1. Complete the `workerAgent.ts` stub
2. Test multi-worker parallel task dispatch
3. Verify worker result aggregation

---

### 2.6 BRIDGE_MODE (Remote Control)

- **References**: 28
- **Functionality**: Local CLI registers as a bridge environment, can be remotely driven from claude.ai or other control planes
- **Current Status**: Both v1 (env-based) and v2 (env-less) implementations exist
- **Key Files**: `src/bridge/bridgeEnabled.ts`, `src/bridge/replBridge.ts` (v1), `src/bridge/remoteBridgeCore.ts` (v2)
- **External Dependencies**: claude.ai OAuth, GrowthBook gate `tengu_ccr_bridge`
- **Exploration Command**: `FEATURE_BRIDGE_MODE=1 bun run dev`

---

### 2.7 FORK_SUBAGENT (Context-Inheriting Sub-Agent)

- **References**: 4
- **Functionality**: AgentTool spawns fork sub-agents that inherit the parent's full conversation context, optimizing prompt cache
- **Current Status**: **Fully implemented** (`forkSubagent.ts`), supports worktree isolation notification, recursion guard
- **Key Files**: `src/tools/AgentTool/forkSubagent.ts`
- **Exploration Command**: `FEATURE_FORK_SUBAGENT=1 bun run dev`

---

### 2.8 TOKEN_BUDGET (Token Budget Control)

- **References**: 9
- **Functionality**: Parses user-specified token budget (e.g. "spend 2M tokens"), automatically continues working until target is reached
- **Current Status**: Parser **fully implemented**, supports shorthand and verbose syntax; QueryEngine turn logic is connected
- **Key Files**: `src/utils/tokenBudget.ts`, `src/QueryEngine.ts`
- **Exploration Command**: `FEATURE_TOKEN_BUDGET=1 bun run dev`

---

### 2.9 MCP_SKILLS (MCP Skill Discovery)

- **References**: 9
- **Functionality**: Filters prompt-type commands from MCP servers into callable skills
- **Current Status**: **Functional implementation** (config-gated filter)
- **Key Files**: `src/commands.ts` (`getMcpSkillCommands()`)
- **Exploration Command**: `FEATURE_MCP_SKILLS=1 bun run dev`

---

### 2.10 TREE_SITTER_BASH (Bash AST Parsing)

- **References**: 3
- **Functionality**: Pure TypeScript bash command AST parser for fail-closed permission matching
- **Current Status**: **Fully implemented** (`bashParser.ts` ~2000 lines + `ast.ts` ~400 lines)
- **Key Files**: `src/utils/vendor/tree-sitter-bash/`
- **Exploration Command**: `FEATURE_TREE_SITTER_BASH=1 bun run dev`

---

### ~~2.11 BUDDY (Virtual Companion)~~ — Completed

- **References**: 16
- **Functionality**: `/buddy` command, supports hatch/rehatch/pet/mute/unmute
- **Status**: Merged, fully functional (completed 2026-04-02)

---

## III. Tier 2 — Partially Implemented (Needs Completion)

### 3.1 PROACTIVE (Proactive Mode)

- **References**: 37
- **Functionality**: Tick-driven autonomous agent, periodically wakes up to perform work, uses SleepTool to control pacing
- **Current Status**: Core module `src/proactive/index.ts` **entirely stubbed** (activate/deactivate/pause return false or no-op)
- **Dependency**: Tightly coupled with KAIROS (all checks are `feature('PROACTIVE') || feature('KAIROS')`)
- **Completion Effort**: Medium — need to implement tick generation, SleepTool integration, pause/resume logic

### 3.2 BASH_CLASSIFIER (Bash Command Classifier)

- **References**: 45
- **Functionality**: LLM-driven bash command intent classification (allow/deny/ask)
- **Current Status**: `bashClassifier.ts` **entirely stubbed** (`matches: false`)
- **Completion Effort**: Large — needs LLM call implementation, prompt design

### 3.3 ULTRAPLAN (Enhanced Planning)

- **References**: 10
- **Functionality**: Keyword-triggered enhanced plan mode; typing "ultraplan" automatically converts to plan
- **Current Status**: Keyword detection **fully implemented**, `/ultraplan` command **is a stub**
- **Completion Effort**: Small — only need to implement command handling logic

### 3.4 EXPERIMENTAL_SKILL_SEARCH (Skill Semantic Search)

- **References**: 21
- **Functionality**: DiscoverSkills tool, semantically searches available skills based on current task
- **Current Status**: Wiring complete, core search logic is a stub
- **Completion Effort**: Medium — need to implement search engine and index

### 3.5 CONTEXT_COLLAPSE (Context Collapse)

- **References**: 20
- **Functionality**: CtxInspectTool lets the model introspect context window size, optimizing compaction decisions
- **Current Status**: Tool is a stub, HISTORY_SNIP sub-feature also a stub
- **Completion Effort**: Medium

### 3.6 WORKFLOW_SCRIPTS (Workflow Automation)

- **References**: 10
- **Functionality**: File-based automated workflows + `/workflows` command
- **Current Status**: WorkflowTool, command, loader all stubs
- **Completion Effort**: Large — need to design workflow DSL from scratch

### 3.7 WEB_BROWSER_TOOL (Browser Tool)

- **References**: 4
- **Functionality**: Model can invoke browser tool to navigate and interact with web pages
- **Current Status**: Tool registration exists, implementation is a stub
- **Completion Effort**: Large

### 3.8 DAEMON (Background Daemon)

- **References**: 3
- **Functionality**: Background daemon process + remote control server
- **Current Status**: Only conditional import wiring, no implementation
- **Completion Effort**: Very large

---

## IV. Tier 3 — Pure Stub / N/A (Low Priority)

| Feature | Refs | Status | Description |
|---------|------|--------|-------------|
| CHICAGO_MCP | 16 | N/A | Anthropic internal MCP infrastructure |
| UDS_INBOX | 17 | Stub | Unix domain socket peer messaging |
| MONITOR_TOOL | 13 | Stub | File/process monitoring tool |
| BG_SESSIONS | 11 | Stub | Background session management |
| SHOT_STATS | 10 | No impl | Per-prompt statistics |
| EXTRACT_MEMORIES | 7 | No impl | Automatic memory extraction |
| TEMPLATES | 6 | Stub | Project/prompt templates |
| LODESTONE | 6 | N/A | Internal infrastructure |
| STREAMLINED_OUTPUT | 1 | — | Streamlined output mode |
| HOOK_PROMPTS | 1 | — | Hook prompts |
| CCR_AUTO_CONNECT | 3 | — | CCR auto connect |
| CCR_MIRROR | 4 | — | CCR mirror mode |
| CCR_REMOTE_SETUP | 1 | — | CCR remote setup |
| NATIVE_CLIPBOARD_IMAGE | 2 | — | Native clipboard image |
| CONNECTOR_TEXT | 7 | — | Connector text |

Plus 40+ other low-reference features.

---

## V. Exploration Roadmap

### Phase 1: Quick Validation (No External Dependencies)

> Goal: Confirm code runs correctly, experience basic functionality

| Priority | Feature | Command | Expected Result |
|----------|---------|---------|-----------------|
| 1 | BUDDY | `FEATURE_BUDDY=1 bun run dev` | `/buddy hatch` generates companion |
| 2 | FORK_SUBAGENT | `FEATURE_FORK_SUBAGENT=1 bun run dev` | Agent can spawn context-inheriting subtasks |
| 3 | TOKEN_BUDGET | `FEATURE_TOKEN_BUDGET=1 bun run dev` | Input "spend 500k tokens" to test auto-continue |
| 4 | TREE_SITTER_BASH | `FEATURE_TREE_SITTER_BASH=1 bun run dev` | More precise bash permission matching |
| 5 | MCP_SKILLS | `FEATURE_MCP_SKILLS=1 bun run dev` | MCP server prompts promoted to skills |

### Phase 2: Core Feature Exploration (OAuth Required)

> Goal: Experience the full KAIROS capability set

| Priority | Feature | Command | Expected Result |
|----------|---------|---------|-----------------|
| 1 | TRANSCRIPT_CLASSIFIER | `FEATURE_TRANSCRIPT_CLASSIFIER=1 bun run dev` | Auto mode activates automatically |
| 2 | KAIROS full suite | `FEATURE_KAIROS=1 FEATURE_KAIROS_BRIEF=1 FEATURE_KAIROS_CHANNELS=1 FEATURE_PROACTIVE=1 bun run dev` | Persistent assistant + Brief output + channel messages |
| 3 | VOICE_MODE | `FEATURE_VOICE_MODE=1 bun run dev` | Hold spacebar to speak |
| 4 | TEAMMEM | `FEATURE_TEAMMEM=1 bun run dev` | Team memory sync |
| 5 | COORDINATOR_MODE | `FEATURE_COORDINATOR_MODE=1 CLAUDE_CODE_COORDINATOR_MODE=1 bun run dev` | Multi-agent orchestration |

### Phase 3: Stub Completion Development

> Goal: Implement high-value stubs into functional features

| Priority | Feature | Completion Difficulty | Value |
|----------|---------|----------------------|-------|
| 1 | PROACTIVE | Medium | Autonomous work capability |
| 2 | ULTRAPLAN | Small | Enhanced planning |
| 3 | CONTEXT_COLLAPSE | Medium | Long conversation optimization |
| 4 | EXPERIMENTAL_SKILL_SEARCH | Medium | Skill discovery |
| 5 | BASH_CLASSIFIER | Large | Security enhancement |

---

## VI. Recommended Combinations

### "Full-Featured Assistant" Combination

```bash
FEATURE_KAIROS=1 \
FEATURE_KAIROS_BRIEF=1 \
FEATURE_KAIROS_CHANNELS=1 \
FEATURE_KAIROS_PUSH_NOTIFICATION=1 \
FEATURE_PROACTIVE=1 \
FEATURE_FORK_SUBAGENT=1 \
FEATURE_TOKEN_BUDGET=1 \
FEATURE_TRANSCRIPT_CLASSIFIER=1 \
FEATURE_BUDDY=1 \
bun run dev
```

### "Multi-Agent Collaboration" Combination

```bash
FEATURE_COORDINATOR_MODE=1 \
FEATURE_FORK_SUBAGENT=1 \
FEATURE_BRIDGE_MODE=1 \
FEATURE_BG_SESSIONS=1 \
CLAUDE_CODE_COORDINATOR_MODE=1 \
bun run dev
```

### "Developer Enhancement" Combination

```bash
FEATURE_TRANSCRIPT_CLASSIFIER=1 \
FEATURE_TREE_SITTER_BASH=1 \
FEATURE_TOKEN_BUDGET=1 \
FEATURE_MCP_SKILLS=1 \
FEATURE_CONTEXT_COLLAPSE=1 \
bun run dev
```

---

## VII. Risks and Caveats

1. **OAuth Dependency**: KAIROS, VOICE_MODE, TEAMMEM, BRIDGE_MODE require Anthropic OAuth authentication (claude.ai subscription); API key users cannot use them
2. **GrowthBook Gating**: Some features (VOICE_MODE's `tengu_cobalt_frost`, TEAMMEM's `tengu_herring_clock`) still require server-side GrowthBook toggle even when the feature flag is enabled
3. **Incomplete Decompilation**: All "implemented" features are decompilation artifacts and may have runtime errors; each needs individual verification
4. **Proactive Stub**: KAIROS's autonomous work capability depends on PROACTIVE, but PROACTIVE's core is a stub that needs completion first
5. **tsc Errors**: The codebase has ~1341 TypeScript compilation errors (from decompilation); these don't affect Bun runtime but will show many red squiggles in the IDE

---

## Appendix: Complete Feature Flag List

89 feature flags total (sorted by reference count descending):

| Feature | Refs | Tier |
|---------|------|------|
| KAIROS | 154 | 1 |
| TRANSCRIPT_CLASSIFIER | 108 | 1 |
| TEAMMEM | 51 | 1 |
| VOICE_MODE | 46 | 1 |
| BASH_CLASSIFIER | 45 | 2 |
| KAIROS_BRIEF | 39 | 1 |
| PROACTIVE | 37 | 2 |
| COORDINATOR_MODE | 32 | 1 |
| BRIDGE_MODE | 28 | 1 |
| EXPERIMENTAL_SKILL_SEARCH | 21 | 2 |
| CONTEXT_COLLAPSE | 20 | 2 |
| KAIROS_CHANNELS | 19 | 1 |
| UDS_INBOX | 17 | 3 |
| CHICAGO_MCP | 16 | 3 |
| BUDDY | 16 | 1 |
| HISTORY_SNIP | 15 | 2 |
| MONITOR_TOOL | 13 | 3 |
| COMMIT_ATTRIBUTION | 12 | — |
| CACHED_MICROCOMPACT | 12 | — |
| BG_SESSIONS | 11 | 3 |
| WORKFLOW_SCRIPTS | 10 | 2 |
| ULTRAPLAN | 10 | 2 |
| SHOT_STATS | 10 | 3 |
| TOKEN_BUDGET | 9 | 1 |
| PROMPT_CACHE_BREAK_DETECTION | 9 | — |
| MCP_SKILLS | 9 | 1 |
| EXTRACT_MEMORIES | 7 | 3 |
| CONNECTOR_TEXT | 7 | — |
| TEMPLATES | 6 | 3 |
| LODESTONE | 6 | 3 |
| TREE_SITTER_BASH_SHADOW | 5 | — |
| QUICK_SEARCH | 5 | — |
| MESSAGE_ACTIONS | 5 | — |
| DOWNLOAD_USER_SETTINGS | 5 | — |
| DIRECT_CONNECT | 5 | — |
| WEB_BROWSER_TOOL | 4 | 2 |
| VERIFICATION_AGENT | 4 | — |
| TERMINAL_PANEL | 4 | — |
| SSH_REMOTE | 4 | — |
| REVIEW_ARTIFACT | 4 | — |
| REACTIVE_COMPACT | 4 | — |
| KAIROS_PUSH_NOTIFICATION | 4 | 1 |
| HISTORY_PICKER | 4 | — |
| FORK_SUBAGENT | 4 | 1 |
| CCR_MIRROR | 4 | — |
| TREE_SITTER_BASH | 3 | 1 |
| MEMORY_SHAPE_TELEMETRY | 3 | — |
| MCP_RICH_OUTPUT | 3 | — |
| KAIROS_GITHUB_WEBHOOKS | 3 | 1 |
| FILE_PERSISTENCE | 3 | — |
| DAEMON | 3 | 2 |
| CCR_AUTO_CONNECT | 3 | — |
| UPLOAD_USER_SETTINGS | 2 | — |
| POWERSHELL_AUTO_MODE | 2 | — |
| OVERFLOW_TEST_TOOL | 2 | — |
| NEW_INIT | 2 | — |
| NATIVE_CLIPBOARD_IMAGE | 2 | — |
| HARD_FAIL | 2 | — |
| ENHANCED_TELEMETRY_BETA | 2 | — |
| COWORKER_TYPE_TELEMETRY | 2 | — |
| BREAK_CACHE_COMMAND | 2 | — |
| AWAY_SUMMARY | 2 | — |
| AUTO_THEME | 2 | — |
| ALLOW_TEST_VERSIONS | 2 | — |
| AGENT_TRIGGERS_REMOTE | 2 | — |
| AGENT_MEMORY_SNAPSHOT | 2 | — |
| UNATTENDED_RETRY | 1 | — |
| ULTRATHINK | 1 | — |
| TORCH | 1 | — |
| STREAMLINED_OUTPUT | 1 | — |
| SLOW_OPERATION_LOGGING | 1 | — |
| SKILL_IMPROVEMENT | 1 | — |
| SELF_HOSTED_RUNNER | 1 | — |
| RUN_SKILL_GENERATOR | 1 | — |
| PERFETTO_TRACING | 1 | — |
| NATIVE_CLIENT_ATTESTATION | 1 | — |
| KAIROS_DREAM | 1 | 1 |
| IS_LIBC_MUSL | 1 | — |
| IS_LIBC_GLIBC | 1 | — |
| HOOK_PROMPTS | 1 | — |
| DUMP_SYSTEM_PROMPT | 1 | — |
| COMPACTION_REMINDERS | 1 | — |
| CCR_REMOTE_SETUP | 1 | — |
| BYOC_ENVIRONMENT_RUNNER | 1 | — |
| BUILTIN_EXPLORE_PLAN_AGENTS | 1 | — |
| BUILDING_CLAUDE_APPS | 1 | — |
| ANTI_DISTILLATION_CC | 1 | — |
| AGENT_TRIGGERS | 1 | — |
| ABLATION_BASELINE | 1 | — |

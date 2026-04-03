# KAIROS — Persistent Assistant Mode

> Feature Flag: `FEATURE_KAIROS=1` (and sub-features)
> Implementation Status: Core framework complete, some sub-modules are stubs
> Reference Count: 154 (largest in the entire codebase)

## 1. Feature Overview

KAIROS transforms the Claude Code CLI from a "Q&A tool" into a "persistent assistant". When enabled, the CLI runs continuously in the background, supporting:

- **Persistent Bridge Sessions**: Reuse sessions across terminal restarts, connected to claude.ai via Anthropic OAuth
- **Background Task Execution**: Continue working when user leaves the terminal (with PROACTIVE feature)
- **Push Notifications to Mobile**: Push when tasks complete or need input (with `KAIROS_PUSH_NOTIFICATION`)
- **Daily Memory Logs**: Automatically records and reviews work content (with `KAIROS_DREAM`)
- **External Channel Message Intake**: Slack/Discord/Telegram messages forwarded to CLI (with `KAIROS_CHANNELS`)
- **Structured Brief Output**: Structured messages via BriefTool (with `KAIROS_BRIEF`)

### Sub-Feature Dependency Tree

```
KAIROS (main toggle)
+-- KAIROS_BRIEF (BriefTool, structured output)
+-- KAIROS_CHANNELS (external channel messages)
+-- KAIROS_PUSH_NOTIFICATION (mobile push notifications)
+-- KAIROS_GITHUB_WEBHOOKS (GitHub PR webhooks)
+-- KAIROS_DREAM (memory distillation)
```

**Note**: PROACTIVE and KAIROS are strongly coupled. All code checks use `feature('PROACTIVE') || feature('KAIROS')`, meaning KAIROS automatically provides proactive capabilities when enabled.

## 2. System Prompt

KAIROS injects two major sections into the system prompt:

### 2.1 Brief Section (`getBriefSection`)

File: `src/constants/prompts.ts:843-858`

Injected when `feature('KAIROS') || feature('KAIROS_BRIEF')`. Structured message output instructions for the Brief tool (`SendUserMessage`). `/brief` toggle and `--brief` flag only control display filtering, not model behavior.

### 2.2 Proactive/Autonomous Work Section (`getProactiveSection`)

File: `src/constants/prompts.ts:860-914`

Injected when `feature('PROACTIVE') || feature('KAIROS')` and `isProactiveActive()`. Core behavior instructions:

- **Tick-Driven**: Kept alive via `<tick_tag>` prompt, each tick contains user's current local time
- **Pacing Control**: Uses `SleepTool` to control wait intervals (prompt cache expires in 5 minutes)
- **Must Sleep on No-Op**: Forbidden to output "still waiting" text (wastes turns and tokens)
- **Bias Toward Action**: Read files, search code, modify files, commit — all without asking
- **Terminal Focus Awareness**: `terminalFocus` field indicates whether user is watching the terminal
  - Unfocused -> highly autonomous action
  - Focused -> more collaborative, present choices

## 3. Implementation Architecture

### 3.1 Core Modules

| Module | File | Status | Responsibility |
|--------|------|--------|----------------|
| Assistant Entry | `src/assistant/index.ts` | Stub | `isAssistantMode()`, `initializeAssistantTeam()` |
| Session Discovery | `src/assistant/sessionDiscovery.ts` | Stub | Discover available bridge sessions |
| Session History | `src/assistant/sessionHistory.ts` | Stub | Persist session history |
| Gate Control | `src/assistant/gate.ts` | Stub | GrowthBook gate checks |
| Session Chooser | `src/assistant/AssistantSessionChooser.ts` | Stub | UI for session selection |
| BriefTool | `src/tools/BriefTool/` | Stub | Structured message output tool |
| Channel Notification | `src/services/mcp/channelNotification.ts` | Stub | External channel message intake |
| Dream Task | `src/components/tasks/src/tasks/DreamTask/` | Stub | Memory distillation task |
| Memory Directory | `src/memdir/memdir.ts` | Stub | Memory directory management |

### 3.2 SleepTool (Shared with Proactive)

File: `src/tools/SleepTool/prompt.ts`

SleepTool is the pacing control core of KAIROS/Proactive. The tool description helps the model understand the "sleep" concept:
- Tool name: `Sleep`
- Function: Wait for specified time then respond to tick prompt
- Works with `<tick_tag>` to implement heartbeat-style autonomous work

### 3.3 Bridge Integration

KAIROS connects to the claude.ai server via Bridge Mode (`src/bridge/`):

```
claude.ai web/app
      |
      v (HTTPS long-poll)
+----------------------+
|  Bridge API Client   |  src/bridge/bridgeApi.ts
|  (register/poll/     |
|   acknowledge)       |
+----------+-----------+
           |
           v
+----------------------+
|  Session Runner      |  src/bridge/sessionRunner.ts
|  (create/resume REPL)|
+----------+-----------+
           |
           v
+----------------------+
|  REPL + Proactive    |  Tick-driven autonomous work
|  Tick Loop           |
+----------------------+
```

### 3.4 Data Flow

```
User sends message from claude.ai
         |
         v
Bridge pollForWork() receives WorkResponse
         |
         v
acknowledgeWork() confirms receipt
         |
         v
sessionRunner creates/resumes REPL session
         |
         v
User message injected into REPL conversation
         |
         v
Model processes -> tool calls -> BriefTool structured output
         |
         v
Results sent back to claude.ai via Bridge API
```

## 4. Key Design Decisions

1. **Tick-Driven Not Event-Driven**: Model controls its own wake frequency via SleepTool, not external event push. Simplifies architecture but increases API call overhead
2. **KAIROS Superset of PROACTIVE**: All proactive checks include KAIROS, no need to enable both flags
3. **Brief Display/Behavior Separation**: `/brief` toggle only controls UI filtering, model can always use BriefTool
4. **Terminal Focus Awareness**: Model auto-adjusts autonomy level based on whether user is watching terminal
5. **GrowthBook Gating**: Some features (like push notifications) require server-side GrowthBook toggle even when feature flag is enabled

## 5. Usage

```bash
# Minimal enable (persistent assistant + Brief)
FEATURE_KAIROS=1 FEATURE_KAIROS_BRIEF=1 bun run dev

# Full feature enable
FEATURE_KAIROS=1 \
FEATURE_KAIROS_BRIEF=1 \
FEATURE_KAIROS_CHANNELS=1 \
FEATURE_KAIROS_PUSH_NOTIFICATION=1 \
FEATURE_KAIROS_GITHUB_WEBHOOKS=1 \
FEATURE_PROACTIVE=1 \
bun run dev

# Combined with Token Budget
FEATURE_KAIROS=1 FEATURE_TOKEN_BUDGET=1 bun run dev
```

## 6. External Dependencies

- **Anthropic OAuth**: Must use claude.ai subscription login (not API key)
- **GrowthBook**: Server-side feature gating (`tengu_ccr_bridge` etc.)
- **Bridge API**: `/v1/environments/bridge` endpoint series

## 7. File Index

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/assistant/index.ts` | 9 | Assistant module entry (stub) |
| `src/assistant/gate.ts` | — | GrowthBook gating (stub) |
| `src/assistant/sessionDiscovery.ts` | — | Session discovery (stub) |
| `src/assistant/sessionHistory.ts` | — | Session history (stub) |
| `src/assistant/AssistantSessionChooser.ts` | — | Session selection UI (stub) |
| `src/tools/BriefTool/` | — | BriefTool implementation (stub) |
| `src/tools/SleepTool/prompt.ts` | ~30 | SleepTool tool prompt |
| `src/services/mcp/channelNotification.ts` | 5 | Channel message intake (stub) |
| `src/memdir/memdir.ts` | — | Memory directory management (stub) |
| `src/constants/prompts.ts:552-554,843-914` | 72 | System prompt injection |
| `src/components/tasks/src/tasks/DreamTask/` | 3 | Dream task (stub) |
| `src/proactive/index.ts` | — | Proactive core (stub, shared by KAIROS) |

# COORDINATOR_MODE — Multi-Agent Orchestration

> Feature Flag: `FEATURE_COORDINATOR_MODE=1` + environment variable `CLAUDE_CODE_COORDINATOR_MODE=1`
> Implementation Status: Orchestrator fully functional, worker agent uses generic AgentTool worker
> Reference Count: 32

## 1. Feature Overview

COORDINATOR_MODE turns the CLI into an "orchestrator" role. The orchestrator does not operate files directly, but dispatches tasks to multiple workers for parallel execution via AgentTool. Suitable for large task decomposition, parallel research, implementation+verification separation, and similar scenarios.

### Core Constraints

- The orchestrator can only use: `Agent` (dispatch workers), `SendMessage` (continue workers), `TaskStop` (stop workers)
- Workers can use all standard tools (Bash, Read, Edit, etc.) + MCP tools + Skill tools
- Every orchestrator message is for the user; worker results arrive as `<task-notification>` XML

## 2. User Interaction

### How to Enable

```bash
FEATURE_COORDINATOR_MODE=1 CLAUDE_CODE_COORDINATOR_MODE=1 bun run dev
```

Both the feature flag and environment variable must be set. `CLAUDE_CODE_COORDINATOR_MODE` can be auto-switched during session restore (`matchSessionMode`).

### Typical Workflow

```
User: "Fix the null pointer in the auth module"

Orchestrator:
  1. Dispatch two workers in parallel:
     - Agent({ description: "Investigate auth bug", prompt: "..." })
     - Agent({ description: "Research auth tests", prompt: "..." })

  2. Receive <task-notification>:
     - Worker A: "Found null pointer at validate.ts:42"
     - Worker B: "Test coverage status..."

  3. Synthesize findings, continue Worker A:
     - SendMessage({ to: "agent-a1b", message: "Fix validate.ts:42..." })

  4. Receive fix result, dispatch verification:
     - Agent({ description: "Verify fix", prompt: "..." })
```

## 3. Implementation Architecture

### 3.1 Mode Detection

File: `src/coordinator/coordinatorMode.ts:36-41`

```ts
export function isCoordinatorMode(): boolean {
  return feature('COORDINATOR_MODE') &&
    isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
}
```

### 3.2 Session Mode Restore

`matchSessionMode(sessionMode)` checks the stored mode when restoring an old session; if the current environment variable is inconsistent with stored mode, it automatically flips the environment variable. Prevents restoring an orchestration session in normal mode (or vice versa).

### 3.3 Worker Tool Set

`getCoordinatorUserContext()` informs the orchestrator of the tools available to workers:

- **Standard Mode**: `ASYNC_AGENT_ALLOWED_TOOLS` excluding internal tools (TeamCreate, TeamDelete, SendMessage, SyntheticOutput)
- **Simple Mode** (`CLAUDE_CODE_SIMPLE=1`): Only Bash, Read, Edit
- **MCP Tools**: Lists connected MCP server names
- **Scratchpad**: If GrowthBook `tengu_scratch` is enabled, provides a cross-worker shared scratchpad directory

### 3.4 System Prompt

File: `src/coordinator/coordinatorMode.ts:111-369`

Orchestrator system prompt (`getCoordinatorSystemPrompt()`) is ~370 lines, containing:

| Section | Content |
|---------|---------|
| 1. Your Role | Orchestrator responsibility definition |
| 2. Your Tools | Agent/SendMessage/TaskStop usage instructions |
| 3. Workers | Worker capabilities and limitations |
| 4. Task Workflow | Research -> Synthesis -> Implementation -> Verification flow |
| 5. Writing Worker Prompts | Self-contained prompt writing guide + good/bad example comparison |
| 6. Example Session | Complete example conversation |

### 3.5 Worker Agent

File: `src/coordinator/workerAgent.ts`

Currently a stub. Workers actually use the generic AgentTool `worker` subagent_type.

### 3.6 Data Flow

```
User message
      |
      v
Orchestrator REPL (restricted tool set)
      |
      +---> Agent({ subagent_type: "worker", prompt: "..." })
      |         |
      |         v
      |    Worker Agent (full tool set)
      |    +-- Executes task (Bash/Read/Edit/...)
      |    +-- Returns <task-notification>
      |
      +---> SendMessage({ to: "agent-id", message: "..." })
      |         |
      |         v
      |    Continues existing Worker
      |
      +---> TaskStop({ task_id: "agent-id" })
                |
                v
           Stops running Worker
```

## 4. Key Design Decisions

1. **Dual Toggle Design**: Feature flag controls code availability, environment variable controls actual activation. Allows compile-time inclusion without default enablement
2. **Orchestrator Restricted**: Can only use Agent/SendMessage/TaskStop, ensuring the orchestrator focuses on dispatch rather than execution
3. **Workers Cannot See Orchestrator Conversation**: Each worker's prompt must be self-contained (all necessary context included)
4. **Parallelism First**: System prompt emphasizes "Parallelism is your superpower", encouraging parallel dispatch of independent tasks
5. **Synthesize, Don't Forward**: Orchestrator must understand worker findings, then write specific implementation instructions. Forbids lazy delegation like "based on your findings"
6. **Optional Scratchpad Sharing**: GrowthBook-gated shared directory that lets workers persistently share knowledge across tasks

## 5. Usage

```bash
# Basic enable
FEATURE_COORDINATOR_MODE=1 CLAUDE_CODE_COORDINATOR_MODE=1 bun run dev

# With Fork Subagent
FEATURE_COORDINATOR_MODE=1 FEATURE_FORK_SUBAGENT=1 \
CLAUDE_CODE_COORDINATOR_MODE=1 bun run dev

# Simple mode (workers only have Bash/Read/Edit)
FEATURE_COORDINATOR_MODE=1 CLAUDE_CODE_COORDINATOR_MODE=1 \
CLAUDE_CODE_SIMPLE=1 bun run dev
```

## 6. File Index

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/coordinator/coordinatorMode.ts` | 370 | Mode detection + system prompt + user context |
| `src/coordinator/workerAgent.ts` | — | Worker agent definition (stub) |
| `src/constants/tools.ts` | — | `ASYNC_AGENT_ALLOWED_TOOLS` tool allowlist |

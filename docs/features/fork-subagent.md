# FORK_SUBAGENT — Context-Inheriting Sub-Agent

> Feature Flag: `FEATURE_FORK_SUBAGENT=1`
> Implementation Status: Fully functional
> Reference Count: 4

## 1. Feature Overview

FORK_SUBAGENT allows AgentTool to spawn "fork sub-agents" that inherit the parent's full conversation context. The sub-agent sees all of the parent's history messages, tool set, and system prompt, and shares the API request prefix with the parent to maximize prompt cache hit rate.

### Core Advantages

- **Prompt Cache Maximization**: Multiple parallel forks share the same API request prefix, only the final directive text block differs
- **Context Completeness**: Sub-agent inherits parent's full conversation history (including thinking config)
- **Permission Bubbling**: Sub-agent permission prompts bubble up to the parent terminal for display
- **Worktree Isolation**: Supports git worktree isolation, sub-agent works in an independent branch

## 2. User Interaction

### Trigger Method

When `FORK_SUBAGENT` is enabled, AgentTool calls without specifying `subagent_type` automatically take the fork path:

```
// Fork path (inherits context)
Agent({ prompt: "Fix this bug" })  // no subagent_type

// Regular agent path (fresh context)
Agent({ subagent_type: "general-purpose", prompt: "..." })
```

### /fork Command

Registers a `/fork` slash command (currently stub). When FORK_SUBAGENT is enabled, the `/branch` command loses its `fork` alias to avoid conflicts.

## 3. Implementation Architecture

### 3.1 Gating and Mutual Exclusion

File: `src/tools/AgentTool/forkSubagent.ts:32-39`

```ts
export function isForkSubagentEnabled(): boolean {
  if (feature('FORK_SUBAGENT')) {
    if (isCoordinatorMode()) return false   // Coordinator has its own delegation model
    if (getIsNonInteractiveSession()) return false  // Disabled in pipe/SDK mode
    return true
  }
  return false
}
```

### 3.2 FORK_AGENT Definition

```ts
export const FORK_AGENT = {
  agentType: 'fork',
  tools: ['*'],              // Wildcard: uses parent's full tool set
  maxTurns: 200,
  model: 'inherit',          // Inherits parent model
  permissionMode: 'bubble',  // Permissions bubble up to parent terminal
  getSystemPrompt: () => '', // Not used: passes parent's pre-rendered prompt directly
}
```

### 3.3 Core Call Flow

```
AgentTool.call({ prompt, name })
      |
      v
isForkSubagentEnabled() && !subagent_type?
      |
      +-- No -> regular agent path
      |
      +-- Yes -> Fork path
            |
            v
      Recursion guard check
      +-- querySource === 'agent:builtin:fork' -> reject
      +-- isInForkChild(messages) -> reject
            |
            v
      Get parent system prompt
      +-- toolUseContext.renderedSystemPrompt (preferred)
      +-- buildEffectiveSystemPrompt (fallback)
            |
            v
      buildForkedMessages(prompt, assistantMessage)
      +-- Clone parent assistant message
      +-- Generate placeholder tool_result
      +-- Append directive text block
            |
            v
      [Optional] buildWorktreeNotice()
            |
            v
      runAgent({
        useExactTools: true,
        override.systemPrompt: parent's,
        forkContextMessages: parent messages,
        availableTools: parent tools,
      })
```

### 3.4 Message Construction: buildForkedMessages

File: `src/tools/AgentTool/forkSubagent.ts:107-169`

Constructed message structure:

```
[
  ...history (filterIncompleteToolCalls),  // parent's full history
  assistant(all tool_use blocks),           // parent's current turn assistant message
  user(
    placeholder tool_result x N +           // identical placeholder text
    <fork-boilerplate> directive            // different for each fork
  )
]
```

**All forks use identical placeholder text**: `"Fork started — processing in background"`. This ensures multiple parallel forks have exactly matching API request prefixes, maximizing prompt cache hits.

### 3.5 Recursion Guard

Two layers of checks prevent fork nesting:

1. **querySource Check**: `toolUseContext.options.querySource === 'agent:builtin:fork'`. Set on `context.options`, resistant to auto-compaction (autocompact only rewrites messages, not options)
2. **Message Scan**: `isInForkChild()` scans message history for `<fork-boilerplate>` tags

### 3.6 Worktree Isolation Notice

When fork + worktree are combined, an appended notice informs the sub-agent:

> "You inherited the parent agent's conversation context at `{parentCwd}`, but you are operating in an independent git worktree `{worktreeCwd}`. Paths need conversion, re-read before editing."

### 3.7 Forced Async

When `isForkSubagentEnabled()` is true, all agent launches are forced async. The `run_in_background` parameter is removed from the schema. Unified interaction via `<task-notification>` XML messages.

## 4. Prompt Cache Optimization

This is the core optimization goal of the entire fork design:

| Optimization | Implementation |
|-------------|----------------|
| **Same System Prompt** | Directly passes `renderedSystemPrompt`, avoids re-rendering (GrowthBook state may be inconsistent) |
| **Same Tool Set** | `useExactTools: true` directly uses parent tools, not filtered through `resolveAgentTools` |
| **Same Thinking Config** | Inherits parent thinking configuration (non-fork agents disable thinking by default) |
| **Same Placeholder Results** | All forks use identical `FORK_PLACEHOLDER_RESULT` text |
| **ContentReplacementState Clone** | Clones parent replacement state by default, keeping wire prefix consistent |

## 5. Sub-Agent Instructions

`buildChildMessage()` generates instructions wrapped in `<fork-boilerplate>`:

- You are a fork worker, not the main agent
- Do not spawn sub-agents again (execute directly)
- No chit-chat, no meta-commentary
- Use tools directly
- Commit after modifying files, report commit hash
- Report format: `Scope:` / `Result:` / `Key files:` / `Files changed:` / `Issues:`

## 6. Key Design Decisions

1. **Fork != Regular Agent**: Fork inherits full context, regular agent starts from scratch. Selection based on whether `subagent_type` is present
2. **renderedSystemPrompt Direct Pass**: Avoids calling `getSystemPrompt()` during fork. Parent freezes prompt bytes at turn start
3. **Shared Placeholder Results**: Multiple parallel forks use exactly identical placeholders, only directives differ
4. **Coordinator Mutual Exclusion**: Fork disabled in coordinator mode, the two have incompatible delegation models
5. **Non-Interactive Disabled**: Disabled in pipe mode and SDK mode, avoiding invisible fork nesting

## 7. Usage

```bash
# Enable feature
FEATURE_FORK_SUBAGENT=1 bun run dev

# Usage in REPL (not specifying subagent_type takes the fork path)
# Agent({ prompt: "Research the structure of this module" })
# Agent({ prompt: "Implement this feature" })
```

## 8. File Index

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/tools/AgentTool/forkSubagent.ts` | ~210 | Core definition + message construction + recursion guard |
| `src/tools/AgentTool/AgentTool.tsx` | — | Fork routing + forced async |
| `src/tools/AgentTool/prompt.ts` | — | "When to Fork" prompt section |
| `src/tools/AgentTool/runAgent.ts` | — | useExactTools path |
| `src/tools/AgentTool/resumeAgent.ts` | — | Fork agent resume |
| `src/constants/xml.ts` | — | XML tag constants |
| `src/utils/forkedAgent.ts` | — | CacheSafeParams + ContentReplacementState clone |
| `src/commands/fork/index.ts` | — | /fork command (stub) |

# Documentation Revision Plan

> Goal: Supplement with source-level insights, upgrading each document from "conceptual overview" to "reverse engineering whitepaper" quality.

---

## Tier 1: Skeleton Pages — Need Major Rewrite

### 1. `safety/sandbox.mdx` — Sandbox Mechanism ✅ DONE

**Current state**: 35 lines, only lists four dimensions (filesystem/network/process/time) with no implementation details.

**Revision direction**:
- Add details on the actual macOS `sandbox-exec` invocation, showing key fragments of the sandbox profile
- Explain the decision logic of `getSandboxConfig()`: which commands go through the sandbox and which bypass it
- Add design tradeoffs for the `dangerouslyDisableSandbox` parameter
- Include Linux platform sandbox comparison (seatbelt vs namespace)
- Show the complete chain of a command execution from permission check → sandbox wrapping → actual execution

---

### 2. `introduction/what-is-claude-code.mdx` — What is Claude Code ✅ DONE

**Current state**: 39 lines, pure marketing copy; the comparison table with "regular chat AI" is too superficial.

**Revision direction**:
- Remove the generic "what it can do" list, replace with a concrete end-to-end example (from user input → system processing → final output)
- Replace text descriptions with a simplified architecture diagram for 30-second intuition building
- Add Claude Code's technical positioning: not an IDE plugin, not a Web Chat, but a terminal-native agentic system
- Include positioning differences with Cursor / Copilot / Aider (at the architecture level, not feature checklists)

---

### 3. `introduction/why-this-whitepaper.mdx` — Why This Whitepaper ✅ DONE

**Current state**: 40 lines, all empty rhetoric; four Cards are just previews of subsequent chapter titles.

**Revision direction**:
- Clarify positioning: this is a reverse engineering analysis of Anthropic's official CLI, not official documentation
- List the 3-5 most surprising/elegant design decisions discovered during reverse engineering (hook reader interest)
- Provide a whitepaper reading roadmap: recommended reading order and what problem each chapter solves
- Add "What this whitepaper is NOT" — not a usage tutorial, not API documentation

---

### 4. `safety/why-safety-matters.mdx` — Why Safety Matters ✅ DONE

**Current state**: 40 lines, only lists obvious risks; "safety vs efficiency balance" has only 3 bullets.

**Revision direction**:
- Show the full safety system panorama from source code perspective: permission rules → sandbox → Plan Mode → budget limits → Hooks defense-in-depth chain
- Add Claude's own System Prompt safety instructions ("confirm before execution", "prefer reversible operations", etc.), showing AI-side safety constraints
- Use real scenarios to illustrate "safety vs efficiency" engineering tradeoffs: e.g., why Read tool is approval-free, why Bash tool requires per-command confirmation
- Include a brief description of Prompt Injection defense (how malicious content in tool results is flagged by the system)

---

## Tier 2: Has Skeleton But Too Shallow — Needs More Substance

### 5. `conversation/streaming.mdx` — Streaming Response ✅ DONE

**Current state**: 43 lines, only says "streaming is good" with a 3-line provider table.

**Revision direction**:
- Add core `BetaRawMessageStreamEvent` event types and their meanings
- Show the state machine flow of interleaved text chunks and tool_use blocks
- Explain error handling during streaming: retry/degradation strategy for network disconnection, API rate limiting, token limit exceeded
- Add core logic of `processStreamEvents()`: how to separate text, tool calls, and usage statistics from the event stream

---

### 6. `tools/search-and-navigation.mdx` — Search and Navigation ✅ DONE

**Current state**: 43 lines, only mentions that Glob and Grep exist.

**Revision direction**:
- Add details on how the ripgrep binary is embedded (vendor directory, platform adaptation)
- Explain the design reason for search result head_limit default of 250 (token budget)
- Show ToolSearch implementation: how semantic matching finds the most relevant tools among 50+ tools (including MCP)
- Add the significance of Glob sorting by modification time: most recently modified files are most likely relevant to the current task

---

### 7. `tools/task-management.mdx` — Task Management ✅ DONE

**Current state**: 50 lines, only has process Steps and 4 bullets for status display.

**Revision direction**:
- Add the task data model: id / subject / description / status / blockedBy / blocks / owner
- Explain the dependency management implementation: how blockedBy prevents tasks from being claimed, how completing a task automatically unblocks downstream tasks
- Show task and Agent tool integration: how sub-Agents claim tasks and report progress
- Add the UX design of the activeForm field: spinner animation text for in-progress tasks

---

### 8. `context/token-budget.mdx` — Token Budget Management ✅ DONE

**Current state**: 55 lines, budget control has only 3 Cards with one sentence each.

**Revision direction**:
- Add the dynamic calculation logic for `contextWindowTokens` and `maxOutputTokens`
- Explain the cache breakpoint placement strategy: why immutable content comes first and variable content comes last in the System Prompt
- Show the specific mechanism for tool output truncation: how overly long results are truncated, when micro-compact is triggered
- Add the token counting implementation: when `countTokens` is called and the tradeoff between approximate vs exact counting

---

### 9. `agent/worktree-isolation.mdx` — Worktree Isolation ✅ DONE

**Current state**: 55 lines, only describes the concept of git worktree.

**Revision direction**:
- Show the `.claude/worktrees/` directory structure and branch naming rules
- Explain the worktree lifecycle: creation timing (`isolation: "worktree"`) → sub-Agent execution → completion/abandonment → automatic cleanup
- Add the binding relationship between worktree and sub-Agent: how to decide keep or remove when Agent finishes
- Include the interaction design of EnterWorktree / ExitWorktree tools

---

### 10. `extensibility/custom-agents.mdx` — Custom Agents ✅ DONE

**Current state**: 56 lines, only has configuration table and example table.

**Revision direction**:
- Show the complete agent markdown file frontmatter format (name / description / model / allowedTools, etc.)
- Explain how agents are loaded and injected into the System Prompt: the discovery and merge logic of `loadAgentDefinitions()`
- Show the tool restriction implementation: how allowedTools filters the tool list
- Add the association between agent and the subagent_type parameter: how the Agent tool specifies using a custom Agent

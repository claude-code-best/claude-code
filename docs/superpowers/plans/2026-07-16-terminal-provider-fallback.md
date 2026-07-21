# Terminal Provider Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefer session terminals only for persistent/interactive/user-visible work, honor explicit Terminal requests, and provide a permission-preserving `ExecuteExtraTool` fallback when a provider cannot select the advertised direct tool.

**Architecture:** Keep `Terminal` and `TerminalRead` in the core API tool array. Extend core-tool search results with real schemas plus a conditional provider fallback, then align the system, SearchExtraTools, ExecuteExtraTool, and Terminal prompts around one selection boundary. Reuse the existing ExecuteExtraTool delegation path without changing validation or permissions.

**Tech Stack:** Bun, TypeScript, Zod v4, bun:test, OpenAI-compatible function conversion.

## Global Constraints

- Terminal is preferred only for interactive programs, long-running processes, cross-turn shell state, persistent SSH/REPL sessions, and commands the user should watch or interact with in the web terminal sidebar.
- Bash remains preferred for short, non-interactive, one-shot commands with no persistence or shared-visibility requirement.
- An explicit user request to use Terminal must be honored whenever Terminal tools are registered.
- Direct Terminal calls remain preferred; ExecuteExtraTool is only a provider/client incompatibility fallback.
- The fallback must preserve target schema validation, enablement checks, permission checks, and target-tool execution.
- Deferred-tool discovery and execution behavior must not be loosened.
- Production code must not use `as any`; `bun run typecheck` must pass with zero errors.

---

### Task 1: Add a recoverable core-tool search contract

**Files:**
- Modify: `packages/builtin-tools/src/tools/SearchExtraToolsTool/__tests__/SearchExtraToolsTool.test.ts`
- Modify: `packages/builtin-tools/src/tools/SearchExtraToolsTool/SearchExtraToolsTool.ts`
- Modify: `packages/builtin-tools/src/tools/SearchExtraToolsTool/prompt.ts`

**Interfaces:**
- Consumes: `SearchExtraToolsTool.call`, `mapToolResultToToolResultBlockParam`, and the target tool's description/input schema.
- Produces: A core-tool result containing direct-call preference and an `ExecuteExtraTool` provider/client fallback using the same schema.

- [ ] **Step 1: Strengthen the existing exact-core-search test**

Add these assertions after the mapped result is created:

```ts
expect(block.content).toContain('Direct call is preferred')
expect(block.content).toContain('Provider/client fallback')
expect(block.content).toContain('ExecuteExtraTool')
expect(block.content).toContain('"tool_name":"Terminal"')
expect(block.content).toContain('Do not search again')
expect(block.content).toContain('Bash')
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun test packages/builtin-tools/src/tools/SearchExtraToolsTool/__tests__/SearchExtraToolsTool.test.ts
```

Expected: FAIL because the old result says not to wrap core tools and does not contain `Provider/client fallback` or a fallback invocation.

- [ ] **Step 3: Implement direct-first fallback guidance**

In `buildCoreToolGuidance`, replace the absolute prohibition with guidance equivalent to:

```ts
`Direct call is preferred: call ${tool.name} with the input schema above. Provider/client fallback: if the current tool interface does not expose ${tool.name}, or rejects selecting it by name, call ExecuteExtraTool, set tool_name to "${tool.name}", and set params to an object matching the input schema above. Do not search again and do not probe for a CLI substitute with Bash.`
```

Update the all-core and mixed-result summaries so they say direct calls are preferred and point to the fallback guidance instead of saying `do NOT use ExecuteExtraTool`.

Update `PROMPT_HEAD` so Terminal is called directly when exposed, but SearchExtraTools-provided fallback guidance may use ExecuteExtraTool when the provider/client cannot expose or select the direct tool.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: all SearchExtraToolsTool tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/builtin-tools/src/tools/SearchExtraToolsTool
git commit -m "fix: add provider fallback for core tool discovery"
```

### Task 2: Align Terminal selection and ExecuteExtraTool prompts

**Files:**
- Modify: `packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.runner.ts`
- Modify: `packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.test.ts`
- Modify: `packages/builtin-tools/src/tools/ExecuteTool/prompt.ts`
- Modify: `packages/builtin-tools/src/tools/TerminalTool/__tests__/terminalTools.test.ts`
- Modify: `packages/builtin-tools/src/tools/TerminalTool/prompt.ts`
- Modify: `src/constants/promptEngineeringAudit.runner.ts`
- Modify: `src/constants/prompts.ts`

**Interfaces:**
- Consumes: `ExecuteTool.prompt`, `ExecuteTool.call`, `TERMINAL_PROMPT`, and conditional system-prompt generation from enabled tool names.
- Produces: One consistent selection rule across all prompt surfaces and a tested core-tool delegation fallback.

- [ ] **Step 1: Add failing prompt and fallback tests**

Add `Terminal` to the mocked `CORE_TOOLS` set in `ExecuteTool.runner.ts`, then add:

```ts
test('documents and executes a provider fallback for a discovered core tool', async () => {
  const prompt = await ExecuteTool.prompt({} as never)
  expect(prompt).toContain('provider/client fallback')
  expect(prompt).toContain('call core tools directly')

  const terminal = makeMockTool('Terminal', { listed: true })
  const result = await ExecuteTool.call(
    { tool_name: 'Terminal', params: { action: 'list' } },
    makeContext([terminal]),
    async () => ({ behavior: 'allow' }),
    { type: 'assistant', content: [], uuid: 'msg-terminal' } as never,
    undefined,
  )

  expect(result.data).toEqual({
    result: { listed: true },
    tool_name: 'Terminal',
  })
})
```

Import `TERMINAL_PROMPT` in `terminalTools.test.ts` and add:

```ts
test('limits Terminal priority to persistent interactive work', () => {
  expect(TERMINAL_PROMPT).toContain('Prefer Bash')
  expect(TERMINAL_PROMPT).toContain('short, non-interactive, one-shot')
  expect(TERMINAL_PROMPT).toContain('persistent')
  expect(TERMINAL_PROMPT).toContain('user explicitly asks')
})
```

Extend the prompt-audit test with:

```ts
expect(prompt).toContain('If the user explicitly asks to use Terminal')
expect(prompt).toContain('provider/client')
expect(prompt).toContain('ExecuteExtraTool')
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
bun test packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.test.ts packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.render.test.ts packages/builtin-tools/src/tools/TerminalTool/__tests__/terminalTools.test.ts src/constants/__tests__/promptEngineeringAudit.test.ts
```

Expected: FAIL because the three prompt surfaces still forbid the fallback or do not define the persistent-only boundary.

- [ ] **Step 3: Align all prompt surfaces**

Update `ExecuteTool` description/prompt to say:

- deferred tools use the normal SearchExtraTools → ExecuteExtraTool workflow;
- core tools are normally called directly;
- a core tool may use ExecuteExtraTool only when SearchExtraTools returned provider/client fallback guidance because direct selection was unavailable or rejected.

Add a `Choosing Terminal vs Bash` section near the top of `TERMINAL_PROMPT`:

```text
Prefer Terminal for persistent cross-turn state, interactive programs, long-running processes, SSH/REPL sessions, shared web-terminal visibility, or when the user explicitly asks for Terminal. Prefer Bash for short, non-interactive, one-shot commands that do not need persistent state or shared visibility. A quick command belongs in Terminal only when it is part of an existing persistent-terminal workflow.
```

Change the quick-command row to `Quick command inside an existing persistent workflow` so it no longer competes with Bash for ordinary one-shot work.

Update the conditional system-prompt bullet to:

- name the persistent/interactive/user-visible selection boundary;
- explicitly honor a user request for Terminal;
- prefer direct calls;
- allow ExecuteExtraTool only as provider/client fallback;
- prohibit repeated search and Bash probing;
- retain Bash for short one-shot commands.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command plus:

```bash
bun test packages/builtin-tools/src/tools/SearchExtraToolsTool/__tests__/SearchExtraToolsTool.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/builtin-tools/src/tools/ExecuteTool packages/builtin-tools/src/tools/TerminalTool src/constants/prompts.ts src/constants/promptEngineeringAudit.runner.ts
git commit -m "fix: recover persistent terminal calls across providers"
```

### Task 3: Verify and roll out the runtime fix

**Files:**
- Verify only: `src/services/api/openai/index.ts`
- Integrate commits into: branch `codex/fix-terminal-sse-delivery`

**Interfaces:**
- Consumes: the final built-in tool registry and OpenAI-compatible request conversion.
- Produces: a restarted RCS parent whose newly spawned sessions load the fixed source.

- [ ] **Step 1: Run focused regression tests**

```bash
bun test packages/builtin-tools/src/tools/SearchExtraToolsTool/__tests__/SearchExtraToolsTool.test.ts packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.test.ts packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.render.test.ts packages/builtin-tools/src/tools/TerminalTool/__tests__/terminalTools.test.ts src/constants/__tests__/promptEngineeringAudit.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run static verification**

```bash
bun run typecheck
bun run lint
git diff --check 3de1a910..HEAD
```

Expected: all commands exit 0 with no TypeScript, lint, or whitespace errors.

- [ ] **Step 3: Run the full suite**

```bash
bun test
```

Expected: the terminal-related tests pass. If the inherited `bridgeIdentity.test.ts` mismatch remains, record it separately and confirm the feature branch did not modify bridge identity/provider registry files.

- [ ] **Step 4: Reconstruct the final OpenAI tool array without network access**

Run the local request-construction probe with `NODE_ENV=test`, a placeholder API key, and `--feature SESSION_TERMINALS`. Assert:

```text
registry_has_terminal=true
terminal_is_deferred=false
api_has_terminal=true
api_has_terminal_read=true
```

- [ ] **Step 5: Integrate into the runtime branch**

Confirm the original worktree has no tracked uncommitted changes, then cherry-pick the feature commits onto `codex/fix-terminal-sse-delivery`. Preserve the untracked `.superpowers/` directory and `scripts/bastion_login.exp`.

- [ ] **Step 6: Restart RCS and verify process provenance**

Gracefully stop the current `bun run rcs` process tree, start `bun run rcs` from `/Users/xiej/LocalDoc/Real_Agentc/Real-Agentic`, and confirm new `remote-control` and session subprocesses use the updated original-worktree source. Existing sessions are not evidence because they retain old code.

- [ ] **Step 7: Verify a fresh session**

In a newly created session, ask for persistent visual Terminal use. Confirm either a direct `Terminal`/`TerminalRead` call or the SearchExtraTools-provided ExecuteExtraTool fallback occurs, with no repeated search and no Bash probe. Do not send private repository context to an external provider solely for diagnostics without explicit approval.

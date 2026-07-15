# Session Terminal Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make models prefer `Terminal`/`TerminalRead` for persistent, interactive, long-running, or user-visible terminal work and recover their direct-call schema after an erroneous tool search.

**Architecture:** Add conditional terminal-selection guidance to the dynamic system prompt, so unavailable feature-gated tools are never advertised. Extend `SearchExtraTools` keyword matching to recognize core tools and attach a schema-bearing recovery message for already-loaded matches while leaving deferred-tool execution unchanged.

**Tech Stack:** TypeScript, Bun, `bun:test`, Zod v4, existing tool registry and prompt-generation infrastructure.

## Global Constraints

- Keep `Bash` preferred for short, non-interactive, one-shot commands.
- Do not change PTY lifecycle, permissions, bridge transport, terminal UI behavior, or Chat-mode availability.
- Use test-driven development: every production behavior change must first have a focused failing regression test.
- Preserve all unrelated dirty-worktree changes.

---

### Task 1: Core-tool discovery and schema recovery

**Files:**
- Modify: `packages/builtin-tools/src/tools/SearchExtraToolsTool/__tests__/SearchExtraToolsTool.test.ts`
- Modify: `packages/builtin-tools/src/tools/SearchExtraToolsTool/SearchExtraToolsTool.ts`
- Modify: `packages/builtin-tools/src/tools/SearchExtraToolsTool/prompt.ts`

**Interfaces:**
- Consumes: `Tool.inputSchema`, optional `Tool.inputJSONSchema`, `Tool.description(...)`, `zodToJsonSchema(...)`, and the existing `already_loaded` result field.
- Produces: optional `core_tool_guidance: string` on `SearchExtraToolsTool.Output`; keyword searches may return matching core tools in `already_loaded` and mapped tool results include their direct-call schema.

- [ ] **Step 1: Write failing multi-word and schema-recovery tests**

Add `Terminal` and `TerminalRead` to the mocked `CORE_TOOLS`, construct tools with real Zod schemas, and add tests equivalent to:

```ts
test('multi-word terminal search returns matching core tools', async () => {
  const terminal = makeTool(
    'Terminal',
    'Operate persistent interactive PTY terminals',
    z.object({ action: z.enum(['open', 'run']), term: z.string() }),
  )
  const terminalRead = makeTool(
    'TerminalRead',
    'Read persistent terminal output',
    z.object({ action: z.enum(['read', 'list']), term: z.string().optional() }),
  )

  const result = await SearchExtraToolsTool.call(
    { query: 'terminal pty create read', max_results: 5 },
    makeContext([terminal, terminalRead]),
    async () => ({ behavior: 'allow' }),
    assistantMessage,
  )

  expect(result.data.already_loaded).toEqual(
    expect.arrayContaining(['Terminal', 'TerminalRead']),
  )
})

test('exact core-tool search returns direct-call schema guidance', async () => {
  const terminal = makeTool(
    'Terminal',
    'Operate persistent interactive PTY terminals',
    z.object({ action: z.enum(['open', 'run']), term: z.string() }),
  )
  const result = await SearchExtraToolsTool.call(
    { query: 'Terminal', max_results: 5 },
    makeContext([terminal]),
    async () => ({ behavior: 'allow' }),
    assistantMessage,
  )
  const block = SearchExtraToolsTool.mapToolResultToToolResultBlockParam(
    result.data,
    'tool-use-terminal',
  )

  expect(result.data.core_tool_guidance).toContain('"action"')
  expect(result.data.core_tool_guidance).toContain('"term"')
  expect(block.content).toContain('call directly')
  expect(block.content).toContain('Do not guess parameters')
  expect(block.content).toContain('Bash')
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun test packages/builtin-tools/src/tools/SearchExtraToolsTool/__tests__/SearchExtraToolsTool.test.ts
```

Expected: FAIL because multi-word keyword matching currently searches only deferred tools and `core_tool_guidance` does not exist.

- [ ] **Step 3: Implement full-set keyword matching and recovery guidance**

In `SearchExtraToolsTool.ts`:

```ts
import { zodToJsonSchema } from 'src/utils/zodToJsonSchema.js'

// outputSchema
core_tool_guidance: z.string().optional(),

// Search core and deferred tools by keyword; deferred TF-IDF remains unchanged.
let candidateTools = tools
```

Add a helper that finds each already-loaded tool, calls its concise `description`, converts `inputSchema` with `zodToJsonSchema` when `inputJSONSchema` is absent, and returns text in this form:

```text
Direct-call schema for already-loaded core tool Terminal:
Description: Operate persistent named PTY terminals...
Input schema: {"type":"object",...}
Call Terminal directly with this schema. Do not guess parameters, do not wrap it in ExecuteExtraTool, and do not probe for it with Bash or a CLI command.
```

Pass this guidance through `buildSearchResult(...)` for both `select:` and keyword result paths whenever `alreadyLoaded` is non-empty. Append it in `mapToolResultToToolResultBlockParam(...)` for all-core and mixed results.

In `prompt.ts`, extend `PROMPT_HEAD` with:

```text
When Terminal or TerminalRead appears in your current tool list, it is an already-loaded core tool: call it directly and never search for it, wrap it in ExecuteExtraTool, or probe for it through Bash.
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same `bun test` command. Expected: all `SearchExtraToolsTool` tests pass with zero failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/builtin-tools/src/tools/SearchExtraToolsTool/__tests__/SearchExtraToolsTool.test.ts packages/builtin-tools/src/tools/SearchExtraToolsTool/SearchExtraToolsTool.ts packages/builtin-tools/src/tools/SearchExtraToolsTool/prompt.ts
git commit -m "fix: expose core tool schemas during discovery"
```

### Task 2: Conditional terminal-priority system guidance

**Files:**
- Modify: `src/constants/prompts.ts`
- Modify: `src/constants/promptEngineeringAudit.runner.ts`

**Interfaces:**
- Consumes: `enabledTools: Set<string>`, `TERMINAL_TOOL_NAME`, and `TERMINAL_READ_TOOL_NAME`.
- Produces: a conditional bullet in `getUsingYourToolsSection(...)`; no terminal text when neither tool is enabled.

- [ ] **Step 1: Write failing prompt-presence and prompt-absence tests**

Mock the terminal prompt constants and add audit tests equivalent to:

```ts
test('prefers session terminals only for persistent interactive work', async () => {
  const prompt = await getFullPrompt([
    ...standardTools,
    { name: 'Terminal' },
    { name: 'TerminalRead' },
  ] as Tools)
  expect(prompt).toContain('prefer Terminal and TerminalRead over Bash')
  expect(prompt).toContain('interactive programs')
  expect(prompt).toContain('long-running processes')
  expect(prompt).toContain('short, non-interactive, one-shot commands')
})

test('does not advertise session terminals when unavailable', async () => {
  const prompt = await getFullPrompt(standardTools)
  expect(prompt).not.toContain('prefer Terminal and TerminalRead over Bash')
})
```

- [ ] **Step 2: Run the prompt audit and verify RED**

Run:

```bash
bun test src/constants/__tests__/promptEngineeringAudit.test.ts
```

Expected: FAIL because conditional terminal-priority guidance is absent.

- [ ] **Step 3: Add minimal conditional guidance**

Import the terminal tool names and append this item in `getUsingYourToolsSection(...)` only when both names are in `enabledTools`:

```ts
enabledTools.has(TERMINAL_TOOL_NAME) &&
enabledTools.has(TERMINAL_READ_TOOL_NAME)
  ? `For interactive programs, long-running processes, work that must preserve shell state across turns, or commands the user should watch or interact with in the web terminal sidebar, prefer ${TERMINAL_TOOL_NAME} and ${TERMINAL_READ_TOOL_NAME} over ${BASH_TOOL_NAME}. Call them directly; do not search for them, wrap them in ${EXECUTE_TOOL_NAME}, or probe for them through ${BASH_TOOL_NAME}. Continue using ${BASH_TOOL_NAME} for short, non-interactive, one-shot commands.`
  : null
```

- [ ] **Step 4: Run the prompt audit and verify GREEN**

Run the same prompt-audit command. Expected: the isolated audit subprocess exits 0.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/constants/prompts.ts src/constants/promptEngineeringAudit.runner.ts
git commit -m "fix: prioritize persistent terminal tools by scenario"
```

### Task 3: Repository verification

**Files:**
- Verify only; no planned production changes.

**Interfaces:**
- Consumes: completed Tasks 1–2.
- Produces: fresh test, typecheck, lint, and full-suite evidence.

- [ ] **Step 1: Run focused regression tests together**

```bash
bun test packages/builtin-tools/src/tools/SearchExtraToolsTool/__tests__/SearchExtraToolsTool.test.ts src/constants/__tests__/promptEngineeringAudit.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run type checking**

```bash
bun run typecheck
```

Expected: exit 0 with zero TypeScript errors.

- [ ] **Step 3: Run the repository full check**

```bash
bun run test:all
```

Expected: typecheck, lint, and test phases all exit 0. If unrelated pre-existing dirty-worktree failures appear, record the exact failing command and affected files without modifying unrelated work.

- [ ] **Step 4: Inspect final scope**

```bash
git diff --check HEAD~2..HEAD
git status --short
```

Expected: no whitespace errors; only the planned files and pre-existing unrelated user changes remain.

# CONTEXT_COLLAPSE — Context Collapse

> Feature Flag: `FEATURE_CONTEXT_COLLAPSE=1`
> Sub-Feature: `FEATURE_HISTORY_SNIP=1`
> Implementation Status: All core logic is Stub, wiring complete
> Reference Count: CONTEXT_COLLAPSE 20 + HISTORY_SNIP 16 = 36

## 1. Feature Overview

CONTEXT_COLLAPSE enables the model to introspect context window usage and intelligently compress old messages. When a conversation approaches the context limit, old messages are automatically collapsed into compressed summaries, preserving key information while freeing token space.

### Sub-Features

| Feature | Function |
|---------|----------|
| `CONTEXT_COLLAPSE` | Context collapse engine (background LLM call to compress old messages) |
| `HISTORY_SNIP` | SnipTool — marks messages for collapse/trimming |

## 2. Implementation Architecture

### 2.1 Module Status

| Module | File | Status |
|--------|------|--------|
| Collapse Core | `src/services/contextCollapse/index.ts` | **Stub** — interfaces complete (`ContextCollapseStats`, `CollapseResult`, `DrainResult`), all functions are no-ops |
| Collapse Operations | `src/services/contextCollapse/operations.ts` | **Stub** — `projectView` is identity function |
| Collapse Persistence | `src/services/contextCollapse/persist.ts` | **Stub** — `restoreFromEntries` is no-op |
| CtxInspectTool | `src/tools/CtxInspectTool/` | **Missing** — directory does not exist |
| SnipTool Prompt | `src/tools/SnipTool/prompt.ts` | **Stub** — empty tool name |
| SnipTool Implementation | `src/tools/SnipTool/SnipTool.ts` | **Missing** |
| force-snip Command | `src/commands/force-snip.js` | **Missing** |
| Collapse Read Search | `src/utils/collapseReadSearch.ts` | **Complete** — Snip as silent absorption operation |
| QueryEngine Integration | `src/QueryEngine.ts` | **Wired** — imports and uses snip projection |
| Token Warning UI | `src/components/TokenWarning.tsx` | **Wired** — collapse progress label |

### 2.2 Core Interfaces (Defined, Pending Implementation)

```ts
// contextCollapse/index.ts
interface ContextCollapseStats {
  // context usage statistics
}
interface CollapseResult {
  // collapse operation result
}
interface DrainResult {
  // emergency release result
}

// Key functions (all stubs):
isContextCollapseEnabled()          // -> false
applyCollapsesIfNeeded(messages)    // pass-through
recoverFromOverflow(messages)       // pass-through (413 recovery)
initContextCollapse()               // no-op
```

### 2.3 Expected Data Flow

```
Conversation continues to grow
      |
      v
Context approaches limit (detected by query.ts)
      |
      +-- Overflow detection (query.ts:440,616,802)
      |
      v
applyCollapsesIfNeeded(messages) [needs implementation]
      |
      +-- Background LLM call to compress old messages
      +-- Preserve key information (decisions, file paths, errors)
      +-- Replace old messages with compressed summaries
      |
      +-- 413 recovery (query.ts:1093,1179)
      |   +-- recoverFromOverflow() emergency collapse
      |
      v
projectView() filters post-collapse message view
      |
      v
Model continues working (in compressed context)
```

### 2.4 HISTORY_SNIP Sub-Feature

SnipTool provides manual collapse capabilities:

- `/force-snip` command — force execute collapse
- SnipTool — marks specific messages for collapse/trimming
- `collapseReadSearch.ts` is fully implemented, handles Snip as a silent absorption operation

### 2.5 Integration Points

| File | Location | Description |
|------|----------|-------------|
| `src/query.ts` | 18,440,616,802,1093,1179 | Overflow detection, 413 recovery, collapse application |
| `src/QueryEngine.ts` | 124,127,1301 | Snip projection usage |
| `src/utils/analyzeContext.ts` | 1122 | Skip reserve buffer display |
| `src/utils/sessionRestore.ts` | 127,494 | Restore collapse state |
| `src/services/compact/autoCompact.ts` | 179,215 | Consider collapse during auto-compaction |

## 3. Content Needing Implementation

| Priority | Module | Effort | Description |
|----------|--------|--------|-------------|
| 1 | `services/contextCollapse/index.ts` | Large | Collapse state machine, LLM call, message compression |
| 2 | `services/contextCollapse/operations.ts` | Medium | `projectView()` message filtering |
| 3 | `services/contextCollapse/persist.ts` | Small | `restoreFromEntries()` disk persistence |
| 4 | `tools/CtxInspectTool/` | Medium | Context introspection tool (token count, collapsed ranges) |
| 5 | `tools/SnipTool/SnipTool.ts` | Medium | Snip tool implementation |
| 6 | `commands/force-snip.js` | Small | `/force-snip` command |

## 4. Key Design Decisions

1. **Background LLM Compression**: Collapse is not simple truncation, but uses LLM to generate compressed summaries that preserve key information
2. **413 Recovery**: When API returns 413 (request too large), emergency collapse is the most important recovery mechanism
3. **Cooperates with autoCompact**: Collapse and auto-compaction (compact) are different mechanisms — collapse operates at message level, compaction at conversation level
4. **Persistence**: Collapse state is persisted to disk, reloaded on session restore

## 5. Usage

```bash
# Enable context collapse
FEATURE_CONTEXT_COLLAPSE=1 bun run dev

# Enable snip sub-feature
FEATURE_CONTEXT_COLLAPSE=1 FEATURE_HISTORY_SNIP=1 bun run dev
```

## 6. File Index

| File | Responsibility |
|------|----------------|
| `src/services/contextCollapse/index.ts` | Collapse core (stub, interfaces defined) |
| `src/services/contextCollapse/operations.ts` | Projection operations (stub) |
| `src/services/contextCollapse/persist.ts` | Persistence (stub) |
| `src/utils/collapseReadSearch.ts` | Snip absorption operation (complete) |
| `src/query.ts` | Overflow detection and 413 recovery integration |
| `src/QueryEngine.ts` | Snip projection usage |
| `src/components/TokenWarning.tsx` | Collapse progress UI |

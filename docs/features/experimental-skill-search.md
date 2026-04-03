# EXPERIMENTAL_SKILL_SEARCH — Skill Semantic Search

> Feature Flag: `FEATURE_EXPERIMENTAL_SKILL_SEARCH=1`
> Implementation Status: All Stub (8 files), wiring complete
> Reference Count: 21

## 1. Feature Overview

EXPERIMENTAL_SKILL_SEARCH provides a DiscoverSkills tool that semantically searches available skills based on the current task. The goal is to let the model automatically discover and recommend relevant skills (both local and remote) when executing tasks, without requiring users to search manually.

## 2. Implementation Architecture

### 2.1 Module Status

| Module | File | Status | Description |
|--------|------|--------|-------------|
| DiscoverSkillsTool | `src/tools/DiscoverSkillsTool/prompt.ts` | **Stub** | Empty tool name |
| Prefetch | `src/services/skillSearch/prefetch.ts` | **Stub** | All 3 functions are no-ops |
| Remote Loading | `src/services/skillSearch/remoteSkillLoader.ts` | **Stub** | Returns empty results |
| Remote State | `src/services/skillSearch/remoteSkillState.ts` | **Stub** | Returns null/undefined |
| Signals | `src/services/skillSearch/signals.ts` | **Stub** | `DiscoverySignal = any` |
| Telemetry | `src/services/skillSearch/telemetry.ts` | **Stub** | No-op logging |
| Local Search | `src/services/skillSearch/localSearch.ts` | **Stub** | No-op cache |
| Feature Check | `src/services/skillSearch/featureCheck.ts` | **Stub** | `isSkillSearchEnabled => false` |
| SkillTool Integration | `src/tools/SkillTool/SkillTool.ts` | **Wired** | Dynamic loading of all remote skill modules |
| Prompt Integration | `src/constants/prompts.ts` | **Wired** | DiscoverSkills schema injection |

### 2.2 Expected Data Flow

```
Model processes user task
      |
      v
DiscoverSkills tool triggers [needs implementation]
      |
      +-- Local search: index installed skill metadata
      |   +-- localSearch.ts -> skill name/description/keyword matching
      |
      +-- Remote search: query skill marketplace/registry
          +-- remoteSkillLoader.ts -> fetch + parse
      |
      v
Result ranking and filtering
      |
      v
Return recommended skill list
      |
      v
Model uses SkillTool to invoke recommended skills
```

### 2.3 Prefetch Mechanism

`prefetch.ts` is expected to analyze message content before user submits input, searching for relevant skills ahead of time:

- `startSkillDiscoveryPrefetch()` — Start prefetch
- `collectSkillDiscoveryPrefetch()` — Collect prefetch results
- `getTurnZeroSkillDiscovery()` — Get turn 0 skill discovery results

## 3. Content Needing Implementation

| Priority | Module | Effort | Description |
|----------|--------|--------|-------------|
| 1 | `DiscoverSkillsTool` | Large | Semantic search tool schema + execution |
| 2 | `skillSearch/prefetch.ts` | Medium | User input analysis and prefetch logic |
| 3 | `skillSearch/remoteSkillLoader.ts` | Large | Remote marketplace/registry fetching |
| 4 | `skillSearch/remoteSkillState.ts` | Small | Discovered skill state management |
| 5 | `skillSearch/localSearch.ts` | Medium | Local index building/querying |
| 6 | `skillSearch/featureCheck.ts` | Small | GrowthBook/config gating |
| 7 | `skillSearch/signals.ts` | Small | `DiscoverySignal` type definition |

## 4. Key Design Decisions

1. **Prefetch Optimization**: Begin searching before user submits, reducing first-response latency
2. **Local + Remote Dual Search**: Local index for fast matching + remote marketplace for deep search
3. **SkillTool Integration**: Discovered skills invoked via SkillTool, no new invocation mechanism needed
4. **Independent of MCP_SKILLS**: MCP_SKILLS discovers from MCP servers, EXPERIMENTAL_SKILL_SEARCH discovers from skill marketplace

## 5. Usage

```bash
# Enable feature (requires implementation before actual use)
FEATURE_EXPERIMENTAL_SKILL_SEARCH=1 bun run dev
```

## 6. File Index

| File | Responsibility |
|------|----------------|
| `src/tools/DiscoverSkillsTool/prompt.ts` | Tool schema (stub) |
| `src/services/skillSearch/prefetch.ts` | Prefetch logic (stub) |
| `src/services/skillSearch/remoteSkillLoader.ts` | Remote loading (stub) |
| `src/services/skillSearch/remoteSkillState.ts` | Remote state (stub) |
| `src/services/skillSearch/signals.ts` | Signal types (stub) |
| `src/services/skillSearch/telemetry.ts` | Telemetry (stub) |
| `src/services/skillSearch/localSearch.ts` | Local search (stub) |
| `src/services/skillSearch/featureCheck.ts` | Feature check (stub) |
| `src/tools/SkillTool/SkillTool.ts` | SkillTool integration point |
| `src/constants/prompts.ts:95,335,778` | Prompt enhancement |

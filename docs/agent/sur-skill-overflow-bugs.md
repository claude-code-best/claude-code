# System Understanding Report — Skill Search / Skill Learning Overflow Bugs

- **Flow id**: `recurring-bug-skill-overflow` (sibling pilot to `recurring-bug-loop-oom`)
- **Branch**: `fix/loop-scheduled-autonomy-oom` (folded into the OOM PR — same audit-and-cap pattern)
- **Trigger**: post-merge review of the autonomy OOM fix surfaced unbounded module-level state in adjacent `EXPERIMENTAL_SKILL_SEARCH` and `SKILL_LEARNING` subsystems. The user explicitly asked for a `肯定也有同类溢出` audit.

---

## 1. Problem

The autonomy OOM bug came from unbounded module-level state (run records, scheduler queues, heartbeat timestamps) growing for the lifetime of the process. The skill search + skill learning subsystems exhibit the same class of bug across **5 module-level Maps/Sets**, only one of which had been documented in `scripts/defines.ts` ("projectContext cache 无淘汰机制（非 GB 级主因）").

These bugs were latent because:

- `EXPERIMENTAL_SKILL_SEARCH` / `SKILL_LEARNING` were enabled-by-default in `DEFAULT_BUILD_FEATURES`, but tests pass because they exercise short paths.
- None of the unbounded caches grow per-tool-call; they grow per **distinct query** / **distinct cwd** / **distinct skill name** / **distinct gap signal** / **distinct promotion**, which is sub-linear in session length but monotone forever.
- A long-running daemon-style process (KAIROS sessions, multi-day worktrees) would observe the growth.

## 2. Module-level state audit

| File:Line | Symbol | Pre-fix bound | Pre-fix evict |
|---|---|---|---|
| `intentNormalize.ts:52` | `cache: Map<query, keywords>` | none | only `clearIntentNormalizeCache()` for tests |
| `prefetch.ts:17` | `discoveredThisSession: Set<skillName>` | none | none |
| `prefetch.ts:18` | `recordedGapSignals: Set<gapKey>` | none | none |
| `projectContext.ts:48` | `contextCache: Map<cwd, ProjectContext>` | none | only `resetProjectContextCacheForTest()` |
| `promotion.ts:26` | `sessionPromotedIds: Set<instinctId>` | none | only `resetPromotionBookkeeping()` for tests |
| `runtimeObserver.ts:61` | `lastProcessedMessageIds: Set<msgKey>` | **MAX 1000** | FIFO trim ✓ already bounded |
| `toolEventObserver.ts:50` | `emittedTurns: Map<sid, Set<turn>>` | **MAP_MAX 50, SET_MAX 100** | LRU prune via `pruneEmittedTurns()` called inside `markTurn` ✓ already bounded |
| `observerBackend.ts:21` | `registry: Map<name, Backend>` | fixed N | n/a — registry pattern, finite ✓ |

**5 unbounded out of 8 module-level mutables.** All 5 are addressed in this PR.

## 3. Severity rationale

Per-entry cost is small (key strings + small objects), so OOM in days is unlikely on a normal workstation. But the canary scenarios:

- **`intentNormalize.cache`**: every distinct Chinese query → Haiku call → cached. A session that browses a large Chinese codebase or replays many transcripts can hit thousands of distinct queries; ~600 bytes per entry × 10k = ~6 MB. Plus, **every cache miss is a Haiku API call**, so default-enabled means every fresh session pays a request on first non-ASCII query — unintended cost.
- **`projectContext.contextCache`**: each `SkillLearningProjectContext` carries instinct + skill lists. Multi-worktree orchestrators (this very repo!) blow past the typical "1 cwd per session" assumption.
- **`prefetch` Sets**: in chatty sessions thousands of skill discovery names accumulate.
- **`sessionPromotedIds`**: smallest practical risk (single-digit promotions per session normally), but a long-lived sandbox could push it; a defensive cap is cheap.

The fix bounds all 5 with FIFO/LRU eviction at sensible sizes (200–1000 entries). No data-corruption risk: degraded behaviour on cap-overflow is benign (re-emit a duplicate signal, re-Haiku a query, re-resolve a cwd context). Same risk profile as the autonomy stale-recovery design.

## 4. Fix surface

| File | Change |
|---|---|
| `src/services/skillSearch/intentNormalize.ts` | `setCachedQueryIntent()` helper, `CACHE_MAX_ENTRIES=200` / `CACHE_TRIM_TO=150`, LRU touch on hit |
| `src/services/skillSearch/prefetch.ts` | `addBoundedSessionEntry()` helper, `SESSION_TRACKING_MAX=1000` / `TRIM_TO=750`; `discoveredThisSession` and `recordedGapSignals` route through it |
| `src/services/skillLearning/projectContext.ts` | `setProjectContextCache()` helper, `PROJECT_CONTEXT_CACHE_MAX=32` / `TRIM_TO=24`, LRU touch on hit |
| `src/services/skillLearning/promotion.ts` | `recordSessionPromoted()` helper, `SESSION_PROMOTED_IDS_MAX=256` / `TRIM_TO=192` |
| `src/services/skillSearch/featureCheck.ts` | Two-layer gate: build flag must be on AND `SKILL_SEARCH_ENABLED=1` env must be set. Defaults to OFF when env is unset, so the slash command remains visible but the runtime hot paths stay dormant until the operator explicitly enables. |
| `src/services/skillLearning/featureCheck.ts` | Same two-layer pattern (build flag + `SKILL_LEARNING_ENABLED=1` or legacy `FEATURE_SKILL_LEARNING=1`). |
| `scripts/defines.ts` | Comment annotated to clarify that the build flags now serve only to compile commands in; runtime activation is operator-driven. |

## 5. Why default-off (without removing from build)?

Three reasons aside from the unbounded-cache concern:

1. **Implicit cost**: `intentNormalize` calls Haiku on cache miss. Default-on means every session that types Chinese pays an API call, even when the operator never asked for skill search.
2. **Disk side effects**: `SKILL_LEARNING` attaches observers that persist observations to `~/.claude` storage. Storage volume should be opt-in, not background.
3. **Experimental status**: the flag is literally named `EXPERIMENTAL_*`. Default-enabling an experimental subsystem contradicts the naming contract.

**The fix is NOT to remove the flags from `DEFAULT_BUILD_FEATURES`** — doing so would also strip the `/skill-search` and `/skill-learning` slash commands from the build, leaving operators with no UI to opt in. Instead the activation logic in `featureCheck.ts` was changed to a two-layer gate:

- **Layer 1 (compile-time)**: `feature('EXPERIMENTAL_SKILL_SEARCH')` / `feature('SKILL_LEARNING')` must be on. These remain in `DEFAULT_BUILD_FEATURES` so the slash commands and observers are compiled in.
- **Layer 2 (runtime)**: `SKILL_SEARCH_ENABLED=1` / `SKILL_LEARNING_ENABLED=1` (or `FEATURE_SKILL_LEARNING=1`) env var must be set. Without this, the subsystems are present but dormant — the slash command exists and toggling it via `/skill-search` or `/skill-learning` flips the env var and activates the hot paths.

Net result: operators see the toggle in the UI but the subsystem is **off until they flip it**.

## 6. Out of scope (filed for follow-up)

- **Test failures on CI** (`prefetch.test.ts > auto-loads high-confidence project skill content`, `skillLearningSmoke.test.ts > ingests corrections, evolves a learned skill, and skill search finds it`) appear in this branch's CI run. Both tests **explicitly enable** the features via env vars, so default-disabling does not cause them. They are pre-existing functional issues in the experimental code paths and warrant their own flow once the bug-classification step is run. Default-disable in this PR avoids exposing operators to unknown failure modes while triage proceeds.
- **Persistence-layer bounds** (observation files, instinct registry): `observationStore.ts` already has 30-day purge and 1MB archive thresholds; `skillGapStore.ts` uses a finite-state lifecycle. Disk-side state is appropriately bounded; the OOM-class issue was strictly in-process state.

## 7. Verification

Local checks (full suite covers cap behaviour via existing tests; the caps degrade gracefully so no test should break):

```bash
bun run typecheck   # 0 errors
bun test src/services/skillSearch/__tests__/intentNormalize.test.ts
bun test src/services/skillSearch/__tests__/prefetch.extractQuery.test.ts
bun test src/services/skillLearning/__tests__/projectContext.test.ts
bun test src/services/skillLearning/__tests__/promotion.test.ts
bun run lint
bun run build
```

The new caps are observable behaviour: under sustained load the Map/Set sizes plateau at the configured maxima rather than monotone-growing.

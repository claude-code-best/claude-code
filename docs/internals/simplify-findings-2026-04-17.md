# Simplify Review Findings — 2026-04-17

> Base commit: `5b9943b3` on `chore/lint-cleanup`
> Three parallel review agents (reuse / quality / efficiency) audited the
> skill-learning sprint's new or heavily-changed files. 30 findings total.
>
> Fix attempt in the same session was **reverted by an unidentified
> post-write mechanism** (git status remained clean after every Edit
> call). This document preserves the findings so a future session can
> apply them when the revert source is identified.

## Files reviewed

- `src/services/skillLearning/` — runtimeObserver, toolEventObserver,
  llmObserverBackend, observerBackend, instinctStore, skillGapStore,
  skillLifecycle, evolution, skillGenerator, commandGenerator,
  agentGenerator, learningPolicy, promotion, observationStore,
  sessionObserver, instinctParser, projectContext, featureCheck
- `src/services/skillSearch/prefetch.ts`, `localSearch.ts`
- `src/commands/skill-learning/skill-learning.ts`
- `src/services/tools/toolExecution.ts` (AC1 wire only)
- `scripts/verify-skill-learning-e2e.ts`

## Section A — Reuse findings (8)

### A1 · Duplicate of `extractTextContent`

`runtimeObserver.ts:301-312` has `textFromContent(content: unknown)`
that maps + filters over ContentBlock[] to join text. The project
already exports `extractTextContent` / `getContentText` from
`src/utils/messages.ts:3011-3031`. The new helper only exists because
it takes `unknown`; a narrow `as ContentBlockParam[]` at the callsite
lets the utility handle it.

### A2 · `extractWords` copied between command and agent generators

`commandGenerator.ts:139-167` is byte-identical to
`agentGenerator.ts:137-164` except for a two-entry difference in the
stop-word set. Both share 80% of the loop body with
`learningPolicy.buildLearnedSkillName` (`learningPolicy.ts:38-47`).
Extract a `extractInstinctWords(instincts, { stopWords })` helper,
ideally placed next to the existing policy exports.

### A3 · `averageConfidence` computed inline in four places

`commandGenerator.ts:132-137`, `agentGenerator.ts:130-135`,
`skillGenerator.ts:36-38`, plus the same reduce shape inside
`learningPolicy.shouldGenerateSkillFromInstincts` (lines 29-32). Expose
a single `averageInstinctConfidence(instincts)` helper.

### A4 · Frontmatter template triplicated across generators

`skillGenerator.ts:171-179`, `commandGenerator.ts:104-111`,
`agentGenerator.ts:102-109` all emit the same 7-line frontmatter
(`name / description / origin / confidence / evolved_from`). A future
schema change has to touch three files. Extract
`buildLearnedArtifactFrontmatter({ name, description, confidence, sourceIds })`.

### A5 · Inline `createHash()` instead of `src/utils/hash.ts`

`instinctParser.ts:69-72`, `observationStore.ts:434-435`,
`projectContext.ts:234`, `skillGapStore.ts:466-468` all hand-roll
`createHash('sha1'|'sha256').update(x).digest('hex')`. `hashContent` in
`src/utils/hash.ts:19-46` already does this with Bun's faster
non-cryptographic hash; the four call sites are dedup-style uses where
cryptographic strength isn't required. **Note:** verify semantic
equivalence before swapping — Bun.hash output differs from SHA-256, so
any persisted IDs need a one-shot migration or a cutover version bump.

### A6 · Defensive `createObservationId` fallback is dead code

`observationStore.ts:427-432` feature-detects `crypto.randomUUID`, but
Bun + Node ≥18 always have it. Other files in the same directory
(`toolEventObserver.ts:72`, `runtimeObserver.ts:253/265/279/288`) call
it directly. Internal inconsistency.

### A7 · `projectContext.ts` re-implements `src/utils/git.ts`

`projectContext.ts:72-99` + 199-210 + 221-231 has its own `execFileSync`
git wrapper, `normalizeGitRemote`, and `projectNameFromRemote`. Already
exists: `findGitRoot` (`src/utils/git.ts:97`), `getRemoteUrl`
(`src/utils/git.ts:269`), `parseGitRemote`
(`src/utils/detectRepository.ts:87`). The blocker is that
projectContext is sync (execFileSync) while `getRemoteUrl` is async.
`findGitRoot` is sync and can be reused immediately.

### A8 · `isSkillLearningEnabled` vs `isSkillSearchEnabled` duplicated

`featureCheck.ts` in skillLearning and skillSearch are 1:1 templates
differing only in env-var names and flag names. Wrap with
`createFeatureGate(envName, flagName)` in `src/utils/`.

## Section B — Quality findings (12)

### B1 · `emittedTurns` redundant with timestamp watermark · HIGH

`toolEventObserver.ts:39-56` maintains `emittedTurns: Map<string, Set<number>>`
plus `markTurn` and `hasToolHookObservationsForTurn`. After the AC1 fix
in `runtimeObserver.ts:146-161` switched to a timestamp watermark, the
turn-Set is now just an "are there any tool-hook observations at all"
gate, which is already answered by `readObservations(...)` returning
an empty array. Module-level mutable state duplicating information
already in the observation store.

**Fix:** delete `emittedTurns`, `markTurn`,
`hasToolHookObservationsForTurn`, `resetToolHookBookkeeping`. Drop the
`if (hasToolHookObservationsForTurn(...))` guard in `runtimeObserver.ts`
and always run the watermark filter. Update
`__tests__/toolEventObserver.test.ts` to remove those imports; add a
test asserting `turn` is persisted on observations instead.

### B2 · Dead `_turn` parameter in `observationsFromMessages` · LOW

`runtimeObserver.ts:232-236` signature carries `_turn: number`, never
used in the body. AC1 rewrite artefact.

**Fix:** drop the parameter and the call-site third argument.

### B3 · Process-artefact comments leaking to source · MEDIUM

Multiple files contain `// codex review QN` / `// Codex second-pass
audit ACn` / `// AC9 compliance (codex review Q6)` comments. These
explain "why the previous implementation was wrong", not the current
invariant. Reviewer references are not addressable from the codebase.

Locations:
- `runtimeObserver.ts:49-54, 77-79, 106-120, 132-134, 145`
- `toolEventObserver.ts:22-28 @todo JSDoc`, 81, 93-146
- `instinctStore.ts:74-79, 152-153`
- `skillGapStore.ts:43, 169, 60-63 TODO block`
- `skillLifecycle.ts:193-199`
- `observationStore.ts:38-41`
- `__tests__/skillGapStore.test.ts:173-175`

**Fix:** keep the WHY (what invariant is guarded), delete the reviewer
reference and the "what was wrong before" narrative. Collapse multi-
line history notes to a single invariant statement.

### B4 · Three dynamic imports in tool wrapper · MEDIUM

`toolEventObserver.ts:101-105`: `runToolCallWithSkillLearningHooks`
does `await import('./projectContext.js')`, `await
import('./featureCheck.js')`, `await
import('./runtimeObserver.js')` on every invocation. Only the
`runtimeObserver` import has a cycle concern; the other two can be
static top-of-file imports.

**Fix:** convert `resolveProjectContext` and `isSkillLearningEnabled`
to static imports. Keep `runtimeObserver` dynamic or restructure
`RUNTIME_SESSION_ID` + `getRuntimeTurn` into a shared constant file.

### B5 · try/catch swallow triplicated · LOW

`toolEventObserver.ts:122, 128-134, 137-143`: three near-identical
`try { await recordX(...) } catch { /* swallow */ }` blocks.

**Fix:** extract `safeRecord(fn: () => Promise<unknown>): Promise<void>`
and call it at the three sites.

### B6 · `recordToolError` redundant with `recordToolComplete` · LOW

`toolEventObserver.ts:180-194` builds the same observation shape as
`recordToolComplete` with `outcome: 'failure'`. `recordToolError` can
simply delegate: `return recordToolComplete(ctx, toolName, error,
'failure')`.

### B7 · TODO comments in production · LOW

`skillGapStore.ts:60-63` carries a "P0-2 hook" multi-line TODO.
`toolEventObserver.ts:22-28` JSDoc `@todo` describes the pending wire
into `src/Tool.ts`. Both are planning notes, not code constraints.

**Fix:** move to issue tracker; leave at most a one-line
`// TODO(skill-learning): wire into Tool.ts dispatch`.

### B8 · `VALID_DOMAINS` double source of truth · MEDIUM

`llmObserverBackend.ts:33-41` maintains a `readonly InstinctDomain[]`
array separately from the `InstinctDomain` union in `types.ts:14-22`.
Adding a domain requires editing both, and `domainField` uses
`includes(value as InstinctDomain)` which bypasses type safety.

**Fix:** declare `export const INSTINCT_DOMAINS = [...] as const` in
`types.ts` and derive the union as `typeof INSTINCT_DOMAINS[number]`.
Import the const in `llmObserverBackend.ts` and validate with
`(INSTINCT_DOMAINS as readonly string[]).includes(value)`.

### B9 · `makeTimeoutSignal` dead fallback · LOW

`llmObserverBackend.ts:284-293` feature-detects `AbortSignal.timeout`
and falls back to `AbortController + setTimeout.unref?.()`. Project
targets Bun + Node ≥18 where `AbortSignal.timeout` is always present.

**Fix:** `return AbortSignal.timeout(ms)` directly.

### B10 · `recordSkillGap` rewrites all 14 fields by hand · LOW

`skillGapStore.ts:95-113` literally lists every field when
constructing the updated gap, mixing carry-over and new values. Adding
a field forces an edit here. Contrast with `recordDraftHit` (L173-178)
which uses spread.

**Fix:** `const gap: SkillGapRecord = { ...(existing ?? defaults), count: ..., updatedAt: now, recommendations: ..., sessionId: ..., cwd: ... }`.

### B11 · `buildGapAction` uses unlabelled regex chain · LOW

`skillGapStore.ts:318-331` dispatches by regex, with `stub` appearing
in two different branches. Order-dependent. The sibling `inferDomain`
(L333-341) is cleanly layered.

**Fix:** define `const ACTION_RULES: Array<{ pattern: RegExp; action:
string }>` at top-of-file, loop in priority order.

### B12 · Watermark is in-memory + module-scoped · MEDIUM

`runtimeObserver.ts:54` `lastConsumedToolHookTimestamp` lives in module
state, reset on test helper, lost on process restart. After restart
the next post-sampling pass re-reads everything above epoch-0. Also
means a test must know to reset the module to avoid cross-test leak.

**Fix:** persist the watermark next to the observations file, or mark
each consumed observation with `consumed: true` at read time.

## Section C — Efficiency findings (10)

### C1 · `resolveProjectContext` is uncached per tool.call · CRITICAL

`projectContext.ts:43-49` (+`persistProjectContext`) does on EVERY
call:
1. `execFileSync('git', ['remote', 'get-url', 'origin'])`
2. `execFileSync('git', ['rev-parse', '--show-toplevel'])`
3. Two `realpathSync.native` calls
4. `readProjectsRegistry` + two `writeFileSync` operations (registry +
   project.json)

`runToolCallWithSkillLearningHooks` calls this per tool.call. At
~100 tool calls per session, that is 200 git process forks plus 400
synchronous disk writes. **Highest-impact finding in the entire
sprint.**

**Fix:**
```ts
const contextCache = new Map<string, SkillLearningProjectContext>()
const PERSIST_INTERVAL_MS = 5 * 60 * 1000
let lastPersistAt = 0

export function resolveProjectContext(cwd = process.cwd()) {
  const cached = contextCache.get(cwd)
  if (cached) {
    if (Date.now() - lastPersistAt > PERSIST_INTERVAL_MS) {
      lastPersistAt = Date.now()
      persistProjectContext(cached)
    }
    return cached
  }
  const resolved = resolveContext(cwd)
  contextCache.set(cwd, resolved)
  persistProjectContext(resolved)
  lastPersistAt = Date.now()
  return resolved
}
```
Also export `resetProjectContextCacheForTest()`.

### C2 · Wrapper pays 3× dynamic import cost even when feature off · HIGH

`toolEventObserver.ts:101-108`: the isSkillLearningEnabled() check is
INSIDE the try block that runs after all three `await import` calls.
Feature-off path pays the cost.

**Fix:** static-import `isSkillLearningEnabled`; at the top of
`runToolCallWithSkillLearningHooks` do `if (!isSkillLearningEnabled())
return invoke()` immediately. Only then do dynamic imports for
runtimeObserver (if still needed).

### C3 · `emittedTurns` unbounded + allocation churn · MEDIUM

`toolEventObserver.ts:42`: `const seen = emittedTurns.get(sessionId) ??
new Set<number>()` — every call allocates a fresh Set and then
`emittedTurns.set()` replaces, even when an entry already existed.
Unbounded growth over a long daemon session.

**Fix:** subsumed by B1 (delete the bookkeeping entirely).

### C4 · Per-turn full-file read of `observations.jsonl` · MEDIUM

`runtimeObserver.ts:147`: `readObservations(options)` reads and
JSON.parses the entire jsonl each post-sampling pass just to filter
for `source === 'tool-hook' && timestamp > watermark`. At 0.9 MB
(below archive threshold) that is ~10–50 ms main-thread blocking per
turn.

**Fix:** keep the last N tool-hook records in a ring buffer in
`toolEventObserver.ts`, returned directly from a
`drainPendingToolHookObservations()` helper. Disk is for durability
only.

### C5 · `purgeOldObservations` always does full read + rewrite · LOW

`observationStore.ts:211-246` reads full file, parses, writes back —
unconditional. Runs on startup via `runStartupMaintenance`. On a
long-lived file near threshold, this is the slowest startup path.

**Fix:** short-circuit if the first observation line's timestamp is
already newer than the cutoff; also skip if file size < some floor.

### C6 · `decayInstinctConfidence` writes instincts serially · LOW

`instinctStore.ts:136-168`: for-await on `saveInstinct` makes N
sequential `writeFile` calls. N is typically small, but for 50+
instincts this is still noticeable.

**Fix:** `await Promise.all(toDecay.map(saveInstinct))`. Safe because
each writes an independent file.

### C7 · `upsertInstinct` reloads full instinct dir per candidate · MEDIUM

`instinctStore.ts:73`: every call re-does `readdir + readFile × N`.
Post-sampling may upsert 3+ candidates in a row. O(candidates × total
instincts) filesystem reads.

**Fix:** add a `bulkUpsertInstincts(candidates, options)` helper that
loads once and diff/merges in memory.

### C8 · Startup maintenance duplicates `loadInstincts` twice · LOW

`runtimeObserver.ts:86-90`: `decayInstinctConfidence` and
`prunePendingInstincts` each internally `loadInstincts` — two full
directory reads back-to-back.

**Fix:** load once in `runStartupMaintenance`, pass the array to both.
Or throttle maintenance to "once per 24h" via a persisted timestamp.

### C9 · `recordedGapSignals` + `discoveredThisSession` unbounded · MEDIUM

`prefetch.ts:22-23`: both module-level Sets monotonically grow. In a
long REPL or daemon session, memory leak accumulates.

**Fix:** LRU-cap at ~500 entries, or register a `sessionEnd` reset.

### C10 · `checkPromotion` loads every project serially · LOW

`promotion.ts:113-140`: `for (const entry of entries) { await
loadInstincts(entry) }`. For N projects, N sequential disk scans. Runs
at the end of each post-sampling pass.

**Fix:** `Promise.all(entries.map(loadInstincts))`. Or invalidate-
based: only call `checkPromotion` when at least one project's instinct
file changed this turn.

## Priority ranking (for the fix sprint)

| Tier | Finding | Effort | Impact |
|---|---|---|---|
| Critical | C1 `resolveProjectContext` cache | S | Huge (per tool.call) |
| High | B1/C3 delete `emittedTurns` bookkeeping | S | Real redundancy |
| High | C2/B4 wrapper static imports + early short-circuit | S | Per tool.call |
| High | B3 clean codex review comments | S | Code hygiene, user policy |
| Medium | B2 drop dead `_turn` param | XS | Trivial |
| Medium | B8 unify `VALID_DOMAINS` via `INSTINCT_DOMAINS` const | S | Type safety |
| Medium | B9 drop AbortSignal fallback | XS | Dead code |
| Medium | B12/C4 watermark persistence or in-memory tool-hook buffer | M | Tail latency |
| Medium | A2/A4 extract shared frontmatter + word helpers | M | Dedup 3 generators |
| Medium | C7 bulkUpsertInstincts | S | Per post-sampling |
| Low | C9/C5/C6/C8/C10 various batch/throttle optimisations | S each | Incremental |
| Low | A5/A7 replace hand-rolled git / hash with existing utils | M | Refactor, careful |
| Low | A6/A8 internal consistency + featureCheck factor | S | Polish |
| Low | B5/B6/B10/B11/B7 cosmetic quality cleanups | S each | Polish |

## Action recommendation

Apply in three independent commits (avoids batch revert risk):

1. **commit 1 (critical):** C1 project context cache + C2/B4 wrapper
   short-circuit + static imports.
2. **commit 2 (state cleanup):** B1/C3 delete `emittedTurns`, B2 drop
   `_turn`, B12 persist or replace watermark.
3. **commit 3 (hygiene):** B3 comment cleanup + B8/B9 domain/timeout
   cleanups + A2/A3/A4 generator helper extraction.

After each commit, run `bunx tsc --noEmit` and
`bun test src/services/skillLearning/__tests__/ src/services/skillSearch/__tests__/ src/commands/skill-learning/__tests__/`
before moving on.

## Environment note

During the 2026-04-17 simplify pass the fixes above were attempted as
direct Edit calls. `git status --short` was empty after the Edit
batch, indicating a PostToolUse / linter / format hook silently
reverted every write. All three agents returned valid diagnoses but
the code base stayed on `5b9943b3` unmodified. A future attempt should
first run `git status` between two Edit calls to confirm write
persistence, or disable the suspect hook and retry.

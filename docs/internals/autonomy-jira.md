# Autonomy Reliability Jira Drafts

These tickets are based on the call-chain audit of `/autonomy`, proactive
ticks, HEARTBEAT managed flows, cron scheduling, command queue consumption,
and daemon process supervision.

## AUT-001: Preserve autonomy lifecycle when queued commands are consumed mid-turn

Type: Bug
Priority: P0
Status: Draft
Patch status: Implemented in `fix/autonomy-lifecycle`.

Problem:
`query.ts` can drain queued prompt/task-notification commands as attachments
during an active turn. Autonomy prompts consumed this way were removed from the
in-memory queue without marking the persisted run as running/completed/failed,
so managed flows could stay stuck in `queued` and never advance.

Evidence:
- `src/query.ts` drains queued commands via `getCommandsByMaxPriority()`.
- `src/query.ts` removes consumed commands from the queue.
- Lifecycle updates existed only in the normal queued-submit path
  `src/utils/handlePromptSubmit.ts` and headless `src/cli/print.ts`.

Acceptance criteria:
- Mid-turn consumed autonomy commands mark runs `running`.
- Normal query completion finalizes consumed runs and queues next managed-flow
  steps.
- Query errors or abort terminal reasons mark consumed runs failed.
- Stale/cancelled autonomy commands are removed from the in-memory queue
  without being sent to the model.
- Regression tests cover stale command filtering and managed-flow advancement.

## AUT-002: Make autonomy run lifecycle transitions terminal-safe

Type: Bug
Priority: P0
Status: Draft
Patch status: Implemented in `fix/autonomy-lifecycle`.

Problem:
Run lifecycle helpers rewrote status unconditionally. A stale in-memory command
could mark a cancelled/completed/failed run back to `running`, causing a
cancelled flow to execute or a terminal flow to be rewritten.

Evidence:
- `markAutonomyRunRunning`, `markAutonomyRunCompleted`,
  `markAutonomyRunFailed`, and `markAutonomyRunCancelled` updated records
  without checking current status.
- External CLI cancel cannot remove queued commands living inside another
  process, so stale commands are a realistic input.

Acceptance criteria:
- `queued -> running/completed/failed/cancelled` remains allowed.
- `running -> completed/failed/cancelled` remains allowed.
- Any terminal status rejects later lifecycle updates.
- Rejected transitions do not update managed-flow step state.
- Regression tests cover stale lifecycle calls after cancellation.

## AUT-003: Prevent proactive and scheduled-task async fire failures from becoming invisible

Type: Bug
Priority: P1
Status: Draft
Patch status: Implemented in `fix/autonomy-lifecycle`.

Problem:
Proactive tick and cron fire callbacks launch detached async work. Failures in
prompt preparation or queue insertion could surface as unhandled rejections or
be lost from diagnostics. In one-shot cron paths, the scheduler has already
decided the task fired.

Evidence:
- `src/proactive/useProactive.ts` used a detached async IIFE without catch.
- `src/cli/print.ts` proactive and cron paths also detached async work.
- `src/hooks/useScheduledTasks.ts` cron callbacks detached async work.

Acceptance criteria:
- Detached proactive/cron fire work has explicit error logging.
- REPL proactive tick generation is non-reentrant.
- Tick generation stops queueing after hook unmount.

## AUT-004: Bound long-running daemon restart timers during shutdown

Type: Bug
Priority: P1
Status: Draft
Patch status: Implemented in `fix/autonomy-lifecycle`.

Problem:
The daemon supervisor scheduled worker restarts with `setTimeout()` but did
not store, clear, or `unref()` the timer. Shutdown during backoff could keep
the supervisor alive until the timer fired, forcing the stop path toward
SIGKILL.

Evidence:
- `src/daemon/main.ts` scheduled restart timers directly in the worker exit
  handler.
- Shutdown only signaled child processes and did not clear restart timers.

Acceptance criteria:
- Worker restart timers are tracked per worker.
- Shutdown clears any pending restart timers.
- Restart and force-kill grace timers do not keep the supervisor alive alone.

## AUT-005: Release autonomy persistence lock bookkeeping after each chain

Type: Bug
Priority: P1
Status: Draft
Patch status: Implemented in `fix/autonomy-lifecycle`.

Problem:
`withAutonomyPersistenceLock` stored a chained promise in its map but compared
the map value against the raw current promise during cleanup. That condition
never matched, so root-level lock bookkeeping could accumulate in long-lived
processes that touch many workspaces.

Evidence:
- `src/utils/autonomyPersistence.ts` stored `previous.then(() => current)`.
- Cleanup compared `persistenceLocks.get(key) === current`.

Acceptance criteria:
- The stored chained promise is the value used for cleanup comparison.
- Existing serialization behavior for same-root calls remains unchanged.
- Tests directly assert same-root lock bookkeeping returns to zero after both
  success and failure.

## AUT-006: Add active-record protection before persistence truncation

Type: Reliability
Priority: P2
Status: Draft
Patch status: Implemented in `fix/autonomy-lifecycle`.

Problem:
Autonomy runs and flows are capped by latest-created/updated order only.
Under high churn, active `queued` or `running` records can be truncated before
completion, which removes recovery evidence and can break managed-flow
advancement.

Evidence:
- `src/utils/autonomyRuns.ts` keeps the latest 200 runs by `createdAt`.
- `src/utils/autonomyFlows.ts` keeps the latest 100 flows by `updatedAt`.

Acceptance criteria:
- Active records are retained before completed historical records are trimmed.
- Tests cover trimming with more than the configured cap and active records
  near the tail.

## AUT-007: Treat provider API-error responses as failed autonomy turns

Type: Bug
Priority: P0
Status: Draft
Patch status: Implemented in `fix/autonomy-lifecycle`.

Problem:
Third-party provider adapters can convert provider failures into synthetic
assistant API-error messages instead of throwing. `query.ts` treated
`isApiErrorMessage` terminal responses as `completed`, so an autonomy command
that had already been consumed as a queued attachment could be marked
completed and advance its managed flow even though the provider call failed.

Evidence:
- `src/services/api/openai/index.ts`, `src/services/api/gemini/index.ts`, and
  `src/services/api/grok/index.ts` yield `createAssistantAPIErrorMessage()` on
  adapter errors.
- `src/query.ts` skipped stop hooks for API-error assistant messages but
  returned `reason: 'completed'`.
- Top-level autonomy finalization used terminal completion to decide whether
  to mark consumed runs completed or failed.

Acceptance criteria:
- Provider API-error assistant messages terminate the query with
  `reason: 'model_error'`.
- Any consumed autonomy run is marked failed rather than completed.
- Managed flows do not advance to the next step after provider API errors.
- A regression test simulates provider error after a queued autonomy attachment
  has been consumed.

## AUT-008: Finalize consumed autonomy runs on async-generator close

Type: Bug
Priority: P0
Status: Draft
Patch status: Implemented in `fix/autonomy-lifecycle`.

Problem:
`query()` is an async generator. When its consumer calls `.return()` or breaks
out of iteration, JavaScript executes `finally` blocks and skips code after the
`try/finally`. The previous autonomy finalization ran after the `finally`, so
queued autonomy commands that had already been claimed as `running` could stay
persisted as `running` forever if the REPL/SDK consumer closed the generator.

Evidence:
- Claimed run IDs were collected during queued attachment injection.
- Completion/failure finalization happened only after `yield* queryLoop(...)`
  returned normally or threw.
- Claude cross-validation flagged this as a durable run/flow leak.

Acceptance criteria:
- Consumed autonomy runs are finalized from a `finally` path.
- Normal completion marks consumed runs completed and enqueues next managed
  flow steps.
- Provider/model errors mark consumed runs failed.
- Generator close and user abort terminals mark consumed runs cancelled.
- A regression test closes the generator after a queued autonomy attachment and
  verifies the run/flow are cancelled, not left running.

## AUT-009: Claim queued autonomy runs before attachment injection

Type: Bug
Priority: P0
Status: Draft
Patch status: Implemented in `fix/autonomy-lifecycle`.

Problem:
The query loop filtered stale queued autonomy commands before attachment
generation, but it did not claim runs as `running` until after attachments were
already yielded. A concurrent cancellation between those steps could still send
a cancelled prompt into the model context.

Evidence:
- `partitionConsumableQueuedAutonomyCommands()` only checked persisted status.
- `markAutonomyRunRunning()` previously ran after `getAttachmentMessages()`.
- Reviewer cross-validation identified the check-then-act race.

Acceptance criteria:
- Query claims queued autonomy runs before passing commands to attachment
  generation.
- Only successfully claimed commands are injected as queued-command
  attachments.
- Failed claims are treated as stale and removed from the in-memory queue.
- Claiming reads persisted run state once per turn rather than once per
  command.

## AUT-010: Cancel proactive and cron runs dropped before enqueue

Type: Bug
Priority: P1
Status: Draft
Patch status: Implemented in `fix/autonomy-lifecycle`.

Problem:
`/proactive` and scheduled-task producers persist autonomy runs before
returning queue commands. If the component is disposed or headless input closes
after persistence but before enqueue, the queued run is left on disk with no
in-memory command to consume it.

Evidence:
- `createProactiveAutonomyCommands()` commits runs before returning commands.
- `commitAutonomyQueuedPrompt()` persists scheduled-task runs before callers
  enqueue them.
- Callers checked `disposed` / `inputClosed` after command creation and could
  return without terminalizing the run.

Acceptance criteria:
- Proactive hook cancellation checks run both before commit and after command
  creation.
- Headless proactive and cron paths cancel any already-created command that is
  dropped due to input close.
- REPL scheduled-task cleanup cancels already-created commands when unmounted.
- A regression test verifies a proactive command created but dropped before
  enqueue is marked cancelled.

## AUT-011: Replace query transition `any` stubs with typed contracts

Type: Test/Type Safety
Priority: P2
Status: Draft
Patch status: Implemented in `fix/autonomy-lifecycle`.

Problem:
`src/query/transitions.ts` defined both `Terminal` and `Continue` as `any`.
That allowed new terminal reasons such as `model_error` and continuation
reasons such as `collapse_drain_retry` to drift without compiler checks.

Evidence:
- Claude cross-validation flagged the `Terminal = any` contract as a remaining
  issue.
- Tightening the type immediately caught that
  `collapse_drain_retry.committed` is a `number`, not a `boolean`.

Acceptance criteria:
- `Terminal` is a concrete union of query terminal reasons.
- `Continue` is a concrete union of continuation reasons and payloads.
- `bun run typecheck` validates all query return sites against that contract.

## AUT-012: Avoid provider test settings-module mock pollution

Type: Test Reliability
Priority: P2
Status: Draft
Patch status: Implemented in `fix/autonomy-lifecycle`.

Problem:
The provider tests previously mocked `settings.js`. A minimal mock broke other
tests that imported additional settings exports in the same Bun process; the
expanded mock avoided the failure but over-coupled the provider test to
unrelated settings internals.

Evidence:
- Full test runs observed cross-file settings mock pollution.
- `src/utils/model/providers.ts` only needs the real `getInitialSettings()`
  behavior.

Acceptance criteria:
- Provider tests do not mock `settings.js`.
- `modelType` precedence is exercised through an injected settings snapshot,
  leaving global bootstrap state untouched.
- Provider tests pass when run alongside permissions tests and the provider
  matrix.

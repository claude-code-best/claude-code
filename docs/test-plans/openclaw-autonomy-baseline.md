# OpenClaw Autonomy Baseline Test Spec

## Purpose

This test spec locks the current behavior of the existing trigger and context layers before any formal autonomy-subsystem implementation begins.

At this stage, production code is read-only. Only test files, fixtures, and planning documents may change.

## Goal

Establish a stable baseline around the parts of `Claude-code-bast` that later autonomy work is most likely to touch:

- proactive state handling
- cron task storage semantics
- cron scheduler helper semantics
- user-context cache and `CLAUDE.md` injection behavior

## Out of Scope for This Baseline Round

- New authority behavior (`AGENTS.md` / `HEARTBEAT.md`)
- New detached-run ledger behavior
- New flow behavior
- UI redesign

## Files Under Baseline Protection

- `src/proactive/index.ts`
- `src/utils/cronTasks.ts`
- `src/utils/cronScheduler.ts`
- `src/context.ts`

## Test Files Added In This Round

- `src/proactive/__tests__/state.baseline.test.ts`
- `src/commands/__tests__/proactive.baseline.test.ts`
- `src/utils/__tests__/cronTasks.baseline.test.ts`
- `src/utils/__tests__/cronScheduler.baseline.test.ts`
- `src/__tests__/context.baseline.test.ts`

## Baseline Assertions

### Proactive state

1. Activating proactive mode sets active state and activation source.
2. Pausing proactive mode suppresses `shouldTick()` and clears `nextTickAt`.
3. Blocking context suppresses `shouldTick()` and clears `nextTickAt`.
4. Subscribers are notified on state transitions.
5. The `/proactive` command enables proactive mode and emits the expected hidden reminder.
6. The `/proactive` command disables proactive mode on the second invocation.

### Cron task storage

1. Session-only cron tasks remain in memory only.
2. Durable cron tasks are persisted to `.claude/scheduled_tasks.json`.
3. Daemon-style `dir`-scoped reads exclude session-only cron tasks.
4. `removeCronTasks()` without `dir` can remove session-only tasks.
5. `removeCronTasks()` with `dir` does not mutate session-only task storage.

### Cron scheduler helpers

1. `isRecurringTaskAged()` preserves current aging semantics.
2. `buildMissedTaskNotification()` preserves the current AskUserQuestion safety wording.
3. `buildMissedTaskNotification()` preserves code-fence hardening for prompt bodies that contain backticks.

### User context caching

1. `getUserContext()` includes `currentDate`.
2. `getUserContext()` includes mocked `claudeMd` content when memory loading is enabled.
3. `CLAUDE_CODE_DISABLE_CLAUDE_MDS` suppresses `claudeMd`.
4. `setSystemPromptInjection()` clears the memoized user-context cache.
5. `getSystemContext()` reflects the injection after cache invalidation.

## Remaining Baseline Gaps

The following areas are intentionally deferred because they require higher-cost harnessing and should still avoid production-code changes:

1. `useScheduledTasks.ts` hook-level runtime behavior
2. `src/cli/print.ts` full headless scheduler loop behavior
3. `useProactive.ts` hook timer behavior
4. end-to-end queue interaction between proactive ticks and `SleepTool`

## Acceptance

This baseline round is complete when:

1. The four new test files pass.
2. No production source files are modified.
3. The tests are stable enough to serve as a pre-implementation guardrail.

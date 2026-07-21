# Provider Command Worker Wakeup Design

## Problem

Self-hosted RCS lazily starts session workers only when durable work exists. Provider catalog and model-management operations use durable environment commands, but `runEnvironmentCommand()` currently marks every timed-out command as failed. If no session message has started a worker yet, a provider catalog read or mutation disappears at timeout, so the browser falls back to a stale read-only catalog and cannot create the command that would wake the worker.

## Goal

Keep provider and model-management commands durable after a worker timeout so a later worker startup can claim and complete them. Preserve the existing fail-fast timeout behavior for ordinary interactive environment commands.

## Design

1. Add a persistence operation that requeues one dispatched environment command to `pending`, incrementing its attempt count and updating its timestamp.
2. Identify provider environment command kinds in one shared service helper.
3. On timeout, `runEnvironmentCommand()` will:
   - leave a provider command already in `pending` untouched;
   - requeue a provider command in `dispatched`;
   - notify the environment work signal so an existing poller wakes immediately;
   - continue throwing the timeout to the current Web API, which can report a retryable timeout or stale read fallback.
4. Non-provider commands continue to be completed with a failure on timeout, preserving cleanup-command behavior.

No synthetic session, fake user message, or permanently running child worker is introduced. Provider mutation operation IDs remain the idempotency boundary if a late worker completes a command after the Web request timed out.

## Error and concurrency behavior

- A command completed before timeout remains completed; the timeout path must not overwrite it.
- A dispatched provider command is returned to the pending queue exactly once by the timeout path.
- A later poll may claim the pending command and complete it normally.
- If a late completion races with a requeued retry, the existing command completion conflict handling remains authoritative and idempotent.

## Testing

- Persistence test: requeue a dispatched command and verify `pending`, incremented attempt count, and updated timestamp.
- Work-dispatch test: a timed-out provider command remains pending and can be claimed by a later poll, while the existing ordinary command timeout test still verifies failure and cleanup preservation.
- Run the focused RCS tests, package typecheck, repository typecheck, and full test suite before completion.

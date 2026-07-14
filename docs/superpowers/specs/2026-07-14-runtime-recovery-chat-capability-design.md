# Runtime Recovery and Chat Capability Design

## Goal

Make one local Claude Code bridge reliably appear as an available Code environment and, when it explicitly advertises sandbox support, serve isolated Chat sessions as well.

The fix covers two observed failures:

1. A bridge can resume polling after a disconnect while its durable environment remains `offline`, so the Web UI continues to hide it.
2. A capable local Claude Code bridge can remain unusable for Chat when its registration does not persist `chat` and `chat_sandbox` capabilities.

## Environment Liveness

The latest connection lease is authoritative for liveness. The existing middleware order remains:

1. authenticate the API key;
2. validate the environment lease token;
3. process the poll.

After those checks succeed, a poll updates both `lastPollAt` and `status: active`. This makes a recovered bridge visible without allocating a new logical environment. A superseded process fails lease validation before the liveness update and therefore cannot revive or modify the environment.

Registration remains the only operation that creates or takes over a lease. Polling only restores online status for the already-authorized latest lease.

## Chat Runtime Capability

The local Claude Code bridge continues to register as `worker_type: claude_code`. It explicitly advertises:

- `claude_code: true`
- `chat: true`
- `chat_sandbox: true`

RCS does not infer Chat support from `worker_type`. This keeps old or alternate workers fail-closed. Chat session selection continues to require an active environment in the same account with both `chat` and `chat_sandbox` set to `true`.

The existing product-aware bridge runtime remains responsible for isolation:

- Code sessions run in their resolved trusted workspace and use workspace-owned artifact directories.
- Chat sessions run under `~/.real-agentc/chat-sessions/<session-id>`.
- Chat child processes force sandbox mode and fail if the sandbox is unavailable.
- Chat browser ownership is scoped to the session ID.

No separate Chat worker process is introduced.

## Data Flow

1. The bridge registers its stable device/workspace identity, ephemeral connection ID, lease, worker type, and capabilities.
2. RCS reuses the logical environment, stores the new lease and capabilities, and marks it active.
3. The bridge long-polls using the environment secret and lease token.
4. Every accepted poll refreshes `lastPollAt` and restores `active` if a disconnect monitor previously marked the environment offline.
5. Code environment queries include the active environment.
6. Chat session creation selects the same environment only when its explicit Chat sandbox capabilities are present.
7. The bridge receives product-aware work and starts the child process with the existing Code or Chat isolation policy.

## Compatibility and Migration

- Existing stable `environment_id` values are preserved.
- Existing offline environments are revived by a valid current-lease poll.
- A currently running bridge that registered before capability advertisement must restart once to publish the new capabilities.
- Legacy and non-leased registrations keep their compatibility behavior; capability inference is not added server-side.
- ACP and env-less/v2 identity semantics remain unchanged.

## Error Handling

- Invalid API keys continue to return `401`.
- Superseded leases continue to return `409 lease_superseded` and do not update liveness.
- Chat creation without an active explicitly capable runtime continues to fail with `no Chat runtime is online`.
- Chat sandbox startup remains fail-closed.

## Verification

Automated coverage will prove:

- an offline environment becomes active after an authenticated poll with the current lease;
- a superseded lease cannot revive an offline environment;
- Claude Code registration includes the three product capabilities;
- Chat selection accepts that registered environment while rejecting a Code-only environment;
- existing stable environment reuse and lease fencing behavior remain intact.

After automated tests and type checking, restart the local bridge once and verify that the active environment endpoint returns the stable environment with Chat capabilities, then create both a Code and a Chat session through the local RCS.

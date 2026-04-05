## Context

CCB's current runtime is centered around Anthropic-compatible Messages API calls. The main REPL loop, model selection, stream handling, and tool schema generation all assume Anthropic event shapes and provider semantics. At the same time, many users already have a working `codex login` session and want to use Codex from inside CCB without giving up CCB's local agent shell, commands, and transcript UI.

This change is cross-cutting because it affects the main query path, model/provider resolution, session lifecycle, and event normalization. Codex also introduces a different runtime boundary: instead of direct Messages API calls, CCB would need to speak to `codex app-server`, which uses thread/turn JSON-RPC semantics and may request token refresh during a session.

## Goals / Non-Goals

**Goals:**
- Introduce a provider-aware backend abstraction for the main conversation loop.
- Add a Codex backend that reuses the local `codex login` state via `codex app-server`.
- Support text streaming, model selection, turn interruption, and graceful startup/auth failure handling for Codex-backed sessions.
- Preserve the existing Anthropic-compatible backend path so current Claude-compatible provider setups continue to work unchanged.

**Non-Goals:**
- Full tool-call parity between Anthropic and Codex in the first version.
- Migrating all side-query helpers, title generation, or classifier paths to Codex in the first version.
- Replacing CCB's existing tool registry or local orchestration model.

## Decisions

### 1. Add a backend layer above provider-specific transports
CCB will add a runtime backend abstraction for the main conversation flow instead of directly calling Anthropic-specific helpers from the query loop. This keeps the current Anthropic path intact while allowing a separate Codex implementation.

Rationale:
- The current code is too coupled to Anthropic stream semantics to make a single `if provider === codex` branch maintainable.
- A backend boundary keeps Codex-specific protocol handling isolated.

Alternatives considered:
- Patch `services/api/claude.ts` directly to also handle Codex. Rejected because it would mix two incompatible protocols into one module.
- Treat Codex as just another model string under the Anthropic backend. Rejected because the runtime, auth, and streaming protocol are different.

### 2. First release is text-only for the main REPL loop
The first Codex backend will support user text input, streamed assistant output, interruption, and end-of-turn handling, but will not attempt full tool-call parity.

Rationale:
- Tool bridging is the highest-risk part because Codex app-server uses server-driven tool call requests rather than Anthropic `tool_use` blocks.
- A text-only first version proves backend selection, auth reuse, and stream normalization before expanding scope.

Alternatives considered:
- Implement tool bridging in the initial release. Rejected because it would expand the blast radius into permissions, tool orchestration, and transcript grouping before the backend contract is stable.

### 3. Reuse `codex app-server` instead of reading Codex auth files directly
The Codex backend will communicate with the locally installed `codex app-server` and let that runtime own the Codex session model.

Rationale:
- `codex login` state is already maintained by the Codex CLI.
- Reading auth files directly would be brittle and would not address in-session token refresh requests.

Alternatives considered:
- Parse `~/.codex/auth.json` and call OpenAI APIs directly. Rejected because refresh semantics and file format stability are not guaranteed.
- Require an API key instead of reusing `codex login`. Rejected for this change because the stated goal is to reuse an existing Codex subscription session.

### 4. Keep side queries on the existing backend initially
Only the main conversation loop will become backend-aware in this change. Smaller helper queries such as titles, hooks, or classifier paths remain on the existing Anthropic-compatible path until the main Codex backend is stable.

Rationale:
- These helpers are scattered across the codebase and currently assume Anthropic-side helpers.
- Delaying them reduces risk while still unlocking the primary user value: using Codex as the main model runtime.

Alternatives considered:
- Migrate all model consumers in one change. Rejected because it increases complexity and makes it harder to isolate regressions.

## Risks / Trade-offs

- **Different stream/event protocol** -> Introduce a normalization layer that translates Codex thread/turn events into CCB's internal message events before touching UI state.
- **Token refresh may be requested mid-session** -> Treat auth refresh and missing-login states as first-class backend errors with explicit user guidance.
- **Feature mismatch with Anthropic-specific paths** -> Limit first scope to the main REPL path and clearly defer tool parity and side-query migration.
- **Two backends increase maintenance cost** -> Keep the backend contract narrow and preserve the existing Anthropic implementation behind the same interface.
- **User confusion around backend/model choice** -> Separate provider selection from model selection so Codex models are not misrepresented as Claude family aliases.

## Migration Plan

1. Add the backend abstraction and wrap the current Anthropic runtime without changing user-visible behavior.
2. Add the Codex backend behind explicit provider selection.
3. Release Codex support as a text-only main-conversation option while leaving helper queries on the current backend.
4. Expand into tool parity and broader backend usage in follow-up changes once the session/runtime behavior is validated.

Rollback strategy:
- Keep Anthropic as the default path.
- If the Codex backend is unstable, disable provider selection for Codex without removing the backend abstraction.

## Open Questions

- Which internal event shape should become the stable backend-neutral contract for streamed text, reasoning, and completion?
- Should unsupported tool-driven turns under Codex be blocked up front or surfaced as a structured backend limitation after the turn starts?
- When side queries are later migrated, should they use the active backend or remain configurable independently?

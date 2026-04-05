## Why

CCB currently assumes an Anthropic-compatible Messages API backend, which makes it easy to point at Claude-compatible providers but impossible to reuse a local Codex subscription directly. Users who already pay for Codex want to keep CCB's CLI workflow, slash commands, and local agent behavior while selecting Codex as the model runtime.

## What Changes

- Add a provider-aware backend selection layer so CCB can choose a model runtime per session instead of hard-wiring Anthropic semantics into the main query loop.
- Introduce a first Codex backend that talks to `codex app-server` and reuses the user's existing `codex login` state.
- Support Codex-backed text streaming for the main conversation flow, including provider/model selection, turn lifecycle, and interruption.
- Keep CCB's existing agent shell, local orchestration, and tool registry in place for phase one, while explicitly deferring full tool-call parity and side-query migration.
- Preserve the current Anthropic-compatible backend path so existing Claude-compatible configurations continue to work.

## Capabilities

### New Capabilities
- `codex-backend`: Allow CCB to run its main conversation loop against a Codex app-server backend, with provider/model selection and text-streaming responses.

### Modified Capabilities

## Impact

- Affects the main query/runtime path, especially backend selection, model resolution, and streaming event handling.
- Touches the code around `src/query/deps.ts`, `src/services/api/claude.ts`, `src/utils/model/*`, and the internal message/event normalization path.
- Adds a runtime dependency on the local `codex` CLI and its app-server protocol when the Codex backend is selected.
- Keeps current Claude-compatible provider setups working, but introduces a second backend path with different protocol, auth refresh, and session semantics.

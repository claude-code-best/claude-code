## 1. Backend abstraction

- [x] 1.1 Identify the current main-turn call path and introduce a backend interface for session start, turn streaming, interruption, and completion events.
- [x] 1.2 Wrap the existing Anthropic-compatible flow in an `AnthropicBackend` implementation without changing current user-visible behavior.
- [x] 1.3 Add provider-aware backend selection wiring so the main query loop resolves a backend before each turn.

## 2. Codex runtime integration

- [x] 2.1 Implement a `CodexBackend` that starts or connects to `codex app-server`, initializes a session, and manages thread/turn lifecycle.
- [x] 2.2 Translate Codex stream notifications into CCB's internal text/reasoning/completion events for the main transcript.
- [x] 2.3 Handle Codex auth and startup failures, including missing login, rejected auth, and refresh-related errors with clear user guidance.
- [x] 2.4 Implement safe interruption for in-flight Codex turns and verify the session remains reusable afterward.

## 3. Provider and model selection

- [x] 3.1 Extend provider selection to include Codex as a first-class backend option.
- [x] 3.2 Make model selection backend-aware so Codex sessions show Codex-supported model identifiers instead of Claude aliases.
- [x] 3.3 Preserve existing Anthropic-compatible defaults and ensure non-Codex sessions continue to use the current backend path unchanged.

## 4. Validation and follow-up guardrails

- [x] 4.1 Add focused tests or runtime checks for backend selection, successful Codex text streaming, auth failure handling, and interruption behavior.
- [x] 4.2 Document first-release scope limits, especially that full tool-call parity and broad side-query migration are deferred.

## ADDED Requirements

### Requirement: User can select a Codex backend and Codex model for the main session
The system SHALL allow a session to choose the Codex backend independently from Anthropic-compatible backends, and SHALL expose Codex-specific model choices when that backend is active.

#### Scenario: Switching from Anthropic-compatible backend to Codex
- **WHEN** the user selects the Codex backend for a session
- **THEN** the system switches the main conversation runtime to Codex for subsequent turns

#### Scenario: Provider-aware model list
- **WHEN** the user opens model selection while the Codex backend is active
- **THEN** the system presents Codex-supported model identifiers instead of Claude-family aliases

### Requirement: Codex backend reuses local Codex login and streams main-turn output
The system SHALL run the main conversation turn against a local `codex app-server` session, SHALL reuse the user's existing Codex login state, and SHALL stream assistant output back into the CCB transcript.

#### Scenario: Successful Codex-backed turn
- **WHEN** the user sends a prompt in a session using the Codex backend and local Codex auth is available
- **THEN** the system starts a Codex-backed turn and streams assistant text into the transcript until the turn completes

#### Scenario: Missing or invalid Codex login
- **WHEN** the user sends a prompt in a session using the Codex backend and local Codex auth is unavailable or rejected
- **THEN** the system surfaces a clear setup or re-login action instead of silently falling back to another backend

### Requirement: Codex-backed sessions can be interrupted safely
The system SHALL let the user interrupt an in-flight Codex-backed turn and SHALL leave the session in a usable state for the next prompt.

#### Scenario: User interrupts a Codex-backed turn
- **WHEN** the user interrupts an active Codex-backed turn
- **THEN** the system stops the active Codex turn and keeps the session available for another prompt

### Requirement: Existing Anthropic-compatible backend behavior is preserved
The system SHALL keep the current Anthropic-compatible backend path available and SHALL not require Codex to be installed or selected for existing Claude-compatible workflows.

#### Scenario: Existing Claude-compatible session remains unchanged
- **WHEN** the user continues using an Anthropic-compatible backend
- **THEN** the system keeps using the existing backend path without requiring Codex runtime setup

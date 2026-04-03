# VOICE_MODE — Voice Input

> Feature Flag: `FEATURE_VOICE_MODE=1`
> Implementation Status: Fully functional (requires Anthropic OAuth)
> Reference Count: 46

## 1. Feature Overview

VOICE_MODE implements Push-to-Talk voice input. The user holds down the spacebar to record audio, which is streamed via WebSocket to the Anthropic STT endpoint (Nova 3), with real-time transcription displayed in the terminal.

### Core Features

- **Push-to-Talk**: Hold spacebar to record, release to send automatically
- **Streaming Transcription**: Intermediate transcription results displayed in real-time during recording
- **Seamless Integration**: Transcribed text submitted directly as a user message to the conversation

## 2. User Interaction

| Action | Behavior |
|--------|----------|
| Hold spacebar | Start recording, display recording status |
| Release spacebar | Stop recording, wait for final transcription |
| Transcription complete | Auto-insert into input field and submit |
| `/voice` command | Toggle voice mode on/off |

### UI Feedback

- **Recording Indicator**: Red/pulsing animation displayed during recording
- **Intermediate Transcription**: STT real-time recognition text displayed during recording
- **Final Transcription**: Replaces intermediate results upon completion

## 3. Implementation Architecture

### 3.1 Gating Logic

File: `src/voice/voiceModeEnabled.ts`

Three-layer check:

```ts
isVoiceModeEnabled() = hasVoiceAuth() && isVoiceGrowthBookEnabled()
```

1. **Feature Flag**: `feature('VOICE_MODE')` — compile-time/runtime toggle
2. **GrowthBook Kill-Switch**: `!getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_quartz_disabled', false)` — emergency kill switch (default false = not disabled)
3. **Auth Check**: `hasVoiceAuth()` — requires Anthropic OAuth token (not API key)

### 3.2 Core Modules

| Module | Responsibility |
|--------|----------------|
| `src/voice/voiceModeEnabled.ts` | Feature flag + GrowthBook + Auth three-layer gating |
| `src/hooks/useVoice.ts` | React hook managing recording state and WebSocket connection |
| `src/services/voiceStreamSTT.ts` | WebSocket streaming to Anthropic STT |

### 3.3 Data Flow

```
User presses spacebar
      |
      v
useVoice hook activates
      |
      v
macOS native audio / SoX starts recording
      |
      v
WebSocket connects to Anthropic STT endpoint
      |
      +---> Intermediate transcription results -> real-time display
      |
      v
User releases spacebar
      |
      v
Stop recording, wait for final transcription
      |
      v
Transcribed text -> insert into input field -> auto-submit
```

### 3.4 Audio Recording

Two audio backends supported:
- **macOS Native Audio**: Preferred, low latency
- **SoX (Sound eXchange)**: Fallback, cross-platform

Audio stream sent via WebSocket to Anthropic's Nova 3 STT model.

## 4. Key Design Decisions

1. **OAuth Exclusive**: Voice mode uses the `voice_stream` endpoint (claude.ai), available only to Anthropic OAuth users. API key, Bedrock, and Vertex users cannot use it
2. **GrowthBook Negative Gating**: `tengu_amber_quartz_disabled` defaults to `false`, automatically available on new installs (no need to wait for GrowthBook initialization)
3. **Keychain Caching**: `getClaudeAIOAuthTokens()` first call accesses macOS keychain (~20-50ms), subsequent calls hit cache
4. **Independent of Main Feature Flag**: `isVoiceGrowthBookEnabled()` short-circuits to `false` when feature flag is off, preventing any module loading

## 5. Usage

```bash
# Enable feature
FEATURE_VOICE_MODE=1 bun run dev

# Usage in REPL
# 1. Ensure logged in via OAuth (claude.ai subscription)
# 2. Hold spacebar to speak
# 3. Release spacebar to wait for transcription
# 4. Or use /voice command to toggle on/off
```

## 6. External Dependencies

| Dependency | Description |
|------------|-------------|
| Anthropic OAuth | claude.ai subscription login, not API key |
| GrowthBook | `tengu_amber_quartz_disabled` emergency kill switch |
| macOS Native Audio or SoX | Audio recording |
| Nova 3 STT | Speech-to-text model |

## 7. File Index

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/voice/voiceModeEnabled.ts` | 55 | Three-layer gating logic |
| `src/hooks/useVoice.ts` | — | React hook (recording state + WebSocket) |
| `src/services/voiceStreamSTT.ts` | — | STT WebSocket streaming |

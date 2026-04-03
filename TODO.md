# TODO

Implement the packages below as closely as possible to match their relationship with the main package.

## Packages

- [x] `url-handler-napi` — URL handling NAPI module (signature fix, keep null fallback)
- [x] `modifiers-napi` — Modifier key detection NAPI module (Bun FFI + Carbon)
- [x] `audio-capture-napi` — Audio capture NAPI module (SoX/arecord)
- [x] `color-diff-napi` — Color difference calculation NAPI module (pure TS implementation)
- [x] `image-processor-napi` — Image processing NAPI module (sharp + osascript clipboard)

- [x] `@ant/computer-use-swift` — Computer Use Swift native module (macOS JXA/screencapture implementation)
- [x] `@ant/computer-use-mcp` — Computer Use MCP service (type-safe stub + sentinel apps + targetImageSize)
- [x] `@ant/computer-use-input` — Computer Use input module (macOS AppleScript/JXA implementation)
<!-- - [ ] `@ant/claude-for-chrome-mcp` — Chrome MCP extension -->

## Engineering Capabilities

- [x] Code formatting and linting
- [x] Redundant code checking
- [x] Git hook configuration
- [x] Code health checks
- [x] Biome lint rule tuning (adapted for decompiled code, formatting disabled to avoid large diffs)
- [x] Unit testing infrastructure setup (test runner configuration)
- [x] CI/CD pipeline (GitHub Actions)

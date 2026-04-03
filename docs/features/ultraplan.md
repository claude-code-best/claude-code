# ULTRAPLAN — Enhanced Planning

> Feature Flag: `FEATURE_ULTRAPLAN=1`
> Implementation Status: Keyword detection complete, command handling complete, CCR remote session complete
> Reference Count: 10

## 1. Feature Overview

ULTRAPLAN automatically enters enhanced planning mode when the "ultraplan" keyword is detected in user input. Compared to normal plan mode, ultraplan provides deeper planning capabilities, supporting both local and remote (CCR) execution.

### Trigger Methods

| Method | Behavior |
|--------|----------|
| Input containing "ultraplan" text | Automatically redirects to `/ultraplan` command |
| `/ultraplan` slash command | Direct execution |
| Rainbow highlighting | Rainbow animation on "ultraplan" keyword in input field |

## 2. Implementation Architecture

### 2.1 Module Status

| Module | File | Lines | Status |
|--------|------|-------|--------|
| Command Handler | `src/commands/ultraplan.tsx` | 472 | **Complete** |
| CCR Session | `src/utils/ultraplan/ccrSession.ts` | 350 | **Complete** |
| Keyword Detection | `src/utils/ultraplan/keyword.ts` | 128 | **Complete** |
| Embedded Prompt | `src/utils/ultraplan/prompt.txt` | 1 | **Complete** |
| REPL Dialog | `src/screens/REPL.tsx` | — | **Wired** |
| Keyword Highlighting | `src/components/PromptInput/PromptInput.tsx` | — | **Wired** |

### 2.2 Keyword Detection

File: `src/utils/ultraplan/keyword.ts` (128 lines)

`findUltraplanTriggerPositions(text)` intelligent filtering:
- Excludes "ultraplan" inside quotes
- Excludes "ultraplan" in paths (e.g., `/path/to/ultraplan/`)
- Excludes contexts other than slash commands
- `replaceUltraplanKeyword(text)` cleans up the keyword

### 2.3 CCR Remote Session

File: `src/utils/ultraplan/ccrSession.ts` (350 lines)

`ExitPlanModeScanner` class implements a complete event state machine:
- `pollForApprovedExitPlanMode()` — 3-second polling interval
- Timeout handling and retry
- Supports remote (teleport) and local execution

### 2.4 Data Flow

```
User inputs "help me ultraplan refactoring this module"
         |
         v
processUserInput detects "ultraplan"
         |
         v
Redirects to /ultraplan command
         |
         +-- Local execution -> EnterPlanMode
         |
         +-- Remote execution -> teleportToRemote -> CCR session
                |
                v
         ExitPlanModeScanner polling
                |
                v
         User approves remotely -> local receives result
```

## 3. Content Needing Implementation

| Module | Description |
|--------|-------------|
| UltraplanChoiceDialog / UltraplanLaunchDialog in `src/screens/REPL.tsx` | Dialog components for user to choose local/remote execution |
| `src/commands/ultraplan/` | Empty directory, possibly an unmerged subcommand structure |

## 4. Key Design Decisions

1. **Intelligent Keyword Filtering**: Excludes "ultraplan" in quotes and paths, avoiding false triggers
2. **Local/Remote Dual Mode**: Supports local plan mode and CCR remote sessions
3. **Rainbow Highlight Feedback**: "ultraplan" keyword uses rainbow animation in input field, hinting at special functionality
4. **processUserInput Integration**: Intercepts in the user input processing pipeline, seamless redirection

## 5. Usage

```bash
# Enable feature
FEATURE_ULTRAPLAN=1 bun run dev

# Usage in REPL
# > ultraplan refactor the auth module
# > /ultraplan
```

## 6. File Index

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/commands/ultraplan.tsx` | 472 | Slash command handler |
| `src/utils/ultraplan/ccrSession.ts` | 350 | CCR remote session management |
| `src/utils/ultraplan/keyword.ts` | 128 | Keyword detection and replacement |
| `src/utils/ultraplan/prompt.txt` | 1 | Embedded prompt |
| `src/utils/processUserInput/processUserInput.ts:468` | — | Keyword redirection |
| `src/components/PromptInput/PromptInput.tsx` | — | Rainbow highlighting |

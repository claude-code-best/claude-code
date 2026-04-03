# ULTRAPLAN (Enhanced Planning) Implementation Analysis

> Generated: 2026-04-02
> Feature Flag: `FEATURE_ULTRAPLAN=1`
> References: 10 (across 8 files)

---

## I. Feature Overview

ULTRAPLAN is a **remote enhanced planning** feature that sends the user's planning request to Claude Code on the Web (CCR, cloud container) for execution. It uses the Opus model in the cloud to generate an advanced plan, which users can edit and approve in the browser, then choose to either continue execution in the cloud or "teleport" the plan back to the local terminal for execution.

**Core value proposition**:
- Terminal is not blocked — planning happens remotely in the cloud while local work can continue
- Uses the most powerful model (Opus)
- Users can view and edit the plan in real-time in the browser
- Supports multi-turn iteration (cloud can ask follow-up questions, users reply in browser)

---

## II. Architecture Overview

```
User inputs "ultraplan xxx"
        |
        v
+-----------------------------------+
|  Keyword detection layer           |  Detects "ultraplan" keyword
|  (keyword.ts)                      |
|  + Input processing layer          |  Rewrites as /ultraplan command
|  (processUserInput)                |
+---------------+-------------------+
                |
                v
+-----------------------------------+
|  Command handling layer            |  launchUltraplan()
|  (ultraplan.tsx)                   |  -> launchDetached()
|  - Pre-flight checks (eligibility, |  buildUltraplanPrompt()
|    reentrancy guard)               |
+---------------+-------------------+
                |
                v
+-----------------------------------+
|  Remote session layer              |  teleportToRemote()
|  - Create CCR cloud session        |  permissionMode: 'plan'
|  - Set plan permission mode        |  model: Opus
+---------------+-------------------+
                |
                v
+-----------------------------------+
|  Polling layer (ccrSession.ts)     |  pollForApprovedExitPlanMode()
|  - ExitPlanModeScanner             |  Polls event stream every 3 seconds
|  - State machine:                  |  Timeout: 30 minutes
|    running -> needs_input          |
|            -> plan_ready           |
+---------------+-------------------+
                |
          +-----+-----+
          v           v
       approved    teleport
    (cloud exec)  (send back to local)
          |           |
          |           v
          |    UltraplanChoiceDialog
          |    User chooses execution method
          v           v
    Completion     Local plan
    notification   execution
```

---

## III. Module Details

### 3.1 Keyword Detection — `src/utils/ultraplan/keyword.ts`

Responsible for detecting the "ultraplan" keyword in user input. The detection logic is quite refined to avoid false triggers:

**Trigger condition**: Input contains a standalone `ultraplan` word (case-insensitive).

**Non-trigger scenarios**:
- Inside quotes/brackets: `` `ultraplan` ``, `"ultraplan"`, `[ultraplan]`, `{ultraplan}`
- Path/identifier context: `src/ultraplan/foo.ts`, `ultraplan.tsx`, `--ultraplan-mode`
- Questions: `ultraplan?`
- Inside slash commands: `/rename ultraplan foo`
- When an ultraplan session is already running or being launched

**Keyword replacement**: After triggering, replaces `ultraplan` with `plan` to maintain grammatical flow (e.g., "please ultraplan this" -> "please plan this").

```typescript
// Core exported functions
findUltraplanTriggerPositions(text)  // Returns array of trigger positions
hasUltraplanKeyword(text)            // Boolean check
replaceUltraplanKeyword(text)        // Replaces first trigger word with "plan"
```

### 3.2 Command Registration — `src/commands.ts`

```typescript
const ultraplan = feature('ULTRAPLAN')
  ? require('./commands/ultraplan.js').default
  : null
```

The command is only loaded when `FEATURE_ULTRAPLAN=1`. Command definition:

```typescript
{
  type: 'local-jsx',
  name: 'ultraplan',
  description: '~10–30 min · Claude Code on the web drafts an advanced plan...',
  argumentHint: '<prompt>',
  isEnabled: () => process.env.USER_TYPE === 'ant',  // Only available to ant users
}
```

> Note: `isEnabled` checks `USER_TYPE === 'ant'` (Anthropic internal users) — this is a command-level restriction. The keyword trigger path does not have this restriction; it works as long as the feature flag is enabled.

### 3.3 Core Command Implementation — `src/commands/ultraplan.tsx`

#### 3.3.1 Entry Function `call()`

Handles the `/ultraplan <prompt>` slash command:

1. **No-argument invocation**: Displays usage help text
2. **Active session exists**: Returns "already polling" message
3. **Normal invocation**: Sets `ultraplanLaunchPending` state, triggers `UltraplanLaunchDialog`

#### 3.3.2 `launchUltraplan()`

Public launch entry, shared by three paths:
- Slash command (`/ultraplan`)
- Keyword trigger (`processUserInput.ts`)
- Plan approval dialog's "Ultraplan" button (`ExitPlanModePermissionRequest`)

Key logic:
1. Reentrancy guard (`ultraplanSessionUrl` / `ultraplanLaunching`)
2. Synchronously set `ultraplanLaunching = true` to prevent race conditions
3. Asynchronously call `launchDetached()`
4. Immediately return launch message (don't wait for remote session creation)

#### 3.3.3 `launchDetached()`

Async background flow:

1. **Get model**: Read `tengu_ultraplan_model` from GrowthBook, default to `opus46` firstParty ID
2. **Eligibility check**: `checkRemoteAgentEligibility()` — verify user has permission to use remote agent
3. **Build prompt**: `buildUltraplanPrompt(blurb, seedPlan)`
   - If `seedPlan` exists (from plan approval dialog), use as draft prefix
   - Load instruction template from `prompt.txt`
   - Append user blurb
4. **Create remote session**: `teleportToRemote()`
   - `permissionMode: 'plan'` — remote runs in plan mode
   - `ultraplan: true` — marks as ultraplan session
   - `useDefaultEnvironment: true` — use default cloud environment
5. **Register task**: `registerRemoteAgentTask()` creates `RemoteAgentTask` tracking entry
6. **Start polling**: `startDetachedPoll()` background polls for approval status

#### 3.3.4 Prompt Construction

```
buildUltraplanPrompt(blurb, seedPlan?)
```

- `prompt.txt`: Currently an empty file (lost in decompilation); original content should contain system instructions guiding the remote agent to generate plans
- Developers can override the prompt file via `ULTRAPLAN_PROMPT_FILE` environment variable (only when `USER_TYPE=ant`)

#### 3.3.5 `startDetachedPoll()`

Background polling management:

1. Calls `pollForApprovedExitPlanMode()` to wait for plan approval
2. Updates `RemoteAgentTask.ultraplanPhase` on phase changes (UI display)
3. Two paths after approval completion:
   - **`executionTarget: 'remote'`**: User chose to execute in the cloud
     - Mark task as complete
     - Clear `ultraplanSessionUrl`
     - Send notification: results will be submitted as a PR
   - **`executionTarget: 'local'`**: User chose to teleport back to local
     - Set `ultraplanPendingChoice`
     - Trigger `UltraplanChoiceDialog`
4. On failure: archive remote session, clear state, send error notification

#### 3.3.6 `stopUltraplan()`

User-initiated stop:

1. `RemoteAgentTask.kill()` archives remote session
2. Clear all ultraplan state (`ultraplanSessionUrl`, `ultraplanPendingChoice`, `ultraplanLaunching`)
3. Send stop notification

### 3.4 CCR Session Polling — `src/utils/ultraplan/ccrSession.ts`

#### 3.4.1 `ExitPlanModeScanner`

Pure state machine, no I/O. Ingests `SDKMessage[]` event batches, classifies `ExitPlanMode` tool call results.

**State types**:

```typescript
type ScanResult =
  | { kind: 'approved' }   // User approved the plan
  | { kind: 'teleport' }   // User clicked "teleport back to local"
  | { kind: 'rejected' }   // User rejected (can continue iterating)
  | { kind: 'pending' }    // Waiting for user approval
  | { kind: 'terminated' } // Remote session unexpectedly terminated
  | { kind: 'unchanged' }  // No new events, state unchanged
```

**Priority**: approved > terminated > rejected > pending > unchanged

**Key design decisions**:
- The same event batch may contain both approval and subsequent crash — don't discard already-approved plans
- Rescan after rejection (`rescanAfterRejection`), since new events may contain a revised plan
- Uses `is_error: true` to detect rejection, searches `content` for markers to extract plan text

#### 3.4.2 `pollForApprovedExitPlanMode()`

Polling main loop:

- **Poll interval**: 3 seconds
- **Timeout**: 30 minutes
- **Fault tolerance**: 5 consecutive network errors before giving up
- **Phase inference**:
  - `hasPendingPlan` (ExitPlanMode exists without result) -> `plan_ready`
  - `quietIdle` (idle with no new events) -> `needs_input` (remote is waiting for user input)
  - Other -> `running`

#### 3.4.3 Plan Text Extraction

Two extraction paths:

1. **Approved**: Search `tool_result` for `## Approved Plan:\n` or `## Approved Plan (edited by user):\n` markers
2. **Teleport**: Search `tool_result` for `__ULTRAPLAN_TELEPORT_SENTINEL__` marker (embedded by browser)

### 3.5 Input Processing Integration — `src/utils/processUserInput/processUserInput.ts`

Keyword trigger path (before slash command processing):

```typescript
if (feature('ULTRAPLAN') &&
    mode === 'prompt' &&               // Not non-interactive mode
    !isNonInteractiveSession &&         // Not background session
    inputString !== null &&
    !inputString.startsWith('/') &&     // Not slash command
    !ultraplanSessionUrl &&             // No active session
    !ultraplanLaunching &&              // Not currently launching
    hasUltraplanKeyword(inputString)) {
  // Rewrite as /ultraplan command
  const rewritten = replaceUltraplanKeyword(inputString).trim()
  await processSlashCommand(`/ultraplan ${rewritten}`, ...)
}
```

### 3.6 UI Layer

#### 3.6.1 Rainbow Highlight — `src/components/PromptInput/PromptInput.tsx`

When an `ultraplan` keyword is detected in input:
- Apply **rainbow gradient** highlight to each character (`getRainbowColor()`)
- Display notification: "This prompt will launch an ultraplan session in Claude Code on the web"

#### 3.6.2 Pre-Launch Dialog — `UltraplanLaunchDialog`

Rendered when `focusedInputDialog === 'ultraplan-launch'` in the REPL.

User options:
- **Confirm**: Call `launchUltraplan()`, first add command echo, then async launch remote session
- **Cancel**: Clear `ultraplanLaunchPending` state

#### 3.6.3 Plan Choice Dialog — `UltraplanChoiceDialog`

Rendered when `focusedInputDialog === 'ultraplan-choice'`.

When the teleport path returns an approved plan, user can choose the execution method.

#### 3.6.4 Plan Approval Button — `ExitPlanModePermissionRequest`

In the local Plan Mode approval dialog, if `feature('ULTRAPLAN')` is enabled, an additional "Ultraplan" button is shown:
- Sends the current local plan as `seedPlan` to remote
- Button only shown when no active ultraplan session exists

### 3.7 Application State — `src/state/AppStateStore.ts`

```typescript
interface AppState {
  ultraplanLaunching?: boolean    // Reentrancy lock (5-second window)
  ultraplanSessionUrl?: string    // Active remote session URL
  ultraplanPendingChoice?: {      // Approved plan awaiting choice
    plan: string
    sessionId: string
    taskId: string
  }
  ultraplanLaunchPending?: {      // Pre-launch dialog
    blurb: string
  }
  isUltraplanMode?: boolean       // Remote side: CCR-side ultraplan marker
}
```

### 3.8 Remote Task Tracking — `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx`

Ultraplan uses `RemoteAgentTask` infrastructure to track remote sessions:

```typescript
registerRemoteAgentTask({
  remoteTaskType: 'ultraplan',
  session: { id, title },
  command: blurb,
  isUltraplan: true  // Special marker, skips generic polling logic
})
```

`extractPlanFromLog()` extracts plan content from `<ultraplan>...</ultraplan>` XML tags.

---

## IV. Data Flow Timeline

```
Timeline ->

User                    Local CLI                     CCR Cloud
 |                       |                             |
 | "ultraplan xxx"       |                             |
 |---------------------->|                             |
 |                       | Keyword detection + rewrite  |
 |                       | /ultraplan "plan xxx"        |
 |                       |                             |
 |  [UltraplanLaunch     |                             |
 |   Dialog]             |                             |
 |---- confirm --------->|                             |
 |                       | launchDetached()             |
 |                       |---------------------------->|
 |                       |  teleportToRemote()          |
 |                       |  (permissionMode: 'plan')    |
 |                       |                             |
 |  "Starting..."        |                             |
 |<----------------------|                             |
 |                       |                             |
 |  (terminal idle,      |  startDetachedPoll()        |
 |   can continue work)  |  === 3s polling loop ===    |
 |                       |                             |
 |                       |                   [Browser opens]
 |                       |                   [Cloud generates plan]
 |                       |                             |
 |                       |  <- needs_input ------------|
 |                       |    (cloud asking user)       |
 |                       |                             |
 |                       |                   [User replies in browser]
 |                       |                             |
 |                       |  <- plan_ready -------------|
 |                       |    (ExitPlanMode awaiting    |
 |                       |     approval)                |
 |                       |                             |
 |                       |                   [User approves/edits]
 |                       |                             |
 |               +-------+  <- approved ---------------|
 |               |       |                             |
 |    [Remote    |       |                             |
 |    execution] |       |                             |
 |    Notify     |       |                             |
 |    complete   |       |                             |
 |               |       |                             |
 |               +-- OR -+  <- teleport ---------------|
 |                       |                             |
 |  [UltraplanChoice     |                             |
 |   Dialog]             |                             |
 |-- Choose execution -->|                             |
 |   method              |                             |
 |                       | Execute plan locally         |
```

---

## V. Key File List

| File | Responsibility |
|------|----------------|
| `src/utils/ultraplan/keyword.ts` | Keyword detection, highlight position calculation, keyword replacement |
| `src/utils/ultraplan/ccrSession.ts` | CCR session polling, ExitPlanMode state machine, plan text extraction |
| `src/utils/ultraplan/prompt.txt` | Remote instruction template (currently empty, needs rebuilding) |
| `src/commands/ultraplan.tsx` | `/ultraplan` command, launch/stop logic, prompt construction |
| `src/utils/processUserInput/processUserInput.ts` | Keyword trigger -> `/ultraplan` command routing |
| `src/components/PromptInput/PromptInput.tsx` | Rainbow highlight + notification prompt |
| `src/screens/REPL.tsx` | Dialog rendering (UltraplanLaunchDialog / UltraplanChoiceDialog) |
| `src/components/permissions/ExitPlanModePermissionRequest/` | "Ultraplan" button in Plan approval |
| `src/state/AppStateStore.ts` | Ultraplan-related state field definitions |
| `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx` | Remote task tracking + `<ultraplan>` tag extraction |
| `src/constants/xml.ts` | `ULTRAPLAN_TAG = 'ultraplan'` |

---

## VI. Dependencies

### External Dependencies

| Dependency | Purpose | Necessity |
|------------|---------|-----------|
| `teleportToRemote()` | Create CCR cloud session | Required — core functionality |
| `checkRemoteAgentEligibility()` | Verify user remote agent usage eligibility | Required — pre-flight check |
| `archiveRemoteSession()` | Archive/terminate remote session | Required — cleanup |
| GrowthBook `tengu_ultraplan_model` | Get model ID to use | Optional — defaults to opus46 |
| `@anthropic-ai/sdk` | SDKMessage types | Required — type definitions |
| `pollRemoteSessionEvents()` | Event stream paginated polling | Required — polling infrastructure |

### Internal Dependencies

- **ExitPlanModeV2Tool**: Tool called on the remote side, triggers the plan approval flow
- **RemoteAgentTask**: Task tracking and state management infrastructure
- **AppState Store**: Ultraplan state management

---

## VII. Current Status and Completion Notes

| Component | Status | Notes |
|-----------|--------|-------|
| Keyword detection | Complete | `keyword.ts` logic is thorough |
| Command framework | Complete | Registration, routing, reentrancy guard complete |
| Launch flow | Complete | `launchUltraplan` / `launchDetached` complete |
| CCR polling | Complete | `ccrSession.ts` state machine complete |
| UI highlight/notification | Complete | Rainbow highlight + notification prompt complete |
| State management | Complete | AppState fields complete |
| `prompt.txt` | Empty file | Remote instruction template needs rebuilding |
| `UltraplanLaunchDialog` | Global declaration | Component implementation not found (may be in built-in package) |
| `UltraplanChoiceDialog` | Global declaration | Component implementation not found (may be in built-in package) |
| `isEnabled` restriction | `USER_TYPE === 'ant'` | Command-level restriction, Anthropic internal users only |

### Completion Suggestions

1. **Rebuild `prompt.txt`**: This is the core instruction for the remote agent, defining how to conduct multi-agent exploratory planning. Needs to design:
   - Planning methodology (multi-angle analysis, risk assessment, phased execution)
   - ExitPlanMode tool usage guidance
   - Output format requirements

2. **Dialog components**: `UltraplanLaunchDialog` and `UltraplanChoiceDialog` are declared in `global.d.ts` but implementation is missing; needs new creation:
   - Launch Dialog: Confirmation dialog (with CCR terms of service link)
   - Choice Dialog: Display approved plan + execution method selection

3. **Relax `isEnabled`**: To allow non-ant users to use the slash command, remove the `USER_TYPE === 'ant'` check

---

## VIII. Relationship with Related Features

| Feature | Relationship |
|---------|--------------|
| `ULTRATHINK` | Similar high-capability mode, but `ULTRATHINK` only increases effort level, doesn't launch remote sessions |
| `FORK_SUBAGENT` | Ultraplan does not use fork subagent; it uses CCR remote agents |
| `COORDINATOR_MODE` | Different multi-agent paradigm; Coordinator orchestrates locally, Ultraplan orchestrates in the cloud |
| `BRIDGE_MODE` | Shares the same underlying `teleportToRemote()` infrastructure |
| `ExitPlanModeTool` | Remote-side approval mechanism; Ultraplan's core interaction model |

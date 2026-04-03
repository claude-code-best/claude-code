# TOKEN_BUDGET — Token Budget Auto-Continue Mode

> Feature Flag: `FEATURE_TOKEN_BUDGET=1`
> Implementation Status: Fully functional

## 1. Feature Overview

TOKEN_BUDGET lets users specify an output token budget target in their prompt (e.g., `+500k`, `spend 2M tokens`), and Claude will **automatically continue working** until the target is reached, without requiring the user to repeatedly press enter to continue.

Suitable for large refactors, batch modifications, large-scale code generation, and other long tasks requiring multiple rounds of tool calls.

## 2. User Interaction

### Syntax

| Format | Example | Description |
|--------|---------|-------------|
| Shorthand (beginning) | `+500k` | Written directly at the start of input |
| Shorthand (end) | `help me refactor this module +2m` | Appended at end of input |
| Full syntax | `spend 2M tokens` or `use 1B tokens` | Embedded in natural language |

Supported units: `k` (thousand), `m` (million), `b` (billion), case-insensitive.

### UI Feedback

- **Input Field Highlighting**: When input contains budget syntax, corresponding text is highlighted (`PromptInput.tsx` computes via `findTokenBudgetPositions`)
- **Spinner Progress**: Bottom spinner shows real-time progress, formatted as:
  - In progress: `Target: 125,000 / 500,000 (25%) · ~2m 30s`
  - Completed: `Target: 510,000 used (500,000 min ✓)`
  - Includes ETA (calculated based on current token output rate)

## 3. Implementation Architecture

### Data Flow

```
User inputs "+500k"
     |
     v
+-------------------------+
|  parseTokenBudget()     |  src/utils/tokenBudget.ts
|  Regex parse -> 500,000 |
+--------+----------------+
         |
         v
+-------------------------+
|  REPL.tsx               |  Called on submit
|  snapshotOutputTokens   |  snapshotOutputTokensForTurn(500000)
|  ForTurn(500000)        |  Records turn start token count + budget
+--------+----------------+
         |
         v
+-------------------------+
|  query.ts main loop     |  Checks after each turn
|  checkTokenBudget()     |  Current output tokens vs budget
+--------+----------------+
         |
    +----+-----+
    |          |
    v          v
 continue    stop
 (below 90%) (reached 90% or diminishing returns)
    |          |
    v          v
 Inject       Normal
 nudge msg    completion,
 continue     send done event
```

### Core Modules

#### 1. Parsing Layer — `src/utils/tokenBudget.ts`

Three regex patterns parse user input:

```
SHORTHAND_START_RE = /^\s*\+(\d+(?:\.\d+)?)\s*(k|m|b)\b/i   // "+500k" at beginning
SHORTHAND_END_RE   = /\s\+(\d+(?:\.\d+)?)\s*(k|m|b)\s*[.!?]?\s*$/i  // "+2m" at end
VERBOSE_RE         = /\b(?:use|spend)\s+(\d+(?:\.\d+)?)\s*(k|m|b)\s*tokens?\b/i  // "spend 2M tokens"
```

- `parseTokenBudget(text)` — Extracts budget value, returns `number | null`
- `findTokenBudgetPositions(text)` — Returns array of match positions, used for input field highlighting
- `getBudgetContinuationMessage(pct, turnTokens, budget)` — Generates continuation message

#### 2. State Layer — `src/bootstrap/state.ts`

Module-level singleton variables tracking current turn budget state:

```
outputTokensAtTurnStart   — Cumulative output token count at start of this turn
currentTurnTokenBudget    — Budget target for this turn (null means no budget)
budgetContinuationCount   — Number of auto-continuations in this turn
```

Key functions:
- `getTotalOutputTokens()` — Aggregates output tokens from `STATE.modelUsage` across all models
- `getTurnOutputTokens()` — `getTotalOutputTokens() - outputTokensAtTurnStart`
- `snapshotOutputTokensForTurn(budget)` — Resets turn starting point, sets new budget
- `getCurrentTurnTokenBudget()` — Returns current budget

#### 3. Decision Layer — `src/query/tokenBudget.ts`

`checkTokenBudget(tracker, agentId, budget, globalTurnTokens)` makes continue/stop decisions:

**Continue conditions**:
- Not in a sub-agent (`agentId` is empty)
- Budget exists and > 0
- Current tokens below **90%** of budget
- No diminishing returns (after 3 consecutive nudges, each producing < 500 tokens)

**Stop conditions**:
- Reached 90% of budget
- Diminishing returns (model has "run out of work")
- Skipped entirely in sub-agent mode

**Diminishing returns detection**: `continuationCount >= 3` and the last two nudge deltas are both < 500 tokens.

#### 4. Main Loop Integration — `src/query.ts`

```
Inside query() function:
  1. Create budgetTracker = createBudgetTracker()
  2. Enter while loop
  3. Call checkTokenBudget() after each turn
  4. When decision.action === 'continue':
     - Inject meta user message (nudge)
     - Continue back to loop top
  5. When decision.action === 'stop':
     - Record completion event (with diminishingReturns flag)
     - Return normally
```

#### 5. UI Layer

| File | Responsibility |
|------|----------------|
| `components/PromptInput/PromptInput.tsx:534` | Highlight budget syntax in input field |
| `components/Spinner.tsx:319-338` | Spinner displays progress percentage + ETA |
| `screens/REPL.tsx:2897` | Parse budget and snapshot on submit |
| `screens/REPL.tsx:2138` | Clear budget on user cancel |
| `screens/REPL.tsx:2963` | Capture budget info at turn end for display |

#### 6. System Prompt — `src/constants/prompts.ts:538-551`

Injects `token_budget` section:

> "When the user specifies a token target (e.g., '+500k', 'spend 2M tokens', 'use 1B tokens'), your output token count will be shown each turn. Keep working until you approach the target — plan your work to fill it productively. The target is a hard minimum, not a suggestion. If you stop early, the system will automatically continue you."

Note: This prompt is **unconditionally cached** (does not vary with budget toggle), because the "When the user specifies..." wording is a no-op when no budget is set.

#### 7. API Attachment — `src/utils/attachments.ts:3830-3845`

Each API call includes an `output_token_usage` attachment:

```json
{
  "type": "output_token_usage",
  "turn": 125000,     // this turn's output
  "session": 350000,  // total session output
  "budget": 500000    // budget target
}
```

Lets the model see its own progress.

## 4. Key Design Decisions

1. **90% Threshold Instead of 100%**: Stops at `COMPLETION_THRESHOLD = 0.9`, avoiding the last nudge round producing tokens far exceeding the budget
2. **Diminishing Returns Protection**: After 3 consecutive nudges, if each round produces < 500 tokens, determines the model has made no substantial progress and terminates early
3. **Sub-agent Exemption**: Sub-tasks within AgentTool skip budget checks, avoiding duplicate continuation triggers
4. **Unconditionally Cached System Prompt**: Budget prompt is always injected (not toggled per budget change), avoiding a ~20K token cache miss each time budget is toggled
5. **Clear Budget on User Cancel**: Pressing Escape calls `snapshotOutputTokensForTurn(null)`, preventing residual budget from triggering continuation

## 5. Usage

```bash
# Enable feature
FEATURE_TOKEN_BUDGET=1 bun run dev

# Use in prompt
> +500k refactor all test files
> spend 2M tokens migrate this project from JS to TS
> write a complete CRUD module +1m
```

## 6. File Index

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/utils/tokenBudget.ts` | 73 | Regex parsing + position finding + continuation message generation |
| `src/query/tokenBudget.ts` | 93 | Budget tracker + continue/stop decision |
| `src/bootstrap/state.ts:724-743` | 20 | Turn-level token snapshot state |
| `src/constants/prompts.ts:538-551` | 14 | System prompt injection |
| `src/utils/attachments.ts:3829-3845` | 17 | API attachment addition |
| `src/query.ts:280,1311-1358` | 48 | Main loop integration |
| `src/screens/REPL.tsx:2897,2963,2138` | 20 | REPL submit/complete/cancel handling |
| `src/components/Spinner.tsx:319-338` | 20 | Progress bar UI |
| `src/components/PromptInput/PromptInput.tsx:534` | 1 | Input highlighting |

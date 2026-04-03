# Plan 15 — CLI Argument Tests + Coverage Baseline

> Priority: Low | Estimated ~15 test cases

---

## 15.1 `src/main.tsx` CLI Argument Tests

**Goal**: Cover argument parsing and mode switching configured with Commander.js.

### Prerequisites

The Commander instance in `src/main.tsx` is typically created at module top level. Test strategy:
- Directly construct a Commander instance or mock the `program` export from `main.tsx`
- Use `parseArgs` instead of `parse` (to avoid triggering `process.exit`)

### Cases

| # | Case | Input | Expected |
|---|------|------|------|
| 1 | Default mode | `[]` | Mode is REPL |
| 2 | Pipe mode | `["-p"]` | Mode is pipe |
| 3 | Pipe with input | `["-p", "say hello"]` | Input is `"say hello"` |
| 4 | Print mode | `["--print", "hello"]` | Equivalent to pipe |
| 5 | Verbose | `["-v"]` | Verbose flag is true |
| 6 | Model selection | `["--model", "claude-opus-4-6"]` | Model value passed correctly |
| 7 | System prompt | `["--system-prompt", "custom"]` | System prompt is set |
| 8 | Help | `["--help"]` | Displays help message without error |
| 9 | Version | `["--version"]` | Displays version number |
| 10 | Unknown flag | `["--nonexistent"]` | No error (when Commander allows unknown args) |

> **Risk**: `main.tsx` may execute initialization logic (auth, analytics), requiring execution in a mock environment. If complexity is too high, downgrade to testing only the argument parsing portion.

---

## 15.2 Coverage Baseline

### Run Command

```bash
bun test --coverage 2>&1 | tail -50
```

### Recorded Metrics

| Module | Current Coverage | Target |
|------|-----------|------|
| `src/utils/` | To be measured | >= 80% |
| `src/utils/permissions/` | To be measured | >= 60% |
| `src/utils/model/` | To be measured | >= 60% |
| `src/Tool.ts` + `src/tools.ts` | To be measured | >= 80% |
| `src/utils/claudemd.ts` | To be measured | >= 40% (core logic hard to test) |
| Overall | To be measured | No hard target |

### Follow-up Actions

- Fill baseline data into `testing-spec.md` section 4
- Identify the 10 files with lowest coverage, queue for subsequent test plans
- If `bun test --coverage` output is unavailable (Bun version limitation), use manual calculation of tested/total exported function ratio instead

---

## Acceptance Criteria

- [ ] CLI arguments cover at least 5 core flags
- [ ] Coverage baseline data recorded in testing-spec.md
- [ ] `bun test` all passing

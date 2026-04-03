# Plan 14 — Integration Test Setup

> Priority: Medium | ~3 new test files | Estimated ~30 test cases

The `tests/integration/` directory is currently empty; all three integration tests designed in the spec have not been created. This plan sets up the mock infrastructure and implements core integration tests.

---

## 14.1 Setting Up `tests/mocks/` Infrastructure

### File Structure

```
tests/
├── mocks/
│   ├── api-responses.ts       # Claude API mock responses
│   ├── file-system.ts         # Temporary file system utilities
│   └── fixtures/
│       ├── sample-claudemd.md # CLAUDE.md sample
│       └── sample-messages.json # Message samples
├── integration/
│   ├── tool-chain.test.ts
│   ├── context-build.test.ts
│   └── message-pipeline.test.ts
└── helpers/
    └── setup.ts               # Shared beforeAll/afterAll
```

### `tests/mocks/file-system.ts`

```typescript
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createTempDir(prefix = "claude-test-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return dir;
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function writeTempFile(dir: string, name: string, content: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, content, "utf-8");
  return path;
}
```

### `tests/mocks/fixtures/sample-claudemd.md`

```markdown
# Project Instructions

This is a sample CLAUDE.md file for testing.
```

### `tests/mocks/api-responses.ts`

```typescript
export const mockStreamResponse = {
  type: "message_start" as const,
  message: {
    id: "msg_mock_001",
    type: "message" as const,
    role: "assistant",
    content: [],
    model: "claude-sonnet-4-20250514",
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 0 },
  },
};

export const mockTextBlock = {
  type: "content_block_start" as const,
  index: 0,
  content_block: { type: "text" as const, text: "Mock response" },
};

export const mockToolUseBlock = {
  type: "content_block_start" as const,
  index: 1,
  content_block: {
    type: "tool_use" as const,
    id: "toolu_mock_001",
    name: "Read",
    input: { file_path: "/tmp/test.txt" },
  },
};

export const mockEndEvent = {
  type: "message_stop" as const,
};
```

---

## 14.2 `tests/integration/tool-chain.test.ts`

**Goal**: Verify the Tool registration -> discovery -> permission check chain.

### Prerequisites

The import chain for `getAllBaseTools` / `getTools` in `src/tools.ts` is very heavy. Strategy:
- Attempt direct import and mock the heaviest dependencies
- If not feasible, fall back to testing `findToolByName` from `src/Tool.ts` + manually constructed tool list

### Cases

| # | Case | Verification |
|---|------|--------|
| 1 | `findToolByName("Bash")` looks up in registered list | Returns correct tool definition |
| 2 | `findToolByName("NonExistent")` | Returns `undefined` |
| 3 | `findToolByName` case-insensitive | `"bash"` also finds it |
| 4 | `filterToolsByDenyRules` rejects specific tools | Rejected tools not in result |
| 5 | `parseToolPreset("default")` returns known list | Contains core tools |
| 6 | Tool built by `buildTool` is discoverable by `findToolByName` | End-to-end verification |

> If `getAllBaseTools` truly cannot be imported, use a mock tool list instead.

---

## 14.3 `tests/integration/context-build.test.ts`

**Goal**: Verify system prompt assembly flow (CLAUDE.md loading + git status + date injection).

### Prerequisites

The dependency chain for `src/context.ts` is extremely heavy. Strategy:
- Mock `src/bootstrap/state.ts` (provide cwd, projectRoot)
- Mock `src/utils/git.ts` (provide git status)
- Use real `src/utils/claudemd.ts` + temporary files

### Cases

| # | Case | Verification |
|---|------|--------|
| 1 | Basic context build | Return value contains system prompt string |
| 2 | CLAUDE.md content appears in context | Content after `stripHtmlComments` is included |
| 3 | Multi-level directory CLAUDE.md merge | Both parent and child directory CLAUDE.md files are loaded |
| 4 | No CLAUDE.md present | Context returns normally without crash |
| 5 | git status is null | Context builds normally (when git is unavailable in test environment) |

> **Risk assessment**: If the cost of mocking `context.ts` dependencies is too high, downgrade to testing `buildEffectiveSystemPrompt` (already covered in systemPrompt.test.ts) and record as a known limitation.

---

## 14.4 `tests/integration/message-pipeline.test.ts`

**Goal**: Verify user input -> message formatting -> API request construction.

### Prerequisites

`src/services/api/claude.ts` builds the final API request. Strategy:
- Mock the Anthropic SDK streaming endpoint
- Verify request parameter structure

### Cases

| # | Case | Verification |
|---|------|--------|
| 1 | Text message formatting | `createUserMessage` generates correct role+content |
| 2 | tool_result message formatting | Contains tool_use_id and content |
| 3 | Multi-turn message serialization | Messages array preserves order |
| 4 | System prompt injected into request | API request's system field is non-empty |
| 5 | Messages consistent after normalize | `normalizeMessages` output structure is correct |

> **Realistic assessment**: Most message formatting is already covered in `messages.test.ts`. API request construction requires mocking the SDK, which has high complexity. If the ROI is low, only implement cases 1-3 and 5; mark case 4 as a stretch goal.

---

## Implementation Steps

1. Create `tests/mocks/` directory and base files
2. Implement `tool-chain.test.ts` (lowest risk, highest value)
3. Evaluate `context-build.test.ts` feasibility, decide whether to implement
4. Implement `message-pipeline.test.ts` (can downgrade to unit tests)
5. Update `testing-spec.md` status

---

## Acceptance Criteria

- [ ] `tests/mocks/` infrastructure usable
- [ ] At least `tool-chain.test.ts` implemented and passing
- [ ] Integration tests run independently from unit tests: `bun test tests/integration/`
- [ ] All integration tests use `createTempDir` + `cleanupTempDir`, leaving no file system residue
- [ ] `bun test` all passing

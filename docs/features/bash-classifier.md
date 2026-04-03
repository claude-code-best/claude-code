# BASH_CLASSIFIER — Bash Command Classifier

> Feature Flag: `FEATURE_BASH_CLASSIFIER=1`
> Implementation Status: bashClassifier.ts all Stub, yoloClassifier.ts fully implemented for reference
> Reference Count: 45

## 1. Feature Overview

BASH_CLASSIFIER uses an LLM to classify bash command intent (allow/deny/ask), implementing automated permission decisions. Users do not need to approve bash commands individually; the classifier automatically determines safety based on command content and context.

### Core Features

- **LLM-Driven Classification**: Uses Opus model to evaluate command safety
- **Two-Phase Classification**: Fast block/allow -> deep chain-of-thought
- **Auto-Approval**: Commands classified as safe automatically pass through
- **UI Integration**: Permission dialog displays classifier status and review options

## 2. Implementation Architecture

### 2.1 Module Status

| Module | File | Status | Description |
|--------|------|--------|-------------|
| Bash Classifier | `src/utils/permissions/bashClassifier.ts` | **Stub** | All functions return no-ops. Comment: "ANT-ONLY" |
| YOLO Classifier | `src/utils/permissions/yoloClassifier.ts` | **Complete** | 1496 lines, two-phase XML classifier |
| Approval Signals | `src/utils/classifierApprovals.ts` | **Complete** | Map + signal management for classifier decisions |
| Permission UI | `src/components/permissions/BashPermissionRequest.tsx` | **Wired** | Classifier status display, review options |
| Permission Pipeline | `src/hooks/toolPermission/handlers/*.ts` | **Wired** | Classifier result routing to decisions |
| API Beta Header | `src/services/api/withRetry.ts` | **Wired** | Sends `bash_classifier` beta when enabled |

### 2.2 Reference Implementation: yoloClassifier.ts

File: `src/utils/permissions/yoloClassifier.ts` (1496 lines)

This is a complete implemented classifier that can serve as reference for bashClassifier.ts:

```
Two-phase classification:
1. Fast phase: Build conversation transcript -> call sideQuery (Opus) -> fast block/allow
2. Deep phase: Chain-of-thought analysis -> final decision
```

Features:
- Builds full conversation transcript context
- Calls safety system prompt sideQuery
- GrowthBook configuration and metrics
- Error handling and degradation

### 2.3 Classifier Position in Permission Pipeline

```
Bash command arrives
      |
      v
bashPermissions.ts permission check
      |
      +-- Traditional rule matching (string-level)
      |
      +-- [BASH_CLASSIFIER] LLM classification
            |
            +-- allow -> auto pass-through
            +-- deny -> auto reject
            +-- ask -> show permission dialog
                  |
                  +-- Classifier auto-approval flag
                  +-- Review options (user can override)
```

## 3. Content Needing Implementation

| Function | Needs Implementation | Description |
|----------|---------------------|-------------|
| `classifyBashCommand()` | LLM call to evaluate safety | Reference yoloClassifier.ts two-phase pattern |
| `isClassifierPermissionsEnabled()` | GrowthBook/config check | Controls whether classifier is active |
| `getBashPromptDenyDescriptions()` | Returns prompt-based deny rules | Permission setting descriptions |
| `getBashPromptAskDescriptions()` | Returns ask rules | Commands requiring user confirmation |
| `getBashPromptAllowDescriptions()` | Returns allow rules | Auto-pass-through commands |
| `generateGenericDescription()` | LLM-generated command description | Provides explanation for permission dialog |
| `extractPromptDescription()` | Parse rule content | Extracts description from rules |

## 4. Key Design Decisions

1. **ANT-ONLY Label**: bashClassifier.ts is marked "ANT-ONLY", likely a client-side adapter for an Anthropic internal server-side classifier
2. **Two-Phase Classification**: Fast phase handles clear-cut cases (reducing latency), deep phase handles ambiguous cases
3. **Classifier Results Reviewable**: Permission UI displays classifier decisions, user can override
4. **YOLO Classifier Reference**: yoloClassifier.ts provides a complete classifier implementation pattern, can be directly referenced

## 5. Usage

```bash
# Enable feature
FEATURE_BASH_CLASSIFIER=1 bun run dev

# Combined with TREE_SITTER_BASH (AST + LLM dual safety)
FEATURE_BASH_CLASSIFIER=1 FEATURE_TREE_SITTER_BASH=1 bun run dev
```

## 6. File Index

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/utils/permissions/bashClassifier.ts` | — | Bash classifier (stub, ANT-ONLY) |
| `src/utils/permissions/yoloClassifier.ts` | 1496 | YOLO classifier (complete reference implementation) |
| `src/utils/classifierApprovals.ts` | — | Classifier approval signal management |
| `src/components/permissions/BashPermissionRequest.tsx:261-469` | — | Classifier UI |
| `src/hooks/toolPermission/handlers/interactiveHandler.ts` | — | Interactive permission handling |
| `src/services/api/withRetry.ts:81` | — | API beta header |

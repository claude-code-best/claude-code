# WORKFLOW_SCRIPTS — Workflow Automation

> Feature Flag: `FEATURE_WORKFLOW_SCRIPTS=1`
> Implementation Status: All Stub (7 files), wiring complete
> Reference Count: 10

## 1. Feature Overview

WORKFLOW_SCRIPTS implements file-based multi-step automated workflows. Users can define workflow description files in YAML/JSON format, and the system parses them into executable multi-agent step sequences. A `/workflows` command is provided to manage and trigger workflows.

## 2. Implementation Architecture

### 2.1 Module Status

| Module | File | Status |
|--------|------|--------|
| WorkflowTool | `src/tools/WorkflowTool/WorkflowTool.ts` | **Stub** — empty object |
| Workflow Permissions | `src/tools/WorkflowTool/WorkflowPermissionRequest.ts` | **Stub** — returns null |
| Constants | `src/tools/WorkflowTool/constants.ts` | **Stub** — empty tool name |
| Command Creation | `src/tools/WorkflowTool/createWorkflowCommand.ts` | **Stub** — no-op |
| Bundled Workflows | `src/tools/WorkflowTool/bundled/` | **Missing** — directory does not exist |
| Local Workflow Task | `src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts` | **Stub** — types + no-op |
| UI Task Component | `src/components/tasks/src/tasks/LocalWorkflowTask/` | **Stub** — empty export |
| Detail Dialog | `src/components/tasks/WorkflowDetailDialog.ts` | **Stub** — returns null |
| Task Registration | `src/tasks.ts` | **Wired** — dynamic loading |
| Tool Registration | `src/tools.ts` | **Wired** — includes bundled workflow initialization |
| Command Registration | `src/commands.ts` | **Wired** — `/workflows` command |

### 2.2 Expected Data Flow

```
User defines workflow (YAML/JSON file)
         |
         v
/workflows command discovers workflow files
         |
         v
createWorkflowCommand() parses into Command object [needs implementation]
         |
         v
WorkflowTool executes workflow [needs implementation]
         |
         +-- Step 1: Agent({ task: "..." })
         +-- Step 2: Agent({ task: "..." })
         +-- Step N: Agent({ task: "..." })
         |
         v
LocalWorkflowTask coordinates step execution [needs implementation]
         |
         v
WorkflowDetailDialog displays progress [needs implementation]
```

### 2.3 Expected Workflow DSL

```
# workflow.yaml (expected format, needs design)
name: "Code Review Workflow"
steps:
  - name: "Static Analysis"
    agent: { type: "general-purpose", prompt: "Run lint and type checking" }
  - name: "Testing"
    agent: { type: "general-purpose", prompt: "Run test suite" }
  - name: "Comprehensive Report"
    agent: { type: "general-purpose", prompt: "Synthesize analysis results into a report" }
```

## 3. Content Needing Implementation

| Priority | Module | Effort | Description |
|----------|--------|--------|-------------|
| 1 | `WorkflowTool.ts` | Large | Schema definition + multi-step execution engine |
| 2 | `bundled/index.js` | Medium | Built-in workflow definitions (initBundledWorkflows) |
| 3 | `createWorkflowCommand.ts` | Medium | Parse files to create command objects |
| 4 | `LocalWorkflowTask.ts` | Large | Step coordination, kill/skip/retry |
| 5 | `WorkflowDetailDialog.ts` | Medium | Progress detail UI |
| 6 | `WorkflowPermissionRequest.ts` | Small | Permission dialog |
| 7 | `constants.ts` | Small | Tool name constants |

## 4. Key Design Decisions

1. **File-based DSL**: Workflows defined as files (YAML/JSON), version control friendly
2. **Multi-Agent Steps**: Each step is an independent agent task, supporting parallel/serial execution
3. **Built-in Workflows**: `bundled/` directory provides ready-to-use common workflows
4. **/workflows Command**: Unified discovery and trigger entry point

## 5. Usage

```bash
# Enable feature (requires implementation before actual use)
FEATURE_WORKFLOW_SCRIPTS=1 bun run dev
```

## 6. File Index

| File | Responsibility |
|------|----------------|
| `src/tools/WorkflowTool/WorkflowTool.ts` | Tool definition (stub) |
| `src/tools/WorkflowTool/WorkflowPermissionRequest.ts` | Permission dialog (stub) |
| `src/tools/WorkflowTool/constants.ts` | Constants (stub) |
| `src/tools/WorkflowTool/createWorkflowCommand.ts` | Command creation (stub) |
| `src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts` | Task coordination (stub) |
| `src/components/tasks/WorkflowDetailDialog.ts` | Detail dialog (stub) |
| `src/tools.ts:127-132` | Tool registration |
| `src/commands.ts:86-89` | Command registration |

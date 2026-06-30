# @claude-code-best/workflow-engine

Deterministic JS script orchestration engine for multi-agent workflows. The core layer has zero runtime dependencies and talks to the outside world exclusively through **port adapters** — you bring your own agent backend, journal store, and progress sink.

## Why

When you orchestrate multiple LLM agents, you want the orchestration itself to be **deterministic, replayable, and testable**. This engine runs a plain JS script (compiled by Bun's transpiler) with primitives like `agent()`, `phase()`, `parallel()` and `pipeline()`. The non-deterministic parts (the LLM, the file system, the clock) are isolated behind ports, so the same script produces the same journal on every replay.

## Installation

```bash
bun add @claude-code-best/workflow-engine
# or
npm install @claude-code-best/workflow-engine
```

Runtime peer requirements: `ajv` and `zod` are pulled in automatically as dependencies.

## Minimal example

```ts
import {
  createFileJournalStore,
  createHostHandle,
  runWorkflow,
  type WorkflowPorts,
} from '@claude-code-best/workflow-engine'

const script = `
export const meta = { name: 'hello', description: 'minimal demo' }
phase('Greet')
const reply = await agent({ prompt: 'Say hi in one short sentence.' })
emit('result', { reply })
`

const ports: WorkflowPorts = {
  // Provide your own agent runner + journal + progress emitter.
  // See examples/smoke.ts for a complete Anthropic SDK wiring.
} as WorkflowPorts

const handle = createHostHandle()
await runWorkflow({
  script,
  ports,
  workflowDir: '.wfe/runs/hello',
  hostHandle: handle,
})
```

For a fully wired end-to-end example with the Anthropic SDK, see [`examples/smoke.ts`](./examples/smoke.ts).

## Core primitives

- `agent(params)` — call the configured AgentRunner; supports structured-output via JSON Schema.
- `phase(name)` — declare a logical phase (display + progress grouping).
- `parallel([...])` — barrier-style fan-out with bounded concurrency.
- `pipeline(stream, fn)` — streaming pipeline with per-item hooks.
- `emit(type, payload)` — emit a progress event to the host.
- `log.*` / hooks / budgets — see the TypeScript definitions for the full surface.

## Building from source

```bash
bun install            # from the repo root
bun run build          # outputs dist/index.js + dist/**/*.d.ts
bun test               # 178 tests
```

## License

MIT © claude-code-best

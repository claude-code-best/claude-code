# Terminal Provider Fallback Design

## Problem

Session `20eb2839-d9dc-4a7a-9aa9-c1ed27e9f41e` reproduced a provider-specific failure with `glm-5.2`:

1. The request tool pipeline registered `Terminal` and `TerminalRead` as non-deferred core tools.
2. `SearchExtraTools({"query":"terminal"})` found `Terminal` in the active registry and reported it as already loaded.
3. The model nevertheless claimed that its tool list did not contain `Terminal`, repeatedly searched for substitutes, and fell back to `Bash`.

A local, no-network reconstruction of the OpenAI-compatible request confirmed that both tools survive every request boundary: registry, deferral filtering, Anthropic schema generation, and OpenAI function conversion. `Terminal` and `TerminalRead` were entries 18 and 19 of 22. The missing-tool claim was therefore model behavior, not a transport omission.

The affected RCS process also ran from the original worktree at commit `3de1a910`. It had not loaded the schema-guidance and terminal-priority commits from the isolated feature branch. Existing RCS and session processes do not hot-reload source commits.

## Goal

Keep direct `Terminal` and `TerminalRead` calls as the preferred path while providing a reliable, permission-preserving `ExecuteExtraTool` fallback for providers that fail to select an advertised core tool.

## Requirements

- `Terminal` and `TerminalRead` remain core tools and remain present in the API tool array.
- Interactive, long-running, persistent-state, and user-visible terminal work continues to prefer them over `Bash`.
- Searching for an already-loaded core tool returns its real description and input schema.
- The result tells capable models to call the tool directly.
- The same result gives models that cannot expose or select the direct tool one explicit fallback: invoke it through `ExecuteExtraTool` with the returned schema.
- The fallback must use the existing registry lookup, schema validation, enablement checks, permission checks, and target-tool call path. It must not bypass permissions.
- Models must not repeat the search or probe for a CLI equivalent through `Bash` after receiving the fallback.
- Deferred-tool behavior remains unchanged.
- Deployment must update the original runtime branch and restart the parent RCS process so newly spawned sessions load the fix.

## Architecture

### Search result contract

`SearchExtraToolsTool` continues to distinguish deferred matches from already-loaded core matches. For a core match it returns:

- the canonical tool name;
- the tool description;
- the generated JSON input schema;
- direct-call guidance;
- a provider-compatibility fallback using `ExecuteExtraTool`.

The direct path remains first in the message. The fallback is conditional language: use it only if the current provider/client does not expose or rejects the direct tool call.

### Execution fallback

`ExecuteExtraTool` already delegates any registry tool, including core tools. Its runtime path performs target lookup, Zod schema validation, `validateInput`, `checkPermissions`, and the target `call`. Only its prompt currently says it is exclusively for deferred tools.

The prompt will be aligned with actual behavior:

- normal core tools should still be called directly;
- a core tool may be proxied only after `SearchExtraTools` identifies it as already loaded and provides a fallback schema;
- the fallback is intended for provider/client tool-selection incompatibility, not routine use.

No execution logic or permission logic needs to be weakened.

### Runtime rollout

The feature branch changes will be committed, then integrated into `codex/fix-terminal-sse-delivery`. The long-running `bun run rcs` parent and its `bun run dev remote-control` child must be restarted. Old conversation subprocesses may retain the old code and should be replaced with newly created sessions for verification.

## Error handling

- Invalid fallback parameters are rejected by the target tool's Zod schema before execution.
- Disabled terminal tools return the existing unavailable result.
- Denied terminal actions preserve the target tool's permission denial.
- Unknown tool names retain the existing “use SearchExtraTools” error.
- A provider that can call the direct tool never needs the fallback and sees no behavior change beyond clearer guidance.

## Testing

1. Extend the core-tool search test to assert that the mapped result contains the real schema, direct-call preference, and `ExecuteExtraTool` fallback.
2. Add an `ExecuteExtraTool` regression test with a core `Terminal` mock to prove fallback delegation reaches the target and preserves parameters.
3. Keep the undiscovered-deferred-tool guard test to prove deferred behavior did not loosen.
4. Run focused SearchExtraTools and ExecuteExtraTool tests.
5. Run prompt audit tests, typecheck, lint, and the full Bun test suite.
6. Reconstruct the OpenAI-compatible request locally and verify `Terminal` and `TerminalRead` remain in the final function list.
7. After RCS restart, create a fresh GLM session and test `TerminalRead({"action":"list"})` or the fallback path without sending private repository context solely for diagnostics.

## Non-goals

- Forcing a provider-wide `tool_choice` for Terminal.
- Making Terminal deferred.
- Renaming Terminal tools.
- Bypassing target-tool permissions or validation.
- Fixing unrelated full-suite failures in the bridge identity tests.

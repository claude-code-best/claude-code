# Runbook Status

Updated: 2026-04-25

## Current Focus

VS Code extension slash command parity and Windows ACP shell routing.

## Gates

| Gate | Owner | Status | Evidence |
| --- | --- | --- | --- |
| Project scope | project-lead | passed | `/mcp` parity scope limited to ACP metadata, slash completion, headless command handling, smoke coverage |
| Frontend slash menu | frontend | passed | `bun test packages/vscode-extension/webview/lib/__tests__/slashCommands.test.ts` |
| ACP command execution | backend | passed | `bun test src/services/acp/__tests__/agent.test.ts packages/vscode-extension/webview/lib/__tests__/slashCommands.test.ts` |
| Runtime install | ops | passed | `bun run install-local:win`; installed junction points to `packages/vscode-extension` |
| QA regression | qa | passed | `bun run typecheck`; `bunx biome lint . --max-diagnostics=1000`; `bun run build`; `bun test`; `bun run test:all` in `packages/vscode-extension` |
| Security review | security | passed | No new dependency, no secret material, no new direct terminal spawning path |
| Independent review | reviewer | passed | Verified MCP command metadata includes structured server catalog and built-in dynamic MCP entries |
| Windows shell routing | ops | passed | VS Code ACP on Windows exposes `PowerShell` instead of `Bash`; orphan `--acp` process check returned `NO_MATCHING_PROCESSES` |

## Recovery

If the local VS Code extension behaves stale after installation, fully quit all
VS Code windows and reopen. The local install path is:

`C:\Users\12180\.vscode\extensions\claude-code-best.ccb-vscode-0.3.0`

## Known Risks

No accepted open risks for the current slash-command/shell-routing work. New risks must be
recorded here with owner, mitigation, and verification.

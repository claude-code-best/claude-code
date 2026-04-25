# Plans

This file tracks multi-step implementation plans for repository work. Keep
entries concise and update them when a task changes scope.

## VS Code Slash Commands And ACP Runtime

Owner: project-lead
Status: active

Acceptance gates:
- Slash command catalog includes canonical commands, aliases, and argument
  hints from the agent.
- Commands with subcommands expose keyboard-selectable first-level options.
- `/mcp enable`, `/mcp disable`, and `/mcp reconnect` expose configured server
  names as second-level options when known.
- ACP/headless slash command execution completes without relying on terminal
  Ink effects.
- Verification includes typecheck, Biome lint, unit tests, extension smoke, and
  ACP smoke.

Stop conditions:
- All verification commands pass.
- No known slash-command execution path remains stuck in pending state.
- Any remaining limitation has a concrete owner and test plan.

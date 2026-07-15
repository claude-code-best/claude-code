# Session Terminal Priority Design

## Goal

Increase the model's preference for the `Terminal` and `TerminalRead` core tools when a task benefits from a persistent, interactive, or user-visible PTY, while retaining `Bash` for short one-shot commands.

## Scope

- Apply terminal-priority guidance only when `Terminal` or `TerminalRead` is actually present in the enabled tool set.
- Prefer session terminals for interactive programs, long-running processes, commands whose state must persist across turns, and work the user should see in the web terminal sidebar.
- Continue to prefer `Bash` for short, non-interactive, one-shot commands such as quick inspections, Git commands, and ordinary test invocations.
- Make broad `SearchExtraTools` keyword searches capable of identifying relevant already-loaded core tools, so queries such as `terminal pty create read` tell the model to call `Terminal` or `TerminalRead` directly.

## Design

### Dynamic tool guidance

Extend the dynamic `Using your tools` system-prompt section. When the enabled tool set contains the session-terminal tools, add a focused rule that distinguishes persistent/interactive/user-visible work from one-shot shell work. The guidance must explicitly say that `Terminal` and `TerminalRead` are core tools and must be called directly rather than discovered or wrapped through `ExecuteExtraTool`.

Keeping this guidance conditional avoids advertising session terminals in Chat mode or in builds where `SESSION_TERMINALS` is disabled.

### Discovery fallback

Update `SearchExtraTools` keyword matching to consider the full available tool set, not only deferred tools. Existing result mapping already distinguishes already-loaded tools and tells the model to call them directly. Deferred tools remain discoverable through the existing TF-IDF index and execution flow.

This fallback does not force `Terminal` use. It only prevents an incorrect conclusion that a relevant core tool is unavailable after the model mistakenly invokes `SearchExtraTools`.

### Prompt consistency

Update the `SearchExtraTools` core-tool guidance to mention that `Terminal` and `TerminalRead`, when present in the current tool list, are direct-call core tools. Avoid claiming they are universally available because registration remains feature- and product-gated.

## Testing

Use test-driven development:

1. Add a failing search regression test proving that a multi-word query such as `terminal pty create read` returns `Terminal` and `TerminalRead` as already-loaded core tools.
2. Add a prompt regression test proving terminal-priority guidance appears only when the terminal tools are enabled and preserves the `Bash` path for short one-shot commands.
3. Run the focused tests, then `bun run typecheck` and the repository's relevant broader test command.

## Non-goals

- Do not route every shell command through a persistent terminal.
- Do not remove or demote `Bash` as a core tool.
- Do not change PTY lifecycle, permissions, bridge transport, or terminal UI behavior.
- Do not make session terminals available in Chat mode.

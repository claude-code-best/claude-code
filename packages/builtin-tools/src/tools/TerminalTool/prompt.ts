export const TERMINAL_TOOL_NAME = 'Terminal'
export const TERMINAL_READ_TOOL_NAME = 'TerminalRead'

export const TERMINAL_DESCRIPTION =
  'Operate persistent named PTY terminals bound to this session: open, run commands, send input/keys/signals, resize, close. Terminals survive across turns and are mirrored live to the user in the web terminal sidebar.'

export const TERMINAL_READ_DESCRIPTION =
  'Read-only access to session terminals: incremental/tail/full output, wait for prompt/silence/pattern/exit conditions, and list all terminals with status.'

export const TERMINAL_PROMPT = `Operate persistent PTY terminals bound to this session. Unlike Bash (one-shot, no state), these terminals keep their shell alive across turns: cwd, venv, ssh connections, running processes all persist. The user sees every terminal live in the web sidebar and can type into them too — you share the same terminals.

## Actions

- \`open\`: create a named terminal. Name it after its role (\`main\`, \`deploy-web01\`, \`monitor-nginx\`). Set \`purpose\` so the user understands what it's for. Re-opening an existing name is a no-op (idempotent).
- \`run\`: write a full command line and wait for completion or a condition — the workhorse. Returns new output, duration, exit code (when shell integration is active), and \`still_running\`.
- \`input\`: write raw text (answer interactive prompts, type into REPLs). \`enter: false\` to type without submitting.
- \`keys\`: send special keys: enter, tab, esc, arrows, space, backspace, ctrl-c/d/z/r/l.
- \`signal\`: interrupt the foreground process — SIGINT first; escalate to SIGTERM, then SIGKILL only if unresponsive.
- \`resize\` / \`close\`: adjust size / kill and remove the terminal.

## Waiting strategy — pick per command type

| Command type | Strategy |
|---|---|
| Quick (<30s: ls, git, pip install) | \`run\` with defaults (prompt-return, 60s timeout) |
| Known milestone output (build/test/deploy) | \`run\` + \`wait: {until: 'pattern', pattern: 'BUILD (SUCCESS\\|FAILED)\\|error', timeout_s: 600}\` — always include failure words in the pattern, not just success |
| Unknown-duration batch job | \`run\` with generous timeout; on timeout follow the intervention checklist below |
| Long-lived process (dev server, tail -f, top, watch, kubectl -w) | run it in a DEDICATED named terminal and DO NOT wait for completion — move on, then use TerminalRead \`read new\` to check on it later |
| Interactive program (ssh first connect, installers, REPLs, DB shells) | \`run\` with short timeout to enter it → TerminalRead \`read\` to see the prompt → \`input\`/\`keys\` to answer, repeat |

Timeouts are NOT errors: the result reports \`timed_out\` with everything captured so far, and the command keeps running in the terminal.

## Intervention checklist (after a wait timeout)

1. \`TerminalRead read new\` — look at the latest output.
2. Stuck at an interactive prompt ([y/N], password, menu)? Answer with \`input\`/\`keys\` if the answer is clear. For passwords or destructive confirmations: STOP and ask the user (they can type directly into the web terminal).
3. Still making progress (logs scrolling, percentages advancing)? Wait again — at most 3 rounds for the same command, then report progress to the user and ask how to proceed.
4. Looks hung (long silence, no completion signs)? Report what you saw, send \`signal SIGINT\`, inspect the aftermath, then retry with a different approach.
5. NEVER blindly re-run a command that just hung.

## Multi-terminal orchestration (cluster deploys, monitoring)

- Names are documentation: \`deploy-web01\`, \`deploy-web02\`, \`monitor-nginx\`, \`db-migrate\`.
- One dedicated ssh terminal per target machine — reuse the connection across turns instead of reconnecting.
- Separate action from observation: deploy terminals execute changes; \`monitor-*\` terminals run \`kubectl get pods -w\` / \`tail -f\`, checked via \`read new\`.
- Work in parallel: while machine A runs a long task, switch to machine B; come back with \`TerminalRead wait pattern\` to verify A.
- Clean up: \`close\` one-off terminals when done; keep monitors alive and tell the user they exist.

## Safety

- Never type passwords/secrets as command arguments; ask the user to type them into the web terminal directly.
- Confirm with the user before destructive commands (rm -rf, DROP, production-affecting changes).
- Only signal terminals you opened, unless the user asks.`

export const TERMINAL_READ_PROMPT = `Read-only companion to the Terminal tool (never requires approval — use it freely and often).

## Actions

- \`read\`: get output from a terminal.
  - \`mode: 'new'\` (default) — only output since YOUR last read (cursor-based, no duplicates). Ideal for checking on long-running processes.
  - \`mode: 'tail'\` — last N lines (default 50). Ideal for "what's on screen now".
  - \`mode: 'full'\` — entire scrollback buffer (up to 512KB).
- \`wait\`: block until a condition or timeout. Conditions:
  - \`until: 'prompt'\` — shell prompt returned (precise via shell integration; auto-falls back to silence). Also yields the command's exit code.
  - \`until: 'silence'\` — no output for \`silence_ms\` (default 2000). Good default for unknown commands.
  - \`until: 'pattern'\` — regex match on new output (e.g. \`'Compiled successfully|Build failed|error'\`). ALWAYS include failure alternatives so you wake up on errors too.
  - \`until: 'exit'\` — the terminal process itself exited.
  - \`timeout_s\` is required and is a hard cap. Timing out is normal, not an error: you get \`timed_out: true\` plus all output captured while waiting.
- \`list\`: all terminals with name, purpose, cwd, foreground command, liveness, last-activity, and a 2-line preview. Start here when resuming work on a session you don't remember.

Long outputs are truncated head+tail with a marker; use \`mode: 'full'\` if you need the middle.`

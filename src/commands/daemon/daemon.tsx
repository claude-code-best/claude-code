import type { LocalJSXCommandOnDone, LocalJSXCommandContext } from '../../types/command.js';

/**
 * /daemon slash command — manages daemon and background sessions from the REPL.
 *
 * Subcommands: status | start | stop | bg | attach | logs | kill
 * Default (no args): status
 */
export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const parts = args ? args.trim().split(/\s+/) : [];
  const sub = parts[0] || 'status';

  // attach is interactive/blocking — not available inside the REPL
  if (sub === 'attach') {
    onDone('Use `claude daemon attach` from the CLI. Attach is not available inside the REPL.', { display: 'system' });
    return null;
  }

  // For all other subcommands, capture console output and return via onDone
  const lines = await captureConsole(async () => {
    if (sub === 'bg') {
      const bg = await import('../../cli/bg.js');
      await bg.handleBgStart(parts.slice(1));
    } else {
      const { daemonMain } = await import('../../daemon/main.js');
      await daemonMain([sub, ...parts.slice(1)]);
    }
  });

  onDone(lines.join('\n') || 'Done.', { display: 'system' });
  return null;
}

async function captureConsole(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...a: unknown[]) => lines.push(a.map(String).join(' '));
  console.error = (...a: unknown[]) => lines.push(a.map(String).join(' '));
  try {
    await fn();
  } finally {
    console.log = origLog;
    console.error = origError;
  }
  return lines;
}

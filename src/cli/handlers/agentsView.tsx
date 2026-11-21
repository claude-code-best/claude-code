/**
 * `claude agents` handler (official Claude Code 2.1.330, strings L926501).
 *
 * Non-interactive (`--json`, or no TTY): print active sessions (interactive
 * and background) as a JSON array and exit — for scripts; works without a
 * terminal. `--all` also includes completed background sessions.
 *
 * Interactive (TTY): open the agents view — a standalone Ink root rendering
 * the session list / session detail views (components/agentsView). The
 * `definitions` subcommand (backcompat) keeps printing the configured agent
 * definition list and lives in handlers/agents.tsx.
 */

/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handlers intentionally exit */

import React from 'react';
import { AppStateProvider } from '../../state/AppState.js';
import { onChangeAppState } from '../../state/onChangeAppState.js';
import { KeybindingSetup } from '../../keybindings/KeybindingProviderSetup.js';
import { AgentsView } from '../../components/agentsView/AgentsView.js';
import { getBaseRenderOptions } from '../../utils/renderOptions.js';

export interface AgentsViewOptions {
  json?: boolean;
  all?: boolean;
  /** Only show sessions started in this directory (or beneath it). */
  cwd?: string;
}

export async function agentsViewHandler(options: AgentsViewOptions): Promise<void> {
  const bg = await import('../bg.js');

  // --json (or no terminal): print the session list as JSON and exit.
  if (options.json || !process.stdin.isTTY) {
    await bg.printSessionsJson({ all: options.all, cwd: options.cwd });
    return;
  }

  // Interactive: open the agents view in a standalone Ink root.
  const { createRoot } = await import('@anthropic/ink');
  const root = await createRoot(getBaseRenderOptions(false));
  await new Promise<void>(resolve => {
    root.render(
      <AppStateProvider onChangeAppState={onChangeAppState}>
        <KeybindingSetup>
          <AgentsView onClose={() => void resolve()} onExitApp={() => void resolve()} cwdFilter={options.cwd} />
        </KeybindingSetup>
      </AppStateProvider>,
    );
  });
  root.unmount();
}

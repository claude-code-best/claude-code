/**
 * `claude agents` handler (official Claude Code 2.1.330, strings L926501).
 *
 * Non-interactive (`--json`, or no TTY): print active sessions (interactive
 * and background) as a JSON array and exit — for scripts; works without a
 * terminal. `--all` also includes completed background sessions.
 *
 * Interactive (TTY): open the agents view — a standalone Ink root rendering
 * the session list / session detail views (components/agentsView). enter
 * opens (attaches into) a session's REPL: the view unmounts, `claude attach`
 * runs, and when the user detaches the list re-renders (the `enter to
 * return` hint follows the last opened session). The `--model`/`--effort`
 * options (falling back to the default model / effort settings) become the
 * dispatch defaults shown in the `New sessions:` line and used by
 * enter-to-create. The `definitions` subcommand (backcompat) keeps printing
 * the configured agent definition list and lives in handlers/agents.tsx.
 */

/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handlers intentionally exit */

import React from 'react';
import { AppStateProvider } from '../../state/AppState.js';
import { onChangeAppState } from '../../state/onChangeAppState.js';
import { KeybindingSetup } from '../../keybindings/KeybindingProviderSetup.js';
import { AgentsView } from '../../components/agentsView/AgentsView.js';
import { getBaseRenderOptions } from '../../utils/renderOptions.js';
import type { SessionEntry } from '../bg/engine.js';

export interface AgentsViewOptions {
  json?: boolean;
  all?: boolean;
  /** Only show sessions started in this directory (or beneath it). */
  cwd?: string;
  /** Model for sessions dispatched from the view (`--model`). */
  model?: string;
  /** Effort for sessions dispatched from the view (`--effort`). */
  effort?: string;
  /**
   * Agent for sessions dispatched from the view (`--agent`).
   * TODO: not wired into dispatch yet (no official behavior evidence).
   */
  agent?: string;
}

export async function agentsViewHandler(options: AgentsViewOptions): Promise<void> {
  const bg = await import('../bg.js');

  // --json (or no terminal): print the session list as JSON and exit.
  if (options.json || !process.stdin.isTTY) {
    await bg.printSessionsJson({ all: options.all, cwd: options.cwd });
    return;
  }

  // Dispatch defaults: the `New sessions: {model} · {effort} · {cwd}` line
  // and the args used by enter-to-create. --model/--effort win over the
  // current default model / effort setting.
  const [{ getDefaultMainLoopModel }, { getInitialEffortSetting }] = await Promise.all([
    import('../../utils/model/model.js'),
    import('../../utils/effort.js'),
  ]);
  const dispatchDefaults = {
    model: options.model ?? getDefaultMainLoopModel(),
    effort: options.effort ?? getInitialEffortSetting(),
    cwd: process.cwd(),
  };

  // Interactive: open the agents view in a standalone Ink root. When enter
  // opens a session, unmount, attach into it, and re-render the list once
  // the user detaches (a fresh root per iteration).
  const { createRoot } = await import('@anthropic/ink');
  let lastOpenedId: string | undefined;
  for (;;) {
    const root = await createRoot(getBaseRenderOptions(false));
    let attachTarget: string | undefined;
    await new Promise<void>(resolve => {
      root.render(
        <AppStateProvider onChangeAppState={onChangeAppState}>
          <KeybindingSetup>
            <AgentsView
              onClose={() => void resolve()}
              onExitApp={() => void resolve()}
              onAttach={(session: SessionEntry) => {
                attachTarget = session.sessionId;
                lastOpenedId = session.sessionId;
                void resolve();
              }}
              initialLastOpenedId={lastOpenedId}
              cwdFilter={options.cwd}
              dispatchDefaults={dispatchDefaults}
            />
          </KeybindingSetup>
        </AppStateProvider>,
      );
    });
    root.unmount();
    if (!attachTarget) break;
    // Blocks until the user detaches from the session's REPL.
    await bg.attachHandler(attachTarget);
  }
}

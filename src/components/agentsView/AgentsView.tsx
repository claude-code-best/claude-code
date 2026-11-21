import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sep } from 'path';
import { Byline, KeyboardShortcutHint, ListItem, Box, Text, useInput } from '@anthropic/ink';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { tailFile } from '../../utils/fsOperations.js';
import { buildDetailHints, buildListHints, trimHintsToWidth, type Hint } from './agentsViewHints.js';
import {
  listSessions,
  respawnSessionCore,
  resolveSessionEngine,
  stopSession,
  type SessionEntry,
} from '../../cli/bg.js';

/**
 * Agents view (official Claude Code 2.1.330, strings L933730/L926501).
 *
 * Opened by `claude agents` (interactive), ← at input start
 * (`leftArrowOpensAgents`), or at startup (`defaultToAgentsView`).
 *
 * Two views:
 * - `agents` — session list: name + subtext (cwd) + stats per row
 *   (official row header W5t = {name, subtext, stats, width}), up/down
 *   navigation, `x` stop, `r` respawn, enter → detail, esc → close.
 * - `agent` — single-session detail: header + detailLines (metadata + log
 *   tail, scrollable) + key hints, esc → back to list.
 *
 * Not implemented in this batch (registered as no-op actions, see
 * agentsViewSettings.ts / schema.ts): the `phases` workflow view, dispatching
 * new sessions from the view, pin/find/rename behavior, and group navigation.
 */

type AgentsSubView = 'agents' | 'agent';

/** How many bytes of the session log the detail view reads. */
const DETAIL_LOG_TAIL_BYTES = 8192;

/** Refresh interval for the session list (ms). */
const REFRESH_INTERVAL_MS = 5000;

type Props = {
  /** Called when the view closes (esc at list level). */
  onClose: () => void;
  /** Standalone mode (`claude agents`): ctrl+c also closes. Not provided
   * when embedded in the REPL — ctrl+c falls through to the cancel-request
   * handler there. */
  onExitApp?: () => void;
  /** Only show sessions started in this directory (or beneath it) —
   * `claude agents --cwd <path>`. */
  cwdFilter?: string;
};

/**
 * Key hint rows (official: `${chord} ${action}` joined KeyboardShortcutHint
 * style, dimColor italic). When the row would exceed the terminal width,
 * hints are dropped lowest-priority-first (agentsViewHints.ts).
 */
function useTrimmedHints(hints: Hint[], columns: number): Hint[] {
  return useMemo(() => trimHintsToWidth(hints, columns), [hints, columns]);
}

function sessionDisplayName(session: SessionEntry): string {
  return session.name ?? session.sessionId.slice(0, 8);
}

function sessionStats(session: SessionEntry): string {
  const parts: string[] = [session.kind, resolveSessionEngine(session)];
  if (session.status) parts.push(session.status);
  if (session.waitingFor) parts.push(`waiting for ${session.waitingFor}`);
  if (session.agent) parts.push(session.agent);
  return parts.join(' · ');
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

/** Metadata detail lines for the agent (single session) sub-view. */
function buildDetailLines(session: SessionEntry, logTail: string): string[] {
  const lines: string[] = [
    `Session    ${session.sessionId}`,
    `PID        ${session.pid}`,
    `Kind       ${session.kind}`,
    `Engine     ${resolveSessionEngine(session)}`,
    `Started    ${formatTime(session.startedAt)}`,
  ];
  if (session.status) lines.push(`Status     ${session.status}`);
  if (session.waitingFor) lines.push(`Waiting    ${session.waitingFor}`);
  if (session.agent) lines.push(`Agent      ${session.agent}`);
  if (session.name) lines.push(`Name       ${session.name}`);
  lines.push(`CWD        ${session.cwd}`);
  if (session.logPath) lines.push(`Log        ${session.logPath}`);

  if (logTail) {
    lines.push('');
    lines.push('── log tail ──');
    for (const line of logTail.replace(/\n+$/, '').split('\n')) {
      lines.push(line);
    }
  }
  return lines;
}

export function AgentsView({ onClose, onExitApp, cwdFilter }: Props): React.ReactNode {
  const { rows, columns } = useTerminalSize();

  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [subView, setSubView] = useState<AgentsSubView>('agents');
  const [logTail, setLogTail] = useState('');
  const [detailScroll, setDetailScroll] = useState(0);
  // Transient feedback for stop/respawn (shown above the key hints)
  const [statusMessage, setStatusMessage] = useState('');

  // Latest callbacks for the refresh interval (avoids stale closures)
  const refreshRef = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    const fresh = await listSessions();
    // --cwd <path>: only show sessions started in that directory (or beneath)
    const visible = cwdFilter
      ? fresh.filter(
          s => s.cwd === cwdFilter || s.cwd.startsWith(cwdFilter.endsWith(sep) ? cwdFilter : cwdFilter + sep),
        )
      : fresh;
    setSessions(visible);
    setSelectedIdx(prev => Math.min(prev, Math.max(0, visible.length - 1)));
  }, [cwdFilter]);
  refreshRef.current = refresh;

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refreshRef.current();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const selected = sessions[selectedIdx];

  // Load the log tail whenever the detail view opens on a new session
  useEffect(() => {
    if (subView !== 'agent' || !selected?.logPath) {
      setLogTail('');
      return;
    }
    let cancelled = false;
    void tailFile(selected.logPath, DETAIL_LOG_TAIL_BYTES)
      .then(result => {
        if (!cancelled) setLogTail(result.content);
      })
      .catch(() => {
        if (!cancelled) setLogTail('');
      });
    return () => {
      cancelled = true;
    };
  }, [subView, selected?.sessionId, selected?.logPath]);

  const detailLines = useMemo(() => (selected ? buildDetailLines(selected, logTail) : []), [selected, logTail]);

  // Detail view scrolling: header (2) + gap (1) + hints (1) + margins (2)
  const detailVisibleLines = Math.max(1, rows - 6);
  const maxDetailScroll = Math.max(0, detailLines.length - detailVisibleLines);
  useEffect(() => {
    setDetailScroll(prev => Math.min(prev, maxDetailScroll));
  }, [maxDetailScroll]);

  const enterDetailView = useCallback(() => {
    if (!selected) return;
    setDetailScroll(0);
    setSubView('agent');
  }, [selected]);

  const backToList = useCallback(() => {
    setSubView('agents');
  }, []);

  // Stop/respawn use the silent bg.ts cores — the interactive view must not
  // print raw console lines into the Ink TUI. Feedback goes to statusMessage.
  const stopSelected = useCallback(async () => {
    if (!selected) return;
    setStatusMessage(`Stopping ${sessionDisplayName(selected)}...`);
    await stopSession(selected);
    await refresh();
    setStatusMessage('');
  }, [selected, refresh]);

  const respawnSelected = useCallback(async () => {
    if (!selected) return;
    // `r` = restart: a still-running session is stopped first, then
    // respawned with its recorded args (CLI `claude respawn` refuses
    // running sessions; the view's key is a restart).
    let result = await respawnSessionCore(selected);
    if (!result.ok && result.reason === 'running') {
      setStatusMessage(`Restarting ${sessionDisplayName(selected)}...`);
      await stopSession(selected);
      result = await respawnSessionCore(selected);
    }
    setStatusMessage(result.ok ? `Respawned ${sessionDisplayName(selected)} as ${result.sessionName}` : result.message);
    await refresh();
  }, [selected, refresh]);

  // ── Agents keybinding context (official L909536) ────────────────────────
  // switchView toggles between the agents (list) and agent (detail) views.
  // togglePin/find/rename and previousGroup/nextGroup are registered as
  // no-ops — the underlying behaviors are not implemented in this batch.
  useKeybindings(
    {
      'agents:switchView': () => {
        if (subView === 'agents') {
          enterDetailView();
        } else {
          backToList();
        }
      },
      'agents:togglePin': () => {
        // TODO: pin the selected session to the top of the list
      },
      'agents:find': () => {
        // TODO: open a find/filter prompt for the session list
      },
      'agents:rename': () => {
        // TODO: rename the selected session (updateSessionName)
      },
      'agents:previousGroup': () => {
        // TODO: jump to the previous session group (by cwd/kind)
      },
      'agents:nextGroup': () => {
        // TODO: jump to the next session group (by cwd/kind)
      },
    },
    { context: 'Agents' },
  );

  // ── View-level raw keys (official key hint row, L933730) ────────────────
  useInput(
    (input, key) => {
      if (key.escape) {
        // esc: go back (detail → list) / close (list → exit)
        if (subView === 'agent') {
          backToList();
        } else {
          onClose();
        }
        return;
      }
      if (key.upArrow) {
        if (subView === 'agents') {
          setSelectedIdx(prev => Math.max(0, prev - 1));
        } else {
          setDetailScroll(prev => Math.max(0, prev - 1));
        }
        return;
      }
      if (key.downArrow) {
        if (subView === 'agents') {
          setSelectedIdx(prev => Math.min(sessions.length - 1, prev + 1));
        } else {
          setDetailScroll(prev => Math.min(maxDetailScroll, prev + 1));
        }
        return;
      }
      if (key.return) {
        // enter: view (list → detail) / collapse (detail → list)
        if (subView === 'agents') {
          enterDetailView();
        } else {
          backToList();
        }
        return;
      }
      if (key.ctrl && input === 'c') {
        // Standalone mode only — in the REPL, ctrl+c propagates to the
        // cancel-request handler (interrupts the active query).
        if (onExitApp) onExitApp();
        return;
      }
      if (key.ctrl || key.meta) return;
      if (input === 'x') {
        void stopSelected();
        return;
      }
      if (input === 'r') {
        void respawnSelected();
      }
    },
    { isActive: true },
  );

  // ── Key hint rows (dimColor italic, trimmed to terminal width) ──────────
  const listHints = useTrimmedHints(
    useMemo(() => buildListHints(), []),
    columns,
  );
  const detailHints = useTrimmedHints(
    useMemo(() => buildDetailHints(), []),
    columns,
  );

  const hintsRow = (hints: Hint[]): React.ReactNode => (
    <Box paddingLeft={1}>
      <Text dimColor italic>
        <Byline>
          {hints.map(h => (
            <KeyboardShortcutHint key={h.chord} shortcut={h.chord} action={h.action} />
          ))}
        </Byline>
      </Text>
    </Box>
  );

  if (subView === 'agent' && selected) {
    const visibleLines = detailLines.slice(detailScroll, detailScroll + detailVisibleLines);
    return (
      <Box flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold>{sessionDisplayName(selected)}</Text>
          <Text dimColor>{sessionStats(selected)}</Text>
        </Box>
        <Text dimColor>{selected.cwd}</Text>
        <Box flexDirection="column" marginTop={1} minHeight={1}>
          {visibleLines.map((line, i) => (
            <Text key={`${i}-${line.slice(0, 16)}`} dimColor={line === ''}>
              {line}
            </Text>
          ))}
        </Box>
        {statusMessage !== '' && (
          <Box>
            <Text dimColor>{statusMessage}</Text>
          </Box>
        )}
        {hintsRow(detailHints)}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1}>
      {sessions.length === 0 ? (
        <Text dimColor>No agents yet.</Text>
      ) : (
        <Box flexDirection="column">
          {sessions.map((session, i) => (
            <ListItem key={session.sessionId} isFocused={i === selectedIdx} description={session.cwd}>
              <Box flexDirection="row" gap={1}>
                <Text>{sessionDisplayName(session)}</Text>
                <Text dimColor>{sessionStats(session)}</Text>
              </Box>
            </ListItem>
          ))}
        </Box>
      )}
      {statusMessage !== '' && (
        <Box>
          <Text dimColor>{statusMessage}</Text>
        </Box>
      )}
      <Box marginTop={1}>{hintsRow(listHints)}</Box>
    </Box>
  );
}

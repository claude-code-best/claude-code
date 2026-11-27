import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sep } from 'path';
import { Byline, KeyboardShortcutHint, ListItem, Box, Text, useInput } from '@anthropic/ink';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { tailFile } from '../../utils/fsOperations.js';
import { isProcessRunning } from '../../utils/genericProcessUtils.js';
import {
  buildDetailHints,
  buildInputHints,
  buildListHints,
  buildReplyHints,
  buildRemoveConfirmHints,
  trimHintsToWidth,
  SHORTCUTS_TABLE,
  SHORTCUTS_TABLE_COLUMN_WIDTH,
  type Hint,
} from './agentsViewHints.js';
import {
  buildCountsLine,
  filterSessions,
  formatRelativeTime,
  groupByStatus,
  nextGroupIndex,
  previousGroupIndex,
  sessionGroup,
  SESSION_GROUP_ICONS,
  SESSION_GROUP_LABELS,
  SLASH_COMMANDS,
} from './agentsViewList.js';
import {
  dispatchSessionCore,
  listSessions,
  removeSessionCore,
  replyToSession,
  resolveSessionEngine,
  sortSessions,
  updateSessionEntry,
  type SessionEntry,
} from '../../cli/bg.js';

/**
 * Agents view (official Claude Code 2.1.330 — behavior verified by driving
 * the official binary under tmux).
 *
 * Opened by `claude agents` (interactive), ← at input start
 * (`leftArrowOpensAgents`), or at startup (`defaultToAgentsView`).
 *
 * List layout (tmux-verified):
 * - Top banner, then a counts line (`1 awaiting input · 1 working ·
 *   2 completed`, zero-count groups omitted), then the dispatch-defaults
 *   line (`New sessions: {model} · {effort} · {cwd}`).
 * - Three status groups: `Needs input` / `Working` / `Completed` (NOT
 *   grouped by cwd). opt+↑/↓ jump between them.
 * - Row: icon (`✶` working, `✻` awaiting input, `∙` completed) + name +
 *   summary column + relative time. Selected row gets the `❯` pointer.
 * - A persistent input box at the bottom (placeholder "describe a task for
 *   a new session"). enter dispatches a new background session; typing
 *   shows `enter to create · esc×2 to clear · ctrl+f to find`.
 *
 * Keys (tmux-verified):
 * - list: enter open (attach in standalone mode, detail view when embedded
 *   in the REPL) · space reply · ctrl+x remove (double-press confirm) ·
 *   ? shortcuts table · esc quit
 * - input: enter create · esc×2 clear · ctrl+f find · ctrl+j newline
 * - reply dialog: enter open/send · space close · ctrl+x remove
 * - ctrl+r rename · ctrl+s switch views · ctrl+t pin to top
 *
 * TODO (no behavior evidence yet, registered as no-ops): `@` mention, the
 * `phases` workflow view, ctrl+y restore of the cleared input, unread
 * markers (the `✻` icon also marks unread sessions), summary columns read
 * from the session transcript, and slash-command completion selection UX.
 */

type AgentsSubView = 'agents' | 'agent';

/** How many bytes of the session log the detail view reads. */
const DETAIL_LOG_TAIL_BYTES = 8192;

/** How many bytes of the session log the list's summary column reads. */
const SUMMARY_TAIL_BYTES = 512;

/** rendered width of the summary column. */
const SUMMARY_MAX_WIDTH = 60;

/** Refresh interval for the session list (ms). */
const REFRESH_INTERVAL_MS = 5000;

/** Input box placeholder (official, verbatim). */
const INPUT_PLACEHOLDER = 'describe a task for a new session';

/** Status shown after esc clears the input (official, verbatim). */
const CLEARED_MESSAGE = 'Cleared · ctrl+y to restore';

type Props = {
  /** Called when the view closes (esc at list level). */
  onClose: () => void;
  /**
   * Standalone mode (`claude agents`): ctrl+c also closes. Not provided when
   * embedded in the REPL — ctrl+c falls through to the cancel-request
   * handler there.
   */
  onExitApp?: () => void;
  /**
   * Standalone mode: enter opens (attaches into) the selected session's
   * REPL. Not provided when embedded in the REPL — enter opens the detail
   * view instead (a nested REPL is not possible there).
   */
  onAttach?: (session: SessionEntry) => void;
  /** Session the user last attached to (standalone re-render after detach). */
  initialLastOpenedId?: string;
  /** Only show sessions started in this directory (or beneath it) —
   * `claude agents --cwd <path>`. */
  cwdFilter?: string;
  /** Dispatch defaults for the "New sessions:" line and enter-to-create. */
  dispatchDefaults?: { model?: string; effort?: string; cwd?: string };
};

/**
 * Key hint rows (official: `${chord} to ${action}` joined KeyboardShortcutHint
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

/** Truncate a string to `max` columns, appending an ellipsis when cut. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

/** Strip ANSI escape sequences from a log line for the summary column. */
function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes is the point
  return text.replace(/[\u001b]\[[0-9;]*[A-Za-z]/g, '');
}

/** Last non-empty line of a log tail — the summary column's fallback. */
function lastNonEmptyLine(content: string): string {
  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = stripAnsi(lines[i]!).trim();
    if (line !== '') return line;
  }
  return '';
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

/** `New sessions: {model} · {effort} · {cwd}` — missing segments omitted. */
function buildNewSessionsLine(defaults: { model?: string; effort?: string; cwd?: string }): string {
  const segments: string[] = [];
  if (defaults.model) segments.push(defaults.model);
  if (defaults.effort) segments.push(`${defaults.effort} effort`);
  if (defaults.cwd) {
    // Official shows the cwd from $HOME: `~/work/claude-code`
    const home = process.env.HOME;
    segments.push(home && defaults.cwd.startsWith(home) ? `~${defaults.cwd.slice(home.length)}` : defaults.cwd);
  }
  if (segments.length === 0) return '';
  return `New sessions: ${segments.join(' · ')}`;
}

export function AgentsView({
  onClose,
  onExitApp,
  onAttach,
  initialLastOpenedId,
  cwdFilter,
  dispatchDefaults,
}: Props): React.ReactNode {
  const { rows, columns } = useTerminalSize();

  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [subView, setSubView] = useState<AgentsSubView>('agents');
  const [logTail, setLogTail] = useState('');
  const [detailScroll, setDetailScroll] = useState(0);
  // Transient feedback for dispatch/reply/remove (shown above the key hints)
  const [statusMessage, setStatusMessage] = useState('');
  // agents:find — the input box enters filter state (ctrl+f)
  const [findMode, setFindMode] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  // agents:rename — inline name editor (ctrl+r)
  const [renameMode, setRenameMode] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  // The persistent input box (enter dispatches a new session)
  const [inputValue, setInputValue] = useState('');
  // Reply dialog (space on a session)
  const [replyMode, setReplyMode] = useState(false);
  const [replyValue, setReplyValue] = useState('');
  // ctrl+x double-press confirmation (the session id awaiting the second press)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  // ? toggles the full shortcuts table
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Session the user last opened (enter hint becomes "return" on that row)
  const [lastOpenedSessionId, setLastOpenedSessionId] = useState<string | null>(initialLastOpenedId ?? null);
  // Summary column: last log line per session (sessionId → text)
  const [summaries, setSummaries] = useState<Record<string, string>>({});

  // The just-dispatched session's tmux name — selected once its registry
  // entry appears (the bg process registers itself asynchronously).
  const pendingDispatchRef = useRef<string | null>(null);

  // Latest callbacks for the refresh interval (avoids stale closures)
  const refreshRef = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    // includeExited: the Completed group lists exited background sessions.
    const fresh = await listSessions({ includeExited: true });
    // --cwd <path>: only show sessions started in that directory (or beneath)
    const visible = cwdFilter
      ? fresh.filter(
          s => s.cwd === cwdFilter || s.cwd.startsWith(cwdFilter.endsWith(sep) ? cwdFilter : cwdFilter + sep),
        )
      : fresh;
    // Pinned first, then newest first (agents:togglePin).
    const sorted = sortSessions(visible);
    setSessions(sorted);

    // Summary column: working → prompt / completed → final reply. Minimal
    // implementation: the last non-empty log line (waitingFor/status fields
    // take precedence at render time). TODO: read the session transcript.
    const withLogs = sorted.filter(s => s.logPath && !s.waitingFor && !s.status);
    if (withLogs.length > 0) {
      const entries = await Promise.all(
        withLogs.map(async s => {
          try {
            const result = await tailFile(s.logPath!, SUMMARY_TAIL_BYTES);
            return [s.sessionId, lastNonEmptyLine(result.content)] as const;
          } catch {
            return [s.sessionId, ''] as const;
          }
        }),
      );
      setSummaries(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    }
  }, [cwdFilter]);
  refreshRef.current = refresh;

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refreshRef.current();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // ── Grouped list (three status groups, tmux-verified) ────────────────────
  const grouped = useMemo(
    () => groupByStatus(filterSessions(sessions, findQuery), s => isProcessRunning(s.pid)),
    [sessions, findQuery],
  );
  const visibleSessions = grouped.flat;
  const selected = visibleSessions[selectedIdx];

  // A just-dispatched session registers itself asynchronously — select it
  // as soon as its entry shows up (it lands in the Working group).
  useEffect(() => {
    if (pendingDispatchRef.current === null) return;
    const idx = visibleSessions.findIndex(s => s.tmuxSessionName === pendingDispatchRef.current);
    if (idx !== -1) {
      pendingDispatchRef.current = null;
      setSelectedIdx(idx);
    }
  }, [visibleSessions]);

  const flatIndexBySession = useMemo(() => {
    const map = new Map<string, number>();
    visibleSessions.forEach((session, i) => map.set(session.sessionId, i));
    return map;
  }, [visibleSessions]);

  // Keep the selection inside the filtered list as the query changes.
  useEffect(() => {
    setSelectedIdx(prev => Math.min(prev, Math.max(0, visibleSessions.length - 1)));
  }, [visibleSessions.length]);

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

  // enter = open: attach into the session's REPL (standalone mode only —
  // a REPL-embedded view cannot nest another REPL, so it opens the detail
  // view instead). Right after returning from a session the hint row shows
  // `enter to return` on that row.
  const openSelected = useCallback(() => {
    if (!selected) return;
    if (onAttach) {
      setLastOpenedSessionId(selected.sessionId);
      onAttach(selected);
      return;
    }
    enterDetailView();
  }, [selected, onAttach, enterDetailView]);

  // NOTE: the official key set (tmux-verified) has no single-key stop/respawn
  // anymore — printable keys type into the persistent input box. Stopping a
  // session goes through ctrl+x (remove refuses running sessions) or the
  // session's own REPL; `claude respawn` remains on the CLI.

  // Pin/unpin the selected session — persisted in its registry entry, and
  // the list re-sorts pinned-first on the next refresh.
  const togglePinSelected = useCallback(async () => {
    if (!selected) return;
    const next = !selected.pinned;
    const ok = await updateSessionEntry(selected, { pinned: next });
    setStatusMessage(
      ok
        ? `${next ? 'Pinned' : 'Unpinned'} ${sessionDisplayName(selected)}`
        : `Could not update ${sessionDisplayName(selected)}`,
    );
    await refresh();
  }, [selected, refresh]);

  // Rename the selected session — persisted in its registry entry.
  const commitRename = useCallback(async () => {
    if (!selected) return;
    const name = renameValue.trim();
    setRenameMode(false);
    if (name === '' || name === selected.name) return;
    const ok = await updateSessionEntry(selected, { name });
    setStatusMessage(ok ? `Renamed to ${name}` : `Could not rename ${sessionDisplayName(selected)}`);
    await refresh();
  }, [selected, renameValue, refresh]);

  // ── Dispatch (input box, enter to create) ────────────────────────────────
  const dispatchPrompt = useCallback(async () => {
    const prompt = inputValue.trim();
    if (prompt === '') return;
    const args = ['-p', prompt];
    if (dispatchDefaults?.model) args.push('--model', dispatchDefaults.model);
    if (dispatchDefaults?.effort) args.push('--effort', dispatchDefaults.effort);
    const result = await dispatchSessionCore(args, { cwd: dispatchDefaults?.cwd });
    if (!result.ok) {
      setStatusMessage(result.message);
      return;
    }
    setInputValue('');
    pendingDispatchRef.current = result.sessionName;
    await refresh();
  }, [inputValue, dispatchDefaults, refresh]);

  // ── Reply dialog (space to reply) ────────────────────────────────────────
  const sendReply = useCallback(async () => {
    if (!selected) return;
    const text = replyValue.trim();
    if (text === '') {
      // enter with an empty reply box = open (the dialog's hint row says so)
      setReplyMode(false);
      setReplyValue('');
      openSelected();
      return;
    }
    const result = await replyToSession(selected, text);
    setStatusMessage(result.ok ? `Sent to ${sessionDisplayName(selected)}` : result.message);
    setReplyValue('');
    setReplyMode(false);
    await refresh();
  }, [selected, replyValue, openSelected, refresh]);

  // ── Remove (ctrl+x, double-press confirm) ────────────────────────────────
  const removeSelected = useCallback(async () => {
    if (!selected) return;
    const result = await removeSessionCore(selected);
    setStatusMessage(result.ok ? `Removed ${sessionDisplayName(selected)}` : result.message);
    await refresh();
  }, [selected, refresh]);

  const handleRemoveKey = useCallback(() => {
    if (!selected) return;
    if (confirmRemoveId === selected.sessionId) {
      setConfirmRemoveId(null);
      void removeSelected();
      return;
    }
    setConfirmRemoveId(selected.sessionId);
  }, [selected, confirmRemoveId, removeSelected]);

  // esc: reply → rename → find → confirm → shortcuts → detail → input → quit
  const handleEscape = useCallback(() => {
    if (replyMode) {
      setReplyMode(false);
      setReplyValue('');
      return;
    }
    if (renameMode) {
      setRenameMode(false);
      return;
    }
    if (findMode) {
      setFindMode(false);
      setFindQuery('');
      return;
    }
    if (confirmRemoveId !== null) {
      setConfirmRemoveId(null);
      return;
    }
    if (showShortcuts) {
      setShowShortcuts(false);
      return;
    }
    if (subView === 'agent') {
      backToList();
      return;
    }
    if (inputValue !== '') {
      // esc×2 to clear: first esc clears the text (TODO: ctrl+y restores it)
      setInputValue('');
      setStatusMessage(CLEARED_MESSAGE);
      return;
    }
    onClose();
  }, [replyMode, renameMode, findMode, confirmRemoveId, showShortcuts, subView, inputValue, backToList, onClose]);

  // A modal editor captures every key while active.
  const modalOpen = replyMode || renameMode || findMode;
  // List mode: input box empty, cursor in the session list.
  const listMode = !modalOpen && subView === 'agents' && inputValue === '';

  // ── Agents keybinding context (official L909536) ─────────────────────────
  // Handlers return false ("not consumed") when a modal editor or the input
  // box owns the key — the event then propagates to the raw useInput below.
  useKeybindings(
    {
      'agents:switchView': () => {
        if (modalOpen) return false;
        setConfirmRemoveId(null);
        if (subView === 'agents') {
          enterDetailView();
        } else {
          backToList();
        }
      },
      'agents:togglePin': () => {
        if (modalOpen) return false;
        setConfirmRemoveId(null);
        void togglePinSelected();
      },
      'agents:find': () => {
        if (replyMode || renameMode) return false;
        setConfirmRemoveId(null);
        // The input box enters filter state (the typed prompt is kept).
        setFindMode(true);
      },
      'agents:rename': () => {
        if (modalOpen) return false;
        if (!selected) return false;
        setConfirmRemoveId(null);
        setRenameValue(selected.name ?? '');
        setRenameMode(true);
      },
      'agents:previousGroup': () => {
        if (!listMode) return false;
        setConfirmRemoveId(null);
        setSelectedIdx(prev => previousGroupIndex(grouped, prev));
      },
      'agents:nextGroup': () => {
        if (!listMode) return false;
        setConfirmRemoveId(null);
        setSelectedIdx(prev => nextGroupIndex(grouped, prev));
      },
      'agents:open': () => {
        if (!listMode) return false;
        setConfirmRemoveId(null);
        openSelected();
      },
      'agents:reply': () => {
        // In the reply dialog the official hint row says `space to close` —
        // space closes the dialog instead of typing a space.
        if (replyMode) {
          setReplyMode(false);
          setReplyValue('');
          return;
        }
        if (!listMode) return false;
        setConfirmRemoveId(null);
        setReplyValue('');
        setReplyMode(true);
      },
      'agents:remove': () => {
        if (renameMode || findMode) return false;
        handleRemoveKey();
      },
      'agents:toggleShortcuts': () => {
        if (!listMode) return false;
        setConfirmRemoveId(null);
        setShowShortcuts(prev => !prev);
      },
      'agents:newline': () => {
        if (modalOpen) return false;
        setInputValue(prev => `${prev}\n`);
      },
      'agents:clearOrQuit': () => {
        handleEscape();
      },
    },
    { context: 'Agents' },
  );

  // Slash-command autocomplete: typing '/' surfaces matching commands.
  const slashCompletions = useMemo(() => {
    if (findMode || renameMode || replyMode || subView !== 'agents') return [];
    if (!inputValue.startsWith('/')) return [];
    const query = inputValue.slice(1).toLowerCase();
    return SLASH_COMMANDS.filter(command => command.startsWith(query));
  }, [findMode, renameMode, replyMode, subView, inputValue]);

  // ── View-level raw keys (everything the keybindings propagate) ───────────
  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        // Standalone mode only — in the REPL, ctrl+c propagates to the
        // cancel-request handler (interrupts the active query). Checked
        // first so it also works while a modal editor is open.
        if (onExitApp) onExitApp();
        return;
      }
      // ── Modal editors take every key while active ────────────────────────
      if (replyMode) {
        if (key.return) {
          void sendReply();
          return;
        }
        if (key.backspace || key.delete) {
          setReplyValue(prev => prev.slice(0, -1));
          return;
        }
        if (!key.ctrl && !key.meta && input) {
          setReplyValue(prev => prev + input);
        }
        return;
      }
      if (renameMode) {
        if (key.return) {
          void commitRename();
          return;
        }
        if (key.backspace || key.delete) {
          setRenameValue(prev => prev.slice(0, -1));
          return;
        }
        if (!key.ctrl && !key.meta && input) {
          setRenameValue(prev => prev + input);
        }
        return;
      }
      if (findMode) {
        if (key.return) {
          // Keep the filter, leave the editor.
          setFindMode(false);
          return;
        }
        if (key.backspace || key.delete) {
          setFindQuery(prev => prev.slice(0, -1));
          return;
        }
        if (!key.ctrl && !key.meta && input) {
          setFindQuery(prev => prev + input);
        }
        return;
      }

      // Any key other than ctrl+x cancels a pending remove confirmation.
      if (confirmRemoveId !== null && !(key.ctrl && input === 'x')) {
        setConfirmRemoveId(null);
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
          setSelectedIdx(prev => Math.min(visibleSessions.length - 1, prev + 1));
        } else {
          setDetailScroll(prev => Math.min(maxDetailScroll, prev + 1));
        }
        return;
      }
      if (key.return) {
        if (subView === 'agent') {
          backToList();
          return;
        }
        if (inputValue.trim() !== '') {
          // enter to create: dispatch a new background session.
          void dispatchPrompt();
          return;
        }
        openSelected();
        return;
      }
      if (key.tab && slashCompletions.length > 0) {
        // TODO: official completion selection UX; tab takes the first match.
        setInputValue(`/${slashCompletions[0]!} `);
        return;
      }
      if (key.ctrl || key.meta) return;
      if (input) {
        // TODO: '@' opens a mention picker in the official binary (no
        // behavior evidence) — for now every printable character types into
        // the input box.
        if (subView === 'agents') setInputValue(prev => prev + input);
      }
    },
    { isActive: true },
  );

  // ── Key hint rows (dimColor italic, trimmed to terminal width) ──────────
  const hasReturnTarget = lastOpenedSessionId !== null && selected?.sessionId === lastOpenedSessionId;
  const listHints = useTrimmedHints(
    useMemo(() => buildListHints(hasReturnTarget), [hasReturnTarget]),
    columns,
  );
  const inputHints = useTrimmedHints(
    useMemo(() => buildInputHints(), []),
    columns,
  );
  const replyHints = useTrimmedHints(
    useMemo(() => buildReplyHints(), []),
    columns,
  );
  const removeConfirmHints = useTrimmedHints(
    useMemo(() => buildRemoveConfirmHints(), []),
    columns,
  );
  const detailHints = useTrimmedHints(
    useMemo(() => buildDetailHints(), []),
    columns,
  );

  const activeHints = replyMode
    ? replyHints
    : confirmRemoveId !== null
      ? removeConfirmHints
      : findMode || inputValue !== ''
        ? inputHints
        : subView === 'agent'
          ? detailHints
          : listHints;

  const hintsRow = (hints: Hint[]): React.ReactNode => (
    <Box paddingLeft={1}>
      <Text dimColor italic>
        <Byline>
          {hints.map(hint =>
            hint.raw !== undefined ? (
              <Text key={hint.raw}>{hint.raw}</Text>
            ) : (
              <KeyboardShortcutHint key={hint.chord} shortcut={hint.chord} action={hint.action} />
            ),
          )}
        </Byline>
      </Text>
    </Box>
  );

  // ── Row rendering ────────────────────────────────────────────────────────
  const summaryFor = (session: SessionEntry): string => {
    if (confirmRemoveId === session.sessionId) return 'ctrl+x again to remove';
    if (session.waitingFor) return session.waitingFor;
    if (session.status) return session.status;
    return summaries[session.sessionId] ?? '';
  };

  const renderRow = (session: SessionEntry): React.ReactNode => {
    const idx = flatIndexBySession.get(session.sessionId) ?? -1;
    const name = sessionDisplayName(session);
    const time = formatRelativeTime(Date.now(), session.startedAt);
    const summaryWidth = Math.max(16, Math.min(SUMMARY_MAX_WIDTH, columns - name.length - time.length - 12));
    const summary = truncate(summaryFor(session), summaryWidth);
    return (
      <ListItem key={session.sessionId} isFocused={idx === selectedIdx} description={session.cwd}>
        <Box flexDirection="row" gap={1}>
          <Text>{SESSION_GROUP_ICONS[sessionGroup(session, isProcessRunning(session.pid))]}</Text>
          <Text>{name}</Text>
          {summary !== '' && (
            <Text dimColor>
              {summary}
              {' '.repeat(Math.max(1, summaryWidth - summary.length))}
            </Text>
          )}
          <Text dimColor>{time}</Text>
        </Box>
      </ListItem>
    );
  };

  const countsLine = buildCountsLine(grouped.counts);
  const newSessionsLine = dispatchDefaults ? buildNewSessionsLine(dispatchDefaults) : '';

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
      {/* Top banner + counts + dispatch defaults (tmux-verified layout) */}
      <Text bold>Agents</Text>
      {countsLine !== '' && <Text dimColor>{countsLine}</Text>}
      {newSessionsLine !== '' && <Text dimColor>{newSessionsLine}</Text>}

      {/* ? toggles the full shortcuts table (official, verbatim) */}
      {showShortcuts && (
        <Box flexDirection="column" marginTop={1}>
          {SHORTCUTS_TABLE.map((row, i) => (
            <Box key={`shortcuts-${i}`}>
              {row.map((cell, j) => (
                <Text key={`shortcuts-${i}-${j}`} dimColor>
                  {cell.padEnd(SHORTCUTS_TABLE_COLUMN_WIDTH)}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
      )}

      {!findMode && findQuery !== '' && (
        <Box marginBottom={1}>
          <Text dimColor>Filter: {findQuery} (ctrl+f to edit, esc clears)</Text>
        </Box>
      )}
      {renameMode && (
        <Box marginBottom={1}>
          <Text>Rename: </Text>
          <Text>{renameValue}</Text>
          <Text dimColor>▌</Text>
        </Box>
      )}

      {visibleSessions.length === 0 ? (
        <Text dimColor>{sessions.length === 0 ? 'No agents yet.' : 'No matching agents.'}</Text>
      ) : (
        <Box flexDirection="column">
          {grouped.groups.map(group => (
            <Box key={group.key} flexDirection="column">
              <Text bold>{SESSION_GROUP_LABELS[group.key]}</Text>
              {group.sessions.map(session => renderRow(session))}
            </Box>
          ))}
        </Box>
      )}

      {/* Reply dialog (space): session summary + reply input in a box */}
      {replyMode && selected && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" paddingLeft={1} paddingRight={1}>
          <Text dimColor>
            {sessionDisplayName(selected)} · {truncate(summaryFor(selected), SUMMARY_MAX_WIDTH)}
          </Text>
          <Box>
            <Text>❯ reply </Text>
            <Text>{replyValue}</Text>
            <Text dimColor>▌</Text>
          </Box>
        </Box>
      )}

      {statusMessage !== '' && (
        <Box>
          <Text dimColor>{statusMessage}</Text>
        </Box>
      )}

      {/* Persistent input box (official: always present at the bottom) */}
      <Box marginTop={1}>
        {findMode ? (
          <Box>
            <Text>Find: </Text>
            <Text>{findQuery}</Text>
            <Text dimColor>▌</Text>
          </Box>
        ) : (
          <Box>
            <Text>❯ </Text>
            {inputValue === '' ? <Text dimColor>{INPUT_PLACEHOLDER}</Text> : <Text>{inputValue}</Text>}
            <Text dimColor>▌</Text>
          </Box>
        )}
      </Box>

      {/* Slash-command autocomplete (official: /permissions /plan /plugin
          /powerup appear in the completion list) */}
      {slashCompletions.length > 0 && (
        <Box>
          <Text dimColor>{slashCompletions.map(command => `/${command}`).join('   ')}</Text>
        </Box>
      )}

      {hintsRow(activeHints)}
    </Box>
  );
}

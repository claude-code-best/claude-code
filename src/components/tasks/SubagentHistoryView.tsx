/**
 * "Earlier in this session" views for the /tasks Background panel
 * (official 2.1.330, strings L937308).
 *
 * - SubagentHistoryView: the `__subagent_history__` group's sub-list of
 *   recorded (ended) subagents. Enter opens the recorded agent's
 *   transcript, Esc goes back to the task list.
 * - RecordedAgentDetailDialog: the `Wd(entry)` view of one recorded agent
 *   — loads the persisted sidechain transcript (getAgentTranscript) and
 *   renders its messages with a minimal scrollable text view. Typing into
 *   the message input and pressing enter reopens the ended agent with the
 *   typed prompt (official changelog L1555) — see resumeRecordedAgent.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { type KeyboardEvent, Box, Text, useInput } from '@anthropic/ink';
import figures from 'figures';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink';
import { formatRelativeTime } from '../agentsView/agentsViewList.js';
import { getAgentTranscript, type RecordedAgentEntry } from '../../utils/sessionStorage.js';
import type { Message } from '../../types/message.js';
import { asAgentId } from '../../types/ids.js';
import { extractTextContent } from '../../utils/messages.js';
import { resumeAgentBackground } from '@claude-code-best/builtin-tools/tools/AgentTool/resumeAgent.js';
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js';
import type { ToolUseContext } from '../../Tool.js';
import { enterTeammateView } from '../../state/teammateViewHelpers.js';
import { logForDebugging } from '../../utils/debug.js';
import { errorMessage } from '../../utils/errors.js';
import {
  DETAIL_HINTS,
  SUBAGENT_HISTORY_HINTS,
  toRecordedAgentItem,
  type RecordedAgentItem,
  type SubagentHistoryLoadState,
} from './backgroundTasksList.js';

type SubagentHistoryViewProps = {
  entries: RecordedAgentEntry[];
  loadState: SubagentHistoryLoadState;
  onSelect: (item: RecordedAgentItem) => void;
  onBack: () => void;
};

/**
 * The Earlier list. Rows show the recorded agent's label (original task
 * description when persisted, else its agent type), agent type, relative
 * last-activity time, and a `stopped` marker for user-stopped agents.
 */
export function SubagentHistoryView({
  entries,
  loadState,
  onSelect,
  onBack,
}: SubagentHistoryViewProps): React.ReactNode {
  const items = useMemo(() => entries.map(toRecordedAgentItem), [entries]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Frozen per mount — relative times don't need to tick.
  const now = useMemo(() => Date.now(), []);

  useEffect(() => {
    setSelectedIndex(prev => Math.min(prev, Math.max(0, items.length - 1)));
  }, [items.length]);

  useKeybindings(
    {
      'confirm:previous': () => setSelectedIndex(prev => Math.max(0, prev - 1)),
      'confirm:next': () => setSelectedIndex(prev => Math.min(items.length - 1, prev + 1)),
      'confirm:yes': () => {
        const item = items[selectedIndex];
        if (item) {
          onSelect(item);
        }
      },
    },
    { context: 'Confirmation', isActive: true },
  );

  return (
    <Dialog
      title="Earlier in this session"
      subtitle={
        <Text dimColor>
          {items.length} recorded {items.length === 1 ? 'agent' : 'agents'}
        </Text>
      }
      onCancel={onBack}
      color="background"
      inputGuide={() => (
        <Byline>
          {SUBAGENT_HISTORY_HINTS.map(hint => (
            <KeyboardShortcutHint key={hint.shortcut + hint.action} shortcut={hint.shortcut} action={hint.action} />
          ))}
        </Byline>
      )}
    >
      <Box flexDirection="column">
        {loadState === 'loading' && <Text dimColor>Loading…</Text>}
        {loadState === 'failed' && <Text dimColor>Earlier agents unreadable</Text>}
        {loadState === 'loaded' && items.length === 0 && <Text dimColor>No earlier agents in this session</Text>}
        {items.map((item, index) => (
          <Box key={item.id} flexDirection="row">
            <Text dimColor={index === selectedIndex}>{index === selectedIndex ? figures.pointer + ' ' : '  '}</Text>
            <Text color={index === selectedIndex ? 'suggestion' : undefined}>
              {item.label}{' '}
              <Text dimColor>
                {item.agentType} · {formatRelativeTime(now, item.lastActivityAt)}
                {item.stoppedByUser ? ' · stopped' : ''}
              </Text>
            </Text>
          </Box>
        ))}
      </Box>
    </Dialog>
  );
}

type TranscriptState = { status: 'loading' } | { status: 'loaded'; messages: Message[] } | { status: 'empty' };

/** Most recent lines shown in the recorded agent transcript view. */
const MAX_TRANSCRIPT_LINES = 30;

type RecordedAgentDetailDialogProps = {
  entry: RecordedAgentItem;
  onBack: () => void;
  /** The /tasks dialog's tool use context (resumeAgentBackground needs it). */
  toolUseContext: ToolUseContext;
  /** Closes the whole /tasks dialog (after a successful resume). */
  onDone: () => void;
};

/**
 * Resume a recorded (ended) agent with a new message (official 2.1.330,
 * changelog L1555: "you can reopen one and message it even after it leaves
 * the list or you restart").
 *
 * `resumeAgentBackground` reads the persisted sidechain transcript,
 * appends the new prompt, re-registers the agent as a live local_agent
 * task (registerAsyncAgent — the agent re-appears in /tasks) and restarts
 * its run loop. Once the task is live again the UI drops straight into
 * its viewing state (enterTeammateView).
 *
 * `canUseTool`: the /tasks dialog context has no interactive permission
 * queue (that lives in the REPL's useCanUseTool), so the minimal
 * implementation resumes the agent with a permissive default — the
 * resumed agent runs with default permissions and cannot prompt.
 */
export async function resumeRecordedAgent({
  agentId,
  prompt,
  toolUseContext,
  canUseTool = permissiveCanUseTool,
}: {
  agentId: string;
  prompt: string;
  toolUseContext: ToolUseContext;
  canUseTool?: CanUseToolFn;
}): Promise<void> {
  await resumeAgentBackground({ agentId, prompt, toolUseContext, canUseTool });
  // resumeAgentBackground re-registered the agent (registerAsyncAgent runs
  // synchronously before it returns) — enter its (now live) transcript view.
  enterTeammateView(agentId, toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState);
}

/** Permissive default (see resumeRecordedAgent's doc comment). */
const permissiveCanUseTool: CanUseToolFn = async (_tool, input) => ({
  behavior: 'allow',
  updatedInput: input,
});

/**
 * The `Wd(entry)` view of one recorded (ended) agent: loads its persisted
 * sidechain transcript and renders a minimal scrollable text view — user
 * messages as `› prompt`, assistant messages as their text content.
 *
 * TODO(official 2.1.330): the official dialog drops the UI straight into
 * the viewing state of the ended agent (full transcript rendering); the
 * sidechain-viewing architecture here only supports live local_agent
 * tasks, so this minimal transcript view is used instead.
 */
export function RecordedAgentDetailDialog({
  entry,
  onBack,
  toolUseContext,
  onDone,
}: RecordedAgentDetailDialogProps): React.ReactNode {
  const [transcript, setTranscript] = useState<TranscriptState>({ status: 'loading' });
  const [offset, setOffset] = useState(0);
  // Message input (official 2.1.330, L1555): type + enter resumes the
  // recorded agent with the typed prompt.
  const [messageValue, setMessageValue] = useState('');
  const [sendState, setSendState] = useState<
    { status: 'idle' } | { status: 'sending' } | { status: 'failed'; message: string }
  >({ status: 'idle' });

  const send = useCallback(async () => {
    const prompt = messageValue.trim();
    if (prompt === '' || sendState.status === 'sending') return;
    setSendState({ status: 'sending' });
    try {
      await resumeRecordedAgent({ agentId: entry.agentId, prompt, toolUseContext });
      // The agent is live and being viewed — close the /tasks dialog.
      onDone();
    } catch (error) {
      const message = errorMessage(error);
      logForDebugging(`[SubagentHistoryView] resume ${entry.agentId} failed: ${message}`);
      setSendState({ status: 'failed', message });
    }
  }, [messageValue, sendState.status, entry.agentId, toolUseContext, onDone]);

  useEffect(() => {
    let cancelled = false;
    setTranscript({ status: 'loading' });
    void getAgentTranscript(asAgentId(entry.agentId)).then(result => {
      if (cancelled) return;
      setTranscript(
        result && result.messages.length > 0 ? { status: 'loaded', messages: result.messages } : { status: 'empty' },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [entry.agentId]);

  const lines = useMemo(() => buildTranscriptLines(transcript), [transcript]);

  useEffect(() => {
    setOffset(prev => Math.min(prev, Math.max(0, lines.length - MAX_TRANSCRIPT_LINES)));
  }, [lines.length]);

  useKeybindings(
    {
      // Detail state (official L940641): ↑/↓ to scroll · Esc to back.
      'confirm:previous': () => setOffset(prev => Math.max(0, prev - 1)),
      'confirm:next': () => setOffset(prev => Math.min(Math.max(0, lines.length - MAX_TRANSCRIPT_LINES), prev + 1)),
      // Enter sends the typed message when the input box is non-empty
      // (official L1555: reopen + message); with an empty box it goes back.
      'confirm:yes': () => {
        if (messageValue.trim() !== '') {
          void send();
        } else {
          onBack();
        }
      },
    },
    { context: 'Confirmation', isActive: true },
  );

  // The message input box: printable keys type, backspace deletes. Runs
  // after the keybindings above so arrows/esc keep their dialog behavior.
  useInput((input, key) => {
    if (key.backspace || key.delete) {
      setMessageValue(prev => prev.slice(0, -1));
      return;
    }
    if (!key.ctrl && !key.meta && !key.return && input) {
      setMessageValue(prev => prev + input);
    }
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'left') {
      e.preventDefault();
      onBack();
    }
  };

  const hiddenCount = Math.max(0, lines.length - MAX_TRANSCRIPT_LINES - offset);

  return (
    <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Dialog
        title={`${entry.agentType} › ${entry.label}`}
        subtitle={<Text dimColor>{entry.stoppedByUser ? 'Stopped' : 'Completed'} · earlier in this session</Text>}
        onCancel={onBack}
        color="background"
        inputGuide={() => (
          <Byline>
            {DETAIL_HINTS.map(hint => (
              <KeyboardShortcutHint key={hint.shortcut + hint.action} shortcut={hint.shortcut} action={hint.action} />
            ))}
          </Byline>
        )}
      >
        <Box flexDirection="column">
          {transcript.status === 'loading' && <Text dimColor>Loading transcript…</Text>}
          {transcript.status === 'empty' && <Text dimColor>No transcript recorded for this agent</Text>}
          {transcript.status === 'loaded' && (
            <>
              {hiddenCount > 0 && (
                <Text dimColor>
                  … +{hiddenCount} earlier {hiddenCount === 1 ? 'message' : 'messages'}
                </Text>
              )}
              {lines.slice(offset, offset + MAX_TRANSCRIPT_LINES).map((line, index) => (
                <Text key={offset + index} wrap="wrap" dimColor={line.kind === 'user'}>
                  {line.kind === 'user' ? '› ' : ''}
                  {line.text}
                </Text>
              ))}
            </>
          )}
          {/* Message input (official L1555): type + enter reopens the ended
              agent with the typed prompt. */}
          <Box marginTop={1}>
            <Text>❯ message </Text>
            {messageValue === '' ? <Text dimColor>type to message this agent</Text> : <Text>{messageValue}</Text>}
            <Text dimColor>{sendState.status === 'sending' ? ' · resuming…' : '▌'}</Text>
          </Box>
          {sendState.status === 'failed' && <Text color="error">Could not resume agent: {sendState.message}</Text>}
        </Box>
      </Dialog>
    </Box>
  );
}

type TranscriptLine = { kind: 'user' | 'assistant'; text: string };

function buildTranscriptLines(transcript: TranscriptState): TranscriptLine[] {
  if (transcript.status !== 'loaded') {
    return [];
  }
  const lines: TranscriptLine[] = [];
  for (const message of transcript.messages) {
    // Message is a single structural type (not a discriminated union) with
    // an index signature — the payload lives on `message.message.content`.
    const content = message.message?.content;
    if (message.type === 'user') {
      const text = typeof content === 'string' ? content : content ? extractTextContent(content, '\n') : '';
      if (text) {
        lines.push({ kind: 'user', text });
      }
    } else if (message.type === 'assistant' && Array.isArray(content)) {
      const text = extractTextContent(content, '\n');
      if (text) {
        lines.push({ kind: 'assistant', text });
      }
    }
  }
  return lines;
}

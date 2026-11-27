/**
 * "Earlier in this session" views for the /tasks Background panel
 * (official 2.1.330, strings L937308).
 *
 * - SubagentHistoryView: the `__subagent_history__` group's sub-list of
 *   recorded (ended) subagents. Enter opens the recorded agent's
 *   transcript, Esc goes back to the task list.
 * - RecordedAgentDetailDialog: the `Wd(entry)` view of one recorded agent
 *   — loads the persisted sidechain transcript (getAgentTranscript) and
 *   renders its messages with a minimal scrollable text view.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { type KeyboardEvent, Box, Text } from '@anthropic/ink';
import figures from 'figures';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink';
import { formatRelativeTime } from '../agentsView/agentsViewList.js';
import { getAgentTranscript, type RecordedAgentEntry } from '../../utils/sessionStorage.js';
import type { Message } from '../../types/message.js';
import { asAgentId } from '../../types/ids.js';
import { extractTextContent } from '../../utils/messages.js';
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
};

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
export function RecordedAgentDetailDialog({ entry, onBack }: RecordedAgentDetailDialogProps): React.ReactNode {
  const [transcript, setTranscript] = useState<TranscriptState>({ status: 'loading' });
  const [offset, setOffset] = useState(0);

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
      'confirm:yes': onBack,
    },
    { context: 'Confirmation', isActive: true },
  );

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

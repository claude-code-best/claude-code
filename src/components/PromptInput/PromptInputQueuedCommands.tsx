import { feature } from 'bun:bundle';
import * as React from 'react';
import { useMemo } from 'react';
import { Box } from '@anthropic/ink';
import { useAppState } from 'src/state/AppState.js';
import { STATUS_TAG, SUMMARY_TAG, TASK_NOTIFICATION_TAG } from '../../constants/xml.js';
import { QueuedMessageProvider } from '../../context/QueuedMessageContext.js';
import { useCommandQueue } from '../../hooks/useCommandQueue.js';
import type { QueuedCommand } from '../../types/textInputTypes.js';
import { isQueuedCommandVisible } from '../../utils/messageQueueManager.js';
import { createUserMessage, EMPTY_LOOKUPS, normalizeMessages } from '../../utils/messages.js';
import { jsonParse } from '../../utils/slowOperations.js';
import { Message } from '../Message.js';

const EMPTY_SET = new Set<string>();

// Official 2.1.330 (changelog: "a long queued message hiding Claude's reply
// while it streams, and erasing it from scrollback in the classic renderer"):
// while a reply is streaming, the queue preview is capped to a couple of
// rows. In the classic renderer the queue sits in the front frame between
// the streaming reply and the prompt — an untruncated multi-row queued
// message grows the front frame until it covers the reply, and the
// frame-shrink on send then erases reply rows that had scrolled up.
const MAX_QUEUED_PREVIEW_LINES = 2;
const MAX_QUEUED_PREVIEW_CHARS = 240;

/** Truncate a queued message's string content to a bounded preview. */
export function truncateQueuedPreview(value: string): string {
  const lines = value.split('\n');
  const truncatedLines = lines.length > MAX_QUEUED_PREVIEW_LINES;
  let text = truncatedLines ? lines.slice(0, MAX_QUEUED_PREVIEW_LINES).join('\n') : value;
  if (text.length > MAX_QUEUED_PREVIEW_CHARS) {
    text = text.slice(0, MAX_QUEUED_PREVIEW_CHARS);
  }
  return truncatedLines || text.length < value.length ? `${text}…` : text;
}

/**
 * Check if a command value is an idle notification that should be hidden.
 * Idle notifications are processed silently without showing to the user.
 */
function isIdleNotification(value: string): boolean {
  try {
    const parsed = jsonParse(value);
    return parsed?.type === 'idle_notification';
  } catch {
    return false;
  }
}

// Maximum number of task notification lines to show
const MAX_VISIBLE_NOTIFICATIONS = 3;

/**
 * Create a synthetic overflow notification message for capped task notifications.
 */
function createOverflowNotificationMessage(count: number): string {
  return `<${TASK_NOTIFICATION_TAG}>
<${SUMMARY_TAG}>+${count} more tasks completed</${SUMMARY_TAG}>
<${STATUS_TAG}>completed</${STATUS_TAG}>
</${TASK_NOTIFICATION_TAG}>`;
}

/**
 * Process queued commands to cap task notifications at MAX_VISIBLE_NOTIFICATIONS lines.
 * Other command types are always shown in full.
 * Idle notifications are filtered out entirely.
 */
function processQueuedCommands(queuedCommands: QueuedCommand[]): QueuedCommand[] {
  // Filter out idle notifications - they are processed silently
  const filteredCommands = queuedCommands.filter(
    cmd => typeof cmd.value !== 'string' || !isIdleNotification(cmd.value),
  );

  // Separate task notifications from other commands
  const taskNotifications = filteredCommands.filter(cmd => cmd.mode === 'task-notification');
  const otherCommands = filteredCommands.filter(cmd => cmd.mode !== 'task-notification');

  // If notifications fit within limit, return all commands as-is
  if (taskNotifications.length <= MAX_VISIBLE_NOTIFICATIONS) {
    return [...otherCommands, ...taskNotifications];
  }

  // Show first (MAX_VISIBLE_NOTIFICATIONS - 1) notifications, then a summary
  const visibleNotifications = taskNotifications.slice(0, MAX_VISIBLE_NOTIFICATIONS - 1);
  const overflowCount = taskNotifications.length - (MAX_VISIBLE_NOTIFICATIONS - 1);

  // Create synthetic overflow message
  const overflowCommand: QueuedCommand = {
    value: createOverflowNotificationMessage(overflowCount),
    mode: 'task-notification',
  };

  return [...otherCommands, ...visibleNotifications, overflowCommand];
}

function PromptInputQueuedCommandsImpl({ isLoading = false }: { isLoading?: boolean }): React.ReactNode {
  const queuedCommands = useCommandQueue();
  const viewingAgent = useAppState(s => !!s.viewingAgentTaskId);
  // Brief layout: dim queue items + skip the paddingX (brief messages
  // already indent themselves). Gate mirrors the brief-spinner/message
  // check elsewhere — no teammate-view override needed since this
  // component early-returns when viewing a teammate.
  const isBriefOnlyState = useAppState(s => s.isBriefOnly);
  const useBriefLayout = feature('KAIROS') || feature('KAIROS_BRIEF') ? isBriefOnlyState : false;

  // createUserMessage mints a fresh UUID per call; without memoization, streaming
  // re-renders defeat Message's areMessagePropsEqual (compares uuid) → flicker.
  const messages = useMemo(() => {
    if (queuedCommands.length === 0) return null;
    // task-notification is shown via useInboxNotification; most isMeta commands
    // (scheduled tasks, proactive ticks) are system-generated and hidden.
    // Channel messages are the exception — isMeta but shown so the keyboard
    // user sees what arrived.
    const visibleCommands = queuedCommands.filter(isQueuedCommandVisible);
    if (visibleCommands.length === 0) return null;
    const processedCommands = processQueuedCommands(visibleCommands);
    return normalizeMessages(
      processedCommands.map(cmd => {
        let content = cmd.value;
        if (cmd.mode === 'bash' && typeof content === 'string') {
          content = `<bash-input>${content}</bash-input>`;
        }
        // Cap the preview while Claude streams so a long queued message
        // can't grow the front frame over the streaming reply (see
        // truncateQueuedPreview). Non-string (block) content is rare and
        // already bounded by the message renderer.
        if (isLoading && typeof content === 'string') {
          content = truncateQueuedPreview(content);
        }
        // [Image #N] placeholders are inline in the text value (inserted at
        // paste time), so the queue preview shows them without stub blocks.
        return createUserMessage({ content });
      }),
    );
  }, [queuedCommands]);

  // Don't show leader's queued commands when viewing any agent's transcript
  if (viewingAgent || messages === null) {
    return null;
  }

  return (
    <Box marginTop={1} flexDirection="column">
      {messages.map((message, i) => (
        <QueuedMessageProvider key={i} isFirst={i === 0} useBriefLayout={useBriefLayout}>
          <Message
            message={message}
            lookups={EMPTY_LOOKUPS}
            addMargin={false}
            tools={[]}
            commands={[]}
            verbose={false}
            inProgressToolUseIDs={EMPTY_SET}
            progressMessagesForMessage={[]}
            shouldAnimate={false}
            shouldShowDot={false}
            isTranscriptMode={false}
            isStatic={true}
          />
        </QueuedMessageProvider>
      ))}
    </Box>
  );
}

export const PromptInputQueuedCommands = React.memo(PromptInputQueuedCommandsImpl);

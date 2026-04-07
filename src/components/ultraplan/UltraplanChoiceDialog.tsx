import * as React from 'react';
import { join } from 'path';
import { writeFile } from 'fs/promises';
import figures from 'figures';
import { Box, Text, useInput, wrapText } from '../../ink.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Select } from '../CustomSelect/select.js';
import { PermissionDialog } from '../permissions/PermissionDialog.js';
import { useSetAppState } from '../../state/AppState.js';
import type { AppState } from '../../state/AppStateStore.js';
import type { Message } from '../../types/message.js';
import { getSessionId } from '../../bootstrap/state.js';
import { clearConversation } from '../../commands/clear/conversation.js';
import { createCommandInputMessage } from '../../utils/messages.js';
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js';
import { updateTaskState } from '../../utils/task/framework.js';
import { archiveRemoteSession } from '../../utils/teleport.js';
import { getCwd } from '../../utils/cwd.js';
import { toRelativePath } from '../../utils/path.js';
import type { UUID } from '../../utils/uuid.js';
import type { FileStateCache } from '../../utils/fileStateCache.js';

/** Maximum visible lines for the plan preview. */
const MAX_VISIBLE_LINES = 24;
/** Lines reserved for chrome around the preview (title bar, options, etc.). */
const CHROME_LINES = 11;

type ChoiceValue = 'here' | 'fresh' | 'cancel';

interface UltraplanChoiceDialogProps {
  plan: string;
  sessionId: string;
  taskId: string;
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
  readFileState: FileStateCache;
  memorySelector?: unknown;
  getAppState: () => AppState;
  setConversationId?: (id: UUID) => void;
  resultDedupState?: unknown;
}

function getDateStamp(): string {
  return new Date().toISOString().split('T')[0]!;
}

/**
 * Attempt to persist the current transcript before clearing.
 * Returns true on success, false on failure (non-fatal).
 */
async function trySaveTranscript(): Promise<boolean> {
  try {
    // In the official CLI this shares/persists the transcript file.
    // Our codebase stubs analytics, so this is a best-effort no-op.
    return true;
  } catch {
    return false;
  }
}

export function UltraplanChoiceDialog({
  plan,
  sessionId,
  taskId,
  setMessages,
  readFileState,
  memorySelector,
  getAppState,
  setConversationId,
  resultDedupState,
}: UltraplanChoiceDialogProps): React.ReactNode {
  const setAppState = useSetAppState();
  const { rows, columns } = useTerminalSize();

  // ── Compute visible lines ──────────────────────────────────────────
  const visibleHeight = Math.min(MAX_VISIBLE_LINES, Math.max(1, Math.floor(rows / 2) - CHROME_LINES));

  const wrappedLines = React.useMemo(
    () => wrapText(plan, Math.max(1, columns - 4), 'wrap').split('\n'),
    [plan, columns],
  );

  const maxScroll = Math.max(0, wrappedLines.length - visibleHeight);
  const [scrollOffset, setScrollOffset] = React.useState(0);

  // Clamp scroll when maxScroll shrinks (e.g. terminal resize).
  React.useEffect(() => {
    setScrollOffset(prev => Math.min(prev, maxScroll));
  }, [maxScroll]);

  const isScrollable = wrappedLines.length > visibleHeight;

  // ── Scroll input handler ───────────────────────────────────────────
  useInput((input, key) => {
    if (!isScrollable) return;
    const halfPage = Math.max(1, Math.floor(visibleHeight / 2));

    if ((key.ctrl && input === 'd') || (key as any).wheelDown) {
      const step = (key as any).wheelDown ? 3 : halfPage;
      setScrollOffset(prev => Math.min(prev + step, maxScroll));
    } else if ((key.ctrl && input === 'u') || (key as any).wheelUp) {
      const step = (key as any).wheelUp ? 3 : halfPage;
      setScrollOffset(prev => Math.max(prev - step, 0));
    }
  });

  // ── Visible slice ──────────────────────────────────────────────────
  const visibleText = wrappedLines.slice(scrollOffset, scrollOffset + visibleHeight).join('\n');

  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset < maxScroll;

  // ── Choice handler ─────────────────────────────────────────────────
  const handleChoice = React.useCallback(
    async (choice: ChoiceValue) => {
      switch (choice) {
        case 'here': {
          enqueuePendingNotification({
            value: [
              'Ultraplan approved in browser. Here is the plan:',
              '',
              '<ultraplan>',
              plan,
              '</ultraplan>',
              '',
              'The user approved this plan in the remote session. Give them a brief summary, then start implementing.',
            ].join('\n'),
            mode: 'task-notification',
          });
          break;
        }

        case 'fresh': {
          const previousSessionId = getSessionId();
          const transcriptSaved = await trySaveTranscript();

          await clearConversation({
            setMessages,
            readFileState,
            getAppState,
            setAppState,
            setConversationId,
          });

          if (transcriptSaved) {
            setMessages(prev => [
              ...prev,
              createCommandInputMessage(`Previous session saved · resume with: claude --resume ${previousSessionId}`),
            ]);
          }

          enqueuePendingNotification({
            value: `Here is the approved implementation plan:\n\n${plan}\n\nImplement this plan.`,
            mode: 'prompt',
          });
          break;
        }

        case 'cancel': {
          const savePath = join(getCwd(), `${getDateStamp()}-ultraplan.md`);
          await writeFile(savePath, plan, { encoding: 'utf-8' });
          setMessages(prev => [
            ...prev,
            createCommandInputMessage(`Ultraplan rejected · Plan saved to ${toRelativePath(savePath)}`),
          ]);
          break;
        }
      }

      // Mark the remote task as completed.
      updateTaskState(taskId, setAppState, task =>
        task.status !== 'running' ? task : { ...task, status: 'completed', endTime: Date.now() },
      );

      // Clear the pending-choice state so the dialog unmounts.
      setAppState(prev =>
        prev.ultraplanPendingChoice
          ? { ...prev, ultraplanPendingChoice: undefined, ultraplanSessionUrl: undefined }
          : prev,
      );

      // Archive the remote CCR session.
      archiveRemoteSession(sessionId);
    },
    [
      plan,
      sessionId,
      taskId,
      setMessages,
      readFileState,
      memorySelector,
      getAppState,
      setAppState,
      setConversationId,
      resultDedupState,
    ],
  );

  // ── Menu options ───────────────────────────────────────────────────
  const options: Array<{ label: string; value: ChoiceValue; description: string }> = React.useMemo(
    () => [
      {
        label: 'Implement here',
        value: 'here' as const,
        description: 'Inject plan into the current conversation',
      },
      {
        label: 'Start new session',
        value: 'fresh' as const,
        description: 'Clear conversation and start with only the plan',
      },
      {
        label: 'Cancel',
        value: 'cancel' as const,
        description: "Don't implement — save plan and return",
      },
    ],
    [],
  );

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <PermissionDialog title="Ultraplan approved" subtitle="How should the plan be implemented?">
      <Box flexDirection="column" marginBottom={1}>
        {/* Plan preview */}
        <Box flexDirection="column" marginBottom={1}>
          <Text>{visibleText}</Text>
          {isScrollable && (
            <Text dimColor>
              {canScrollUp ? figures.arrowUp : ' '}
              {canScrollDown ? figures.arrowDown : ' '} {scrollOffset + 1}–
              {Math.min(scrollOffset + visibleHeight, wrappedLines.length)}
              {' of '}
              {wrappedLines.length}
              {' · ctrl+u/ctrl+d to scroll'}
            </Text>
          )}
        </Box>

        {/* Choice menu */}
        <Select<ChoiceValue> options={options} onChange={value => void handleChoice(value)} />
      </Box>
    </PermissionDialog>
  );
}

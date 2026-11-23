/**
 * Actions panel + confirm-stop dialog for the /tasks Background panel
 * (official 2.1.330, strings L937308).
 *
 * Selecting an item in the task list and pressing Enter opens the Actions
 * panel: a bold `Actions for {truncate(taskName, 16)}` title over the
 * condition-generated action list (`I9`: view / foreground / stop). The
 * stop action routes through the confirm-stop dialog when the task has a
 * stop method (official `nl`).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { type KeyboardEvent, Box, Text } from '@anthropic/ink';
import figures from 'figures';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink';
import {
  ACTION_LABELS,
  ACTIONS_VIEW_HINTS,
  CONFIRM_STOP_HINTS,
  getAvailableActions,
  truncateTaskName,
  type ListItem,
  type TaskAction,
} from './backgroundTasksList.js';

type TaskActionsPanelProps = {
  item: ListItem;
  onChoose: (action: TaskAction) => void;
  onBack: () => void;
};

function renderHints(hints: { shortcut: string; action: string }[]): React.ReactNode {
  return (
    <Byline>
      {hints.map(hint => (
        <KeyboardShortcutHint key={hint.shortcut + hint.action} shortcut={hint.shortcut} action={hint.action} />
      ))}
    </Byline>
  );
}

/**
 * The Actions list for the selected task-list item. ↑/↓ selects, Enter
 * chooses, Esc goes back (official: `Actions for {name}` + Select + esc
 * hint `go back`).
 */
export function TaskActionsPanel({ item, onChoose, onBack }: TaskActionsPanelProps): React.ReactNode {
  const actions = useMemo(() => getAvailableActions(item), [item]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    // New item → reset the cursor to the first action.
    setSelectedIndex(0);
  }, [item.id]);

  useEffect(() => {
    // The available set can change under the cursor (e.g. a task finishes
    // while the panel is open and "stop" disappears) — keep it in range.
    setSelectedIndex(prev => Math.min(prev, Math.max(0, actions.length - 1)));
  }, [actions.length]);

  useKeybindings(
    {
      'confirm:previous': () => setSelectedIndex(prev => Math.max(0, prev - 1)),
      'confirm:next': () => setSelectedIndex(prev => Math.min(actions.length - 1, prev + 1)),
      'confirm:yes': () => {
        const action = actions[selectedIndex];
        if (action) {
          onChoose(action);
        }
      },
    },
    { context: 'Confirmation', isActive: true },
  );

  return (
    <Dialog
      title={`Actions for ${truncateTaskName(item.label)}`}
      onCancel={onBack}
      color="background"
      inputGuide={() => renderHints(ACTIONS_VIEW_HINTS)}
    >
      <Box flexDirection="column">
        {actions.map((action, index) => (
          <Box key={action} flexDirection="row">
            <Text dimColor={index === selectedIndex}>{index === selectedIndex ? figures.pointer + ' ' : '  '}</Text>
            <Text color={index === selectedIndex ? 'suggestion' : undefined}>{ACTION_LABELS[action]}</Text>
          </Box>
        ))}
      </Box>
    </Dialog>
  );
}

type ConfirmStopDialogProps = {
  item: ListItem;
  onConfirm: () => void;
  onBack: () => void;
};

/**
 * The third view state (`confirmStop`): stopping a task that has a stop
 * method asks for confirmation first. Enter confirms the stop, Esc goes
 * back to where the stop was triggered from.
 */
export function ConfirmStopDialog({ item, onConfirm, onBack }: ConfirmStopDialogProps): React.ReactNode {
  useKeybindings(
    {
      'confirm:yes': onConfirm,
    },
    { context: 'Confirmation', isActive: true },
  );

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'left') {
      e.preventDefault();
      onBack();
    }
  };

  return (
    <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Dialog
        title="Stop task"
        subtitle={<Text dimColor>{truncateTaskName(item.label)}</Text>}
        onCancel={onBack}
        color="background"
        inputGuide={() => renderHints(CONFIRM_STOP_HINTS)}
      >
        <Text>Are you sure you want to stop this task?</Text>
      </Dialog>
    </Box>
  );
}

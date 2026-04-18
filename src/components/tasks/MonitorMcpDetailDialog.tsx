import React from 'react';
import type { DeepImmutable } from 'src/types/utils.js';
import { useElapsedTime } from '../../hooks/useElapsedTime.js';
import { Box, Text, type KeyboardEvent } from '@anthropic/ink';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import type { MonitorMcpTaskState } from '../../tasks/MonitorMcpTask/MonitorMcpTask.js';
import { Byline } from '../design-system/Byline.js';
import { Dialog } from '../design-system/Dialog.js';
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js';

type Props = {
  task: DeepImmutable<MonitorMcpTaskState>;
  onBack?: () => void;
  onKill?: () => void;
};

/**
 * Detail dialog for MCP monitor tasks shown in the Shift+Down background
 * tasks overlay. Displays the server name, resource URI, and current status.
 * Follows the DreamDetailDialog/ShellDetailDialog pattern.
 */
export function MonitorMcpDetailDialog({ task, onBack, onKill }: Props): React.ReactNode {
  const elapsedTime = useElapsedTime(task.startTime, task.status === 'running', 1000, 0);

  useKeybindings({}, { context: 'MonitorMcpDetail' });

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'left' && onBack) {
      e.preventDefault();
      onBack();
    } else if (e.key === 'x' && task.status === 'running' && onKill) {
      e.preventDefault();
      onKill();
    }
  };

  return (
    <Box flexDirection="column" tabIndex={0} borderStyle="round" onKeyDown={handleKeyDown}>
      <Dialog
        title="MCP Monitor"
        subtitle={
          <Text dimColor>
            {elapsedTime} · {task.serverName}:{task.resourceUri}
          </Text>
        }
        onCancel={onBack ?? (() => {})}
        inputGuide={() => (
          <Byline>
            {onBack && <KeyboardShortcutHint shortcut="←" action="go back" />}
            <KeyboardShortcutHint shortcut="Esc" action="close" />
            {task.status === 'running' && onKill && <KeyboardShortcutHint shortcut="x" action="stop" />}
          </Byline>
        )}
      >
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text bold>Status:</Text>{' '}
            {task.status === 'running' ? (
              <Text color="ansi:green">running</Text>
            ) : task.status === 'completed' ? (
              <Text color="ansi:green">{task.status}</Text>
            ) : (
              <Text color="ansi:red">{task.status}</Text>
            )}
          </Text>
          <Text>
            <Text bold>Description:</Text> {task.description}
          </Text>
          <Text>
            <Text bold>Server:</Text> {task.serverName}
          </Text>
          <Text>
            <Text bold>Resource:</Text> {task.resourceUri}
          </Text>
          {task.command && (
            <Text>
              <Text bold>Command:</Text> {task.command}
            </Text>
          )}
        </Box>
      </Dialog>
    </Box>
  );
}

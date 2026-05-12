import React, { useMemo } from 'react';
import type { DeepImmutable } from 'src/types/utils.js';
import { useElapsedTime } from '../../hooks/useElapsedTime.js';
import { type KeyboardEvent, Box, Text, useTheme } from '@anthropic/ink';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { getEmptyToolPermissionContext } from '../../Tool.js';
import type { InProcessTeammateTaskState } from '../../tasks/InProcessTeammateTask/types.js';
import { getTools } from '../../tools.js';
import { formatNumber, truncateToWidth } from '../../utils/format.js';

import { Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink';
import { toInkColor } from '../../utils/ink.js';
import { renderToolActivity } from './renderToolActivity.js';
import { describeTeammateActivity } from './taskStatusUtils.js';

type Props = {
  teammate: DeepImmutable<InProcessTeammateTaskState>;
  onDone: () => void;
  onKill?: () => void;
  onBack?: () => void;
  onForeground?: () => void;
};
export function InProcessTeammateDetailDialog({
  teammate,
  onDone,
  onKill,
  onBack,
  onForeground,
}: Props): React.ReactNode {
  const [theme] = useTheme();
  const tools = useMemo(() => getTools(getEmptyToolPermissionContext()), []);

  const elapsedTime = useElapsedTime(
    teammate.startTime,
    teammate.status === 'running',
    1000,
    teammate.totalPausedMs ?? 0,
  );

  // Restore confirm:yes (Enter/y) dismissal — Dialog handles confirm:no (Esc)
  useKeybindings(
    {
      'confirm:yes': onDone,
    },
    { context: 'Confirmation' },
  );

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault();
      onDone();
    } else if (e.key === 'left' && onBack) {
      e.preventDefault();
      onBack();
    } else if (e.key === 'x' && teammate.status === 'running' && onKill) {
      e.preventDefault();
      onKill();
    } else if (e.key === 'f' && teammate.status === 'running' && onForeground) {
      e.preventDefault();
      onForeground();
    }
  };

  const activity = describeTeammateActivity(teammate);

  const tokenCount = teammate.result?.totalTokens ?? teammate.progress?.tokenCount;
  const toolUseCount = teammate.result?.totalToolUseCount ?? teammate.progress?.toolUseCount;

  const displayPrompt = truncateToWidth(teammate.prompt, 300);

  const title = (
    <Text>
      <Text color={toInkColor(teammate.identity.color)}>@{teammate.identity.agentName}</Text>
      {activity && <Text dimColor> ({activity})</Text>}
    </Text>
  );

  const subtitle = (
    <Text>
      {teammate.status !== 'running' && (
        <Text color={teammate.status === 'completed' ? 'success' : teammate.status === 'killed' ? 'warning' : 'error'}>
          {teammate.status === 'completed' ? 'Completed' : teammate.status === 'failed' ? 'Failed' : 'Stopped'}
          {' · '}
        </Text>
      )}
      <Text dimColor>
        {elapsedTime}
        {tokenCount !== undefined && tokenCount > 0 && <> · {formatNumber(tokenCount)} tokens</>}
        {toolUseCount !== undefined && toolUseCount > 0 && (
          <>
            {' '}
            · {toolUseCount} {toolUseCount === 1 ? 'tool' : 'tools'}
          </>
        )}
      </Text>
    </Text>
  );

  return (
    <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Dialog
        title={title}
        subtitle={subtitle}
        onCancel={onDone}
        color="background"
        inputGuide={exitState =>
          exitState.pending ? (
            <Text>Press {exitState.keyName} again to exit</Text>
          ) : (
            <Byline>
              {onBack && <KeyboardShortcutHint shortcut="←" action="go back" />}
              <KeyboardShortcutHint shortcut="Esc/Enter/Space" action="close" />
              {teammate.status === 'running' && onKill && <KeyboardShortcutHint shortcut="x" action="stop" />}
              {teammate.status === 'running' && onForeground && (
                <KeyboardShortcutHint shortcut="f" action="foreground" />
              )}
            </Byline>
          )
        }
      >
        {/* Recent activities for running teammates */}
        {teammate.status === 'running' &&
          teammate.progress?.recentActivities &&
          teammate.progress.recentActivities.length > 0 && (
            <Box flexDirection="column">
              <Text bold dimColor>
                Progress
              </Text>
              {teammate.progress.recentActivities.map((activity, i) => (
                <Text key={i} dimColor={i < teammate.progress!.recentActivities!.length - 1} wrap="truncate-end">
                  {i === teammate.progress!.recentActivities!.length - 1 ? '› ' : '  '}
                  {renderToolActivity(activity, tools, theme)}
                </Text>
              ))}
            </Box>
          )}

        {/* Prompt section */}
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            Prompt
          </Text>
          <Text wrap="wrap">{displayPrompt}</Text>
        </Box>

        {/* Error details if failed */}
        {teammate.status === 'failed' && teammate.error && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="error">
              Error
            </Text>
            <Text color="error" wrap="wrap">
              {teammate.error}
            </Text>
          </Box>
        )}
      </Dialog>
    </Box>
  );
}

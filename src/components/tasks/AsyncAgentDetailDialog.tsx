import React, { useMemo } from 'react';
import type { DeepImmutable } from 'src/types/utils.js';
import { useElapsedTime } from '../../hooks/useElapsedTime.js';
import { type KeyboardEvent, Box, Text, useTheme } from '@anthropic/ink';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { getEmptyToolPermissionContext } from '../../Tool.js';
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import { getTools } from '../../tools.js';
import { formatNumber } from '../../utils/format.js';
import { extractTag } from '../../utils/messages.js';
import { Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink';
import { UserPlanMessage } from '../messages/UserPlanMessage.js';
import { renderToolActivity } from './renderToolActivity.js';
import { getTaskStatusColor, getTaskStatusIcon } from './taskStatusUtils.js';

type Props = {
  agent: DeepImmutable<LocalAgentTaskState>;
  onDone: () => void;
  onKillAgent?: () => void;
  onBack?: () => void;
};

export function AsyncAgentDetailDialog({ agent, onDone, onKillAgent, onBack }: Props): React.ReactNode {
  const [theme] = useTheme();

  // Get tools for rendering activity messages
  const tools = useMemo(() => getTools(getEmptyToolPermissionContext()), []);

  const elapsedTime = useElapsedTime(agent.startTime, agent.status === 'running', 1000, agent.totalPausedMs ?? 0);

  // Restore confirm:yes (Enter/y) dismissal — Dialog handles confirm:no (Esc)
  // internally but does NOT auto-wire confirm:yes.
  useKeybindings(
    {
      'confirm:yes': onDone,
    },
    { context: 'Confirmation' },
  );

  // Component-specific shortcuts shown in UI hints (x=stop) and
  // navigation keys (space=dismiss, left=back). These are context-dependent
  // actions tied to agent state, not standard dialog keybindings.
  // Note: Dialog component already handles ESC via confirm:no keybinding;
  // confirm:yes (Enter/y) is handled by useKeybindings above.
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault();
      onDone();
    } else if (e.key === 'left' && onBack) {
      e.preventDefault();
      onBack();
    } else if (e.key === 'x' && agent.status === 'running' && onKillAgent) {
      e.preventDefault();
      onKillAgent();
    }
  };

  // Extract plan from prompt - if present, we show the plan instead of the prompt
  const planContent = extractTag(agent.prompt, 'plan');

  const displayPrompt = agent.prompt.length > 300 ? agent.prompt.substring(0, 297) + '…' : agent.prompt;

  // Get tokens and tool uses (from result if completed, otherwise from progress)
  const tokenCount = agent.result?.totalTokens ?? agent.progress?.tokenCount;
  const toolUseCount = agent.result?.totalToolUseCount ?? agent.progress?.toolUseCount;

  const title = (
    <Text>
      {agent.selectedAgent?.agentType ?? 'agent'} › {agent.description || 'Async agent'}
    </Text>
  );

  // Build subtitle with status and stats
  const subtitle = (
    <Text>
      {agent.status !== 'running' && (
        <Text color={getTaskStatusColor(agent.status)}>
          {getTaskStatusIcon(agent.status)}{' '}
          {agent.status === 'completed' ? 'Completed' : agent.status === 'failed' ? 'Failed' : 'Stopped'}
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
              {agent.status === 'running' && onKillAgent && <KeyboardShortcutHint shortcut="x" action="stop" />}
            </Byline>
          )
        }
      >
        <Box flexDirection="column">
          {/* Recent activities for running agents */}
          {agent.status === 'running' &&
            agent.progress?.recentActivities &&
            agent.progress.recentActivities.length > 0 && (
              <Box flexDirection="column">
                <Text bold dimColor>
                  Progress
                </Text>
                {agent.progress.recentActivities.map((activity, i) => (
                  <Text key={i} dimColor={i < agent.progress!.recentActivities!.length - 1} wrap="truncate-end">
                    {i === agent.progress!.recentActivities!.length - 1 ? '› ' : '  '}
                    {renderToolActivity(activity, tools, theme)}
                  </Text>
                ))}
              </Box>
            )}

          {/* Plan section (if present) - shown instead of prompt */}
          {planContent ? (
            <Box marginTop={1}>
              <UserPlanMessage addMargin={false} planContent={planContent} />
            </Box>
          ) : (
            /* Prompt section - only shown when no plan */
            <Box flexDirection="column" marginTop={1}>
              <Text bold dimColor>
                Prompt
              </Text>
              <Text wrap="wrap">{displayPrompt}</Text>
            </Box>
          )}

          {/* Error details if failed */}
          {agent.status === 'failed' && agent.error && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="error">
                Error
              </Text>
              <Text color="error" wrap="wrap">
                {agent.error}
              </Text>
            </Box>
          )}
        </Box>
      </Dialog>
    </Box>
  );
}

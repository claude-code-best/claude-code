import * as React from 'react';
import { Box, Text, KeyboardShortcutHint } from '@anthropic/ink';
import { toInkColor } from '../utils/ink.js';
import { useAppState } from '../state/AppState.js';
import { getViewedTeammateTask } from '../state/selectors.js';

import { OffscreenFreeze } from './OffscreenFreeze.js';

// Inline type check instead of importing isLocalAgentTask — keeps this leaf
// header component off LocalAgentTask's runtime import graph (same pattern
// as teammateViewHelpers.ts).
type ViewedLocalAgent = {
  type: 'local_agent';
  agentType: string;
  description: string;
};

function isLocalAgent(task: unknown): task is ViewedLocalAgent {
  return typeof task === 'object' && task !== null && 'type' in task && task.type === 'local_agent';
}

/**
 * Header shown when viewing a teammate's or background agent's transcript.
 * Displays the agent name (colored for teammates), and for background agents
 * the task description on the right of the title bar (official 2.1.330, m60:
 * title bar right side = agent task name, e.g. "500-word essay on
 * mountains"), plus the exit hint.
 */
export function TeammateViewHeader(): React.ReactNode {
  const viewedTeammate = useAppState(s => getViewedTeammateTask(s));
  // agent (Agent-tool task) being viewed. Selects the existing
  // task object reference (allowed by the useAppState selector rules) —
  // agentType/description are static per task.
  const viewedLocalAgent = useAppState(s =>
    s.viewingAgentTaskId && !viewedTeammate ? s.tasks[s.viewingAgentTaskId] : undefined,
  );

  if (viewedTeammate) {
    const nameColor = toInkColor(viewedTeammate.identity.color);
    return (
      <OffscreenFreeze>
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text>Viewing </Text>
            <Text color={nameColor} bold>
              @{viewedTeammate.identity.agentName}
            </Text>
            <Text dimColor>
              {' · '}
              <KeyboardShortcutHint shortcut="esc" action="return" />
            </Text>
          </Box>
          <Text dimColor>{viewedTeammate.prompt}</Text>
        </Box>
      </OffscreenFreeze>
    );
  }

  if (!isLocalAgent(viewedLocalAgent)) {
    return null;
  }

  return (
    <OffscreenFreeze>
      <Box flexDirection="row" justifyContent="space-between" width="100%" marginBottom={1}>
        <Box flexShrink={0}>
          <Text>
            Viewing <Text bold>@{viewedLocalAgent.agentType}</Text>
          </Text>
          <Text dimColor>
            {' · '}
            <KeyboardShortcutHint shortcut="esc" action="return" />
          </Text>
        </Box>
        <Text dimColor wrap="truncate-end">
          {viewedLocalAgent.description}
        </Text>
      </Box>
    </OffscreenFreeze>
  );
}

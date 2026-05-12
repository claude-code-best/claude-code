import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { getAgentName, getTeammateColor, getTeamName } from '../../utils/teammate.js';
import { Spinner } from '../Spinner.js';
import { WorkerBadge } from './WorkerBadge.js';

type Props = {
  toolName: string;
  description: string;
};

/**
 * Visual indicator shown on workers while waiting for leader to approve a permission request.
 * Displays the pending tool with a spinner and information about what's being requested.
 */
export function WorkerPendingPermission({ toolName, description }: Props): React.ReactNode {
  const teamName = getTeamName();
  const agentName = getAgentName();
  const agentColor = getTeammateColor();

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
      <Box marginBottom={1}>
        <Spinner />
        <Text color="warning" bold>
          {' '}
          Waiting for team lead approval
        </Text>
      </Box>

      {agentName && agentColor && (
        <Box marginBottom={1}>
          <WorkerBadge name={agentName} color={agentColor} />
        </Box>
      )}

      <Box>
        <Text dimColor>Tool: </Text>
        <Text>{toolName}</Text>
      </Box>

      <Box>
        <Text dimColor>Action: </Text>
        <Text>{description}</Text>
      </Box>

      {teamName && (
        <Box marginTop={1}>
          <Text dimColor>
            Permission request sent to team {'"'}
            {teamName}
            {'"'} leader
          </Text>
        </Box>
      )}
    </Box>
  );
}

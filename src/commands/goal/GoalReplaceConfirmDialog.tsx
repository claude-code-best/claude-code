/**
 * Confirmation dialog shown when the user runs `/goal <objective>`
 * while a non-complete goal is already active.
 */
import * as React from 'react';

import { Box, Text } from '@anthropic/ink';

import type { GoalState } from 'src/types/logs.js';
import { Select } from 'src/components/CustomSelect/index.js';
import { PermissionDialog } from 'src/components/permissions/PermissionDialog.js';
import { formatGoalElapsed, formatGoalStatusLabel } from 'src/services/goal/goalState.js';

type Props = {
  currentGoal: GoalState;
  newObjective: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function GoalReplaceConfirmDialog({ currentGoal, newObjective, onConfirm, onCancel }: Props): React.ReactNode {
  function handleResponse(value: 'yes' | 'no'): void {
    if (value === 'yes') onConfirm();
    else onCancel();
  }

  const tokensDisplay =
    currentGoal.tokenBudget !== null
      ? `${currentGoal.tokensUsed} / ${currentGoal.tokenBudget}`
      : `${currentGoal.tokensUsed}`;

  return (
    <PermissionDialog color="warning" title="Replace active goal?">
      <Box flexDirection="column" marginTop={1} paddingX={1}>
        <Text>A goal is already in progress. Replacing it will reset all progress and counters.</Text>

        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Current goal:</Text>
          <Text>
            <Text dimColor>· Objective: </Text>
            {currentGoal.objective}
          </Text>
          <Text>
            <Text dimColor>· Status: </Text>
            {formatGoalStatusLabel(currentGoal.status)}
          </Text>
          <Text>
            <Text dimColor>· Time: </Text>
            {formatGoalElapsed(currentGoal)}
          </Text>
          <Text>
            <Text dimColor>· Tokens: </Text>
            {tokensDisplay}
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text dimColor>New objective:</Text>
          <Text>{newObjective}</Text>
        </Box>

        <Box marginTop={1}>
          <Select
            options={[
              { label: 'Yes, replace the goal', value: 'yes' as const },
              { label: 'No, keep the current goal', value: 'no' as const },
            ]}
            onChange={handleResponse}
            onCancel={onCancel}
          />
        </Box>
      </Box>
    </PermissionDialog>
  );
}

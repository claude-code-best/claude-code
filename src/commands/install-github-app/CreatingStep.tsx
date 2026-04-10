import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Workflow } from './types.js';

interface CreatingStepProps {
  currentWorkflowInstallStep: number;
  secretExists: boolean;
  useExistingSecret: boolean;
  secretName: string;
  skipWorkflow?: boolean;
  selectedWorkflows: Workflow[];
}

export function CreatingStep({
  currentWorkflowInstallStep,
  secretExists,
  useExistingSecret,
  secretName,
  skipWorkflow = false,
  selectedWorkflows,
}: CreatingStepProps) {
  const progressSteps = skipWorkflow
    ? [
        'Getting repository information',
        secretExists && useExistingSecret ? 'Using existing API key secret' : `Setting up ${secretName} secret`,
      ]
    : [
        'Getting repository information',
        'Creating branch',
        selectedWorkflows.length > 1 ? 'Creating workflow files' : 'Creating workflow file',
        secretExists && useExistingSecret ? 'Using existing API key secret' : `Setting up ${secretName} secret`,
        'Opening pull request page',
      ];

  return (
    <>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Install GitHub App</Text>
          <Text dimColor>Create GitHub Actions workflow</Text>
        </Box>
        {progressSteps.map((stepText, index) => {
          let status: 'completed' | 'in-progress' | 'pending' = 'pending';

          if (index < currentWorkflowInstallStep) {
            status = 'completed';
          } else if (index === currentWorkflowInstallStep) {
            status = 'in-progress';
          }

          return (
            <Box key={index}>
              <Text color={status === 'completed' ? 'success' : status === 'in-progress' ? 'warning' : undefined}>
                {status === 'completed' ? '✓ ' : ''}
                {stepText}
                {status === 'in-progress' ? '…' : ''}
              </Text>
            </Box>
          );
        })}
      </Box>
    </>
  );
}

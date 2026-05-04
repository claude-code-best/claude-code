import React, { useCallback, useState } from 'react';
import type { Workflow } from '../commands/install-github-app/types.js';
import type { ExitState } from '../hooks/useExitOnCtrlCDWithKeybindings.js';
import { Box, Link, Text, Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink';
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js';
import { SelectMulti } from './CustomSelect/SelectMulti.js';

type WorkflowOption = {
  value: Workflow;
  label: string;
};

type Props = {
  onSubmit: (selectedWorkflows: Workflow[]) => void;
  defaultSelections: Workflow[];
};

const WORKFLOWS: WorkflowOption[] = [
  {
    value: 'claude' as const,
    label: '@Claude Code - Tag @claude in issues and PR comments',
  },
  {
    value: 'claude-review' as const,
    label: 'Claude Code Review - Automated code review on new PRs',
  },
];

function renderInputGuide(exitState: ExitState): React.ReactNode {
  if (exitState.pending) {
    return <Text>Press {exitState.keyName} again to exit</Text>;
  }
  return (
    <Byline>
      <KeyboardShortcutHint shortcut="↑↓" action="navigate" />
      <KeyboardShortcutHint shortcut="Space" action="toggle" />
      <KeyboardShortcutHint shortcut="Enter" action="confirm" />
      <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="cancel" />
    </Byline>
  );
}

export function WorkflowMultiselectDialog({ onSubmit, defaultSelections }: Props): React.ReactNode {
  const [showError, setShowError] = useState(false);

  const handleSubmit = useCallback(
    (selectedValues: Workflow[]) => {
      if (selectedValues.length === 0) {
        setShowError(true);
        return;
      }
      setShowError(false);
      onSubmit(selectedValues);
    },
    [onSubmit],
  );

  const handleChange = useCallback(() => {
    setShowError(false);
  }, []);

  // Cancel just shows the error - user must select at least one workflow
  const handleCancel = useCallback(() => {
    setShowError(true);
  }, []);

  return (
    <Dialog
      title="Select GitHub workflows to install"
      subtitle="We'll create a workflow file in your repository for each one you select."
      onCancel={handleCancel}
      inputGuide={renderInputGuide}
    >
      <Box>
        <Text dimColor>
          More workflow examples (issue triage, CI fixes, etc.) at:{' '}
          <Link url="https://github.com/anthropics/claude-code-action/blob/main/examples/">
            https://github.com/anthropics/claude-code-action/blob/main/examples/
          </Link>
        </Text>
      </Box>

      <SelectMulti
        options={WORKFLOWS.map(workflow => ({
          label: workflow.label,
          value: workflow.value,
        }))}
        defaultValue={defaultSelections}
        onSubmit={handleSubmit}
        onChange={handleChange}
        onCancel={handleCancel}
        hideIndexes
      />

      {showError && (
        <Box>
          <Text color="error">You must select at least one workflow to continue</Text>
        </Box>
      )}
    </Dialog>
  );
}

import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import type { PromptRequest } from '../../types/hooks.js';
import { Select } from '../CustomSelect/select.js';
import { PermissionDialog } from '../permissions/PermissionDialog.js';

type Props = {
  title: string;
  toolInputSummary?: string | null;
  request: PromptRequest;
  onRespond: (key: string) => void;
  onAbort: () => void;
};

export function PromptDialog({ title, toolInputSummary, request, onRespond, onAbort }: Props): React.ReactNode {
  useKeybinding('app:interrupt', onAbort, { isActive: true });

  const options = request.options.map(opt => ({
    label: opt.label,
    value: opt.key,
    description: opt.description,
  }));

  return (
    <PermissionDialog
      title={title}
      subtitle={request.message}
      titleRight={toolInputSummary ? <Text dimColor>{toolInputSummary}</Text> : undefined}
    >
      <Box flexDirection="column" paddingY={1}>
        <Select
          options={options}
          onChange={value => {
            onRespond(value);
          }}
        />
      </Box>
    </PermissionDialog>
  );
}

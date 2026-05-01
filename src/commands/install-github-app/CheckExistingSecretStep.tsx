import React, { useCallback, useState } from 'react';
import TextInput from '../../components/TextInput.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, color, Text, useTheme } from '@anthropic/ink';
import { useKeybindings } from '../../keybindings/useKeybinding.js';

interface CheckExistingSecretStepProps {
  useExistingSecret: boolean;
  secretName: string;
  onToggleUseExistingSecret: (useExisting: boolean) => void;
  onSecretNameChange: (value: string) => void;
  onSubmit: () => void;
}

export function CheckExistingSecretStep({
  useExistingSecret,
  secretName,
  onToggleUseExistingSecret,
  onSecretNameChange,
  onSubmit,
}: CheckExistingSecretStepProps) {
  const [cursorOffset, setCursorOffset] = useState(0);
  const terminalSize = useTerminalSize();
  const [theme] = useTheme();

  // When the text input is visible, omit confirm:yes so bare 'y' passes
  // through to the input instead of submitting. TextInput's onSubmit handles
  // Enter. Keep the Confirmation context (not Settings) to avoid j/k bindings.
  const handlePrevious = useCallback(() => onToggleUseExistingSecret(true), [onToggleUseExistingSecret]);
  const handleNext = useCallback(() => onToggleUseExistingSecret(false), [onToggleUseExistingSecret]);
  useKeybindings(
    {
      'confirm:previous': handlePrevious,
      'confirm:next': handleNext,
      'confirm:yes': onSubmit,
    },
    { context: 'Confirmation', isActive: useExistingSecret },
  );
  useKeybindings(
    {
      'confirm:previous': handlePrevious,
      'confirm:next': handleNext,
    },
    { context: 'Confirmation', isActive: !useExistingSecret },
  );

  return (
    <>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Install GitHub App</Text>
          <Text dimColor>Setup API key secret</Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="warning">ANTHROPIC_API_KEY already exists in repository secrets!</Text>
        </Box>
        <Box marginBottom={1}>
          <Text>Would you like to:</Text>
        </Box>
        <Box marginBottom={1}>
          <Text>
            {useExistingSecret ? color('success', theme)('> ') : '  '}
            Use the existing API key
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text>
            {!useExistingSecret ? color('success', theme)('> ') : '  '}
            Create a new secret with a different name
          </Text>
        </Box>
        {!useExistingSecret && (
          <>
            <Box marginBottom={1}>
              <Text>Enter new secret name (alphanumeric with underscores):</Text>
            </Box>
            <TextInput
              value={secretName}
              onChange={onSecretNameChange}
              onSubmit={onSubmit}
              focus={true}
              placeholder="e.g., CLAUDE_API_KEY"
              columns={terminalSize.columns}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
              showCursor={true}
            />
          </>
        )}
      </Box>
      <Box marginLeft={3}>
        <Text dimColor>↑/↓ to select · Enter to continue</Text>
      </Box>
    </>
  );
}

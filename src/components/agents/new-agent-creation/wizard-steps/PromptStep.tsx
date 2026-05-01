import React, { type ReactNode, useCallback, useState } from 'react';
import { Box, Byline, KeyboardShortcutHint, Text } from '@anthropic/ink';
import { useKeybinding } from '../../../../keybindings/useKeybinding.js';
import { editPromptInEditor } from '../../../../utils/promptEditor.js';
import { ConfigurableShortcutHint } from '../../../ConfigurableShortcutHint.js';
import TextInput from '../../../TextInput.js';
import { useWizard } from '../../../wizard/index.js';
import { WizardDialogLayout } from '../../../wizard/WizardDialogLayout.js';
import type { AgentWizardData } from '../types.js';

export function PromptStep(): ReactNode {
  const { goNext, goBack, updateWizardData, wizardData } = useWizard<AgentWizardData>();
  const [systemPrompt, setSystemPrompt] = useState(wizardData.systemPrompt || '');
  const [cursorOffset, setCursorOffset] = useState(systemPrompt.length);
  const [error, setError] = useState<string | null>(null);

  // Handle escape key - use Settings context so 'n' key doesn't cancel (allows typing 'n' in input)
  useKeybinding('confirm:no', goBack, { context: 'Settings' });

  const handleExternalEditor = useCallback(async () => {
    const result = await editPromptInEditor(systemPrompt);
    if (result.content !== null) {
      setSystemPrompt(result.content);
      setCursorOffset(result.content.length);
    }
  }, [systemPrompt]);

  useKeybinding('chat:externalEditor', handleExternalEditor, {
    context: 'Chat',
  });

  const handleSubmit = (): void => {
    const trimmedPrompt = systemPrompt.trim();
    if (!trimmedPrompt) {
      setError('System prompt is required');
      return;
    }

    setError(null);
    updateWizardData({ systemPrompt: trimmedPrompt });
    goNext();
  };

  return (
    <WizardDialogLayout
      subtitle="System prompt"
      footerText={
        <Byline>
          <KeyboardShortcutHint shortcut="Type" action="enter text" />
          <KeyboardShortcutHint shortcut="Enter" action="continue" />
          <ConfigurableShortcutHint
            action="chat:externalEditor"
            context="Chat"
            fallback="ctrl+g"
            description="open in editor"
          />
          <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description="go back" />
        </Byline>
      }
    >
      <Box flexDirection="column">
        <Text>Enter the system prompt for your agent:</Text>
        <Text dimColor>Be comprehensive for best results</Text>

        <Box marginTop={1}>
          <TextInput
            value={systemPrompt}
            onChange={setSystemPrompt}
            onSubmit={handleSubmit}
            placeholder="You are a helpful code reviewer who..."
            columns={80}
            cursorOffset={cursorOffset}
            onChangeCursorOffset={setCursorOffset}
            focus
            showCursor
          />
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text color="error">{error}</Text>
          </Box>
        )}
      </Box>
    </WizardDialogLayout>
  );
}

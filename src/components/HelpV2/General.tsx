import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { PromptInputHelpMenu } from '../PromptInput/PromptInputHelpMenu.js';

export function General(): React.ReactNode {
  return (
    <Box flexDirection="column" paddingY={1} gap={1}>
      <Box flexDirection="column" gap={1}>
        <Text bold>Getting started</Text>
        <Box flexDirection="column">
          <Text>
            <Text bold>1. </Text>
            <Text>Ask a question or describe a task — Claude will explore your code and respond.</Text>
          </Text>
          <Text>
            <Text bold>2. </Text>
            <Text>When Claude wants to edit files or run commands, you review and approve each action.</Text>
          </Text>
          <Text>
            <Text bold>3. </Text>
            <Text>Type </Text>
            <Text bold>/commit</Text>
            <Text> to commit changes, </Text>
            <Text bold>/help</Text>
            <Text> for commands, or </Text>
            <Text bold>?</Text>
            <Text> for shortcuts.</Text>
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column">
        <Box>
          <Text bold>Shortcuts</Text>
        </Box>
        <PromptInputHelpMenu gap={2} fixedWidth={true} />
      </Box>
    </Box>
  );
}

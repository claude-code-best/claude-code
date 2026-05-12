import * as React from 'react';
import { FLAG_ICON } from '../../constants/figures.js';
import { Box, Text } from '@anthropic/ink';

/**
 * ANT-ONLY: Banner shown in the transcript that prompts users to report
 * issues via /issue. Appears when friction is detected in the conversation.
 */
export function IssueFlagBanner(): React.ReactNode {
  if (process.env.USER_TYPE !== 'ant') {
    return null;
  }

  return (
    <Box flexDirection="row" marginTop={1} width="100%">
      <Box minWidth={2}>
        <Text color="warning">{FLAG_ICON}</Text>
      </Box>
      <Text>
        <Text dimColor>[ANT-ONLY] </Text>
        <Text color="warning" bold>
          Something off with Claude?
        </Text>
        <Text dimColor> /issue to report it</Text>
      </Text>
    </Box>
  );
}

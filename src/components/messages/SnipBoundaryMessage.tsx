/**
 * SnipBoundaryMessage — visual separator showing where conversation was snipped.
 */
import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Message } from '../../types/message.js';

type Props = {
  message: Message;
};

export function SnipBoundaryMessage({ message }: Props): React.ReactNode {
  const content =
    typeof (message as Record<string, unknown>).content === 'string'
      ? ((message as Record<string, unknown>).content as string)
      : '[snip] Conversation history before this point has been snipped.';

  return (
    <Box marginTop={1} marginBottom={1}>
      <Text dimColor>── {content} ──</Text>
    </Box>
  );
}

import * as React from 'react';
import { Box, Text } from '@anthropic/ink';

export type ClawdPose = 'default' | 'arms-up' | 'look-left' | 'look-right';

type Props = {
  pose?: ClawdPose;
};

// CoStrict ASCII art 大字标志，两行块字符风格：
// █▀▀ █▀█ █▀ ▀█▀ █▀█ █ █▀▀ ▀█▀
// █▄▄ █▄█ ▄█  █  █▀▄ █ █▄▄  █

export function Clawd({ pose = 'default' }: Props = {}): React.ReactNode {
  return (
    <Box flexDirection="column" alignItems="center">
      <Text color="claudeBlue_FOR_SYSTEM_SPINNER">{'█▀▀ █▀█ █▀ ▀█▀ █▀█ █ █▀▀ ▀█▀'}</Text>
      <Text color="claudeBlue_FOR_SYSTEM_SPINNER">{'█▄▄ █▄█ ▄█  █  █▀▄ █ █▄▄  █ '}</Text>
    </Box>
  );
}

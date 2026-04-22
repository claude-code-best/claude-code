/**
 * UserForkBoilerplateMessage — render the fork/subagent boilerplate directive.
 */
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { extractTag } from '../../utils/messages.js';

type Props = {
  addMargin: boolean;
  param: TextBlockParam;
};

export function UserForkBoilerplateMessage({ param, addMargin }: Props): React.ReactNode {
  const text = param.text;
  const extracted = extractTag(text, 'fork-boilerplate');
  if (!extracted) {
    return null;
  }

  const firstLine = extracted.trim().split('\n')[0] ?? '';
  const preview = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;

  return (
    <Box flexDirection="row" marginTop={addMargin ? 1 : 0}>
      <Text dimColor>[fork] </Text>
      <Text>{preview}</Text>
    </Box>
  );
}

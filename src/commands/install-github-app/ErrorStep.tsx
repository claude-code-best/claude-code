import React from 'react';
import { GITHUB_ACTION_SETUP_DOCS_URL } from '../../constants/github-app.js';
import { Box, Text } from '@anthropic/ink';

interface ErrorStepProps {
  error: string | undefined;
  errorReason?: string;
  errorInstructions?: string[];
}

export function ErrorStep({ error, errorReason, errorInstructions }: ErrorStepProps) {
  return (
    <>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>安装 GitHub 应用</Text>
        </Box>
        <Text color="error">Error: {error}</Text>
        {errorReason && (
          <Box marginTop={1}>
            <Text dimColor>Reason: {errorReason}</Text>
          </Box>
        )}
        {errorInstructions && errorInstructions.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>如何修复：</Text>
            {errorInstructions.map((instruction, index) => (
              <Box key={index} marginLeft={2}>
                <Text dimColor>• </Text>
                <Text>{instruction}</Text>
              </Box>
            ))}
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>
            For manual setup instructions, see: <Text color="claude">{GITHUB_ACTION_SETUP_DOCS_URL}</Text>
          </Text>
        </Box>
      </Box>
      <Box marginLeft={3}>
        <Text dimColor>按任意键退出</Text>
      </Box>
    </>
  );
}

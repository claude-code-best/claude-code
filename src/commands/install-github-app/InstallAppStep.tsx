import figures from 'figures';
import React from 'react';
import { GITHUB_ACTION_SETUP_DOCS_URL } from '../../constants/github-app.js';
import { Box, Text } from '@anthropic/ink';
import { useKeybinding } from '../../keybindings/useKeybinding.js';

interface InstallAppStepProps {
  repoUrl: string;
  onSubmit: () => void;
}

export function InstallAppStep({ repoUrl, onSubmit }: InstallAppStepProps) {
  // Enter to submit
  useKeybinding('confirm:yes', onSubmit, { context: 'Confirmation' });

  return (
    <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>安装 Claude GitHub 应用</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>正在打开浏览器以安装 Claude GitHub 应用…</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>如果浏览器没有自动打开，请访问：</Text>
      </Box>
      <Box marginBottom={1}>
        <Text underline>https://github.com/apps/claude</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>
          请为以下仓库安装应用：<Text bold>{repoUrl}</Text>
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Important: Make sure to grant access to this specific repository</Text>
      </Box>
      <Box>
        <Text bold color="permission">
          安装应用后，请按 Enter 键{figures.ellipsis}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Having trouble? See manual setup instructions at: <Text color="claude">{GITHUB_ACTION_SETUP_DOCS_URL}</Text>
        </Text>
      </Box>
    </Box>
  );
}

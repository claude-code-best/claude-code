import React from 'react';
import { envDynamic } from 'src/utils/envDynamic.js';
import { Box, Text } from '@anthropic/ink';
import { useKeybindings } from '../keybindings/useKeybinding.js';
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js';
import { env } from '../utils/env.js';
import {
  getTerminalIdeType,
  type IDEExtensionInstallationStatus,
  isJetBrainsIde,
  toIDEDisplayName,
} from '../utils/ide.js';
import { Dialog } from '@anthropic/ink';

interface Props {
  onDone: () => void;
  installationStatus: IDEExtensionInstallationStatus | null;
}

export function IdeOnboardingDialog({ onDone, installationStatus }: Props): React.ReactNode {
  markDialogAsShown();

  // Handle Enter/Escape to dismiss
  useKeybindings(
    {
      'confirm:yes': onDone,
      'confirm:no': onDone,
    },
    { context: 'Confirmation' },
  );

  const ideType = installationStatus?.ideType ?? getTerminalIdeType();
  const isJetBrains = isJetBrainsIde(ideType);

  const ideName = toIDEDisplayName(ideType);
  const installedVersion = installationStatus?.installedVersion;
  const pluginOrExtension = isJetBrains ? 'plugin' : 'extension';
  const mentionShortcut = env.platform === 'darwin' ? 'Cmd+Option+K' : 'Ctrl+Alt+K';

  return (
    <>
      <Dialog
        title={
          <>
            <Text color="claude">✻ </Text>
            <Text>Welcome to Claude Code for {ideName}</Text>
          </>
        }
        subtitle={installedVersion ? `installed ${pluginOrExtension} v${installedVersion}` : undefined}
        color="ide"
        onCancel={onDone}
        hideInputGuide
      >
        <Box flexDirection="column" gap={1}>
          <Text>
            • Claude has context of <Text color="suggestion">⧉ open files</Text> and{' '}
            <Text color="suggestion">⧉ selected lines</Text>
          </Text>
          <Text>
            • Review Claude Code&apos;s changes <Text color="diffAddedWord">+11</Text>{' '}
            <Text color="diffRemovedWord">-22</Text> in the comfort of your IDE
          </Text>
          <Text>
            • Cmd+Esc<Text dimColor> for Quick Launch</Text>
          </Text>
          <Text>
            • {mentionShortcut}
            <Text dimColor> to reference files or lines in your input</Text>
          </Text>
        </Box>
      </Dialog>
      <Box paddingX={1}>
        <Text dimColor italic>
          Press Enter to continue
        </Text>
      </Box>
    </>
  );
}

export function hasIdeOnboardingDialogBeenShown(): boolean {
  const config = getGlobalConfig();
  const terminal = envDynamic.terminal || 'unknown';
  return config.hasIdeOnboardingBeenShown?.[terminal] === true;
}

function markDialogAsShown(): void {
  if (hasIdeOnboardingDialogBeenShown()) {
    return;
  }
  const terminal = envDynamic.terminal || 'unknown';
  saveGlobalConfig(current => ({
    ...current,
    hasIdeOnboardingBeenShown: {
      ...current.hasIdeOnboardingBeenShown,
      [terminal]: true,
    },
  }));
}

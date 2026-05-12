import { toString as qrToString } from 'qrcode';
import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Pane } from '@anthropic/ink';
import { type KeyboardEvent, Box, Text } from '@anthropic/ink';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';

type Platform = 'ios' | 'android';

type Props = {
  onDone: () => void;
};

const PLATFORMS: Record<Platform, { url: string }> = {
  ios: {
    url: 'https://apps.apple.com/app/claude-by-anthropic/id6473753684',
  },
  android: {
    url: 'https://play.google.com/store/apps/details?id=com.anthropic.claude',
  },
};

function MobileQRCode({ onDone }: Props): React.ReactNode {
  const [platform, setPlatform] = useState<Platform>('ios');
  const [qrCodes, setQrCodes] = useState<Record<Platform, string>>({
    ios: '',
    android: '',
  });

  const { url } = PLATFORMS[platform];
  const qrCode = qrCodes[platform];

  // Generate both QR codes upfront to avoid flicker when switching
  useEffect(() => {
    async function generateQRCodes(): Promise<void> {
      const [ios, android] = await Promise.all([
        qrToString(PLATFORMS.ios.url, {
          type: 'utf8',
          errorCorrectionLevel: 'L',
        }),
        qrToString(PLATFORMS.android.url, {
          type: 'utf8',
          errorCorrectionLevel: 'L',
        }),
      ]);
      setQrCodes({ ios, android });
    }
    generateQRCodes().catch(() => {
      // QR generation failed, leave empty
    });
  }, []);

  const handleClose = useCallback(() => {
    onDone();
  }, [onDone]);

  useKeybinding('confirm:no', handleClose, { context: 'Confirmation' });

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'q' || (e.ctrl && e.key === 'c')) {
      e.preventDefault();
      onDone();
      return;
    }
    if (e.key === 'tab' || e.key === 'left' || e.key === 'right') {
      e.preventDefault();
      setPlatform(prev => (prev === 'ios' ? 'android' : 'ios'));
    }
  }

  const lines = qrCode.split('\n').filter(line => line.length > 0);

  return (
    <Pane>
      <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
        <Text> </Text>
        <Text> </Text>
        {lines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
        <Text> </Text>
        <Text> </Text>

        {/* Controls */}
        <Box flexDirection="row" gap={2}>
          <Text>
            <Text bold={platform === 'ios'} underline={platform === 'ios'}>
              iOS
            </Text>
            <Text dimColor>{' / '}</Text>
            <Text bold={platform === 'android'} underline={platform === 'android'}>
              Android
            </Text>
          </Text>
          <Text dimColor>(tab to switch, esc to close)</Text>
        </Box>
        <Text dimColor>{url}</Text>
      </Box>
    </Pane>
  );
}

export async function call(onDone: LocalJSXCommandOnDone): Promise<React.ReactNode> {
  return <MobileQRCode onDone={onDone} />;
}

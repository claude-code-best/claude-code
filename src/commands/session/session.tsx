import { toString as qrToString } from 'qrcode';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Box, Pane, Text } from '@anthropic/ink';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import { useAppState } from '../../state/AppState.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { logForDebugging } from '../../utils/debug.js';

type Props = {
  onDone: () => void;
};

function SessionInfo({ onDone }: Props): React.ReactNode {
  const remoteSessionUrl = useAppState(s => s.remoteSessionUrl);
  const [qrCode, setQrCode] = useState<string>('');

  // 当 URL 可用时生成二维码
  useEffect(() => {
    if (!remoteSessionUrl) return;

    const url = remoteSessionUrl;
    async function generateQRCode(): Promise<void> {
      const qr = await qrToString(url, {
        type: 'utf8',
        errorCorrectionLevel: 'L',
      });
      setQrCode(qr);
    }
    // 故意静默失败 - URL 仍会显示，因此二维码并非关键
    generateQRCode().catch(e => {
      logForDebugging('QR code generation failed', e);
    });
  }, [remoteSessionUrl]);

  // Handle ESC to dismiss
  useKeybinding('confirm:no', onDone, { context: 'Confirmation' });

  // 未处于远程模式
  if (!remoteSessionUrl) {
    return (
      <Pane>
        <Text color="warning">Not in remote mode. Start with `claude --remote` to use this command.</Text>
        <Text dimColor>(press esc to close)</Text>
      </Pane>
    );
  }

  const lines = qrCode.split('\n').filter(line => line.length > 0);
  const isLoading = lines.length === 0;

  return (
    <Pane>
      <Box marginBottom={1}>
        <Text bold>远程会话</Text>
      </Box>

      {/* QR Code - silently fails if generation errors, URL is still shown */}
      {isLoading ? <Text dimColor>Generating QR code…</Text> : lines.map((line, i) => <Text key={i}>{line}</Text>)}

      {/* URL */}
      <Box marginTop={1}>
        <Text dimColor>在浏览器中打开：</Text>
        <Text color="ide">{remoteSessionUrl}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>(按 esc 键关闭)</Text>
      </Box>
    </Pane>
  );
}

export const call: LocalJSXCommandCall = async onDone => {
  return <SessionInfo onDone={onDone} />;
};

import React, { useCallback } from 'react';
import { logEvent } from 'src/services/analytics/index.js';
import { Box, Link, Newline, Text } from '@anthropic/ink';
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js';
import { updateSettingsForSource } from '../utils/settings/settings.js';
import { Select } from './CustomSelect/index.js';
import { Dialog } from '@anthropic/ink';

type Props = {
  onAccept(): void;
};

export function BypassPermissionsModeDialog({ onAccept }: Props): React.ReactNode {
  const [pendingExitCode, setPendingExitCode] = React.useState<number | null>(null);

  // Clear screen before shutdown so residual dialog content doesn't leak
  // to the terminal. Deferred to next tick so Ink flushes the null render.
  React.useEffect(() => {
    if (pendingExitCode !== null) {
      const code = pendingExitCode;
      const timer = setTimeout(() => gracefulShutdownSync(code));
      return () => clearTimeout(timer);
    }
  }, [pendingExitCode]);

  React.useEffect(() => {
    logEvent('tengu_bypass_permissions_mode_dialog_shown', {});
  }, []);

  function onChange(value: 'accept' | 'decline') {
    switch (value) {
      case 'accept': {
        logEvent('tengu_bypass_permissions_mode_dialog_accept', {});

        updateSettingsForSource('userSettings', {
          skipDangerousModePermissionPrompt: true,
        });
        onAccept();
        break;
      }
      case 'decline': {
        setPendingExitCode(1);
        break;
      }
    }
  }

  const handleEscape = useCallback(() => {
    setPendingExitCode(0);
  }, []);

  if (pendingExitCode !== null) {
    return null;
  }

  return (
    <Dialog title="WARNING: Claude Code running in Bypass Permissions mode" color="error" onCancel={handleEscape}>
      <Box flexDirection="column" gap={1}>
        <Text>
          In Bypass Permissions mode, Claude Code will not ask for your approval before running potentially dangerous
          commands.
          <Newline />
          This mode should only be used in a sandboxed container/VM that has restricted internet access and can easily
          be restored if damaged.
        </Text>
        <Text>
          By proceeding, you accept all responsibility for actions taken while running in Bypass Permissions mode.
        </Text>

        <Link url="https://code.claude.com/docs/en/security" />
      </Box>

      <Select
        options={[
          { label: 'No, exit', value: 'decline' },
          { label: 'Yes, I accept', value: 'accept' },
        ]}
        onChange={value => onChange(value as 'accept' | 'decline')}
      />
    </Dialog>
  );
}

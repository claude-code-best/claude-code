import * as React from 'react';
import { Box, Text, Link } from '@anthropic/ink';
import { Select } from '../CustomSelect/select.js';
import { Dialog } from '../design-system/Dialog.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { CCR_TERMS_URL } from '../../commands/ultraplan.js';
import { getPromptIdentifier, getDialogConfig, type PromptIdentifier } from 'src/utils/ultraplan/prompt.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChoiceValue = 'run' | 'cancel';

interface UltraplanLaunchDialogProps {
  onChoice: (
    choice: ChoiceValue,
    opts: {
      disconnectedBridge: boolean;
      promptIdentifier: PromptIdentifier;
    },
  ) => void;
}

function dispatchShowTermsLink() {
  return !getGlobalConfig().hasSeenUltraplanTerms;
}

function dispatchPromptIdentifier() {
  return getPromptIdentifier();
}

export function UltraplanLaunchDialog({ onChoice }: UltraplanLaunchDialogProps): React.ReactNode {
  // Whether the user has never seen the ultraplan terms before
  const [showTermsLink] = React.useState(dispatchShowTermsLink);

  // Stable prompt identifier for this dialog instance
  const [promptIdentifier] = React.useState(dispatchPromptIdentifier);

  // Dialog copy derived from the prompt identifier
  const dialogConfig = React.useMemo(() => {
    return getDialogConfig(promptIdentifier);
  }, [promptIdentifier]);

  // Whether the remote-control bridge is currently active
  const isBridgeEnabled = useAppState(state => state.replBridgeEnabled);

  const setAppState = useSetAppState();

  // ------------------------------------------------------------------
  // Choice handler
  // ------------------------------------------------------------------

  const handleChoice = React.useCallback(
    (value: ChoiceValue) => {
      // If the user chose "run" while the bridge is enabled, disconnect it
      // first so the ultraplan session doesn't collide with remote control.
      const disconnectedBridge = value === 'run' && isBridgeEnabled;

      if (disconnectedBridge) {
        setAppState(prev => {
          if (!prev.replBridgeEnabled) {
            return prev;
          }
          return {
            ...prev,
            replBridgeEnabled: false,
            replBridgeExplicit: false,
            replBridgeOutboundOnly: false,
          };
        });
      }

      // Persist that the user has now seen the ultraplan terms
      if (value !== 'cancel' && showTermsLink) {
        saveGlobalConfig(prev => (prev.hasSeenUltraplanTerms ? prev : { ...prev, hasSeenUltraplanTerms: true }));
      }

      onChoice(value, { disconnectedBridge, promptIdentifier });
    },
    [onChoice, isBridgeEnabled, setAppState, showTermsLink],
  );

  const handleCancel = React.useCallback(() => {
    handleChoice('cancel');
  }, [handleChoice]);

  const runDescription = isBridgeEnabled
    ? 'Disable remote control and launch in Claude Code on the web'
    : 'launch in Claude Code on the web';

  const options = [
    {
      label: 'Run ultraplan',
      value: 'run' as const,
      description: runDescription,
    },
    { label: 'Not now', value: 'cancel' as const },
  ];

  return (
    <Dialog title="Run ultraplan in the cloud?" subtitle={dialogConfig.timeEstimate} onCancel={handleCancel}>
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text dimColor>{dialogConfig.dialogBody}</Text>
          {showTermsLink ? (
            <Text dimColor>
              For more information on Claude Code on the web:
              <Link url={CCR_TERMS_URL}>{CCR_TERMS_URL}</Link>
            </Text>
          ) : null}
        </Box>

        {/* Pipeline description (hidden when bridge will be disconnected) */}
        <Text dimColor>
          {isBridgeEnabled ? 'This will disable Remote Control for this session.' : dialogConfig.dialogPipeline}
        </Text>

        <Select options={options} onChange={handleChoice} />
      </Box>
    </Dialog>
  );
}

export default UltraplanLaunchDialog;

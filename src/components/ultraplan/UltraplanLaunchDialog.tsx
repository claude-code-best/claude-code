import * as React from 'react';
import { Box, Text, Link } from '@anthropic/ink';
import { Select } from '../CustomSelect/select.js';
import { PermissionDialog } from '../permissions/PermissionDialog.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { CCR_TERMS_URL } from '../../commands/ultraplan.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChoiceValue = 'run' | 'cancel';

interface UltraplanLaunchDialogProps {
  onChoice: (
    choice: ChoiceValue,
    opts: {
      disconnectedBridge?: boolean;
      promptIdentifier?: string;
    },
  ) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a unique prompt identifier for this launch.
 * In the official build this comes from a GrowthBook-gated helper (`Zc8`);
 * we use `crypto.randomUUID()` as a drop-in replacement.
 */
function generatePromptIdentifier(): string {
  return crypto.randomUUID();
}

/**
 * Returns dialog copy for the ultraplan launch dialog.
 * The official build resolves this from a GrowthBook feature gate (`Gc8`);
 * we return reasonable defaults.
 */
function getUltraplanLaunchConfig(_identifier: string) {
  return {
    dialogBody:
      'Ultraplan sends your task to Claude Code on the web for deep exploration. ' +
      'Claude will research, draft a detailed plan, and return it here for your review ' +
      'before any code is changed.',
    dialogPipeline: 'Your prompt → Claude Code on the web → Plan review → Implementation',
    timeEstimate: '~10–30 min',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UltraplanLaunchDialog({ onChoice }: UltraplanLaunchDialogProps): React.ReactNode {
  // Whether the user has never seen the ultraplan terms before
  const [showTermsLink] = React.useState(() => !getGlobalConfig().hasSeenUltraplanTerms);

  // Stable prompt identifier for this dialog instance
  const [promptIdentifier] = React.useState(() => generatePromptIdentifier());

  // Dialog copy derived from the prompt identifier
  const config = React.useMemo(() => getUltraplanLaunchConfig(promptIdentifier), [promptIdentifier]);

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
          if (!prev.replBridgeEnabled) return prev;
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
    [onChoice, promptIdentifier, isBridgeEnabled, setAppState, showTermsLink],
  );

  // ------------------------------------------------------------------
  // Menu options
  // ------------------------------------------------------------------

  const runDescription = isBridgeEnabled
    ? 'Disable remote control and launch in Claude Code on the web'
    : 'launch in Claude Code on the web';

  const options = React.useMemo(
    () => [
      {
        label: 'Run ultraplan',
        value: 'run' as const,
        description: runDescription,
      },
      { label: 'Not now', value: 'cancel' as const },
    ],
    [runDescription],
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <PermissionDialog title="Run ultraplan in the cloud?" subtitle={config.timeEstimate}>
      <Box flexDirection="column" gap={1}>
        {/* Body + optional warnings */}
        <Box flexDirection="column">
          <Text dimColor>{config.dialogBody}</Text>
          {isBridgeEnabled && <Text dimColor>This will disable Remote Control for this session.</Text>}
          {showTermsLink && (
            <Text dimColor>
              For more information on Claude Code on the web: <Link url={CCR_TERMS_URL}>{CCR_TERMS_URL}</Link>
            </Text>
          )}
        </Box>

        {/* Pipeline description (hidden when bridge will be disconnected) */}
        {!isBridgeEnabled && <Text dimColor>{config.dialogPipeline}</Text>}

        {/* Action menu */}
        <Select options={options} onChange={handleChoice} />
      </Box>
    </PermissionDialog>
  );
}

export default UltraplanLaunchDialog;

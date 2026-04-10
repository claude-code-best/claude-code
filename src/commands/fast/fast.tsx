import * as React from 'react';
import { useState } from 'react';
import type { CommandResultDisplay, LocalJSXCommandContext } from '../../commands.js';
import { Dialog } from '@anthropic/ink';
import { FastIcon, getFastIconString } from '../../components/FastIcon.js';
import { Box, Link, Text } from '@anthropic/ink';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import { type AppState, useAppState, useSetAppState } from '../../state/AppState.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import {
  clearFastModeCooldown,
  FAST_MODE_MODEL_DISPLAY,
  getFastModeModel,
  getFastModeRuntimeState,
  getFastModeUnavailableReason,
  isFastModeEnabled,
  isFastModeSupportedByModel,
  prefetchFastModeStatus,
} from '../../utils/fastMode.js';
import { formatDuration } from '../../utils/format.js';
import { formatModelPricing, getOpus46CostTier } from '../../utils/modelCost.js';
import { updateSettingsForSource } from '../../utils/settings/settings.js';

function applyFastMode(enable: boolean, setAppState: (f: (prev: AppState) => AppState) => void): void {
  clearFastModeCooldown();
  updateSettingsForSource('userSettings', {
    fastMode: enable ? true : undefined,
  });
  if (enable) {
    setAppState(prev => {
      // Only switch model if current model doesn't support fast mode
      const needsModelSwitch = !isFastModeSupportedByModel(prev.mainLoopModel);
      return {
        ...prev,
        ...(needsModelSwitch ? { mainLoopModel: getFastModeModel(), mainLoopModelForSession: null } : {}),
        fastMode: true,
      };
    });
  } else {
    setAppState(prev => ({ ...prev, fastMode: false }));
  }
}

export function FastModePicker({
  onDone,
  unavailableReason,
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
  unavailableReason: string | null;
}): React.ReactNode {
  const model = useAppState(s => s.mainLoopModel);
  const initialFastMode = useAppState(s => s.fastMode);
  const setAppState = useSetAppState();
  const [enableFastMode, setEnableFastMode] = useState(initialFastMode ?? false);
  const runtimeState = getFastModeRuntimeState();
  const isCooldown = runtimeState.status === 'cooldown';
  const isUnavailable = unavailableReason !== null;
  const pricing = formatModelPricing(getOpus46CostTier(true));

  function handleConfirm(): void {
    if (isUnavailable) return;
    applyFastMode(enableFastMode, setAppState);
    logEvent('tengu_fast_mode_toggled', {
      enabled: enableFastMode,
      source: 'picker' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    if (enableFastMode) {
      const fastIcon = getFastIconString(enableFastMode);
      const modelUpdated = !isFastModeSupportedByModel(model) ? ` · model set to ${FAST_MODE_MODEL_DISPLAY}` : '';
      onDone(`${fastIcon} Fast mode ON${modelUpdated} · ${pricing}`);
    } else {
      setAppState(prev => ({ ...prev, fastMode: false }));
      onDone(`Fast mode OFF`);
    }
  }

  function handleCancel(): void {
    if (isUnavailable) {
      // Ensure fast mode is off if the org has disabled it
      if (initialFastMode) {
        applyFastMode(false, setAppState);
      }
      onDone('Fast mode OFF', { display: 'system' });
      return;
    }
    const message = initialFastMode ? `${getFastIconString()} Kept Fast mode ON` : `Kept Fast mode OFF`;
    onDone(message, { display: 'system' });
  }

  function handleToggle(): void {
    if (isUnavailable) return;
    setEnableFastMode(prev => !prev);
  }

  useKeybindings(
    {
      'confirm:yes': handleConfirm,
      'confirm:nextField': handleToggle,
      'confirm:next': handleToggle,
      'confirm:previous': handleToggle,
      'confirm:cycleMode': handleToggle,
      'confirm:toggle': handleToggle,
    },
    { context: 'Confirmation' },
  );

  const title = (
    <Text>
      <FastIcon cooldown={isCooldown} /> Fast mode (research preview)
    </Text>
  );

  return (
    <Dialog
      title={title}
      subtitle={`High-speed mode for ${FAST_MODE_MODEL_DISPLAY}. Billed as extra usage at a premium rate. Separate rate limits apply.`}
      onCancel={handleCancel}
      color="fastMode"
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : isUnavailable ? (
          <Text>Esc to cancel</Text>
        ) : (
          <Text>Tab to toggle · Enter to confirm · Esc to cancel</Text>
        )
      }
    >
      {unavailableReason ? (
        <Box marginLeft={2}>
          <Text color="error">{unavailableReason}</Text>
        </Box>
      ) : (
        <>
          <Box flexDirection="column" gap={0} marginLeft={2}>
            <Box flexDirection="row" gap={2}>
              <Text bold>Fast mode</Text>
              <Text color={enableFastMode ? 'fastMode' : undefined} bold={enableFastMode}>
                {enableFastMode ? 'ON ' : 'OFF'}
              </Text>
              <Text dimColor>{pricing}</Text>
            </Box>
          </Box>

          {isCooldown && runtimeState.status === 'cooldown' && (
            <Box marginLeft={2}>
              <Text color="warning">
                {runtimeState.reason === 'overloaded'
                  ? 'Fast mode overloaded and is temporarily unavailable'
                  : "You've hit your fast limit"}
                {' · resets in '}
                {formatDuration(runtimeState.resetAt - Date.now(), {
                  hideTrailingZeros: true,
                })}
              </Text>
            </Box>
          )}
        </>
      )}
      <Text dimColor>
        Learn more:{' '}
        <Link url="https://code.claude.com/docs/en/fast-mode">https://code.claude.com/docs/en/fast-mode</Link>
      </Text>
    </Dialog>
  );
}

async function handleFastModeShortcut(
  enable: boolean,
  getAppState: () => AppState,
  setAppState: (f: (prev: AppState) => AppState) => void,
): Promise<string> {
  const unavailableReason = getFastModeUnavailableReason();
  if (unavailableReason) {
    return `Fast mode unavailable: ${unavailableReason}`;
  }

  const { mainLoopModel } = getAppState();
  applyFastMode(enable, setAppState);
  logEvent('tengu_fast_mode_toggled', {
    enabled: enable,
    source: 'shortcut' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  });

  if (enable) {
    const fastIcon = getFastIconString(true);
    const modelUpdated = !isFastModeSupportedByModel(mainLoopModel) ? ` · model set to ${FAST_MODE_MODEL_DISPLAY}` : '';
    const pricing = formatModelPricing(getOpus46CostTier(true));
    return `${fastIcon} Fast mode ON${modelUpdated} · ${pricing}`;
  } else {
    return `Fast mode OFF`;
  }
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args?: string,
): Promise<React.ReactNode | null> {
  if (!isFastModeEnabled()) {
    return null;
  }

  // Fetch org fast mode status before showing the picker. We must know
  // whether the org has disabled fast mode before allowing any toggle.
  // If a startup prefetch is already in flight, this awaits it.
  await prefetchFastModeStatus();

  const arg = args?.trim().toLowerCase();
  if (arg === 'on' || arg === 'off') {
    const result = await handleFastModeShortcut(arg === 'on', context.getAppState, context.setAppState);
    onDone(result);
    return null;
  }

  const unavailableReason = getFastModeUnavailableReason();
  logEvent('tengu_fast_mode_picker_shown', {
    unavailable_reason: (unavailableReason ?? '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  });
  return <FastModePicker onDone={onDone} unavailableReason={unavailableReason} />;
}

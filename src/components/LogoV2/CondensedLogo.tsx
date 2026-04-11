import * as React from 'react';
import { type ReactNode, useEffect } from 'react';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text, stringWidth } from '@anthropic/ink';
import { useAppState } from '../../state/AppState.js';
import { getEffortSuffix } from '../../utils/effort.js';
import { truncate } from '../../utils/format.js';
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js';
import { formatModelAndBilling, getLogoDisplayData, isNotLoggedIn, truncatePath } from '../../utils/logoV2Utils.js';
import { renderModelSetting } from '../../utils/model/model.js';
import { OffscreenFreeze } from '../OffscreenFreeze.js';
import { AnimatedClawd } from './AnimatedClawd.js';
import { Clawd } from './Clawd.js';
import { GuestPassesUpsell, incrementGuestPassesSeenCount, useShowGuestPassesUpsell } from './GuestPassesUpsell.js';
import {
  incrementOverageCreditUpsellSeenCount,
  OverageCreditUpsell,
  useShowOverageCreditUpsell,
} from './OverageCreditUpsell.js';

export function CondensedLogo(): ReactNode {
  const { columns } = useTerminalSize();
  const agent = useAppState(s => s.agent);
  const effortValue = useAppState(s => s.effortValue);
  // Subscribe to authVersion to re-render after login/logout
  useAppState(s => s.authVersion);
  const model = useMainLoopModel();
  const notLoggedIn = isNotLoggedIn();
  const modelDisplayName = renderModelSetting(model);
  const { version, cwd, billingType, agentName: agentNameFromSettings } = getLogoDisplayData();

  // Prefer AppState.agent (set from --agent CLI flag) over settings
  const agentName = agent ?? agentNameFromSettings;
  const showGuestPassesUpsell = useShowGuestPassesUpsell();
  const showOverageCreditUpsell = useShowOverageCreditUpsell();

  useEffect(() => {
    if (showGuestPassesUpsell) {
      incrementGuestPassesSeenCount();
    }
  }, [showGuestPassesUpsell]);

  useEffect(() => {
    if (showOverageCreditUpsell && !showGuestPassesUpsell) {
      incrementOverageCreditUpsellSeenCount();
    }
  }, [showOverageCreditUpsell, showGuestPassesUpsell]);

  // Calculate available width for text content
  // Account for: condensed clawd width (11 chars) + gap (2) + padding (2) = 15 chars
  const textWidth = Math.max(columns - 15, 20);

  // Truncate version to fit within available width, accounting for "CoStrict v" prefix
  const versionPrefix = 'CoStrict v';
  const truncatedVersion = truncate(version, Math.max(textWidth - versionPrefix.length, 6));

  const effortSuffix = getEffortSuffix(model, effortValue);
  const { shouldSplit, truncatedModel, truncatedBilling } = formatModelAndBilling(
    modelDisplayName + effortSuffix,
    billingType,
    textWidth,
  );

  // Truncate path, accounting for agent name if present
  const separator = ' · ';
  const atPrefix = '@';
  const cwdAvailableWidth = agentName
    ? textWidth - atPrefix.length - stringWidth(agentName) - separator.length
    : textWidth;
  const truncatedCwd = truncatePath(cwd, Math.max(cwdAvailableWidth, 10));

  // OffscreenFreeze: the logo sits at the top of the message list and is the
  // first thing to enter scrollback. useMainLoopModel() subscribes to model
  // changes and getLogoDisplayData() reads getCwd()/subscription state — any
  // of which changing while in scrollback would force a full terminal reset.
  return (
    <OffscreenFreeze>
      <Box
        flexDirection="row"
        gap={2}
        alignItems="center"
        borderStyle="round"
        borderColor="claudeBlue_FOR_SYSTEM_SPINNER"
        paddingX={1}
        paddingY={1}
      >
        {isFullscreenEnvEnabled() ? <AnimatedClawd /> : <Clawd />}

        {/* Info */}
        <Box flexDirection="column">
          <Text>
            <Text bold color="claudeBlue_FOR_SYSTEM_SPINNER">
              CoStrict
            </Text>{' '}
            <Text dimColor>v{truncatedVersion}</Text>
          </Text>
          {notLoggedIn ? (
            <Text dimColor>Not logged in</Text>
          ) : shouldSplit ? (
            <>
              <Text dimColor>{truncatedModel}</Text>
              <Text dimColor>{truncatedBilling}</Text>
            </>
          ) : (
            <Text dimColor>
              {truncatedModel} · {truncatedBilling}
            </Text>
          )}
          <Text dimColor>{agentName ? `@${agentName} · ${truncatedCwd}` : truncatedCwd}</Text>
          {showGuestPassesUpsell && <GuestPassesUpsell />}
          {!showGuestPassesUpsell && showOverageCreditUpsell && <OverageCreditUpsell maxWidth={textWidth} twoLine />}
        </Box>
      </Box>
    </OffscreenFreeze>
  );
}

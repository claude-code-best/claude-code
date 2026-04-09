import React from 'react';
import { Box, Text, useTheme } from '@anthropic/ink';
import { env } from '../../utils/env.js';

const WELCOME_V2_WIDTH = 58;

const COSTRICT_ART_LINE1 = '█▀▀ █▀█ █▀ ▀█▀ █▀█ █ █▀▀ ▀█▀';
const COSTRICT_ART_LINE2 = '█▄▄ █▄█ ▄█  █  █▀▄ █ █▄▄  █ ';
const DIVIDER_PREFIX = '…………'; // 4个…，每个占2列，共8列

export function WelcomeV2(): React.ReactNode {
  const [theme] = useTheme();
  const welcomeMessage = 'Welcome to CoStrict';

  if (env.terminal === 'Apple_Terminal') {
    return <AppleTerminalWelcomeV2 theme={theme} welcomeMessage={welcomeMessage} />;
  }

  if (['light', 'light-daltonized', 'light-ansi'].includes(theme)) {
    return (
      <Box width={WELCOME_V2_WIDTH} flexDirection="column">
        <Text>
          <Text color="claudeBlue_FOR_SYSTEM_SPINNER">{welcomeMessage} </Text>
          <Text dimColor>v{MACRO.VERSION} </Text>
        </Text>
        <Text>{'…………………………………………………………………………………………………………………………………………………………'}</Text>
        <Text>{'            ░░░░░░                                        '}</Text>
        <Text>{'    ░░░   ░░░░░░░░░░                                      '}</Text>
        <Text>{'   ░░░░░░░░░░░░░░░░░░░                                    '}</Text>
        <Text> </Text>
        <Text>
          {'…………'}
          <Text color="claudeBlue_FOR_SYSTEM_SPINNER">
            {'  '}
            {COSTRICT_ART_LINE1}
          </Text>
        </Text>
        <Text>
          {'…………'}
          <Text color="claudeBlue_FOR_SYSTEM_SPINNER">
            {'  '}
            {COSTRICT_ART_LINE2}
          </Text>
          {'…………………………………………'}
        </Text>
      </Box>
    );
  }

  return (
    <Box width={WELCOME_V2_WIDTH} flexDirection="column">
      <Text>
        <Text color="claudeBlue_FOR_SYSTEM_SPINNER">{welcomeMessage} </Text>
        <Text dimColor>v{MACRO.VERSION} </Text>
      </Text>
      <Text>{'…………………………………………………………………………………………………………………………………………………………'}</Text>
      <Text>{'     *                                       █████▓▓░     '}</Text>
      <Text>{'                                 *         ███▓░     ░░   '}</Text>
      <Text>{'            ░░░░░░                        ███▓░           '}</Text>
      <Text>{'    ░░░   ░░░░░░░░░░                      ███▓░           '}</Text>
      <Text>
        <Text>{'   ░░░░░░░░░░░░░░░░░░░    '}</Text>
        <Text bold>*</Text>
        <Text>{'                ██▓░░      ▓   '}</Text>
      </Text>
      <Text>{'                                             ░▓▓███▓▓░    '}</Text>
      <Text dimColor>{' *                                 ░░░░                   '}</Text>
      <Text dimColor>{'                                 ░░░░░░░░                 '}</Text>
      <Text dimColor>{'              *                ░░░░░░░░░░░░░░░░           '}</Text>
      <Text dimColor>{'                                                     *    '}</Text>
      <Text>
        {'    '}
        <Text color="claudeBlue_FOR_SYSTEM_SPINNER">
          {'  '}
          {COSTRICT_ART_LINE1}
        </Text>
      </Text>
      <Text>
        {'…………'}
        <Text color="claudeBlue_FOR_SYSTEM_SPINNER">
          {'  '}
          {COSTRICT_ART_LINE2}
        </Text>
        {'………………………………………………………………'}
      </Text>
    </Box>
  );
}

type AppleTerminalWelcomeV2Props = {
  theme: string;
  welcomeMessage: string;
};

function AppleTerminalWelcomeV2({ theme, welcomeMessage }: AppleTerminalWelcomeV2Props): React.ReactNode {
  const isLightTheme = ['light', 'light-daltonized', 'light-ansi'].includes(theme);

  if (isLightTheme) {
    return (
      <Box width={WELCOME_V2_WIDTH} flexDirection="column">
        <Text>
          <Text color="claudeBlue_FOR_SYSTEM_SPINNER">{welcomeMessage} </Text>
          <Text dimColor>v{MACRO.VERSION} </Text>
        </Text>
        <Text>{'…………………………………………………………………………………………………………………………………………………………'}</Text>
        <Text>{'            ░░░░░░                                        '}</Text>
        <Text>{'    ░░░   ░░░░░░░░░░                                      '}</Text>
        <Text>{'   ░░░░░░░░░░░░░░░░░░░                                    '}</Text>
        <Text> </Text>
        <Text>
          {'…………'}
          <Text color="claudeBlue_FOR_SYSTEM_SPINNER">
            {'  '}
            {COSTRICT_ART_LINE1}
          </Text>
        </Text>
        <Text>
          {'…………'}
          <Text color="claudeBlue_FOR_SYSTEM_SPINNER">
            {'  '}
            {COSTRICT_ART_LINE2}
          </Text>
          {'…………………………………………'}
        </Text>
      </Box>
    );
  }

  return (
    <Box width={WELCOME_V2_WIDTH} flexDirection="column">
      <Text>
        <Text color="claudeBlue_FOR_SYSTEM_SPINNER">{welcomeMessage} </Text>
        <Text dimColor>v{MACRO.VERSION} </Text>
      </Text>
      <Text>{'…………………………………………………………………………………………………………………………………………………………'}</Text>
      <Text>{'     *                                       █████▓▓░     '}</Text>
      <Text>{'                                 *         ███▓░     ░░   '}</Text>
      <Text>{'            ░░░░░░                        ███▓░           '}</Text>
      <Text>{'    ░░░   ░░░░░░░░░░                      ███▓░           '}</Text>
      <Text>
        <Text>{'   ░░░░░░░░░░░░░░░░░░░    '}</Text>
        <Text bold>*</Text>
        <Text>{'                ██▓░░      ▓   '}</Text>
      </Text>
      <Text>{'                                             ░▓▓███▓▓░    '}</Text>
      <Text dimColor>{' *                                 ░░░░                   '}</Text>
      <Text dimColor>{'                                 ░░░░░░░░                 '}</Text>
      <Text dimColor>{'                               ░░░░░░░░░░░░░░░░           '}</Text>
      <Text>
        {'…………'}
        <Text color="claudeBlue_FOR_SYSTEM_SPINNER">
          {'  '}
          {COSTRICT_ART_LINE1}
        </Text>
      </Text>
      <Text>
        {'…………'}
        <Text color="claudeBlue_FOR_SYSTEM_SPINNER">
          {'  '}
          {COSTRICT_ART_LINE2}
        </Text>
        {'…………………………………………'}
      </Text>
    </Box>
  );
}

import React from 'react'
import { Box, Text, useTheme } from '@anthropic/ink'
import { env } from '../../utils/env.js'

const WELCOME_V2_WIDTH = 58

export function WelcomeV2(): React.ReactNode {
  const [theme] = useTheme()
  const welcomeMessage = 'Welcome to Claude Code'

  if (env.terminal === 'Apple_Terminal') {
    return (
      <AppleTerminalWelcomeV2 theme={theme} welcomeMessage={welcomeMessage} />
    )
  }

  if (['light', 'light-daltonized', 'light-ansi'].includes(theme)) {
    return (
      <Box width={WELCOME_V2_WIDTH}>
        <Text>
          <Text>
            <Text color="claude">{welcomeMessage} </Text>
            <Text dimColor>v{MACRO.VERSION} </Text>
          </Text>
          <Text>
            {'…………………………………………………………………………………………………………………………………………………………'}
          </Text>
          <Text>
            {'                                                          '}
          </Text>
          <Text>
            {'                                                          '}
          </Text>
          <Text>
            {'                                                          '}
          </Text>
          <Text>
            {'            ░░░░░░                                        '}
          </Text>
          <Text>
            {'    ░░░   ░░░░░░░░░░                                      '}
          </Text>
          <Text>
            {'   ░░░░░░░░░░░░░░░░░░░                                    '}
          </Text>
          <Text>
            {'                                                          '}
          </Text>
          <Text>
            <Text dimColor>{'                           ░░░░'}</Text>
            <Text>{'                     ██    '}</Text>
          </Text>
          <Text>
            <Text dimColor>{'                         ░░░░░░░░░░'}</Text>
            <Text>{'               ██▒▒██  '}</Text>
          </Text>
          <Text>
            {'                                            ▒▒      ██   ▒'}
          </Text>
          <Text>
            {'      '}
            <Text color="clawd_body"> █████████ </Text>
            {'                         ▒▒░░▒▒      ▒ ▒▒'}
          </Text>
          <Text>
            {'      '}
            <Text color="clawd_body" backgroundColor="clawd_background">
              ██▄█████▄██
            </Text>
            {'                           ▒▒         ▒▒ '}
          </Text>
          <Text>
            {'      '}
            <Text color="clawd_body"> █████████ </Text>
            {'                          ░          ▒   '}
          </Text>
          <Text>
            {'…………………'}
            <Text color="clawd_body">{'█ █   █ █'}</Text>
            {'……………………………………………………………………░…………………………▒…………'}
          </Text>
        </Text>
      </Box>
    )
  }

  return (
    <Box width={WELCOME_V2_WIDTH}>
      <Text>
        <Text>
          <Text color="claude">{welcomeMessage} </Text>
          <Text dimColor>v{MACRO.VERSION} </Text>
        </Text>
        <Text>
          {'…………………………………………………………………………………………………………………………………………………………'}
        </Text>
        <Text>
          {'                                                          '}
        </Text>
        <Text>
          {'     *                                       █████▓▓░     '}
        </Text>
        <Text>
          {'                                 *         ███▓░     ░░   '}
        </Text>
        <Text>
          {'            ░░░░░░                        ███▓░           '}
        </Text>
        <Text>
          {'    ░░░   ░░░░░░░░░░                      ███▓░           '}
        </Text>
        <Text>
          <Text>{'   ░░░░░░░░░░░░░░░░░░░    '}</Text>
          <Text bold>*</Text>
          <Text>{'                ██▓░░      ▓   '}</Text>
        </Text>
        <Text>
          {'                                             ░▓▓███▓▓░    '}
        </Text>
        <Text dimColor>
          {' *                                 ░░░░                   '}
        </Text>
        <Text dimColor>
          {'                                 ░░░░░░░░                 '}
        </Text>
        <Text dimColor>
          {'                               ░░░░░░░░░░░░░░░░           '}
        </Text>
        <Text>
          {'      '}
          <Text color="clawd_body"> █████████ </Text>
          {'                                       '}
          <Text dimColor>*</Text>
          <Text> </Text>
        </Text>
        <Text>
          {'      '}
          <Text color="clawd_body">██▄█████▄██</Text>
          <Text>{'                        '}</Text>
          <Text bold>*</Text>
          <Text>{'                '}</Text>
        </Text>
        <Text>
          {'      '}
          <Text color="clawd_body"> █████████ </Text>
          {'     *                                   '}
        </Text>
        <Text>
          {'…………………'}
          <Text color="clawd_body">{'█ █   █ █'}</Text>
          {'………………………………………………………………………………………………………………'}
        </Text>
      </Text>
    </Box>
  )
}

type AppleTerminalWelcomeV2Props = {
  theme: string
  welcomeMessage: string
}

function AppleTerminalWelcomeV2({
  theme,
  welcomeMessage,
}: AppleTerminalWelcomeV2Props): React.ReactNode {
  const isLightTheme = ['light', 'light-daltonized', 'light-ansi'].includes(
    theme,
  )

  if (isLightTheme) {
    return (
      <Box width={WELCOME_V2_WIDTH}>
        <Text>
          <Text>
            <Text color="claude">{welcomeMessage} </Text>
            <Text dimColor>v{MACRO.VERSION} </Text>
          </Text>
          <Text>
            {'…………………………………………………………………………………………………………………………………………………………'}
          </Text>
          <Text>
            {'                                                          '}
          </Text>
          <Text>
            {'                                                          '}
          </Text>
          <Text>
            {'                                                          '}
          </Text>
          <Text>
            {'            ░░░░░░                                        '}
          </Text>
          <Text>
            {'    ░░░   ░░░░░░░░░░                                      '}
          </Text>
          <Text>
            {'   ░░░░░░░░░░░░░░░░░░░                                    '}
          </Text>
          <Text>
            {'                                                          '}
          </Text>
          <Text>
            <Text dimColor>{'                           ░░░░'}</Text>
            <Text>{'                     ██    '}</Text>
          </Text>
          <Text>
            <Text dimColor>{'                         ░░░░░░░░░░'}</Text>
            <Text>{'               ██▒▒██  '}</Text>
          </Text>
          <Text>
            {'                                            ▒▒      ██   ▒'}
          </Text>
          <Text>
            {'                                          ▒▒░░▒▒      ▒ ▒▒'}
          </Text>
          <Text>
            {'      '}
            <Text color="clawd_body">▗</Text>
            <Text color="clawd_background" backgroundColor="clawd_body">
              {' '}
              ▗{'     '}▖{' '}
            </Text>
            <Text color="clawd_body">▖</Text>
            {'                           ▒▒         ▒▒ '}
          </Text>
          <Text>
            {'       '}
            <Text backgroundColor="clawd_body">{' '.repeat(9)}</Text>
            {'                           ░          ▒   '}
          </Text>
          <Text>
            {'…………………'}
            <Text backgroundColor="clawd_body"> </Text>
            <Text> </Text>
            <Text backgroundColor="clawd_body"> </Text>
            <Text>{'   '}</Text>
            <Text backgroundColor="clawd_body"> </Text>
            <Text> </Text>
            <Text backgroundColor="clawd_body"> </Text>
            {'……………………………………………………………………░…………………………▒…………'}
          </Text>
        </Text>
      </Box>
    )
  }

  return (
    <Box width={WELCOME_V2_WIDTH}>
      <Text>
        <Text>
          <Text color="claude">{welcomeMessage} </Text>
          <Text dimColor>v{MACRO.VERSION} </Text>
        </Text>
        <Text>
          {'…………………………………………………………………………………………………………………………………………………………'}
        </Text>
        <Text>
          {'                                                          '}
        </Text>
        <Text>
          {'     *                                       █████▓▓░     '}
        </Text>
        <Text>
          {'                                 *         ███▓░     ░░   '}
        </Text>
        <Text>
          {'            ░░░░░░                        ███▓░           '}
        </Text>
        <Text>
          {'    ░░░   ░░░░░░░░░░                      ███▓░           '}
        </Text>
        <Text>
          <Text>{'   ░░░░░░░░░░░░░░░░░░░    '}</Text>
          <Text bold>*</Text>
          <Text>{'                ██▓░░      ▓   '}</Text>
        </Text>
        <Text>
          {'                                             ░▓▓███▓▓░    '}
        </Text>
        <Text dimColor>
          {' *                                 ░░░░                   '}
        </Text>
        <Text dimColor>
          {'                                 ░░░░░░░░                 '}
        </Text>
        <Text dimColor>
          {'                               ░░░░░░░░░░░░░░░░           '}
        </Text>
        <Text>
          {'                                                      '}
          <Text dimColor>*</Text>
          <Text> </Text>
        </Text>
        <Text>
          {'        '}
          <Text color="clawd_body">▗</Text>
          <Text color="clawd_background" backgroundColor="clawd_body">
            {' '}
            ▗{'     '}▖{' '}
          </Text>
          <Text color="clawd_body">▖</Text>
          <Text>{'                       '}</Text>
          <Text bold>*</Text>
          <Text>{'                '}</Text>
        </Text>
        <Text>
          {'        '}
          <Text backgroundColor="clawd_body">{' '.repeat(9)}</Text>
          {'      *                                   '}
        </Text>
        <Text>
          {'…………………'}
          <Text backgroundColor="clawd_body"> </Text>
          <Text> </Text>
          <Text backgroundColor="clawd_body"> </Text>
          <Text>{'   '}</Text>
          <Text backgroundColor="clawd_body"> </Text>
          <Text> </Text>
          <Text backgroundColor="clawd_body"> </Text>
          {'………………………………………………………………………………………………………………'}
        </Text>
      </Text>
    </Box>
  )
}

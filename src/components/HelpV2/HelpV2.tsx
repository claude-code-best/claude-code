import * as React from 'react'
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js'
import { useShortcutDisplay } from 'src/keybindings/useShortcutDisplay.js'
import {
  builtInCommandNames,
  type Command,
  type CommandResultDisplay,
  INTERNAL_ONLY_COMMANDS,
} from '../../commands.js'
import { useIsInsideModal } from '../../context/modalContext.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Link, Text } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { Pane } from '../design-system/Pane.js'
import { Tab, Tabs } from '../design-system/Tabs.js'
import { Commands } from './Commands.js'
import { General } from './General.js'
import { t, useLocale } from '../../i18n/index.js'

type Props = {
  onClose: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  commands: Command[]
}

export function HelpV2({ onClose, commands }: Props): React.ReactNode {
  const locale = useLocale()
  const { rows, columns } = useTerminalSize()
  const maxHeight = Math.floor(rows / 2)
  // Inside the modal slot, FullscreenLayout already caps height and Pane/Tabs
  // use flexShrink=0 (see #23592) — our own height= constraint would clip the
  // footer since Tabs won't shrink to fit. Let the modal slot handle sizing.
  const insideModal = useIsInsideModal()

  const close = () => onClose(t('help.dismissed'), { display: 'system' })
  useKeybinding('help:dismiss', close, { context: 'Help' })
  const exitState = useExitOnCtrlCDWithKeybindings(close)
  const dismissShortcut = useShortcutDisplay('help:dismiss', 'Help', 'esc')

  const builtinNames = builtInCommandNames()
  let builtinCommands = commands.filter(
    cmd => builtinNames.has(cmd.name) && !cmd.isHidden,
  )
  let antOnlyCommands: Command[] = []

  // We have to do this in an `if` to help treeshaking
  if (process.env.USER_TYPE === 'ant') {
    const internalOnlyNames = new Set(INTERNAL_ONLY_COMMANDS.map(_ => _.name))
    builtinCommands = builtinCommands.filter(
      cmd => !internalOnlyNames.has(cmd.name),
    )
    antOnlyCommands = commands.filter(
      cmd => internalOnlyNames.has(cmd.name) && !cmd.isHidden,
    )
  }

  const customCommands = commands.filter(
    cmd => !builtinNames.has(cmd.name) && !cmd.isHidden,
  )

  const tabs = [
    <Tab key="general" title={t('help.general')}>
      <General />
    </Tab>,
  ]

  tabs.push(
    <Tab key="commands" title={t('help.commands')}>
      <Commands
        commands={builtinCommands}
        maxHeight={maxHeight}
        columns={columns}
        title={t('help.browseDefault')}
        onCancel={close}
      />
    </Tab>,
  )

  tabs.push(
    <Tab key="custom" title={t('help.customCommands')}>
      <Commands
        commands={customCommands}
        maxHeight={maxHeight}
        columns={columns}
        title={t('help.browseCustom')}
        emptyMessage={t('help.noCustomCommands')}
        onCancel={close}
      />
    </Tab>,
  )

  if (process.env.USER_TYPE === 'ant' && antOnlyCommands.length > 0) {
    tabs.push(
      <Tab key="ant-only" title="[ant-only]">
        <Commands
          commands={antOnlyCommands}
          maxHeight={maxHeight}
          columns={columns}
          title={t('help.browseAntOnly')}
          onCancel={close}
        />
      </Tab>,
    )
  }

  return (
    <Box flexDirection="column" height={insideModal ? undefined : maxHeight}>
      <Pane color="professionalBlue">
        <Tabs
          title={
            process.env.USER_TYPE === 'ant'
              ? '/help'
              : `Claude Code v${MACRO.VERSION}`
          }
          color="professionalBlue"
          defaultTab="general"
        >
          {tabs}
        </Tabs>
        <Box marginTop={1}>
          <Text>
            {t('help.forMoreHelp')}{' '}
            <Link url="https://code.claude.com/docs/en/overview" />
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            {exitState.pending ? (
              <>Press {exitState.keyName} again to exit</>
            ) : (
              <Text italic>{dismissShortcut} {t('ui.toCancel')}</Text>
            )}
          </Text>
        </Box>
      </Pane>
    </Box>
  )
}

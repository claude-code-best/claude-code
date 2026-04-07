import React, { useState } from 'react'
import {
  type OptionWithDescription,
  Select,
} from '../../components/CustomSelect/select.js'
import { Dialog } from '@anthropic/ink'
import { Box, Text } from '@anthropic/ink'
import { useAppState } from '../../state/AppState.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'
import { openBrowser } from '../../utils/browser.js'
import {
  CLAUDE_IN_CHROME_MCP_SERVER_NAME,
  openInChrome,
} from '../../utils/claudeInChrome/common.js'
import { isChromeExtensionInstalled } from '../../utils/claudeInChrome/setup.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { env } from '../../utils/env.js'
import { isRunningOnHomespace } from '../../utils/envUtils.js'

const CHROME_EXTENSION_URL = 'https://claude.ai/chrome'
const CHROME_PERMISSIONS_URL = 'https://clau.de/chrome/permissions'
const CHROME_RECONNECT_URL = 'https://clau.de/chrome/reconnect'

type MenuAction =
  | 'install-extension'
  | 'reconnect'
  | 'manage-permissions'
  | 'toggle-default'

type Props = {
  onDone: (result?: string) => void
  isExtensionInstalled: boolean
  configEnabled: boolean | undefined
  isClaudeAISubscriber: boolean
  isWSL: boolean
}

function ClaudeInChromeMenu({
  onDone,
  isExtensionInstalled: installed,
  configEnabled,
  isClaudeAISubscriber,
  isWSL,
}: Props): React.ReactNode {
  const mcpClients = useAppState(s => s.mcp.clients)
  const [selectKey, setSelectKey] = useState(0)
  const [enabledByDefault, setEnabledByDefault] = useState(
    configEnabled ?? false,
  )
  const [showInstallHint, setShowInstallHint] = useState(false)
  const [isExtensionInstalled, setIsExtensionInstalled] = useState(installed)

  const isHomespace = process.env.USER_TYPE === 'ant' && isRunningOnHomespace()

  const chromeClient = mcpClients.find(
    c => c.name === CLAUDE_IN_CHROME_MCP_SERVER_NAME,
  )
  const isConnected = chromeClient?.type === 'connected'

  function openUrl(url: string): void {
    if (isHomespace) {
      void openBrowser(url)
    } else {
      void openInChrome(url)
    }
  }

  function handleAction(action: MenuAction): void {
    switch (action) {
      case 'install-extension':
        setSelectKey(k => k + 1)
        setShowInstallHint(true)
        openUrl(CHROME_EXTENSION_URL)
        break
      case 'reconnect':
        setSelectKey(k => k + 1)
        void isChromeExtensionInstalled().then(installed => {
          setIsExtensionInstalled(installed)
          if (installed) {
            setShowInstallHint(false)
          }
        })
        openUrl(CHROME_RECONNECT_URL)
        break
      case 'manage-permissions':
        setSelectKey(k => k + 1)
        openUrl(CHROME_PERMISSIONS_URL)
        break
      case 'toggle-default': {
        const newValue = !enabledByDefault
        saveGlobalConfig(current => ({
          ...current,
          claudeInChromeDefaultEnabled: newValue,
        }))
        setEnabledByDefault(newValue)
        break
      }
    }
  }

  const options: OptionWithDescription<MenuAction>[] = []
  const requiresExtensionSuffix = isExtensionInstalled
    ? ''
    : ' (requires extension)'

  if (!isExtensionInstalled && !isHomespace) {
    options.push({
      label: 'Install Chrome extension',
      value: 'install-extension',
    })
  }

  options.push(
    {
      label: (
        <>
          <Text>Manage permissions</Text>
          <Text dimColor>{requiresExtensionSuffix}</Text>
        </>
      ),
      value: 'manage-permissions',
    },
    {
      label: (
        <>
          <Text>Reconnect extension</Text>
          <Text dimColor>{requiresExtensionSuffix}</Text>
        </>
      ),
      value: 'reconnect',
    },
    {
      label: `Enabled by default: ${enabledByDefault ? 'Yes' : 'No'}`,
      value: 'toggle-default',
    },
  )

  const isDisabled =
    isWSL || ("external" !== 'ant' && !isClaudeAISubscriber)

  return (
    <Dialog
      title="Claude in Chrome (Beta)"
      onCancel={() => onDone()}
      color="chromeYellow"
    >
      <Box flexDirection="column" gap={1}>
        <Text>
          Claude in Chrome works with the Chrome extension to let you control
          your browser directly from Claude Code. Navigate websites, fill forms,
          capture screenshots, record GIFs, and debug with console logs and
          network requests.
        </Text>

        {isWSL && (
          <Text color="error">
            Claude in Chrome is not supported in WSL at this time.
          </Text>
        )}


        {"external" !== 'ant' && !isClaudeAISubscriber && (
          <Text color="error">
            Claude in Chrome requires a claude.ai subscription.
          </Text>
        )}

        {!isDisabled && (
          <>
            {!isHomespace && (
              <Box flexDirection="column">
                <Text>
                  Status:{' '}
                  {isConnected ? (
                    <Text color="success">Enabled</Text>
                  ) : (
                    <Text color="inactive">Disabled</Text>
                  )}
                </Text>
                <Text>
                  Extension:{' '}
                  {isExtensionInstalled ? (
                    <Text color="success">Installed</Text>
                  ) : (
                    <Text color="warning">Not detected</Text>
                  )}
                </Text>
              </Box>
            )}
            <Select
              key={selectKey}
              options={options}
              onChange={handleAction}
              hideIndexes
            />

            {showInstallHint && (
              <Text color="warning">
                Once installed, select {'"Reconnect extension"'} to connect.
              </Text>
            )}

            <Text>
              <Text dimColor>Usage: </Text>
              <Text>claude --chrome</Text>
              <Text dimColor> or </Text>
              <Text>claude --no-chrome</Text>
            </Text>

            <Text dimColor>
              Site-level permissions are inherited from the Chrome extension.
              Manage permissions in the Chrome extension settings to control
              which sites Claude can browse, click, and type on.
            </Text>
          </>
        )}
        <Text dimColor>Learn more: https://code.claude.com/docs/en/chrome</Text>
      </Box>
    </Dialog>
  )
}

export const call = async function (
  onDone: (result?: string) => void,
): Promise<React.ReactNode> {
  const isExtensionInstalled = await isChromeExtensionInstalled()
  const config = getGlobalConfig()
  const isSubscriber = isClaudeAISubscriber()
  const isWSL = env.isWslEnvironment()

  return (
    <ClaudeInChromeMenu
      onDone={onDone}
      isExtensionInstalled={isExtensionInstalled}
      configEnabled={config.claudeInChromeDefaultEnabled}
      isClaudeAISubscriber={isSubscriber}
      isWSL={isWSL}
    />
  )
}

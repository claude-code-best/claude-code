import React from 'react'
import { Box, Dialog, wrappedRender as render, Text } from '@anthropic/ink'
import { KeybindingSetup } from '../keybindings/KeybindingProviderSetup.js'
import { AppStateProvider } from '../state/AppState.js'
import type { ConfigParseError } from '../utils/errors.js'
import { getBaseRenderOptions } from '../utils/renderOptions.js'
import {
  jsonStringify,
  writeFileSync_DEPRECATED,
} from '../utils/slowOperations.js'
import type { ThemeName } from '../utils/theme.js'
import { Select } from './CustomSelect/index.js'

interface InvalidConfigHandlerProps {
  error: ConfigParseError
}

interface InvalidConfigDialogProps {
  filePath: string
  errorDescription: string
  onExit: () => void
  onReset: () => void
}

/**
 * Dialog shown when the Claude config file contains invalid JSON
 */
function InvalidConfigDialog({
  filePath,
  errorDescription,
  onExit,
  onReset,
}: InvalidConfigDialogProps): React.ReactNode {
  // Handler for Select onChange
  const handleSelect = (value: string) => {
    if (value === 'exit') {
      onExit()
    } else {
      onReset()
    }
  }

  return (
    <Dialog title="Configuration Error" color="error" onCancel={onExit}>
      <Box flexDirection="column" gap={1}>
        <Text>
          The configuration file at <Text bold>{filePath}</Text> contains
          invalid JSON.
        </Text>
        <Text>{errorDescription}</Text>
      </Box>
      <Box flexDirection="column">
        <Text bold>Choose an option:</Text>
        <Select
          options={[
            { label: 'Exit and fix manually', value: 'exit' },
            { label: 'Reset with default configuration', value: 'reset' },
          ]}
          onChange={handleSelect}
          onCancel={onExit}
        />
      </Box>
    </Dialog>
  )
}

/**
 * Safe fallback theme name for error dialogs to avoid circular dependency.
 * Uses a hardcoded dark theme that doesn't require reading from config.
 */
const SAFE_ERROR_THEME_NAME: ThemeName = 'dark'

export async function showInvalidConfigDialog({
  error,
}: InvalidConfigHandlerProps): Promise<void> {
  // Extend RenderOptions with theme property for this specific usage
  type SafeRenderOptions = Parameters<typeof render>[1] & { theme?: ThemeName }

  const renderOptions: SafeRenderOptions = {
    ...getBaseRenderOptions(false),
    // IMPORTANT: Use hardcoded theme name to avoid circular dependency with getGlobalConfig()
    // This allows the error dialog to show even when config file has JSON syntax errors
    theme: SAFE_ERROR_THEME_NAME,
  }

  // biome-ignore lint/suspicious/noAsyncPromiseExecutor: render must be awaited inside executor
  await new Promise<void>(async resolve => {
    const { unmount } = await render(
      <AppStateProvider>
        <KeybindingSetup>
          <InvalidConfigDialog
            filePath={error.filePath}
            errorDescription={error.message}
            onExit={() => {
              unmount()
              void resolve()
              process.exit(1)
            }}
            onReset={() => {
              writeFileSync_DEPRECATED(
                error.filePath,
                jsonStringify(error.defaultConfig, null, 2),
                { flush: false, encoding: 'utf8' },
              )
              unmount()
              void resolve()
              process.exit(0)
            }}
          />
        </KeybindingSetup>
      </AppStateProvider>,
      renderOptions,
    )
  })
}

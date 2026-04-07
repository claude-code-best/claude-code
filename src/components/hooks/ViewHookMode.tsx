/**
 * ViewHookMode shows read-only details for a single configured hook.
 *
 * The /hooks menu is read-only; this view replaces the former delete-hook
 * confirmation screen and directs users to settings.json or Claude for edits.
 */
import * as React from 'react'
import { Box, Text } from '@anthropic/ink'
import {
  hookSourceDescriptionDisplayString,
  type IndividualHookConfig,
} from '../../utils/hooks/hooksSettings.js'
import { Dialog } from '@anthropic/ink'

type Props = {
  selectedHook: IndividualHookConfig
  eventSupportsMatcher: boolean
  onCancel: () => void
}

export function ViewHookMode({
  selectedHook,
  eventSupportsMatcher,
  onCancel,
}: Props): React.ReactNode {
  return (
    <Dialog
      title="Hook details"
      onCancel={onCancel}
      inputGuide={() => <Text>Esc to go back</Text>}
    >
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text>
            Event: <Text bold>{selectedHook.event}</Text>
          </Text>
          {eventSupportsMatcher && (
            <Text>
              Matcher: <Text bold>{selectedHook.matcher || '(all)'}</Text>
            </Text>
          )}
          <Text>
            Type: <Text bold>{selectedHook.config.type}</Text>
          </Text>
          <Text>
            Source:{' '}
            <Text dimColor>
              {hookSourceDescriptionDisplayString(selectedHook.source)}
            </Text>
          </Text>
          {selectedHook.pluginName && (
            <Text>
              Plugin: <Text dimColor>{selectedHook.pluginName}</Text>
            </Text>
          )}
        </Box>
        <Box flexDirection="column">
          <Text dimColor>{getContentFieldLabel(selectedHook.config)}:</Text>
          <Box
            borderStyle="round"
            borderDimColor
            paddingLeft={1}
            paddingRight={1}
          >
            <Text>{getContentFieldValue(selectedHook.config)}</Text>
          </Box>
        </Box>
        {'statusMessage' in selectedHook.config &&
          selectedHook.config.statusMessage && (
            <Text>
              Status message:{' '}
              <Text dimColor>{selectedHook.config.statusMessage}</Text>
            </Text>
          )}
        <Text dimColor>
          To modify or remove this hook, edit settings.json directly or ask
          Claude to help.
        </Text>
      </Box>
    </Dialog>
  )
}

/**
 * Get a human-readable label for the primary content field of a hook
 * based on its type.
 */
function getContentFieldLabel(config: IndividualHookConfig['config']): string {
  switch (config.type) {
    case 'command':
      return 'Command'
    case 'prompt':
      return 'Prompt'
    case 'agent':
      return 'Prompt'
    case 'http':
      return 'URL'
  }
}

/**
 * Get the actual content value for a hook's primary field, bypassing
 * statusMessage so the detail view always shows the real command/prompt/URL.
 */
function getContentFieldValue(config: IndividualHookConfig['config']): string {
  switch (config.type) {
    case 'command':
      return config.command
    case 'prompt':
      return config.prompt
    case 'agent':
      return config.prompt
    case 'http':
      return config.url
  }
}

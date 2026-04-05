import * as React from 'react'
import { Box, Text } from 'src/ink.js'
import {
  type NetworkHostPattern,
  shouldAllowManagedSandboxDomainsOnly,
} from 'src/utils/sandbox/sandbox-adapter.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { Select } from '../CustomSelect/select.js'
import { PermissionDialog } from './PermissionDialog.js'

export type SandboxPermissionRequestProps = {
  hostPattern: NetworkHostPattern
  onUserResponse: (response: {
    allow: boolean
    persistToSettings: boolean
  }) => void
}

export function SandboxPermissionRequest({
  hostPattern: { host },
  onUserResponse,
}: SandboxPermissionRequestProps): React.ReactNode {
  function onSelect(value: string) {
    // We may want to better unify this dialog with other permission dialogs
    // and use their logging, but this is slightly different and we don't have
    // the tool context here. For now, just use basic logging for basic data.
    if (process.env.USER_TYPE === 'ant') {
      logEvent('tengu_sandbox_network_dialog_result', {
        host: host as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        result:
          value as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    }

    switch (value) {
      case 'yes':
        onUserResponse({ allow: true, persistToSettings: false })
        break
      case 'yes-dont-ask-again':
        onUserResponse({ allow: true, persistToSettings: true })
        break
      case 'no':
        onUserResponse({ allow: false, persistToSettings: false })
        break
    }
  }

  const managedDomainsOnly = shouldAllowManagedSandboxDomainsOnly()

  const options = [
    { label: 'Yes', value: 'yes' },
    ...(!managedDomainsOnly
      ? [
          {
            label: (
              <Text>
                Yes, and don&apos;t ask again for <Text bold>{host}</Text>
              </Text>
            ),
            value: 'yes-dont-ask-again',
          },
        ]
      : []),
    {
      label: (
        <Text>
          No, and tell Claude what to do differently <Text bold>(esc)</Text>
        </Text>
      ),
      value: 'no',
    },
  ]

  return (
    <PermissionDialog title="Network request outside of sandbox">
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box>
          <Text dimColor>Host:</Text>
          <Text> {host}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Do you want to allow this connection?</Text>
        </Box>
        <Box>
          <Select
            options={options}
            onChange={onSelect}
            onCancel={() => {
              if (process.env.USER_TYPE === 'ant') {
                logEvent('tengu_sandbox_network_dialog_result', {
                  host: host as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                  result:
                    'cancel' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                })
              }
              onUserResponse({ allow: false, persistToSettings: false })
            }}
          />
        </Box>
      </Box>
    </PermissionDialog>
  )
}

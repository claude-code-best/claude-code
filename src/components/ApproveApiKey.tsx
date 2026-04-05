import React from 'react'
import { t } from '../i18n/index.js'
import { Text } from '../ink.js'
import { saveGlobalConfig } from '../utils/config.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'

type Props = {
  customApiKeyTruncated: string
  onDone(approved: boolean): void
}

export function ApproveApiKey({
  customApiKeyTruncated,
  onDone,
}: Props): React.ReactNode {
  function onChange(value: 'yes' | 'no') {
    switch (value) {
      case 'yes': {
        saveGlobalConfig(current => ({
          ...current,
          customApiKeyResponses: {
            ...current.customApiKeyResponses,
            approved: [
              ...(current.customApiKeyResponses?.approved ?? []),
              customApiKeyTruncated,
            ],
          },
        }))
        onDone(true)
        break
      }
      case 'no': {
        saveGlobalConfig(current => ({
          ...current,
          customApiKeyResponses: {
            ...current.customApiKeyResponses,
            rejected: [
              ...(current.customApiKeyResponses?.rejected ?? []),
              customApiKeyTruncated,
            ],
          },
        }))
        onDone(false)
        break
      }
    }
  }

  return (
    <Dialog
      title={t('auth.apiKeyDetected')}
      color="warning"
      onCancel={() => onChange('no')}
    >
      <Text>
        <Text bold>ANTHROPIC_API_KEY</Text>
        <Text>: sk-ant-...{customApiKeyTruncated}</Text>
      </Text>
      <Text>{t('auth.apiKeyPrompt')}</Text>
      <Select
        defaultValue="no"
        defaultFocusValue="no"
        options={[
          { label: t('auth.apiKeyYes'), value: 'yes' },
          {
            label: (
              <Text>
                {t('auth.apiKeyNo')} (<Text bold>{t('auth.apiKeyRecommended')}</Text>)
              </Text>
            ),
            value: 'no',
          },
        ]}
        onChange={value => onChange(value as 'yes' | 'no')}
        onCancel={() => onChange('no')}
      />
    </Dialog>
  )
}

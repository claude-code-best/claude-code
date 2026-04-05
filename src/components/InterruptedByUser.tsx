import * as React from 'react'
import { t } from '../i18n/index.js'
import { Text } from '../ink.js'

export function InterruptedByUser(): React.ReactNode {
  return (
    <>
      <Text dimColor>{t('common.cancelling')} </Text>
      {process.env.USER_TYPE === 'ant' ? (
        <Text dimColor>· [ANT-ONLY] /issue to report a model issue</Text>
      ) : (
        <Text dimColor>· {t('ui.whatShouldClaudeDoInstead')}</Text>
      )}
    </>
  )
}

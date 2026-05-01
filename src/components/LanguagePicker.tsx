import React from 'react'
import { Box, Text } from '@anthropic/ink'
import { Select } from './CustomSelect/index.js'
import { t } from '../utils/i18n/index.js'

type Props = {
  initialLanguage: string | undefined
  onComplete: (language: string | undefined) => void
  onCancel: () => void
}

const LANGUAGE_OPTIONS = [
  { label: 'Auto (follow system)', value: 'auto' as const },
  { label: 'English', value: 'en' as const },
  { label: '中文', value: 'zh' as const },
]

export function LanguagePicker({
  initialLanguage,
  onComplete,
  onCancel,
}: Props): React.ReactNode {
  const defaultFocusValue =
    initialLanguage === 'en' ? 'en' : initialLanguage === 'zh' ? 'zh' : 'auto'

  const options = LANGUAGE_OPTIONS.map(opt => ({
    label: t(`settings.language.option.${opt.value}`, opt.label),
    value: opt.value,
  }))

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="remember" bold>{t('settings.language.pickerTitle', 'Select your preferred language:')}</Text>
      <Select
        options={options}
        defaultFocusValue={defaultFocusValue}
        onChange={value => {
          onComplete(value === 'auto' ? undefined : value)
        }}
        onCancel={onCancel}
      />
      <Text dimColor>{t('settings.language.pickerHint', 'Takes effect after restart')}</Text>
    </Box>
  )
}

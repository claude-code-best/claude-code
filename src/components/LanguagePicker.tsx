import figures from 'figures'
import React, { useState } from 'react'
import { Box, Text } from '@anthropic/ink'
import { Select } from './CustomSelect/index.js'
import { t } from '../utils/i18n/index.js'

type Props = {
  initialLanguage: string | undefined
  onComplete: (language: string | undefined) => void
  onCancel: () => void
}

export function LanguagePicker({
  initialLanguage,
  onComplete,
  onCancel,
}: Props): React.ReactNode {
  const [selectedIndex, setSelectedIndex] = useState(
    initialLanguage === 'en' ? 1 : initialLanguage === 'zh' ? 2 : 0,
  )

  const options = [
    { label: t('settings.language.option.auto', 'Auto (follow system)'), value: 'auto' },
    { label: t('settings.language.option.english', 'English'), value: 'en' },
    { label: t('settings.language.option.chinese', '中文'), value: 'zh' },
  ]

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="remember" bold>{t('settings.language.pickerTitle', 'Select your preferred language:')}</Text>
      <Select
        options={options}
        defaultValue={options[selectedIndex].value}
        onChange={value => {
          onComplete(value === 'auto' ? undefined : value)
        }}
        onCancel={onCancel}
      />
      <Text dimColor>{t('settings.language.pickerHint', 'Takes effect after restart')}</Text>
    </Box>
  )
}

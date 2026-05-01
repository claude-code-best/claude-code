import figures from 'figures'
import React, { useState } from 'react'
import { Box, Text, useInput } from '@anthropic/ink'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { t } from '../utils/i18n/index.js'

type LanguageOption = {
  label: string
  value: string | undefined
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { label: t('settings.language.option.auto', 'Auto (follow system)'), value: undefined },
  { label: t('settings.language.option.english', 'English'), value: 'en' },
  { label: t('settings.language.option.chinese', '中文'), value: 'zh' },
]

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
  // Map initialLanguage to option index
  const initialIndex = LANGUAGE_OPTIONS.findIndex(
    opt => opt.value === initialLanguage,
  )
  const [selectedIndex, setSelectedIndex] = useState(
    initialIndex >= 0 ? initialIndex : 0,
  )

  useKeybinding('confirm:no', onCancel, { context: 'Settings' })

  useInput(input => {
    if (input === 'up') {
      setSelectedIndex(prev =>
        prev > 0 ? prev - 1 : LANGUAGE_OPTIONS.length - 1,
      )
    }
    if (input === 'down') {
      setSelectedIndex(prev =>
        prev < LANGUAGE_OPTIONS.length - 1 ? prev + 1 : 0,
      )
    }
  })

  function handleSubmit(): void {
    onComplete(LANGUAGE_OPTIONS[selectedIndex].value)
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text>{t('settings.language.pickerTitle', 'Select your preferred language:')}</Text>
      {LANGUAGE_OPTIONS.map((option, index) => (
        <Box key={option.value ?? 'auto'}>
          <Text>
            {index === selectedIndex ? `${figures.pointer} ` : '  '}
          </Text>
          <Text bold={index === selectedIndex}>{option.label}</Text>
        </Box>
      ))}
      <Text dimColor>{t('settings.language.pickerHint', 'Takes effect after restart')} · {t('ui.back', 'Back')}: Esc</Text>
      <Box marginTop={1}>
        <Text>{figures.tick} Press Enter to confirm</Text>
      </Box>
    </Box>
  )
}

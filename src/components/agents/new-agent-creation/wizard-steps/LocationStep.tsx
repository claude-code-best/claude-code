import React, { type ReactNode } from 'react'
import { Box, Byline, KeyboardShortcutHint } from '@anthropic/ink'
import type { SettingSource } from '../../../../utils/settings/constants.js'
import { ConfigurableShortcutHint } from '../../../ConfigurableShortcutHint.js'
import { Select } from '../../../CustomSelect/select.js'
import { useWizard } from '../../../wizard/index.js'
import { WizardDialogLayout } from '../../../wizard/WizardDialogLayout.js'
import type { AgentWizardData } from '../types.js'

export function LocationStep(): ReactNode {
  const { goNext, updateWizardData, cancel } = useWizard<AgentWizardData>()

  const locationOptions = [
    {
      label: 'Project (.claude/agents/)',
      value: 'projectSettings' as SettingSource,
    },
    {
      label: 'Personal (~/.claude/agents/)',
      value: 'userSettings' as SettingSource,
    },
  ]

  return (
    <WizardDialogLayout
      subtitle="Choose location"
      footerText={
        <Byline>
          <KeyboardShortcutHint shortcut="↑↓" action="navigate" />
          <KeyboardShortcutHint shortcut="Enter" action="select" />
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="cancel"
          />
        </Byline>
      }
    >
      <Box>
        <Select
          key="location-select"
          options={locationOptions}
          onChange={(value: string) => {
            updateWizardData({ location: value as SettingSource })
            goNext()
          }}
          onCancel={() => cancel()}
        />
      </Box>
    </WizardDialogLayout>
  )
}

import React, { type ReactNode } from 'react'
import { Box } from '../../../../ink.js'
import { ConfigurableShortcutHint } from '../../../ConfigurableShortcutHint.js'
import { Select } from '../../../CustomSelect/select.js'
import { Byline } from '../../../design-system/Byline.js'
import { KeyboardShortcutHint } from '../../../design-system/KeyboardShortcutHint.js'
import { useWizard } from '../../../wizard/index.js'
import { WizardDialogLayout } from '../../../wizard/WizardDialogLayout.js'
import type { AgentWizardData } from '../types.js'

export function MethodStep(): ReactNode {
  const { goNext, goBack, updateWizardData, goToStep } =
    useWizard<AgentWizardData>()

  const methodOptions = [
    {
      label: 'Generate with Claude (recommended)',
      value: 'generate',
    },
    {
      label: 'Manual configuration',
      value: 'manual',
    },
  ]

  return (
    <WizardDialogLayout
      subtitle="Creation method"
      footerText={
        <Byline>
          <KeyboardShortcutHint shortcut="↑↓" action="navigate" />
          <KeyboardShortcutHint shortcut="Enter" action="select" />
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="go back"
          />
        </Byline>
      }
    >
      <Box>
        <Select
          key="method-select"
          options={methodOptions}
          onChange={(value: string) => {
            const method = value as 'generate' | 'manual'
            updateWizardData({
              method,
              wasGenerated: method === 'generate',
            })

            // Dynamic navigation based on method
            if (method === 'generate') {
              goNext() // Go to GenerateStep (index 2)
            } else {
              goToStep(3) // Skip to TypeStep (index 3)
            }
          }}
          onCancel={() => goBack()}
        />
      </Box>
    </WizardDialogLayout>
  )
}

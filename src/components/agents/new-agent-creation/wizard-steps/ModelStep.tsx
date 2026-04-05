import React, { type ReactNode } from 'react'
import { ConfigurableShortcutHint } from '../../../ConfigurableShortcutHint.js'
import { Byline } from '../../../design-system/Byline.js'
import { KeyboardShortcutHint } from '../../../design-system/KeyboardShortcutHint.js'
import { useWizard } from '../../../wizard/index.js'
import { WizardDialogLayout } from '../../../wizard/WizardDialogLayout.js'
import { ModelSelector } from '../../ModelSelector.js'
import type { AgentWizardData } from '../types.js'

export function ModelStep(): ReactNode {
  const { goNext, goBack, updateWizardData, wizardData } =
    useWizard<AgentWizardData>()

  const handleComplete = (model?: string): void => {
    updateWizardData({ selectedModel: model })
    goNext()
  }

  return (
    <WizardDialogLayout
      subtitle="Select model"
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
      <ModelSelector
        initialModel={wizardData.selectedModel}
        onComplete={handleComplete}
        onCancel={goBack}
      />
    </WizardDialogLayout>
  )
}

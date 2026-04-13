import React, { type ReactNode } from 'react'
import { Box, Byline, KeyboardShortcutHint } from '@anthropic/ink'
import { useKeybinding } from '../../../../keybindings/useKeybinding.js'
import type { AgentColorName } from '@claude-code-best/builtin-tools/tools/AgentTool/agentColorManager.js'
import { ConfigurableShortcutHint } from '../../../ConfigurableShortcutHint.js'
import { useWizard } from '../../../wizard/index.js'
import { WizardDialogLayout } from '../../../wizard/WizardDialogLayout.js'
import { ColorPicker } from '../../ColorPicker.js'
import type { AgentWizardData } from '../types.js'

export function ColorStep(): ReactNode {
  const { goNext, goBack, updateWizardData, wizardData } =
    useWizard<AgentWizardData>()

  // Handle escape key - ColorPicker handles its own escape internally
  useKeybinding('confirm:no', goBack, { context: 'Confirmation' })

  const handleConfirm = (color?: string): void => {
    updateWizardData({
      selectedColor: color,
      // Prepare final agent for confirmation
      finalAgent: {
        agentType: wizardData.agentType!,
        whenToUse: wizardData.whenToUse!,
        getSystemPrompt: () => wizardData.systemPrompt!,
        tools: wizardData.selectedTools,
        ...(wizardData.selectedModel
          ? { model: wizardData.selectedModel }
          : {}),
        ...(color ? { color: color as AgentColorName } : {}),
        source: wizardData.location!,
      },
    })
    goNext()
  }

  return (
    <WizardDialogLayout
      subtitle="Choose background color"
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
        <ColorPicker
          agentName={wizardData.agentType || 'agent'}
          currentColor="automatic"
          onConfirm={handleConfirm}
        />
      </Box>
    </WizardDialogLayout>
  )
}

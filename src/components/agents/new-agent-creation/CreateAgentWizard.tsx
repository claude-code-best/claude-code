import React, { type ReactNode } from 'react'
import { isAutoMemoryEnabled } from '../../../memdir/paths.js'
import type { Tools } from '../../../Tool.js'
import type { AgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js'
import { WizardProvider } from '../../wizard/index.js'
import type { WizardStepComponent } from '../../wizard/types.js'
import type { AgentWizardData } from './types.js'
import { ColorStep } from './wizard-steps/ColorStep.js'
import { ConfirmStepWrapper } from './wizard-steps/ConfirmStepWrapper.js'
import { DescriptionStep } from './wizard-steps/DescriptionStep.js'
import { GenerateStep } from './wizard-steps/GenerateStep.js'
import { LocationStep } from './wizard-steps/LocationStep.js'
import { MemoryStep } from './wizard-steps/MemoryStep.js'
import { MethodStep } from './wizard-steps/MethodStep.js'
import { ModelStep } from './wizard-steps/ModelStep.js'
import { PromptStep } from './wizard-steps/PromptStep.js'
import { ToolsStep } from './wizard-steps/ToolsStep.js'
import { TypeStep } from './wizard-steps/TypeStep.js'

type Props = {
  tools: Tools
  existingAgents: AgentDefinition[]
  onComplete: (message: string) => void
  onCancel: () => void
}

export function CreateAgentWizard({
  tools,
  existingAgents,
  onComplete,
  onCancel,
}: Props): ReactNode {
  // Create step components with props
  const steps: WizardStepComponent[] = [
    LocationStep, // 0
    MethodStep, // 1
    GenerateStep, // 2
    () => <TypeStep existingAgents={existingAgents} />, // 3
    PromptStep, // 4
    DescriptionStep, // 5
    () => <ToolsStep tools={tools} />, // 6
    ModelStep, // 7
    ColorStep, // 8
    // MemoryStep is conditionally included based on GrowthBook gate
    ...(isAutoMemoryEnabled() ? [MemoryStep] : []),
    () => (
      <ConfirmStepWrapper
        tools={tools}
        existingAgents={existingAgents}
        onComplete={onComplete}
      />
    ),
  ]

  return (
    <WizardProvider<AgentWizardData>
      steps={steps}
      initialData={{}}
      onComplete={() => {
        // Wizard completion is handled by ConfirmStepWrapper
        // which calls onComplete with the appropriate message
      }}
      onCancel={onCancel}
      title="Create new agent"
      showStepCounter={false}
    />
  )
}

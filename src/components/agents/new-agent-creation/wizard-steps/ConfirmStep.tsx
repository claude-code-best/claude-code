import React, { type ReactNode } from 'react'
import { type KeyboardEvent, Box, Byline, KeyboardShortcutHint, Text } from '@anthropic/ink'
import { useKeybinding } from '../../../../keybindings/useKeybinding.js'
import { isAutoMemoryEnabled } from '../../../../memdir/paths.js'
import type { Tools } from '../../../../Tool.js'
import { getMemoryScopeDisplay } from '../../../../tools/AgentTool/agentMemory.js'
import type { AgentDefinition } from '../../../../tools/AgentTool/loadAgentsDir.js'
import { truncateToWidth } from '../../../../utils/format.js'
import { getAgentModelDisplay } from '../../../../utils/model/agent.js'
import { ConfigurableShortcutHint } from '../../../ConfigurableShortcutHint.js'
import { useWizard } from '../../../wizard/index.js'
import { WizardDialogLayout } from '../../../wizard/WizardDialogLayout.js'
import { getNewRelativeAgentFilePath } from '../../agentFileUtils.js'
import { validateAgent } from '../../validateAgent.js'
import type { AgentWizardData } from '../types.js'

type Props = {
  tools: Tools
  existingAgents: AgentDefinition[]
  onSave: () => void
  onSaveAndEdit: () => void
  error?: string | null
}

export function ConfirmStep({
  tools,
  existingAgents,
  onSave,
  onSaveAndEdit,
  error,
}: Props): ReactNode {
  const { goBack, wizardData } = useWizard<AgentWizardData>()

  useKeybinding('confirm:no', goBack, { context: 'Confirmation' })

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 's' || e.key === 'return') {
      e.preventDefault()
      onSave()
    } else if (e.key === 'e') {
      e.preventDefault()
      onSaveAndEdit()
    }
  }

  const agent = wizardData.finalAgent!
  const validation = validateAgent(agent, tools, existingAgents)

  const systemPromptPreview = truncateToWidth(agent.getSystemPrompt(), 240)
  const whenToUsePreview = truncateToWidth(agent.whenToUse, 240)

  const getToolsDisplay = (toolNames: string[] | undefined): string => {
    // undefined means "all tools" per PR semantic
    if (toolNames === undefined) return 'All tools'
    if (toolNames.length === 0) return 'None'
    if (toolNames.length === 1) return toolNames[0] || 'None'
    if (toolNames.length === 2) return toolNames.join(' and ')
    return `${toolNames.slice(0, -1).join(', ')}, and ${toolNames[toolNames.length - 1]}`
  }

  // Compute memory display outside JSX
  const memoryDisplayElement = isAutoMemoryEnabled() ? (
    <Text>
      <Text bold>Memory</Text>: {getMemoryScopeDisplay(agent.memory)}
    </Text>
  ) : null

  return (
    <WizardDialogLayout
      subtitle="Confirm and save"
      footerText={
        <Byline>
          <KeyboardShortcutHint shortcut="s/Enter" action="save" />
          <KeyboardShortcutHint shortcut="e" action="edit in your editor" />
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="cancel"
          />
        </Byline>
      }
    >
      <Box
        flexDirection="column"
        tabIndex={0}
        autoFocus
        onKeyDown={handleKeyDown}
      >
        <Text>
          <Text bold>Name</Text>: {agent.agentType}
        </Text>
        <Text>
          <Text bold>Location</Text>:{' '}
          {getNewRelativeAgentFilePath({
            source: wizardData.location!,
            agentType: agent.agentType,
          })}
        </Text>
        <Text>
          <Text bold>Tools</Text>: {getToolsDisplay(agent.tools)}
        </Text>
        <Text>
          <Text bold>Model</Text>: {getAgentModelDisplay(agent.model)}
        </Text>
        {memoryDisplayElement}

        <Box marginTop={1}>
          <Text>
            <Text bold>Description</Text> (tells Claude when to use this agent):
          </Text>
        </Box>
        <Box marginLeft={2} marginTop={1}>
          <Text>{whenToUsePreview}</Text>
        </Box>

        <Box marginTop={1}>
          <Text>
            <Text bold>System prompt</Text>:
          </Text>
        </Box>
        <Box marginLeft={2} marginTop={1}>
          <Text>{systemPromptPreview}</Text>
        </Box>

        {validation.warnings.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text color="warning">Warnings:</Text>
            {validation.warnings.map((warning, i) => (
              <Text key={i} dimColor>
                {' '}
                • {warning}
              </Text>
            ))}
          </Box>
        )}

        {validation.errors.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text color="error">Errors:</Text>
            {validation.errors.map((err, i) => (
              <Text key={i} color="error">
                {' '}
                • {err}
              </Text>
            ))}
          </Box>
        )}

        {error && (
          <Box marginTop={1}>
            <Text color="error">{error}</Text>
          </Box>
        )}

        <Box marginTop={2}>
          <Text color="success">
            Press <Text bold>s</Text> or <Text bold>Enter</Text> to save,{' '}
            <Text bold>e</Text> to save and edit
          </Text>
        </Box>
      </Box>
    </WizardDialogLayout>
  )
}

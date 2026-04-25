import * as React from 'react'
import { Settings } from '../../components/Settings/Settings.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { elicitChoice } from '../elicitation.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

export const call: LocalJSXCommandCall = async (onDone, context) => {
  if (context.elicit) {
    const choice = await elicitChoice(
      context,
      'Choose a config action.',
      'action',
      'Config action',
      [
        { value: 'summary', title: 'Show summary' },
        { value: 'autoCompactEnabled', title: 'Auto-compact' },
        { value: 'thinkingEnabled', title: 'Thinking mode' },
        { value: 'verbose', title: 'Verbose output' },
        { value: 'spinnerTipsEnabled', title: 'Show tips' },
      ],
    )

    if (choice.status === 'cancelled') {
      onDone('Config unchanged', { display: 'system' })
      return null
    }

    if (choice.status === 'accepted') {
      if (choice.value === 'summary') {
        onDone(renderConfigSummary())
        return null
      }

      const enabled = await elicitChoice(
        context,
        'Choose the new value.',
        'value',
        'Value',
        [
          { value: 'true', title: 'On' },
          { value: 'false', title: 'Off' },
        ],
      )
      if (enabled.status !== 'accepted') {
        onDone('Config unchanged', { display: 'system' })
        return null
      }
      const nextValue = enabled.value === 'true'
      applyConfigAction(choice.value, nextValue, context)
      onDone(`${configActionLabel(choice.value)} set to ${nextValue ? 'on' : 'off'}`)
      return null
    }
  }

  return <Settings onClose={onDone} context={context} defaultTab="Config" />
}

function renderConfigSummary(): string {
  const globalConfig = getGlobalConfig()
  const settings = getInitialSettings()
  return [
    'Config summary:',
    `- Auto-compact: ${globalConfig.autoCompactEnabled ? 'on' : 'off'}`,
    `- Thinking mode: ${settings?.thinkingEnabled ? 'on' : 'off'}`,
    `- Verbose output: ${globalConfig.verbose ? 'on' : 'off'}`,
    `- Show tips: ${settings?.spinnerTipsEnabled ?? true ? 'on' : 'off'}`,
    `- Theme: ${globalConfig.theme ?? 'default'}`,
  ].join('\n')
}

function applyConfigAction(
  action: string,
  enabled: boolean,
  context: Parameters<LocalJSXCommandCall>[1],
): void {
  switch (action) {
    case 'autoCompactEnabled':
      saveGlobalConfig(current => ({ ...current, autoCompactEnabled: enabled }))
      return
    case 'thinkingEnabled':
      updateSettingsForSource('userSettings', { thinkingEnabled: enabled })
      context.setAppState(prev => ({ ...prev, thinkingEnabled: enabled }))
      return
    case 'verbose':
      saveGlobalConfig(current => ({ ...current, verbose: enabled }))
      context.setAppState(prev => ({ ...prev, verbose: enabled }))
      return
    case 'spinnerTipsEnabled':
      updateSettingsForSource('localSettings', {
        spinnerTipsEnabled: enabled ? undefined : false,
      })
      context.setAppState(prev => ({
        ...prev,
        settings: { ...prev.settings, spinnerTipsEnabled: enabled },
      }))
      return
  }
}

function configActionLabel(action: string): string {
  switch (action) {
    case 'autoCompactEnabled':
      return 'Auto-compact'
    case 'thinkingEnabled':
      return 'Thinking mode'
    case 'verbose':
      return 'Verbose output'
    case 'spinnerTipsEnabled':
      return 'Show tips'
    default:
      return action
  }
}

import type { Command } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'
import { MIX_MODE_ENV, isMixModeEnabled } from '../utils/model/mix.js'
import {
  getSettings_DEPRECATED,
  getSettingsFilePathForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'

const TRUE_VALUES = new Set(['true', 'on', 'enable', 'enabled', '1', 'yes'])
const FALSE_VALUES = new Set(['false', 'off', 'disable', 'disabled', '0', 'no'])

function getMixUsageText(
  enabled: boolean,
  settingsPath: string | undefined,
): string {
  return [
    `Mix mode is ${enabled ? 'enabled' : 'disabled'}.`,
    `Settings file: ${settingsPath ?? 'unknown'}`,
    '',
    'Usage:',
    '  /mix true    Enable mixed model mode',
    '  /mix false   Disable mixed model mode',
    '  /mix status  Show current mixed model mode status',
    '',
    'When mixed model mode is enabled, Opus, Sonnet, and Haiku can each be configured separately.',
    'After running /mix true, run /login and choose which model family you want to configure first.',
    'Each model family stores its own provider, API URL, API key, and model name in ccbsettings.json.',
  ].join('\n')
}

const call: LocalCommandCall = async args => {
  const arg = args.trim().toLowerCase()
  const settingsPath = getSettingsFilePathForSource('userSettings')

  if (!arg || arg === 'status') {
    const settings = getSettings_DEPRECATED() || {}
    const enabled = isMixModeEnabled(settings)
    return {
      type: 'text',
      value: getMixUsageText(enabled, settingsPath),
    }
  }

  if (!TRUE_VALUES.has(arg) && !FALSE_VALUES.has(arg)) {
    return {
      type: 'text',
      value: getMixUsageText(
        isMixModeEnabled(getSettings_DEPRECATED() || {}),
        settingsPath,
      ),
    }
  }

  const enabled = TRUE_VALUES.has(arg)
  const { error } = updateSettingsForSource('userSettings', { mix: enabled })
  if (error) {
    return {
      type: 'text',
      value: `Failed to update mix mode: ${error.message}`,
    }
  }

  process.env[MIX_MODE_ENV] = enabled ? '1' : '0'
  return {
    type: 'text',
    value: enabled
      ? [
          'Mix mode enabled.',
          '',
          'Next step: run /login, then select Opus, Sonnet, or Haiku to configure that model family.',
          'Each family can use its own provider, API URL, API key, and model name.',
        ].join('\n')
      : 'Mix mode disabled. /login will use the shared API configuration flow.',
  }
}

const mix = {
  type: 'local',
  name: 'mix',
  description:
    'Enable or disable mixed model mode; when enabled, Opus, Sonnet, and Haiku can be configured separately',
  argumentHint: '[true|false|status]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default mix

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

const call: LocalCommandCall = async args => {
  const arg = args.trim().toLowerCase()

  if (!arg || arg === 'status') {
    const settings = getSettings_DEPRECATED() || {}
    const enabled = isMixModeEnabled(settings)
    const path = getSettingsFilePathForSource('userSettings')
    return {
      type: 'text',
      value: `Mix mode is ${enabled ? 'enabled' : 'disabled'}.\nSettings file: ${path ?? 'unknown'}`,
    }
  }

  if (!TRUE_VALUES.has(arg) && !FALSE_VALUES.has(arg)) {
    return {
      type: 'text',
      value: 'Usage: /mix [true|false|status]',
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
      ? 'Mix mode enabled. Run /login to configure Opus, Sonnet, and Haiku separately.'
      : 'Mix mode disabled. /login will use the shared API configuration flow.',
  }
}

const mix = {
  type: 'local',
  name: 'mix',
  description: 'Toggle per-model API configuration mode',
  argumentHint: '[true|false|status]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default mix

import { normalizeLanguageForSTT } from '../../hooks/useVoice.js'
import { getShortcutDisplay } from '../../keybindings/shortcutFormat.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalCommandCall } from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { settingsChangeDetector } from '../../utils/settings/changeDetector.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'
import { isVoiceAvailable } from '../../voice/voiceModeEnabled.js'

const LANG_HINT_MAX_SHOWS = 2

export const call: LocalCommandCall = async args => {
  // Check kill-switch before allowing voice mode
  if (!isVoiceAvailable()) {
    return {
      type: 'text' as const,
      value: '语音模式不可用。',
    }
  }

  const currentSettings = getInitialSettings()
  const isCurrentlyEnabled = currentSettings.voiceEnabled === true
  const providerArg = args?.trim().toLowerCase()

  // Handle provider argument when already enabled — switch backend only
  if (isCurrentlyEnabled && providerArg === 'doubao') {
    const result = updateSettingsForSource('userSettings', {
      voiceProvider: 'doubao',
    })
    if (result.error) {
      return {
        type: 'text' as const,
        value:
          'Failed to update settings. Check your settings file for syntax errors.',
      }
    }
    settingsChangeDetector.notifyChange('userSettings')
    const key = getShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')
    return {
      type: 'text' as const,
      value: `Voice mode switched to Doubao ASR. Hold ${key} to record.`,
    }
  }

  // Handle provider argument when already enabled — switch to anthropic
  if (isCurrentlyEnabled && providerArg === 'anthropic') {
    const result = updateSettingsForSource('userSettings', {
      voiceProvider: 'anthropic',
    })
    if (result.error) {
      return {
        type: 'text' as const,
        value:
          'Failed to update settings. Check your settings file for syntax errors.',
      }
    }
    settingsChangeDetector.notifyChange('userSettings')
    const key = getShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')
    return {
      type: 'text' as const,
      value: `Voice mode switched to Anthropic STT. Hold ${key} to record.`,
    }
  }

  // Toggle OFF — no checks needed
  if (isCurrentlyEnabled) {
    const result = updateSettingsForSource('userSettings', {
      voiceProvider: 'anthropic',
    })
    if (result.error) {
      return {
        type: 'text' as const,
        value:
          'Failed to update settings. Check your settings file for syntax errors.',
      }
    }
    settingsChangeDetector.notifyChange('userSettings')
    const key = getShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')
    return {
      type: 'text' as const,
      value: `Voice mode switched to Anthropic STT. Hold ${key} to record.`,
    }
  }

  // 切换为 OFF — 无需检查
  if (isCurrentlyEnabled) {
    const result = updateSettingsForSource('userSettings', {
      voiceEnabled: false,
    })
    if (result.error) {
      return {
        type: 'text' as const,
        value: '更新设置失败。请检查设置文件中的语法错误。',
      }
    }
    settingsChangeDetector.notifyChange('userSettings')
    logEvent('tengu_voice_toggled', { enabled: false })
    return {
      type: 'text' as const,
      value: '语音模式已禁用。',
    }
  }

  // Toggle ON — determine provider from argument or default
  const provider = providerArg === 'doubao' ? 'doubao' : 'anthropic'

  // Run pre-flight checks
  const { isVoiceStreamAvailable } = await import(
    '../../services/voiceStreamSTT.js'
  )
  const { checkRecordingAvailability } = await import('../../services/voice.js')

  // 检查录音可用性（麦克风访问权限）
  const recording = await checkRecordingAvailability()
  if (!recording.available) {
    return {
      type: 'text' as const,
      value: recording.reason ?? '在此环境中语音模式不可用。',
    }
  }

  // Check for API key (only for Anthropic backend — Doubao uses its own credentials)
  if (provider !== 'doubao' && !isVoiceStreamAvailable()) {
    return {
      type: 'text' as const,
      value: '语音模式需要 Claude.ai 账户。请运行 /login 登录。',
    }
  }

  // 检查录音工具
  const { checkVoiceDependencies, requestMicrophonePermission } = await import(
    '../../services/voice.js'
  )
  const deps = await checkVoiceDependencies()
  if (!deps.available) {
    const hint = deps.installCommand
      ? `
是否安装音频录制工具？运行：${deps.installCommand}`
      : '\n请手动安装 SoX 以进行音频录制。'
    return {
      type: 'text' as const,
      value: `未找到音频录制工具。${hint}`,
    }
  }

  // 探测麦克风访问权限，以便操作系统权限对话框现在弹出
  // ，而不是在用户首次按住说话时触发。
  if (!(await requestMicrophonePermission())) {
    let guidance: string
    if (process.platform === 'win32') {
      guidance = '设置 → 隐私 → 麦克风'
    } else if (process.platform === 'linux') {
      guidance = '您系统的音频设置'
    } else {
      guidance = '系统设置 → 隐私与安全 → 麦克风'
    }
    return {
      type: 'text' as const,
      value: `麦克风访问被拒绝。要启用它，请前往 ${guidance}，然后再次运行 /voice。`,
    }
  }

  // All checks passed — enable voice with provider
  const result = updateSettingsForSource('userSettings', {
    voiceEnabled: true,
    ...(provider === 'doubao' ? { voiceProvider: 'doubao' } : {}),
  })
  if (result.error) {
    return {
      type: 'text' as const,
      value: '更新设置失败。请检查设置文件中的语法错误。',
    }
  }
  settingsChangeDetector.notifyChange('userSettings')
  logEvent('tengu_voice_toggled', { enabled: true })
  const key = getShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')
  let langNote = ''
  const providerLabel = provider === 'doubao' ? 'Doubao ASR' : 'Anthropic'
  // Doubao backend handles all languages natively — skip language hints
  if (provider !== 'doubao') {
    const stt = normalizeLanguageForSTT(currentSettings.language)
    const cfg = getGlobalConfig()
    const langChanged = cfg.voiceLangHintLastLanguage !== stt.code
    const priorCount = langChanged ? 0 : (cfg.voiceLangHintShownCount ?? 0)
    const showHint = !stt.fellBackFrom && priorCount < LANG_HINT_MAX_SHOWS
    if (stt.fellBackFrom) {
      langNote = ` Note: "${stt.fellBackFrom}" is not a supported dictation language; using English. Change it via /config.`
    } else if (showHint) {
      langNote = ` Dictation language: ${stt.code} (/config to change).`
    }
    if (langChanged || showHint) {
      saveGlobalConfig(prev => ({
        ...prev,
        voiceLangHintShownCount: priorCount + (showHint ? 1 : 0),
        voiceLangHintLastLanguage: stt.code,
      }))
    }
  }
  return {
    type: 'text' as const,
    value: `Voice mode enabled (${providerLabel}). Hold ${key} to record.${langNote}`,
  }
}

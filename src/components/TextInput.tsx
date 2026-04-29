import { feature } from 'bun:bundle'
import chalk from 'chalk'
import React, { useMemo, useRef } from 'react'
import { useVoiceState } from '../context/voice.js'
import { useClipboardImageHint } from '../hooks/useClipboardImageHint.js'
import { useSettings } from '../hooks/useSettings.js'
import { useTextInput } from '../hooks/useTextInput.js'
import { Box, color, useAnimationFrame, useTerminalFocus, useTheme } from '@anthropic/ink'
import type { BaseTextInputProps } from '../types/textInputTypes.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import type { TextHighlight } from '../utils/textHighlighting.js'
import { BaseTextInput } from './BaseTextInput.js'
import { hueToRgb } from './Spinner/utils.js'

// 波形条使用的字符块：空格（静音） + 8 个递增的块元素。
const BARS = ' \u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588'

// 迷你波形光标宽度
const CURSOR_WAVEFORM_WIDTH = 1

// 平滑因子（0 = 即时，1 = 冻结）。作为指数移动平均应用于
// 上升和下降过程，以获得稳定、无抖动的波形条。
const SMOOTH = 0.7

// 音频电平的增强因子 — computeLevel 使用保守的除数（rms/2000）进行归一化，因此正常语音的电平大约在
// 0.3-0.5 之间。此乘数使波形条能利用整个动态范围。
// 原始音频电平阈值（增强前），低于此阈值光标显示为
const LEVEL_BOOST = 1.8

// 灰色。computeLevel 返回 sqrt(rms/2000)，因此环境麦克风噪声
// 通常位于 0.05-0.15。语音大约从 0.2+ 开始。
// 提升至挂载时 — 此组件在每次按键时都会重新渲染。
const SILENCE_THRESHOLD = 0.15

export type Props = BaseTextInputProps & {
  highlights?: TextHighlight[]
}

export default function TextInput(props: Props): React.ReactNode {
  const [theme] = useTheme()
  const isTerminalFocused = useTerminalFocus()
  // 当终端重新获得焦点且剪贴板中有图像时显示提示
  const accessibilityEnabled = useMemo(
    () => isEnvTruthy(process.env.CLAUDE_CODE_ACCESSIBILITY),
    [],
  )
  const settings = useSettings()
  const reducedMotion = settings.prefersReducedMotion ?? false

  const voiceState = feature('VOICE_MODE')
    ?
      useVoiceState(s => s.voiceState)
    : ('idle' as const)
  const isVoiceRecording = voiceState === 'recording'

  const audioLevels = feature('VOICE_MODE')
    ?
      useVoiceState(s => s.voiceAudioLevels)
    : []
  const smoothedRef = useRef<number[]>(new Array(CURSOR_WAVEFORM_WIDTH).fill(0))

  const needsAnimation = isVoiceRecording && !reducedMotion
  const [animRef, animTime] = feature('VOICE_MODE')
    ?
      useAnimationFrame(needsAnimation ? 50 : null)
    : [() => {}, 0]

  // 光标反色函数：语音录制期间使用迷你波形，
  useClipboardImageHint(isTerminalFocused, !!props.onImagePaste)

  // 其他情况使用标准 chalk.inverse。无预热脉冲 — 约 120ms
  // 的预热窗口太短，无法让周期为 1s 的脉冲被识别，并且
  // 在预热期间以 50ms 间隔驱动 TextInput 重新渲染（同时空格
  // 字符正以每 30-80ms 的间隔到达）会导致明显的卡顿。
  // 基于最新音频电平的单条波形
  const canShowCursor = isTerminalFocused && !accessibilityEnabled
  let invert: (text: string) => string
  if (!canShowCursor) {
    invert = (text: string) => text
  } else if (isVoiceRecording && !reducedMotion) {
    // 最新音频电平的单柱波形
    const smoothed = smoothedRef.current
    const raw =
      audioLevels.length > 0 ? (audioLevels[audioLevels.length - 1] ?? 0) : 0
    const target = Math.min(raw * LEVEL_BOOST, 1)
    smoothed[0] = (smoothed[0] ?? 0) * SMOOTH + target * (1 - SMOOTH)
    const displayLevel = smoothed[0] ?? 0
    const barIndex = Math.max(
      1,
      Math.min(Math.round(displayLevel * (BARS.length - 1)), BARS.length - 1),
    )
    const isSilent = raw < SILENCE_THRESHOLD
    const hue = ((animTime / 1000) * 90) % 360
    const { r, g, b } = isSilent ? { r: 128, g: 128, b: 128 } : hueToRgb(hue)
    invert = () => chalk.rgb(r, g, b)(BARS[barIndex]!)
  } else {
    invert = chalk.inverse
  }

  const textInputState = useTextInput({
    value: props.value,
    onChange: props.onChange,
    onSubmit: props.onSubmit,
    onExit: props.onExit,
    onExitMessage: props.onExitMessage,
    onHistoryReset: props.onHistoryReset,
    onHistoryUp: props.onHistoryUp,
    onHistoryDown: props.onHistoryDown,
    onClearInput: props.onClearInput,
    focus: props.focus,
    mask: props.mask,
    multiline: props.multiline,
    cursorChar: props.showCursor ? ' ' : '',
    highlightPastedText: props.highlightPastedText,
    invert,
    themeText: color('text', theme),
    columns: props.columns,
    maxVisibleLines: props.maxVisibleLines,
    onImagePaste: props.onImagePaste,
    disableCursorMovementForUpDownKeys:
      props.disableCursorMovementForUpDownKeys,
    disableEscapeDoublePress: props.disableEscapeDoublePress,
    externalOffset: props.cursorOffset,
    onOffsetChange: props.onChangeCursorOffset,
    inputFilter: props.inputFilter,
    inlineGhostText: props.inlineGhostText,
    dim: chalk.dim,
  })

  return (
    <Box ref={animRef}>
      <BaseTextInput
        inputState={textInputState}
        terminalFocus={isTerminalFocused}
        highlights={props.highlights}
        invert={invert}
        hidePlaceholderText={isVoiceRecording}
        {...props}
      />
    </Box>
  )
}

import type { EffortValue } from '../../utils/effort.js'

/**
 * 光标在面板上的位置。仅面板内部使用，不进入 AppState / settings / API。
 * 'ultracode' 不是 EffortLevel；它在本面板里仅作视觉占位与文案引导。
 */
export type PanelPosition =
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'ultracode'

export const PANEL_POSITIONS: readonly PanelPosition[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultracode',
] as const

export const HOME_POSITION: PanelPosition = 'low'
export const END_POSITION: PanelPosition = 'ultracode'

/**
 * 判断一个值是否可作为面板光标位置（不含 ultracode，因 ultracode 仅由面板内部产生）。
 */
function isNonUltracodePosition(
  value: unknown,
): value is Exclude<PanelPosition, 'ultracode'> {
  return (
    typeof value === 'string' &&
    value !== 'ultracode' &&
    (PANEL_POSITIONS as readonly string[]).includes(value)
  )
}

/**
 * 把 EffortValue 归一化为面板可用的光标位置。
 * - null / undefined / 数值（ant-only）/ ultracode → undefined（让上层用 displayed）
 * - 合法 string 档位 → 返回该档位
 */
function normalizeToPanelPosition(
  value: EffortValue | null | undefined,
): PanelPosition | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number') return undefined
  if (isNonUltracodePosition(value)) {
    return value
  }
  return undefined
}

export function moveLeft(cursor: PanelPosition): PanelPosition {
  const idx = PANEL_POSITIONS.indexOf(cursor)
  if (idx <= 0) return PANEL_POSITIONS[0]
  return PANEL_POSITIONS[idx - 1]
}

export function moveRight(cursor: PanelPosition): PanelPosition {
  const idx = PANEL_POSITIONS.indexOf(cursor)
  if (idx === -1 || idx >= PANEL_POSITIONS.length - 1) {
    return PANEL_POSITIONS[PANEL_POSITIONS.length - 1]
  }
  return PANEL_POSITIONS[idx + 1]
}

export function isUltracode(cursor: PanelPosition): boolean {
  return cursor === 'ultracode'
}

/**
 * 决定面板挂载时的初始光标位置。
 * 优先级：env override（若是合法档位）> displayed level
 *
 * @param envOverride    getEffortEnvOverride() 的返回值：EffortValue | null | undefined
 * @param appStateEffort AppState.effortValue
 * @param displayed      getDisplayedEffortLevel(model, appStateEffort) —— 必传，避免此处再依赖 model
 */
export function getInitialCursor(args: {
  envOverride: EffortValue | null | undefined
  appStateEffort: EffortValue | undefined
  displayed: PanelPosition
}): PanelPosition {
  const fromEnv = normalizeToPanelPosition(args.envOverride)
  if (fromEnv !== undefined) return fromEnv
  // displayed 已经是 EffortLevel（不含 ultracode），合法
  return args.displayed
}

// ---- 确认/取消决策（注入 ApplyFn 避免循环依赖 + 便于测试）----

export type ConfirmOutcome =
  | {
      kind: 'apply'
      message: string
      effortUpdate?: { value: EffortValue | undefined }
    }
  | { kind: 'ultracode-hint'; message: string }

export type ApplyFn = (cursor: PanelPosition) => {
  message: string
  effortUpdate?: { value: EffortValue | undefined }
}

export const ULTRACODE_HINT =
  'ultracode is not an effort level. Use /ultracode <context> to start a multi-agent workflow.'

export const CANCEL_MESSAGE = 'Effort unchanged.'

export function computeConfirmOutcome(
  cursor: PanelPosition,
  applyFn: ApplyFn,
): ConfirmOutcome {
  if (isUltracode(cursor)) {
    return { kind: 'ultracode-hint', message: ULTRACODE_HINT }
  }
  const result = applyFn(cursor)
  return {
    kind: 'apply',
    message: result.message,
    effortUpdate: result.effortUpdate,
  }
}

import { type DOMElement, useAnimationFrame } from '@anthropic/ink'

const RIPPLE_INTERVAL_MS = 60

/**
 * ultracode 波纹动画 hook。
 *
 * 设计：
 * - 仅当 enabled=true（cursor === 'ultracode' 或退出淡出未结束）时订阅时钟，
 *   pass null 时 useAnimationFrame 内部不订阅 ClockContext，setInterval 不触发。
 * - 返回 [ref, time]：ref 附到波纹容器（驱动 viewport-pause），time
 *   用于 computeRippleLine 计算各行的波纹相位。
 *
 * enabled=false 时返回 time=0（下游基于 enabled 直接不渲染波纹层，
 * 但 0 仍是合法值，避免意外的 phase 输出 NaN）。
 *
 * 注意：调用方应传 showingRipple（on ultracode || fade > 0），不是 rippleActive，
 * 这样退出动画期间时钟继续推进，fade useEffect 才有 tick 触发。
 */
export function useRippleFrame(
  enabled: boolean,
): [ref: (element: DOMElement | null) => void, time: number] {
  const [ref, time] = useAnimationFrame(enabled ? RIPPLE_INTERVAL_MS : null)
  return [ref, enabled ? time : 0]
}

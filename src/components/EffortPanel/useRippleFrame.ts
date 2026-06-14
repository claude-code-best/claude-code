import { type DOMElement, useAnimationFrame } from '@anthropic/ink'

const RIPPLE_INTERVAL_MS = 60

/**
 * ultracode 波纹动画 hook。
 *
 * 设计：
 * - 仅当 enabled=true（cursor === 'ultracode'）时订阅时钟，pass null 时
 *   useAnimationFrame 内部不订阅 ClockContext，setInterval 不触发。
 * - 返回 [ref, time]：ref 附到波纹容器（驱动 viewport-pause），time
 *   用于 computeRippleLine 计算各行的波纹相位。
 *
 * enabled=false 时返回 time=0（下游基于 enabled 直接不渲染波纹层，
 * 但 0 仍是合法值，避免意外的 phase 输出 NaN）。
 */
export function useRippleFrame(
  enabled: boolean,
): [ref: (element: DOMElement | null) => void, time: number] {
  const [ref, time] = useAnimationFrame(enabled ? RIPPLE_INTERVAL_MS : null)
  return [ref, enabled ? time : 0]
}

/**
 * EffortPanel ultracode 档位的背景波纹动画 —— 纯函数模块。
 *
 * 设计目标：
 * - 仅在 cursor 停在 ultracode 时启动（订阅时钟由 useRippleFrame 控制）
 * - 震源：面板右下（ultracode 字符位置），向左/上辐射同心圆波
 * - 字符强度由距离衰减 + 正弦相位决定
 * - 文字字符永远覆盖波纹背景（mergeLayers），保证可读性
 *
 * 所有函数纯：相同入参 → 相同出参，便于单测 + 帧快照。
 */

/**
 * 强度（0~1）→ 视觉密度递增的字符。
 * 0.0 空格（静默）→ 1.0 实心方块（最强）。
 *
 * 注：波峰附近的"涟漪"字符（~ ◌ ○ 等）通过 pickCharWavePeak 单独处理，
 * 让震源附近出现循环的高频涟漪字符（与单纯密度梯度区分）。
 */
const INTENSITY_CHARS = [' ', '·', '∙', '░', '▒', '▓'] as const

/**
 * 震源附近的波峰字符循环（dist < 6 时叠加）。
 * 让 ultracode 附近出现明显"水波"感，而非仅密度梯度。
 */
const WAVE_PEAK_CHARS = ['~', '◌', '○', '◑', '●'] as const

/**
 * 把强度（任意实数）钳到 [0, 1]。
 */
function clampIntensity(intensity: number): number {
  if (intensity < 0) return 0
  if (intensity > 1) return 1
  return intensity
}

/**
 * 强度 → 字符。
 *
 * 强度 < 0.95 时按 INTENSITY_CHARS 分级（密度梯度）；
 * 强度 >= 0.95 时按波峰字符循环（基于 time 偏移）。
 */
export function pickChar(intensity: number, time: number = 0): string {
  const v = clampIntensity(intensity)
  if (v >= 0.95) {
    // 波峰循环：以 time 为相位让字符循环流动
    const idx = Math.floor(time / 80) % WAVE_PEAK_CHARS.length
    return WAVE_PEAK_CHARS[idx]
  }
  // 密度梯度：v ∈ [0, 0.95) 映射到 INTENSITY_CHARS[0..5)
  const idx = Math.min(
    INTENSITY_CHARS.length - 1,
    Math.floor(v * INTENSITY_CHARS.length),
  )
  return INTENSITY_CHARS[idx]
}

/**
 * 计算面板某一行 y 的完整波纹字符串。
 *
 * 波纹数学：
 *   dx = x - sourceX
 *   dy = (y - sourceY) * 1.5    （y 方向视觉拉伸，行高 > 字宽）
 *   dist = sqrt(dx² + dy²)
 *   phase = dist * 0.4 - time * 0.012
 *   wave = max(0, sin(phase))
 *   falloff = max(0, 1 - dist / 40)
 *   intensity = wave * falloff
 *   震源附近 (dist < 6)：叠加高频涟漪 max(intensity, 0.5 + 0.5*sin(time*0.02 - dist*1.2))
 *
 * @returns 长度严格等于 width 的字符串
 */
export function computeRippleLine(args: {
  y: number
  width: number
  time: number
  sourceX: number
  sourceY: number
}): string {
  const { y, width, time, sourceX, sourceY } = args
  if (width <= 0) return ''

  let out = ''
  for (let x = 0; x < width; x++) {
    const dx = x - sourceX
    const dy = (y - sourceY) * 1.5
    const dist = Math.sqrt(dx * dx + dy * dy)

    // 主波纹相位
    const phase = dist * 0.4 - time * 0.012
    const wave = Math.max(0, Math.sin(phase))

    // 距离衰减
    const falloff = Math.max(0, 1 - dist / 40)
    let intensity = wave * falloff

    // 震源附近高频涟漪
    if (dist < 6) {
      const ripple = 0.5 + 0.5 * Math.sin(time * 0.02 - dist * 1.2)
      if (ripple > intensity) intensity = ripple
    }

    out += pickChar(intensity, time)
  }
  return out
}

/**
 * 文字 overlay：在某行的 x 位置覆盖 text 字符串。
 * 后渲染的 overlay 在相同位置覆盖先渲染的（last-write-wins）。
 */
export type Overlay = {
  text: string
  /** 起始列；可为负（前缀被截断） */
  x: number
}

/**
 * 把 overlays 文字覆盖到 ripple 背景上。
 * - 文字字符永远胜出（即使背景是高密度字符）
 * - 超出右边界的文字被截断
 * - x 为负时跳过前 |x| 个字符
 *
 * @param ripple   原始波纹字符串（长度 = 行宽）
 * @param overlays 要覆盖的文字列表
 * @returns        合成后的字符串（长度严格等于 ripple.length）
 */
export function mergeLayers(ripple: string, overlays: Overlay[]): string {
  const chars = ripple.split('')
  for (const overlay of overlays) {
    const start = overlay.x
    if (start >= chars.length) continue
    for (let i = 0; i < overlay.text.length; i++) {
      const targetIdx = start + i
      if (targetIdx < 0) continue
      if (targetIdx >= chars.length) break
      chars[targetIdx] = overlay.text[i]
    }
  }
  return chars.join('')
}

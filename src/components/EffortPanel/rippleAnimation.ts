/**
 * EffortPanel ultracode 档位的背景波纹动画 —— 纯函数模块（颜色驱动）。
 *
 * 设计：
 * - 仅在 cursor 停在 ultracode 时启动（订阅时钟由 useRippleFrame 控制）
 * - 震源：面板右下（ultracode 字符位置），向左/上辐射同心圆波
 * - 每位置强度（0~1）→ 颜色（suggestion 系暗紫蓝渐变）
 * - 文字 overlay 在波纹之上（last-write-wins，颜色可单独指定）
 *
 * 渲染模型：每位置一个 cell（char + color），相邻同色合并为 segment。
 * 渲染层用 Box flexDirection="row" + 多个 Text 段输出（每段一个 color）。
 *
 * 所有函数纯：相同入参 → 相同出参，便于单测 + 帧快照。
 */

/**
 * suggestion 系颜色梯度（暗背景 → suggestion 色）。
 *
 * 设计：所有强度都映射到具体颜色（不返回 transparent），让整面板都是
 * "暗紫蓝海洋"作为底色，波峰在底色上流动。这样波纹颜色变化更明显，
 * 波谷也有暗色（不会"消失"）。
 *
 * 最暗档用 #1a1f3a（紫黑，亮度 ~12%），不是纯黑——避免远端波谷
 * 看起来像"硬黑边"。波峰最高升到 suggestion (#5769F7)，避免与
 * 文字 overlay（也用 suggestion 系）同色互相吞噬。
 */
const RIPPLE_COLOR_STOPS = [
  '#1a1f3a', // 0.00 ~ 0.14 — 最暗（紫黑底色，非纯黑）
  '#1f2543', // 0.14 ~ 0.28
  '#252c55', // 0.28 ~ 0.42
  '#2e3870', // 0.42 ~ 0.56
  '#3a4582', // 0.56 ~ 0.70
  '#4a5bb0', // 0.70 ~ 0.84
  '#5769F7', // 0.84 ~ 1.00 — suggestion (波峰)
] as const

/**
 * 强度（任意实数）→ 颜色字符串。
 *
 * 钳到 [0, 1]，按 RIPPLE_COLOR_STOPS 分级。永不返回 transparent。
 * intensity=0 → 最暗档（#1a1f3a，作为面板底色）。
 */
export function intensityToColor(intensity: number): string {
  const v = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity
  const idx = Math.min(
    RIPPLE_COLOR_STOPS.length - 1,
    Math.floor(v * RIPPLE_COLOR_STOPS.length),
  )
  return RIPPLE_COLOR_STOPS[idx]
}

/**
 * 'transparent' 字面量。intensityToColor 永不返回它（保留为兼容性导出）。
 * 渲染层可用此常量做语义判定（如 cell 是 overlay 文字而非波纹背景）。
 */
export const TRANSPARENT = 'transparent'

/**
 * 单位置 cell：char + color。
 * - color 为 'transparent' 时渲染层不染色（背景保持终端默认）。
 * - 文字 overlay cell 用具体颜色（suggestion / warning 等）。
 */
export type Cell = {
  char: string
  color: string
}

/**
 * 渲染段：相邻同 color 的 cells 合并。
 * 减少 React Text 节点数量（一行从 72 个 Text 降到 ~5-10 个）。
 */
export type Segment = {
  text: string
  color: string
}

/**
 * 文字 overlay：在某行的 x 位置覆盖 text 字符串。
 * - color undefined 时保留底层波纹 cell 自身颜色（仅替换 char）
 * - color 指定时同时覆盖 char + color
 *
 * 后渲染的 overlay 在相同位置覆盖先渲染的（last-write-wins）。
 */
export type Overlay = {
  text: string
  /** 起始列；可为负（前缀被截断） */
  x: number
  /** overlay 字符颜色；undefined = 保留底层波纹颜色 */
  color?: string
}

/**
 * 波纹背景字符。
 * 用空格让背景留空、只靠 color 染色（视觉上像"颜色斑点"）。
 * 空格宽度稳定（永远 1 列），不像可变宽度 unicode 字符。
 */
const RIPPLE_BG_CHAR = ' '

/**
 * 计算面板某一行 y 的完整波纹 cell 列表。
 *
 * 波纹数学（v3 — 简化，移除震源高频涟漪）：
 *   dx = x - sourceX
 *   dy = (y - sourceY) * 1.5    （y 方向视觉拉伸，行高 > 字宽）
 *   dist = sqrt(dx² + dy²)
 *   phase = dist * 0.35 - time * 0.004   （速度调慢至原 1/3）
 *   wave = max(0, sin(phase))
 *   falloff = max(0, 1 - dist / 90)       （覆盖半径扩到 90）
 *   intensity = wave * falloff
 *
 * 每位置强度经 intensityToColor → 颜色字符串（永不 transparent），写入 cell。
 * 即使 intensity=0（波谷）也得到最暗档 #1a1f3a 作为面板底色。
 *
 * @returns 长度严格等于 width 的 Cell 数组
 */
export function computeRippleCells(args: {
  y: number
  width: number
  time: number
  sourceX: number
  sourceY: number
}): Cell[] {
  const { y, width, time, sourceX, sourceY } = args
  if (width <= 0) return []

  const cells: Cell[] = new Array(width)
  for (let x = 0; x < width; x++) {
    const dx = x - sourceX
    const dy = (y - sourceY) * 1.5
    const dist = Math.sqrt(dx * dx + dy * dy)

    // 主波纹相位（速度调慢：原 0.012 → 0.004，约 1/3 速）
    const phase = dist * 0.35 - time * 0.004
    const wave = Math.max(0, Math.sin(phase))

    // 距离衰减（覆盖半径扩到 90：原 40）
    const falloff = Math.max(0, 1 - dist / 90)
    const intensity = wave * falloff

    cells[x] = {
      char: RIPPLE_BG_CHAR,
      color: intensityToColor(intensity),
    }
  }
  return cells
}

/**
 * 把 overlays 文字覆盖到 cells。
 *
 * 行为：
 * - 文字字符永远胜出（替换底层 cell.char）
 * - overlay.color 为 undefined 时保留底层 cell.color（仅替换 char）
 * - overlay.color 指定时同时覆盖 char + color
 * - 超出右边界的文字被截断
 * - x 为负时跳过前 |x| 个字符
 *
 * 不修改原数组，返回新数组（防御式拷贝）。
 */
export function applyOverlaysToCells(
  cells: Cell[],
  overlays: Overlay[],
): Cell[] {
  const out: Cell[] = cells.map(c => ({ ...c }))
  for (const overlay of overlays) {
    const start = overlay.x
    if (start >= out.length) continue
    for (let i = 0; i < overlay.text.length; i++) {
      const targetIdx = start + i
      if (targetIdx < 0) continue
      if (targetIdx >= out.length) break
      out[targetIdx] = {
        char: overlay.text[i],
        color: overlay.color ?? out[targetIdx].color,
      }
    }
  }
  return out
}

/**
 * 合并相邻同色 cells 为 segments。
 *
 * 用于减少渲染节点：一行 72 cells 可能只有 5-10 个颜色变化点，
 * 合并后只需渲染 N 个 Text 段而非 N 个单字符 Text。
 */
export function cellsToSegments(cells: Cell[]): Segment[] {
  if (cells.length === 0) return []
  const segments: Segment[] = []
  let current: Segment = { text: cells[0].char, color: cells[0].color }
  for (let i = 1; i < cells.length; i++) {
    const cell = cells[i]
    if (cell.color === current.color) {
      current.text += cell.char
    } else {
      segments.push(current)
      current = { text: cell.char, color: cell.color }
    }
  }
  segments.push(current)
  return segments
}

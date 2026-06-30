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
 *
 * 这些是 base 颜色（hueShift=0 时返回）。生产代码会传 hueShift 让
 * 整个梯度绕色相环旋转，制造主色随时间漂移的视觉效果。
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
 * 色相连续旋转速度（度/ms）。
 * 周期 = 360 / 0.03 = 12000ms = 12s，远慢于波纹相位（~1.6s），
 * 让主色漂移感"ambient"而非"动画"。
 *
 * 连续旋转（非 sin 振荡）让色相 0~360° 全色环都被访问：
 * 蓝 233° → 紫 270° → 品红 300° → 红 0° → 橙 30° → 黄 60° →
 * 绿 120° → 青 180° → 蓝 233°（一圈）。
 */
const HUE_ROTATION_DEG_PER_MS = 0.03

/**
 * hex → {h, s, l}（h 单位度，s/l 为 0~1）。
 *
 * 标准 RGB → HSL 转换。非法 hex（非 #rrggbb）→ h=0, s=0, l=0（黑）。
 */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return { h: 0, s: 0, l: 0 }
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) {
    h = 60 * (((g - b) / d) % 6)
  } else if (max === g) {
    h = 60 * ((b - r) / d + 2)
  } else {
    h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s, l }
}

/**
 * {h, s, l} → hex。
 *
 * 标准 HSL → RGB 转换。h 自动 mod 360 处理。
 */
function hslToHex(h: number, s: number, l: number): string {
  const hNorm = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hPrime = hNorm / 60
  const x = c * (1 - Math.abs((hPrime % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hPrime < 1) {
    r = c
    g = x
  } else if (hPrime < 2) {
    r = x
    g = c
  } else if (hPrime < 3) {
    g = c
    b = x
  } else if (hPrime < 4) {
    g = x
    b = c
  } else if (hPrime < 5) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  const m = l - c / 2
  const toHex = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * 把 hex 颜色绕色相环旋转 hueShift 度。
 *
 * 保持饱和度和亮度不变，仅旋转 hue。用于让 RIPPLE_COLOR_STOPS 整体
 * 漂移到不同色相（蓝→青→紫→蓝循环），制造主色随时间变化的效果。
 *
 * 非法 hex 原样返回（防御式）。
 */
export function rotateHue(hex: string, hueShift: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  if (hueShift === 0) return hex // 快路径：避免无意义 round-trip
  const { h, s, l } = hexToHsl(hex)
  return hslToHex(h + hueShift, s, l)
}

/**
 * 根据 time 计算当前色相偏移（度，连续旋转）。
 *
 * 返回值始终在 [0, 360) 区间，单调递增（模 360）。
 * 周期约 12s 一圈，覆盖完整色环。
 */
export function getHueShiftAtTime(time: number): number {
  return (time * HUE_ROTATION_DEG_PER_MS) % 360
}

/**
 * 强度（任意实数）→ 颜色字符串。
 *
 * 钳到 [0, 1]，按 RIPPLE_COLOR_STOPS 分级。永不返回 transparent。
 * intensity=0 → 最暗档（#1a1f3a，作为面板底色）。
 *
 * @param hueShift 整个色阶绕色相环旋转的度数（0 = base 颜色）。
 *                 生产代码传 getHueShiftAtTime(time) 实现主色漂移。
 *                 测试代码传 0（默认）获得确定性输出。
 */
export function intensityToColor(intensity: number, hueShift = 0): string {
  const v = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity
  const idx = Math.min(
    RIPPLE_COLOR_STOPS.length - 1,
    Math.floor(v * RIPPLE_COLOR_STOPS.length),
  )
  const base = RIPPLE_COLOR_STOPS[idx]
  return hueShift === 0 ? base : rotateHue(base, hueShift)
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
 * 波纹数学（v6.1 — 平滑呼吸 + 主色全色环旋转）：
 *   dx = x - sourceX
 *   dy = (y - sourceY) * 1.5    （y 方向视觉拉伸，行高 > 字宽）
 *   dist = sqrt(dx² + dy²)
 *   phase = dist * 0.35 - time * 0.004   （速度调慢至原 1/3）
 *   wave = (sin(phase) + 1) / 2          （[−1,1] → [0,1]，平滑无平带）
 *   falloff = max(0, 1 - dist / 90)       （覆盖半径扩到 90）
 *   intensity = wave * falloff
 *   hueShift = (time * 0.03) % 360        （连续旋转，12s 一圈全色环）
 *   color = intensityToColor(intensity, hueShift)
 *
 * v6.1 改 hueShift 为连续旋转（v6 是 sin±25° 振荡，色域太窄到不了
 * 红黄）。现在每 12s 走完一圈完整色环：蓝→紫→品红→红→橙→黄→绿→青→蓝。
 * 两个时间常数（相位 0.004 vs hue 0.03）解耦，让"流动"和"变色"不同步。
 *
 * 每位置强度经 intensityToColor → 颜色字符串（永不 transparent），写入 cell。
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

  const hueShift = getHueShiftAtTime(time)

  const cells: Cell[] = new Array(width)
  for (let x = 0; x < width; x++) {
    const dx = x - sourceX
    const dy = (y - sourceY) * 1.5
    const dist = Math.sqrt(dx * dx + dy * dy)

    // 主波纹相位（速度调慢：原 0.012 → 0.004，约 1/3 速）
    const phase = dist * 0.35 - time * 0.004
    // 平滑呼吸：[−1,1] → [0,1]，无平带，无双倍频率
    const wave = (Math.sin(phase) + 1) / 2

    // 距离衰减（覆盖半径扩到 90：原 40）
    const falloff = Math.max(0, 1 - dist / 90)
    const intensity = wave * falloff

    cells[x] = {
      char: RIPPLE_BG_CHAR,
      color: intensityToColor(intensity, hueShift),
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

/**
 * 把 hex 颜色按 fade 因子（0~1）缩放亮度。
 *
 * 用于进入/退出动画：
 * - fade ≤ 0.01 → TRANSPARENT（cell 不渲染背景，等同终端默认）
 * - fade = 0.5  → 颜色 RGB 各分量减半（暗紫蓝）
 * - fade = 1    → 原色（完整波纹）
 *
 * 非法 hex（非 #rrggbb 格式）原样返回（防御式）。
 */
export function fadeColor(color: string, fade: number): string {
  if (color === TRANSPARENT) return TRANSPARENT
  const f = fade < 0 ? 0 : fade > 1 ? 1 : fade
  if (f <= 0.01) return TRANSPARENT
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  const fr = Math.round(r * f)
    .toString(16)
    .padStart(2, '0')
  const fg = Math.round(g * f)
    .toString(16)
    .padStart(2, '0')
  const fb = Math.round(b * f)
    .toString(16)
    .padStart(2, '0')
  return `#${fr}${fg}${fb}`
}

/**
 * 把整行 cells 的颜色按 fade 缩放（用于进入/退出动画）。
 *
 * 不修改原数组，返回新数组。
 */
export function fadeCells(cells: Cell[], fade: number): Cell[] {
  return cells.map(c => ({ char: c.char, color: fadeColor(c.color, fade) }))
}

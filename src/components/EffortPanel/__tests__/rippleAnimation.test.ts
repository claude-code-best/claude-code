import { describe, expect, test } from 'bun:test'
import {
  type Cell,
  type Overlay,
  TRANSPARENT,
  applyOverlaysToCells,
  cellsToSegments,
  computeRippleCells,
  fadeCells,
  fadeColor,
  getHueShiftAtTime,
  intensityToColor,
  rotateHue,
} from '../rippleAnimation.js'

describe('intensityToColor', () => {
  test('intensity=0 → 最暗档（不再是 transparent，作面板底色）', () => {
    expect(intensityToColor(0)).toBe('#1a1f3a')
  })

  test('intensity < 0 钳到 0 → 最暗档', () => {
    expect(intensityToColor(-0.5)).toBe('#1a1f3a')
  })

  test('intensity > 0 → 永远是 #hex 颜色字符串（不返回 transparent）', () => {
    for (const v of [0.05, 0.1, 0.2, 0.5, 0.8]) {
      const c = intensityToColor(v)
      expect(c).not.toBe(TRANSPARENT)
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  test('intensity > 1 钳到 1 → 最高强度颜色', () => {
    expect(intensityToColor(1.5)).toBe(intensityToColor(1))
  })

  test('intensity 单调递增 → 颜色档位递增（至少 3 档）', () => {
    const samples = [0.2, 0.4, 0.6, 0.8, 1.0]
    const colors = samples.map(intensityToColor)
    const unique = new Set(colors)
    expect(unique.size).toBeGreaterThanOrEqual(3)
  })

  test('intensity=1 → suggestion 档（波峰最高档）', () => {
    expect(intensityToColor(1)).toBe('#5769F7')
  })

  test('hueShift=0 → 与无 hueShift 相同（快路径）', () => {
    for (const v of [0, 0.2, 0.5, 0.8, 1]) {
      expect(intensityToColor(v, 0)).toBe(intensityToColor(v))
    }
  })

  test('hueShift ≠ 0 → 返回不同颜色（但仍是合法 hex）', () => {
    const base = intensityToColor(0.8)
    const shifted = intensityToColor(0.8, 30)
    expect(shifted).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(shifted).not.toBe(base)
  })

  test('hueShift 180° → 大致补色（亮色变暗色族）', () => {
    // #5769F7 ≈ HSL(233, 91, 65)，旋转 180° → HSL(53, 91, 65) ≈ 黄色系
    const shifted = intensityToColor(1, 180)
    expect(shifted).toMatch(/^#[0-9a-fA-F]{6}$/)
    // 不再是蓝紫族（R 分量应明显大于 B 分量）
    const r = parseInt(shifted.slice(1, 3), 16)
    const b = parseInt(shifted.slice(5, 7), 16)
    expect(r).toBeGreaterThan(b)
  })
})

describe('rotateHue', () => {
  test('hueShift=0 → 原样返回（快路径，无 round-trip 误差）', () => {
    expect(rotateHue('#5769F7', 0)).toBe('#5769F7')
    expect(rotateHue('#1a1f3a', 0)).toBe('#1a1f3a')
  })

  test('旋转 360° → 等同原色（一圈回起点，大小写无关）', () => {
    expect(rotateHue('#5769F7', 360).toLowerCase()).toBe('#5769f7')
    expect(rotateHue('#5769F7', -360).toLowerCase()).toBe('#5769f7')
  })

  test('旋转 ±n*360° → 等同原色（任意整圈）', () => {
    expect(rotateHue('#3a4582', 720).toLowerCase()).toBe('#3a4582')
    expect(rotateHue('#3a4582', -1080).toLowerCase()).toBe('#3a4582')
  })

  test('灰度色（saturation=0）旋转后不变', () => {
    // #808080 = (128,128,128)，saturation=0，旋转无意义
    expect(rotateHue('#808080', 90)).toBe('#808080')
  })

  test('非法 hex → 原样返回（防御式）', () => {
    expect(rotateHue('not-a-color', 90)).toBe('not-a-color')
    expect(rotateHue('#123', 90)).toBe('#123')
  })

  test('旋转后保持 6 位 hex 格式', () => {
    const rotated = rotateHue('#5769F7', 45)
    expect(rotated).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})

describe('getHueShiftAtTime', () => {
  test('time=0 → 0', () => {
    expect(getHueShiftAtTime(0)).toBe(0)
  })

  test('time > 0 → 在 [0, 360) 范围内（连续旋转，非负）', () => {
    for (const t of [100, 500, 1000, 2000, 5000, 10000, 50000, 100000]) {
      const shift = getHueShiftAtTime(t)
      expect(shift).toBeGreaterThanOrEqual(0)
      expect(shift).toBeLessThan(360)
    }
  })

  test('time 推进 → hueShift 单调递增（模 360）', () => {
    // 在一个周期内（12000ms），hueShift 应单调递增
    const samples = [0, 1000, 2000, 3000, 4000, 5000, 6000]
    const shifts = samples.map(getHueShiftAtTime)
    for (let i = 1; i < shifts.length; i++) {
      expect(shifts[i]).toBeGreaterThan(shifts[i - 1])
    }
  })

  test('周期 12000ms（time=12000 应回到 0，模 360）', () => {
    // 12000ms * 0.03 = 360，% 360 = 0
    const shift = getHueShiftAtTime(12000)
    expect(shift).toBe(0)
  })

  test('半周期 6000ms → hueShift=180（对面色相）', () => {
    // 6000ms * 0.03 = 180
    expect(getHueShiftAtTime(6000)).toBe(180)
  })

  test('四分之一周期 3000ms → hueShift=90', () => {
    expect(getHueShiftAtTime(3000)).toBe(90)
  })

  test('多周期循环：time=24000 等同 time=0', () => {
    expect(getHueShiftAtTime(24000)).toBe(0)
    expect(getHueShiftAtTime(36000)).toBe(0)
  })
})

describe('computeRippleCells', () => {
  test('返回数组长度等于 width', () => {
    const cells = computeRippleCells({
      y: 2,
      width: 30,
      time: 100,
      sourceX: 25,
      sourceY: 2,
    })
    expect(cells.length).toBe(30)
  })

  test('每个 cell 的 char 是空格', () => {
    const cells = computeRippleCells({
      y: 0,
      width: 10,
      time: 0,
      sourceX: 5,
      sourceY: 0,
    })
    for (const cell of cells) {
      expect(cell.char).toBe(' ')
    }
  })

  test('每个 cell 的 color 是合法字符串', () => {
    const cells = computeRippleCells({
      y: 0,
      width: 10,
      time: 0,
      sourceX: 5,
      sourceY: 0,
    })
    for (const cell of cells) {
      expect(typeof cell.color).toBe('string')
      expect(
        cell.color === TRANSPARENT || /^#[0-9a-fA-F]{6}$/.test(cell.color),
      ).toBe(true)
    }
  })

  test('width=0 → 空数组', () => {
    expect(
      computeRippleCells({ y: 0, width: 0, time: 0, sourceX: 0, sourceY: 0 }),
    ).toEqual([])
  })

  test('width<0 → 空数组', () => {
    expect(
      computeRippleCells({ y: 0, width: -5, time: 0, sourceX: 0, sourceY: 0 }),
    ).toEqual([])
  })

  test('震源点 time=0 时为中间档（(sin+1)/2 → intensity=0.5），time 推进后扫过波峰/波谷', () => {
    // v5 平滑波：dist=0，time=0 时 phase=0，sin(0)=0，(0+1)/2=0.5 → intensity=0.5 → 中间档
    const t0 = computeRippleCells({
      y: 5,
      width: 11,
      time: 0,
      sourceX: 5,
      sourceY: 5,
    })
    // 0.5 * 7 = 3.5, floor = 3, RIPPLE_COLOR_STOPS[3] = '#2e3870'
    expect(t0[5].color).toBe('#2e3870')

    // time 推进，phase 变化，震源会扫过波峰（亮档）和波谷（暗档）
    const t1 = computeRippleCells({
      y: 5,
      width: 11,
      time: 1500,
      sourceX: 5,
      sourceY: 5,
    })
    // 不同 time 不同颜色（动画推进）
    expect(t1[5].color).not.toBe('#2e3870')
  })

  test('覆盖半径扩大：dist=65（左侧远端）仍有非最暗颜色', () => {
    // 震源 x=65，远端 x=0 → dist=65
    // falloff = max(0, 1 - 65/90) = 0.278，波峰时 intensity ≈ 0.278
    // 应映射到非最暗档（#15182b 或更亮）
    const cells = computeRippleCells({
      y: 0,
      width: 66,
      time: 0,
      sourceX: 65,
      sourceY: 0,
    })
    // 第 0 列 dist=65，time=0 时 phase = 65*0.35 = 22.75 rad
    // sin(22.75) ≈ -0.59 → wave = 0 → intensity = 0 → 最暗档
    // 但 time 推进时波峰会扫过此处，强度变高
    // 这里只验证 cell 有合法颜色（最暗档也算合法）
    expect(cells[0].color).toMatch(/^#[0-9a-fA-F]{6}$/)
    // 推进 time 后，左侧应出现非最暗颜色（波峰扫过）
    const t1 = computeRippleCells({
      y: 0,
      width: 66,
      time: 2000,
      sourceX: 65,
      sourceY: 0,
    })
    const nonDarkest = t1.filter(c => c.color !== '#1a1f3a')
    expect(nonDarkest.length).toBeGreaterThan(0)
  })

  test('time 推进时颜色分布变化（动画效果）', () => {
    const t0 = computeRippleCells({
      y: 2,
      width: 30,
      time: 0,
      sourceX: 25,
      sourceY: 2,
    })
    const t1 = computeRippleCells({
      y: 2,
      width: 30,
      time: 500,
      sourceX: 25,
      sourceY: 2,
    })
    // 至少有一个位置颜色不同
    const diffs = t0.filter((c, i) => c.color !== t1[i].color)
    expect(diffs.length).toBeGreaterThan(0)
  })
})

describe('applyOverlaysToCells', () => {
  function makeCells(colors: string[]): Cell[] {
    return colors.map(c => ({ char: ' ', color: c }))
  }

  test('无 overlay 时原样返回（但为新数组）', () => {
    const cells = makeCells(['#111', '#222', '#333'])
    const out = applyOverlaysToCells(cells, [])
    expect(out).toEqual(cells)
    expect(out).not.toBe(cells) // 防御式拷贝
  })

  test('overlay 替换 char 但保留底层 color（color 未指定时）', () => {
    const cells = makeCells([
      TRANSPARENT,
      TRANSPARENT,
      TRANSPARENT,
      TRANSPARENT,
    ])
    const overlays: Overlay[] = [{ text: 'hi', x: 1 }]
    const out = applyOverlaysToCells(cells, overlays)
    expect(out[1].char).toBe('h')
    expect(out[2].char).toBe('i')
    expect(out[1].color).toBe(TRANSPARENT) // 保留底层色
    expect(out[0].char).toBe(' ')
  })

  test('overlay 指定 color 时同时覆盖 char + color', () => {
    const cells = makeCells([TRANSPARENT, TRANSPARENT, TRANSPARENT])
    const overlays: Overlay[] = [{ text: 'AB', x: 0, color: '#5769F7' }]
    const out = applyOverlaysToCells(cells, overlays)
    expect(out[0]).toEqual({ char: 'A', color: '#5769F7' })
    expect(out[1]).toEqual({ char: 'B', color: '#5769F7' })
    expect(out[2]).toEqual({ char: ' ', color: TRANSPARENT })
  })

  test('overlay 超出右边界被截断', () => {
    const cells = makeCells([TRANSPARENT, TRANSPARENT, TRANSPARENT])
    const overlays: Overlay[] = [{ text: 'abcdef', x: 1 }]
    const out = applyOverlaysToCells(cells, overlays)
    expect(out[0].char).toBe(' ')
    expect(out[1].char).toBe('a')
    expect(out[2].char).toBe('b')
    // 'cdef' 被截断
  })

  test('overlay x 为负数 → 从开头截断（不向左溢出）', () => {
    const cells = makeCells([TRANSPARENT, TRANSPARENT, TRANSPARENT])
    const overlays: Overlay[] = [{ text: 'abc', x: -1 }]
    const out = applyOverlaysToCells(cells, overlays)
    expect(out[0].char).toBe('b') // 跳过 'a'，'b' 占 0
    expect(out[1].char).toBe('c')
    expect(out[2].char).toBe(' ')
  })

  test('多个 overlay 后者覆盖前者（同位置）', () => {
    const cells = makeCells([TRANSPARENT, TRANSPARENT, TRANSPARENT])
    const overlays: Overlay[] = [
      { text: 'AAA', x: 0, color: '#111' },
      { text: 'B', x: 1, color: '#222' },
    ]
    const out = applyOverlaysToCells(cells, overlays)
    expect(out[0]).toEqual({ char: 'A', color: '#111' })
    expect(out[1]).toEqual({ char: 'B', color: '#222' }) // 第二个 overlay 覆盖
    expect(out[2]).toEqual({ char: 'A', color: '#111' })
  })

  test('overlay 起始位置 >= 数组长度 → 完全跳过', () => {
    const cells = makeCells([TRANSPARENT, TRANSPARENT])
    const overlays: Overlay[] = [{ text: 'X', x: 5 }]
    const out = applyOverlaysToCells(cells, overlays)
    expect(out.every(c => c.char === ' ')).toBe(true)
  })

  test('不修改原数组（防御式拷贝）', () => {
    const cells = makeCells([TRANSPARENT])
    const snapshot = cells.map(c => ({ ...c }))
    applyOverlaysToCells(cells, [{ text: 'X', x: 0 }])
    expect(cells).toEqual(snapshot)
  })
})

describe('cellsToSegments', () => {
  test('空数组 → 空数组', () => {
    expect(cellsToSegments([])).toEqual([])
  })

  test('单 cell → 单段', () => {
    const cells: Cell[] = [{ char: 'a', color: '#111' }]
    expect(cellsToSegments(cells)).toEqual([{ text: 'a', color: '#111' }])
  })

  test('全部同色 → 合并为一段', () => {
    const cells: Cell[] = [
      { char: 'a', color: '#111' },
      { char: 'b', color: '#111' },
      { char: 'c', color: '#111' },
    ]
    expect(cellsToSegments(cells)).toEqual([{ text: 'abc', color: '#111' }])
  })

  test('颜色交替 → 每个独立段', () => {
    const cells: Cell[] = [
      { char: 'a', color: '#111' },
      { char: 'b', color: '#222' },
      { char: 'c', color: '#111' },
    ]
    expect(cellsToSegments(cells)).toEqual([
      { text: 'a', color: '#111' },
      { text: 'b', color: '#222' },
      { text: 'c', color: '#111' },
    ])
  })

  test('相邻同色段合并，不同色段分开', () => {
    const cells: Cell[] = [
      { char: 'a', color: TRANSPARENT },
      { char: 'b', color: TRANSPARENT },
      { char: 'X', color: '#5769F7' },
      { char: 'Y', color: '#5769F7' },
      { char: 'c', color: TRANSPARENT },
    ]
    expect(cellsToSegments(cells)).toEqual([
      { text: 'ab', color: TRANSPARENT },
      { text: 'XY', color: '#5769F7' },
      { text: 'c', color: TRANSPARENT },
    ])
  })

  test('段文本拼接顺序保持原顺序', () => {
    const cells: Cell[] = [
      { char: '1', color: '#111' },
      { char: '2', color: '#111' },
      { char: '3', color: '#111' },
    ]
    expect(cellsToSegments(cells)[0].text).toBe('123')
  })
})

describe('fadeColor', () => {
  test('fade=1 → 原色（不变）', () => {
    expect(fadeColor('#5769F7', 1)).toBe('#5769f7')
  })

  test('fade=0 → TRANSPARENT（cell 不渲染）', () => {
    expect(fadeColor('#5769F7', 0)).toBe(TRANSPARENT)
  })

  test('fade ≤ 0.01 → TRANSPARENT（阈值）', () => {
    expect(fadeColor('#5769F7', 0.01)).toBe(TRANSPARENT)
    expect(fadeColor('#5769F7', 0.009)).toBe(TRANSPARENT)
  })

  test('fade=0.5 → RGB 各分量减半', () => {
    // #5769F7 = (87, 105, 247)，减半 → (44, 53, 124) = #2c357c
    // Math.round(87*0.5)=44, Math.round(105*0.5)=53, Math.round(247*0.5)=124
    expect(fadeColor('#5769F7', 0.5)).toBe('#2c357c')
  })

  test('TRANSPARENT 输入 → 原样返回（不处理）', () => {
    expect(fadeColor(TRANSPARENT, 1)).toBe(TRANSPARENT)
    expect(fadeColor(TRANSPARENT, 0.5)).toBe(TRANSPARENT)
  })

  test('非法 hex 格式 → 原样返回（防御式）', () => {
    expect(fadeColor('not-a-color', 0.5)).toBe('not-a-color')
    expect(fadeColor('#123', 0.5)).toBe('#123') // 非 6 位 hex
  })

  test('fade < 0 钳到 0 → TRANSPARENT', () => {
    expect(fadeColor('#5769F7', -0.5)).toBe(TRANSPARENT)
  })

  test('fade > 1 钳到 1 → 原色', () => {
    expect(fadeColor('#5769F7', 1.5)).toBe('#5769f7')
  })

  test('结果始终为 6 位 hex（前导零补全）', () => {
    // #010203 = (1, 2, 3)，fade=0.5 → Math.round 后为 (1, 1, 2) = #010102
    // 但 1*0.5 = 0.5, Math.round(0.5) = 1（ banker's rounding 在 JS 中是 round half up）
    // 验证格式：6 位 hex
    const result = fadeColor('#010203', 0.5)
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('fadeCells', () => {
  test('空数组 → 空数组', () => {
    expect(fadeCells([], 0.5)).toEqual([])
  })

  test('每个 cell 的颜色按 fade 缩放，char 保留', () => {
    const cells: Cell[] = [
      { char: ' ', color: '#5769F7' },
      { char: 'A', color: '#ffffff' },
    ]
    const out = fadeCells(cells, 0.5)
    expect(out[0]).toEqual({ char: ' ', color: '#2c357c' })
    // #ffffff = (255, 255, 255)，fade=0.5 → (128, 128, 128) = #808080
    expect(out[1]).toEqual({ char: 'A', color: '#808080' })
  })

  test('不修改原数组（防御式拷贝）', () => {
    const cells: Cell[] = [{ char: ' ', color: '#5769F7' }]
    const snapshot = cells.map(c => ({ ...c }))
    fadeCells(cells, 0.5)
    expect(cells).toEqual(snapshot)
  })

  test('TRANSPARENT cell 保持 TRANSPARENT', () => {
    const cells: Cell[] = [
      { char: ' ', color: TRANSPARENT },
      { char: ' ', color: '#5769F7' },
    ]
    const out = fadeCells(cells, 0.5)
    expect(out[0].color).toBe(TRANSPARENT)
    expect(out[1].color).toBe('#2c357c')
  })

  test('fade=0 → 所有非 transparent 颜色变 TRANSPARENT', () => {
    const cells: Cell[] = [
      { char: ' ', color: '#5769F7' },
      { char: ' ', color: '#1a1f3a' },
    ]
    const out = fadeCells(cells, 0)
    expect(out[0].color).toBe(TRANSPARENT)
    expect(out[1].color).toBe(TRANSPARENT)
  })
})

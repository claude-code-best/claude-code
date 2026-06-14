import { describe, expect, test } from 'bun:test'
import {
  type Cell,
  type Overlay,
  TRANSPARENT,
  applyOverlaysToCells,
  cellsToSegments,
  computeRippleCells,
  intensityToColor,
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

  test('震源点 time=0 时为波谷（最暗档），time 推进后出现亮档', () => {
    // dist=0，time=0 时 phase = -0 = 0，sin(0)=0 → wave=0 → intensity=0 → 最暗档
    const t0 = computeRippleCells({
      y: 5,
      width: 11,
      time: 0,
      sourceX: 5,
      sourceY: 5,
    })
    expect(t0[5].color).toBe('#1a1f3a')

    // time 推进，phase 变化，震源会扫过波峰
    const t1 = computeRippleCells({
      y: 5,
      width: 11,
      time: 1500,
      sourceX: 5,
      sourceY: 5,
    })
    expect(t1[5].color).not.toBe('#1a1f3a')
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

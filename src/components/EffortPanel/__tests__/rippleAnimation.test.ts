import { describe, expect, test } from 'bun:test'
import {
  type Overlay,
  computeRippleLine,
  mergeLayers,
  pickChar,
} from '../rippleAnimation.js'

describe('pickChar', () => {
  test('intensity=0 → 空格', () => {
    expect(pickChar(0)).toBe(' ')
  })

  test('intensity < 0 钳到 0 → 空格', () => {
    expect(pickChar(-0.5)).toBe(' ')
  })

  test('intensity > 1 钳到 1 → 最高强度字符', () => {
    expect(pickChar(1.5)).toBe(pickChar(1))
  })

  test('intensity 单调递增 → 字符视觉密度递增（按字符串长度近似）', () => {
    // 字符密度：' ' < '·' < '∙' < '░' < '▒' < '▓'
    const samples = [0, 0.15, 0.35, 0.55, 0.75, 0.95]
    const chars = samples.map(pickChar)
    expect(chars[0]).toBe(' ')
    // 至少 4 种不同字符（说明分级生效）
    const unique = new Set(chars)
    expect(unique.size).toBeGreaterThanOrEqual(4)
  })

  test('波峰位置（intensity ≥ 0.95）出现 WAVE_PEAK_CHARS 循环字符之一', () => {
    const wavePeakChars = ['~', '◌', '○', '◑', '●']
    // 不同 time 偏移应触达不同波峰字符（基于 time / 80 的相位）
    const seen = new Set<string>()
    for (let t = 0; t < 400; t += 40) {
      seen.add(pickChar(1, t))
    }
    // 至少出现 2 种 WAVE_PEAK_CHARS（说明循环生效）
    const hits = [...seen].filter(c => wavePeakChars.includes(c))
    expect(hits.length).toBeGreaterThanOrEqual(2)
  })
})

describe('computeRippleLine', () => {
  test('返回字符串长度等于 width', () => {
    const line = computeRippleLine({
      y: 2,
      width: 30,
      time: 100,
      sourceX: 25,
      sourceY: 2,
    })
    expect(line.length).toBe(30)
  })

  test('width=0 → 空字符串', () => {
    expect(
      computeRippleLine({ y: 0, width: 0, time: 0, sourceX: 0, sourceY: 0 }),
    ).toBe('')
  })

  test('震源点 (sourceX, sourceY) 处字符非空（dist=0，falloff=1）', () => {
    const line = computeRippleLine({
      y: 5,
      width: 11,
      time: 0,
      sourceX: 5,
      sourceY: 5,
    })
    // 震源在 (5,5)，y=5 行的第 5 列字符应非空格
    expect(line[5]).not.toBe(' ')
  })

  test('远离震源的字符强度衰减（远端更可能是空格）', () => {
    // 震源在左端，远端 30 列外，time=0 时强度低
    const line = computeRippleLine({
      y: 0,
      width: 40,
      time: 0,
      sourceX: 0,
      sourceY: 0,
    })
    // 第 0 列字符密度 >= 第 39 列（不一定严格，但近端更密）
    const nearDensity = line.charCodeAt(0)
    const farDensity = line.charCodeAt(39)
    // 用 charCode 近似：震源附近字符 charCode 应大于等于远端
    // 注：空格 charCode=32，其他字符 charCode 通常更大
    expect(nearDensity).toBeGreaterThanOrEqual(farDensity)
  })

  test('time 推进时字符变化（动画效果）', () => {
    const t0 = computeRippleLine({
      y: 2,
      width: 30,
      time: 0,
      sourceX: 25,
      sourceY: 2,
    })
    const t1 = computeRippleLine({
      y: 2,
      width: 30,
      time: 500,
      sourceX: 25,
      sourceY: 2,
    })
    expect(t0).not.toBe(t1)
  })
})

describe('mergeLayers', () => {
  test('无 overlay 时原样返回 ripple', () => {
    const ripple = '·∙░▒▓░∙·'
    expect(mergeLayers(ripple, [])).toBe(ripple)
  })

  test('overlay 文字字符覆盖对应位置', () => {
    const ripple = '········'
    const overlays: Overlay[] = [{ text: 'hi', x: 2 }]
    expect(mergeLayers(ripple, overlays)).toBe('··hi····')
  })

  test('多个 overlay 不重叠时各自覆盖', () => {
    const ripple = '·········'
    const overlays: Overlay[] = [
      { text: 'A', x: 0 },
      { text: 'B', x: 4 },
      { text: 'C', x: 8 },
    ]
    // ripple 长 9：A 在 0；B 在 4；C 在 8；其余保留 '·'
    expect(mergeLayers(ripple, overlays)).toBe('A···B···C')
  })

  test('overlay 超出右边界被截断', () => {
    const ripple = '·····'
    const overlays: Overlay[] = [{ text: 'abcdef', x: 3 }]
    // ripple 长 5，overlay 从 x=3 开始 → 'ab' 占 3,4，剩下 'cdef' 截断
    expect(mergeLayers(ripple, overlays)).toBe('···ab')
  })

  test('overlay x 为负数 → 从开头截断（不向左溢出）', () => {
    const ripple = '·····'
    const overlays: Overlay[] = [{ text: 'abc', x: -1 }]
    // x=-1 → 跳过 'a'，'bc' 占 0,1
    expect(mergeLayers(ripple, overlays)).toBe('bc···')
  })

  test('overlay x=0 + 完整覆盖 → 全部覆盖', () => {
    const ripple = '·····'
    const overlays: Overlay[] = [{ text: 'HELLO', x: 0 }]
    expect(mergeLayers(ripple, overlays)).toBe('HELLO')
  })

  test('文字字符永远胜出（即使 ripple 那里是高密度字符）', () => {
    const ripple = '▓▓▓▓▓'
    const overlays: Overlay[] = [{ text: 'X', x: 2 }]
    expect(mergeLayers(ripple, overlays)).toBe('▓▓X▓▓')
  })

  test('多个 overlay 后者覆盖前者（同位置）', () => {
    const ripple = '·····'
    const overlays: Overlay[] = [
      { text: 'AAA', x: 0 },
      { text: 'B', x: 1 },
    ]
    // ripple 长 5：A 在 0；B 在 1（覆盖第一个 A）；2 为 A；3,4 为 '·'（未被 overlay 覆盖）
    expect(mergeLayers(ripple, overlays)).toBe('ABA··')
  })
})

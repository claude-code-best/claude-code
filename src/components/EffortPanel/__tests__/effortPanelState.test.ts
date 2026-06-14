import { describe, expect, test } from 'bun:test'
import {
  END_POSITION,
  HOME_POSITION,
  PANEL_POSITIONS,
  type PanelPosition,
  getInitialCursor,
  isUltracode,
  moveLeft,
  moveRight,
} from '../effortPanelState.js'

describe('effortPanelState', () => {
  test('PANEL_POSITIONS 顺序为 low → ultracode', () => {
    expect(PANEL_POSITIONS).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
      'ultracode',
    ])
  })

  test('moveLeft 在 low 处保持 low', () => {
    expect(moveLeft('low')).toBe('low')
  })

  test('moveLeft 正常左移', () => {
    expect(moveLeft('high')).toBe('medium')
    expect(moveLeft('ultracode')).toBe('max')
  })

  test('moveRight 在 ultracode 处保持 ultracode', () => {
    expect(moveRight('ultracode')).toBe('ultracode')
  })

  test('moveRight 正常右移', () => {
    expect(moveRight('medium')).toBe('high')
    expect(moveRight('max')).toBe('ultracode')
  })

  test('HOME_POSITION 等于 low', () => {
    expect(HOME_POSITION).toBe('low')
  })

  test('END_POSITION 等于 ultracode', () => {
    expect(END_POSITION).toBe('ultracode')
  })

  test('isUltracode 守卫', () => {
    expect(isUltracode('ultracode')).toBe(true)
    expect(isUltracode('max')).toBe(false)
  })

  test('getInitialCursor：env override 为合法档位时返回 env 值', () => {
    expect(
      getInitialCursor({
        envOverride: 'high',
        appStateEffort: 'medium',
        displayed: 'high',
      }),
    ).toBe('high')
  })

  test('getInitialCursor：env 为 null（unset）时用 displayed', () => {
    expect(
      getInitialCursor({
        envOverride: null,
        appStateEffort: undefined,
        displayed: 'medium',
      }),
    ).toBe('medium')
  })

  test('getInitialCursor：env undefined 时用 displayed', () => {
    expect(
      getInitialCursor({
        envOverride: undefined,
        appStateEffort: 'high',
        displayed: 'high',
      }),
    ).toBe('high')
  })

  test('getInitialCursor：env 是数值（ant-only）时落回 displayed', () => {
    // 数值不是合法 PanelPosition，回退
    expect(
      getInitialCursor({
        envOverride: 75,
        appStateEffort: 'medium',
        displayed: 'medium',
      }),
    ).toBe('medium')
  })

  test('PanelPosition 类型编译期检查（隐式）', () => {
    const p: PanelPosition = 'xhigh'
    expect(p).toBe('xhigh')
  })
})

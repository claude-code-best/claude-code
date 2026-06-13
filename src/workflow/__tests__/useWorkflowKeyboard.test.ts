import { expect, test } from 'bun:test'
import { routeWorkflowKey } from '../panel/useWorkflowKeyboard.js'

test('Tab → nextTab；Shift+Tab → prevTab', () => {
  expect(routeWorkflowKey('', { tab: true })).toBe('nextTab')
  expect(routeWorkflowKey('', { tab: true, shift: true })).toBe('prevTab')
})

test('q / Esc → quit', () => {
  expect(routeWorkflowKey('q', {})).toBe('quit')
  expect(routeWorkflowKey('', { escape: true })).toBe('quit')
})

test('x → kill；r → resume；n → newRun', () => {
  expect(routeWorkflowKey('x', {})).toBe('kill')
  expect(routeWorkflowKey('r', {})).toBe('resume')
  expect(routeWorkflowKey('n', {})).toBe('newRun')
})

test('←/→ 切焦点列；↑/↓ 列内移动', () => {
  expect(routeWorkflowKey('', { leftArrow: true })).toBe('focusLeft')
  expect(routeWorkflowKey('', { rightArrow: true })).toBe('focusRight')
  expect(routeWorkflowKey('', { upArrow: true })).toBe('moveUp')
  expect(routeWorkflowKey('', { downArrow: true })).toBe('moveDown')
})

test('无关输入 → null', () => {
  expect(routeWorkflowKey('z', {})).toBeNull()
  expect(routeWorkflowKey('', {})).toBeNull()
})

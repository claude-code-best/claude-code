import { useInput } from '@anthropic/ink'

/** 焦点所在列。 */
export type FocusColumn = 'phases' | 'agents'

/** useInput 的 key 对象子集（仅声明用到的字段，避免耦合 ink Key 类型）。 */
type KeyEvent = {
  tab?: boolean
  shift?: boolean
  escape?: boolean
  leftArrow?: boolean
  rightArrow?: boolean
  upArrow?: boolean
  downArrow?: boolean
}

/** 键 → 动作（纯函数，便于单测；无渲染依赖）。 */
export type WorkflowKeyAction =
  | 'nextTab'
  | 'prevTab'
  | 'focusLeft'
  | 'focusRight'
  | 'moveUp'
  | 'moveDown'
  | 'kill'
  | 'resume'
  | 'newRun'
  | 'quit'

export function routeWorkflowKey(
  input: string,
  key: KeyEvent,
): WorkflowKeyAction | null {
  // @anthropic/ink 的 key.tab 对 Tab 键置 true；个别环境回落到 '\t'
  if (key.tab || input === '\t') return key.shift ? 'prevTab' : 'nextTab'
  if (key.escape || input === 'q') return 'quit'
  if (input === 'x') return 'kill'
  if (input === 'r') return 'resume'
  if (input === 'n') return 'newRun'
  if (key.leftArrow) return 'focusLeft'
  if (key.rightArrow) return 'focusRight'
  if (key.upArrow) return 'moveUp'
  if (key.downArrow) return 'moveDown'
  return null
}

/** 焦点模型回调（WorkflowsPanel 注入）。 */
export type WorkflowKeyboardHandlers = {
  nextTab: () => void
  prevTab: () => void
  focusLeft: () => void
  focusRight: () => void
  moveUp: () => void
  moveDown: () => void
  killFocused: () => void
  resumeFocused: () => void
  newRun: () => void
  quit: () => void
}

/**
 * /workflows 面板键位（焦点轮转模型）：
 * - Tab / Shift+Tab：切顶部 run tab
 * - ← / →：phases ↔ agents 焦点切换
 * - ↑ / ↓：当前焦点列内移动
 * - x kill · r resume · n new · q / Esc quit
 */
export function useWorkflowKeyboard(h: WorkflowKeyboardHandlers): void {
  useInput((input, key) => {
    const action = routeWorkflowKey(input, key as KeyEvent)
    if (action === null) return
    switch (action) {
      case 'nextTab':
        h.nextTab()
        break
      case 'prevTab':
        h.prevTab()
        break
      case 'focusLeft':
        h.focusLeft()
        break
      case 'focusRight':
        h.focusRight()
        break
      case 'moveUp':
        h.moveUp()
        break
      case 'moveDown':
        h.moveDown()
        break
      case 'kill':
        h.killFocused()
        break
      case 'resume':
        h.resumeFocused()
        break
      case 'newRun':
        h.newRun()
        break
      case 'quit':
        h.quit()
        break
    }
  })
}

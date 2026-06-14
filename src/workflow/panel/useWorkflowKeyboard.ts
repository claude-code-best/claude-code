import { useInput } from '@anthropic/ink'

/** 焦点所在列。 */
export type FocusColumn = 'phases' | 'agents'

/** 键盘模式：normal=正常导航；confirm=弹了 Dialog，等用户 y/n 确认。 */
export type WorkflowKeyboardMode = 'normal' | 'confirm'

/** useInput 的 key 对象子集（仅声明用到的字段，避免耦合 ink Key 类型）。 */
type KeyEvent = {
  tab?: boolean
  shift?: boolean
  escape?: boolean
  return?: boolean
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
  | 'killAgent'
  | 'killWorkflow'
  | 'resume'
  | 'newRun'
  | 'quit'
  | 'confirmYes'
  | 'confirmNo'

export function routeWorkflowKey(
  input: string,
  key: KeyEvent,
  mode: WorkflowKeyboardMode = 'normal',
): WorkflowKeyAction | null {
  // confirm 模式：仅 y/Enter 确认，n/Esc/q 取消，其他键吞掉（防误触）
  if (mode === 'confirm') {
    if (input === 'y' || input === 'Y' || key.return) return 'confirmYes'
    if (input === 'n' || input === 'N' || key.escape || input === 'q') {
      return 'confirmNo'
    }
    return null
  }
  // @anthropic/ink 的 key.tab 对 Tab 键置 true；个别环境回落到 '\t'
  if (key.tab || input === '\t') return key.shift ? 'prevTab' : 'nextTab'
  if (key.escape || input === 'q') return 'quit'
  // 大写 K = 杀整个 workflow；小写 x = 杀当前选中 agent（仅 agents 列）。
  // 大小写区分避免 x 误触发 workflow kill；K 显式需要 Shift 暗示"重操作"。
  if (input === 'K') return 'killWorkflow'
  if (input === 'x') return 'killAgent'
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
  /** 请求杀当前选中 agent（panel 弹 Dialog 二次确认）。 */
  killAgent: () => void
  /** 请求杀整个 workflow（panel 弹 Dialog 二次确认）。 */
  killWorkflow: () => void
  resumeFocused: () => void
  newRun: () => void
  quit: () => void
  /** confirm 模式下用户确认（y/Enter）。 */
  confirmYes: () => void
  /** confirm 模式下用户取消（n/Esc/q）。 */
  confirmNo: () => void
}

/**
 * /workflows 面板键位（焦点轮转模型）：
 * - Tab / Shift+Tab：切顶部 run tab
 * - ← / →：phases ↔ agents 焦点切换
 * - ↑ / ↓：当前焦点列内移动
 * - x kill 单 agent · K kill 整个 workflow（带 Dialog 二次确认） · r resume · n new · q / Esc quit
 *
 * @param mode confirm 时只接受 y/n/Esc/q，其他键吞掉——避免在确认弹窗里误导航。
 */
export function useWorkflowKeyboard(
  h: WorkflowKeyboardHandlers,
  mode: WorkflowKeyboardMode = 'normal',
): void {
  useInput((input, key) => {
    const action = routeWorkflowKey(input, key as KeyEvent, mode)
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
      case 'killAgent':
        h.killAgent()
        break
      case 'killWorkflow':
        h.killWorkflow()
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
      case 'confirmYes':
        h.confirmYes()
        break
      case 'confirmNo':
        h.confirmNo()
        break
    }
  })
}

import { useInput } from '@anthropic/ink'

/** The column that currently has focus. */
export type FocusColumn = 'phases' | 'agents'

/** Keyboard mode: normal = regular navigation; confirm = a Dialog is open, waiting for the user's y/n confirmation. */
export type WorkflowKeyboardMode = 'normal' | 'confirm'

/** Subset of the useInput key object (only declares the fields we use, to avoid coupling to the ink Key type). */
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

/** key -> action (pure function, easy to unit test; no rendering dependencies). */
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
  // confirm mode: only y/Enter confirms, n/Esc/q cancels, all other keys are swallowed (prevent mis-touch)
  if (mode === 'confirm') {
    if (input === 'y' || input === 'Y' || key.return) return 'confirmYes'
    if (input === 'n' || input === 'N' || key.escape || input === 'q') {
      return 'confirmNo'
    }
    return null
  }
  // @anthropic/ink sets key.tab to true for the Tab key; some environments fall back to '\t'
  if (key.tab || input === '\t') return key.shift ? 'prevTab' : 'nextTab'
  if (key.escape || input === 'q') return 'quit'
  // Capital K = kill the entire workflow; lowercase x = kill the currently selected agent (agents column only).
  // Case distinction avoids x accidentally triggering workflow kill; K explicitly requires Shift, hinting at a "heavy operation".
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

/** Focus model callbacks (injected by WorkflowsPanel). */
export type WorkflowKeyboardHandlers = {
  nextTab: () => void
  prevTab: () => void
  focusLeft: () => void
  focusRight: () => void
  moveUp: () => void
  moveDown: () => void
  /** Request killing the currently selected agent (panel pops a Dialog for secondary confirmation). */
  killAgent: () => void
  /** Request killing the entire workflow (panel pops a Dialog for secondary confirmation). */
  killWorkflow: () => void
  resumeFocused: () => void
  newRun: () => void
  quit: () => void
  /** User confirms in confirm mode (y/Enter). */
  confirmYes: () => void
  /** User cancels in confirm mode (n/Esc/q). */
  confirmNo: () => void
}

/**
 * /workflows panel keybindings (focus rotation model):
 * - Tab / Shift+Tab: switch the top run tab
 * - Left / Right: switch focus between phases and agents
 * - Up / Down: move within the currently focused column
 * - x kill single agent · K kill the entire workflow (with Dialog secondary confirmation) · r resume · n new · q / Esc quit
 *
 * @param mode In confirm mode only y/n/Esc/q are accepted, all other keys are swallowed - avoid mis-navigation inside the confirmation dialog.
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

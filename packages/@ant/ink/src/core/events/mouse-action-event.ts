import { Event } from './event.js'
import type { EventTarget } from './terminal-event.js'

/**
 * Mouse action event (mousedown, mouseup, mousedrag).
 * Bubbles from the deepest hit node up through parentNode.
 */
export class MouseActionEvent extends Event {
  /** Action type */
  readonly type: 'mousedown' | 'mouseup' | 'mousedrag'
  /** 0-indexed screen column */
  readonly col: number
  /** 0-indexed screen row */
  readonly row: number
  /** Mouse button number */
  readonly button: number
  /**
   * Column relative to the current handler's Box.
   * Recomputed before each handler fires.
   */
  localCol = 0
  /** Row relative to the current handler's Box. */
  localRow = 0

  constructor(
    type: 'mousedown' | 'mouseup' | 'mousedrag',
    col: number,
    row: number,
    button: number,
  ) {
    super()
    this.type = type
    this.col = col
    this.row = row
    this.button = button
  }

  /** Recompute local coords relative to the target Box. */
  prepareForTarget(target: EventTarget): void {
    const dom = target as unknown as { yogaNode?: { getComputedLeft?(): number; getComputedTop?(): number } }
    this.localCol = this.col - (dom.yogaNode?.getComputedLeft?.() ?? 0)
    this.localRow = this.row - (dom.yogaNode?.getComputedTop?.() ?? 0)
  }
}

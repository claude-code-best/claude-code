import type { DOMElement } from '../dom.js'
import { nodeCache } from '../node-cache.js'
import { Event } from './event.js'

export class MouseActionEvent extends Event {
  readonly type: 'mousedown' | 'mouseup' | 'mousedrag'
  readonly col: number
  readonly row: number
  readonly button: number
  localCol = 0
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

  prepareForTarget(target: DOMElement): void {
    const rect = nodeCache.get(target)
    if (!rect) return
    this.localCol = this.col - rect.x
    this.localRow = this.row - rect.y
  }
}

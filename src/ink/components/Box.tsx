import React, { type PropsWithChildren, type Ref } from 'react'
import type { Except } from 'type-fest'
import type { DOMElement } from '../dom.js'
import type { ClickEvent } from '../events/click-event.js'
import type { FocusEvent } from '../events/focus-event.js'
import type { KeyboardEvent } from '../events/keyboard-event.js'
import type { Styles } from '../styles.js'
import * as warn from '../warn.js'

export type Props = Except<Styles, 'textWrap'> & {
  ref?: Ref<DOMElement>
  /**
   * Tab order index. Nodes with `tabIndex >= 0` participate in
   * Tab/Shift+Tab cycling; `-1` means programmatically focusable only.
   */
  tabIndex?: number
  /**
   * Focus this element when it mounts. Like the HTML `autofocus`
   * attribute — the FocusManager calls `focus(node)` during the
   * reconciler's `commitMount` phase.
   */
  autoFocus?: boolean
  /**
   * Fired on left-button click (press + release without drag). Only works
   * inside `<AlternateScreen>` where mouse tracking is enabled — no-op
   * otherwise. The event bubbles from the deepest hit Box up through
   * ancestors; call `event.stopImmediatePropagation()` to stop bubbling.
   */
  onClick?: (event: ClickEvent) => void
  onFocus?: (event: FocusEvent) => void
  onFocusCapture?: (event: FocusEvent) => void
  onBlur?: (event: FocusEvent) => void
  onBlurCapture?: (event: FocusEvent) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onKeyDownCapture?: (event: KeyboardEvent) => void
  /**
   * Fired when the mouse moves into this Box's rendered rect. Like DOM
   * `mouseenter`, does NOT bubble — moving between children does not
   * re-fire on the parent. Only works inside `<AlternateScreen>` where
   * mode-1003 mouse tracking is enabled.
   */
  onMouseEnter?: () => void
  /** Fired when the mouse moves out of this Box's rendered rect. */
  onMouseLeave?: () => void
}

/**
 * `<Box>` is an essential Ink component to build your layout. It's like `<div style="display: flex">` in the browser.
 */
function Box({
  children,
  flexWrap = 'nowrap',
  flexDirection = 'row',
  flexGrow = 0,
  flexShrink = 1,
  ref,
  tabIndex,
  autoFocus,
  onClick,
  onFocus,
  onFocusCapture,
  onBlur,
  onBlurCapture,
  onMouseEnter,
  onMouseLeave,
  onKeyDown,
  onKeyDownCapture,
  ...style
}: PropsWithChildren<Props>): React.ReactNode {
  // Warn if spacing values are not integers to prevent fractional layout dimensions
  warn.ifNotInteger(style.margin, 'margin')
  warn.ifNotInteger(style.marginX, 'marginX')
  warn.ifNotInteger(style.marginY, 'marginY')
  warn.ifNotInteger(style.marginTop, 'marginTop')
  warn.ifNotInteger(style.marginBottom, 'marginBottom')
  warn.ifNotInteger(style.marginLeft, 'marginLeft')
  warn.ifNotInteger(style.marginRight, 'marginRight')
  warn.ifNotInteger(style.padding, 'padding')
  warn.ifNotInteger(style.paddingX, 'paddingX')
  warn.ifNotInteger(style.paddingY, 'paddingY')
  warn.ifNotInteger(style.paddingTop, 'paddingTop')
  warn.ifNotInteger(style.paddingBottom, 'paddingBottom')
  warn.ifNotInteger(style.paddingLeft, 'paddingLeft')
  warn.ifNotInteger(style.paddingRight, 'paddingRight')
  warn.ifNotInteger(style.gap, 'gap')
  warn.ifNotInteger(style.columnGap, 'columnGap')
  warn.ifNotInteger(style.rowGap, 'rowGap')

  return (
    <ink-box
      ref={ref}
      tabIndex={tabIndex}
      autoFocus={autoFocus}
      onClick={onClick}
      onFocus={onFocus}
      onFocusCapture={onFocusCapture}
      onBlur={onBlur}
      onBlurCapture={onBlurCapture}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={onKeyDown}
      onKeyDownCapture={onKeyDownCapture}
      style={{
        flexWrap,
        flexDirection,
        flexGrow,
        flexShrink,
        ...style,
        overflowX: style.overflowX ?? style.overflow ?? 'visible',
        overflowY: style.overflowY ?? style.overflow ?? 'visible',
      }}
    >
      {children}
    </ink-box>
  )
}

export default Box

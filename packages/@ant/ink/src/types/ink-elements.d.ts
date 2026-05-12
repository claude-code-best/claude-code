// Type declarations for custom Ink JSX elements
// Note: The detailed prop types are defined in ink-jsx.d.ts via React module augmentation.
// This file provides the global JSX namespace fallback declarations.
import type { ReactNode, Ref } from 'react'
import type { ClickEvent } from '../core/events/click-event.js'
import type { FocusEvent } from '../core/events/focus-event.js'
import type { KeyboardEvent } from '../core/events/keyboard-event.js'
import type { Styles, TextStyles } from '../core/styles.js'
import type { DOMElement } from '../core/dom.js'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'ink-box': {
        ref?: Ref<DOMElement>
        tabIndex?: number
        autoFocus?: boolean
        onClick?: (event: ClickEvent) => void
        onFocus?: (event: FocusEvent) => void
        onFocusCapture?: (event: FocusEvent) => void
        onBlur?: (event: FocusEvent) => void
        onBlurCapture?: (event: FocusEvent) => void
        onMouseEnter?: () => void
        onMouseLeave?: () => void
        onKeyDown?: (event: KeyboardEvent) => void
        onKeyDownCapture?: (event: KeyboardEvent) => void
        style?: Styles
        stickyScroll?: boolean
        children?: ReactNode
      }
      'ink-text': {
        style?: Styles
        textStyles?: TextStyles
        children?: ReactNode
      }
      'ink-link': {
        href?: string
        children?: ReactNode
      }
      'ink-raw-ansi': {
        rawText?: string
        rawWidth?: number
        rawHeight?: number
      }
    }
  }
}

export {}

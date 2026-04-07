/**
 * Ink custom JSX intrinsic elements.
 *
 * With "jsx": "react-jsx", TypeScript resolves JSX types from react/jsx-runtime
 * whose IntrinsicElements extends React.JSX.IntrinsicElements. We augment the
 * 'react' module to inject our custom elements into React.JSX.IntrinsicElements.
 *
 * This file must be a module (have an import/export) for `declare module`
 * augmentation to work correctly.
 */
import type { ReactNode, Ref } from 'react';
import type { ClickEvent } from '../ink/events/click-event.js';
import type { FocusEvent } from '../ink/events/focus-event.js';
import type { KeyboardEvent } from '../ink/events/keyboard-event.js';
import type { Styles, TextStyles } from '../ink/styles.js';
import type { DOMElement } from '../ink/dom.js';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ink-box': {
        ref?: Ref<DOMElement>;
        tabIndex?: number;
        autoFocus?: boolean;
        onClick?: (event: ClickEvent) => void;
        onFocus?: (event: FocusEvent) => void;
        onFocusCapture?: (event: FocusEvent) => void;
        onBlur?: (event: FocusEvent) => void;
        onBlurCapture?: (event: FocusEvent) => void;
        onMouseEnter?: () => void;
        onMouseLeave?: () => void;
        onKeyDown?: (event: KeyboardEvent) => void;
        onKeyDownCapture?: (event: KeyboardEvent) => void;
        style?: Styles;
        stickyScroll?: boolean;
        children?: ReactNode;
      };
      'ink-text': {
        style?: Styles;
        textStyles?: TextStyles;
        children?: ReactNode;
      };
      'ink-link': {
        href?: string;
        children?: ReactNode;
      };
      'ink-raw-ansi': {
        rawText?: string;
        rawWidth?: number;
        rawHeight?: number;
      };
    }
  }
}

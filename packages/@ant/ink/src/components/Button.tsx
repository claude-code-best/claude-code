import React, { type Ref, useCallback, useEffect, useRef, useState } from 'react';
import type { Except } from 'type-fest';
import type { DOMElement } from '../core/dom.js';
import type { ClickEvent } from '../core/events/click-event.js';
import type { FocusEvent } from '../core/events/focus-event.js';
import type { KeyboardEvent } from '../core/events/keyboard-event.js';
import type { Styles } from '../core/styles.js';
import Box from './Box.js';

type ButtonState = {
  focused: boolean;
  hovered: boolean;
  active: boolean;
};

export type Props = Except<Styles, 'textWrap'> & {
  ref?: Ref<DOMElement>;
  /**
   * Called when the button is activated via Enter, Space, or click.
   */
  onAction: () => void;
  /**
   * Tab order index. Defaults to 0 (in tab order).
   * Set to -1 for programmatically focusable only.
   */
  tabIndex?: number;
  /**
   * Focus this button when it mounts.
   */
  autoFocus?: boolean;
  /**
   * Render prop receiving the interactive state. Use this to
   * style children based on focus/hover/active — Button itself
   * is intentionally unstyled.
   *
   * If not provided, children render as-is (no state-dependent styling).
   */
  children: ((state: ButtonState) => React.ReactNode) | React.ReactNode;
};

function Button({ onAction, tabIndex = 0, autoFocus, children, ref, ...style }: Props): React.ReactNode {
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const activeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (activeTimer.current) clearTimeout(activeTimer.current);
    };
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'return' || e.key === ' ') {
        e.preventDefault();
        setIsActive(true);
        onAction();
        if (activeTimer.current) clearTimeout(activeTimer.current);
        activeTimer.current = setTimeout(setter => setter(false), 100, setIsActive);
      }
    },
    [onAction],
  );

  const handleClick = useCallback(
    (_e: ClickEvent) => {
      onAction();
    },
    [onAction],
  );

  const handleFocus = useCallback((_e: FocusEvent) => setIsFocused(true), []);
  const handleBlur = useCallback((_e: FocusEvent) => setIsFocused(false), []);
  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  const state: ButtonState = {
    focused: isFocused,
    hovered: isHovered,
    active: isActive,
  };
  const content = typeof children === 'function' ? children(state) : children;

  return (
    <Box
      ref={ref}
      tabIndex={tabIndex}
      autoFocus={autoFocus}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...style}
    >
      {content}
    </Box>
  );
}

export default Button;
export type { ButtonState };

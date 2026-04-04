import React, { type PropsWithChildren, type Ref } from 'react'
import Box from '../../ink/components/Box.js'
import type { DOMElement } from '../../ink/dom.js'
import type { ClickEvent } from '../../ink/events/click-event.js'
import type { FocusEvent } from '../../ink/events/focus-event.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import type { Color, Styles } from '../../ink/styles.js'
import { getTheme, type Theme } from '../../utils/theme.js'
import { useTheme } from './ThemeProvider.js'

// Color props that accept theme keys
type ThemedColorProps = {
  readonly borderColor?: keyof Theme | Color
  readonly borderTopColor?: keyof Theme | Color
  readonly borderBottomColor?: keyof Theme | Color
  readonly borderLeftColor?: keyof Theme | Color
  readonly borderRightColor?: keyof Theme | Color
  readonly backgroundColor?: keyof Theme | Color
}

// Base Styles without color props (they'll be overridden)
type BaseStylesWithoutColors = Omit<
  Styles,
  | 'textWrap'
  | 'borderColor'
  | 'borderTopColor'
  | 'borderBottomColor'
  | 'borderLeftColor'
  | 'borderRightColor'
  | 'backgroundColor'
>

export type Props = BaseStylesWithoutColors &
  ThemedColorProps & {
    ref?: Ref<DOMElement>
    tabIndex?: number
    autoFocus?: boolean
    onClick?: (event: ClickEvent) => void
    onFocus?: (event: FocusEvent) => void
    onFocusCapture?: (event: FocusEvent) => void
    onBlur?: (event: FocusEvent) => void
    onBlurCapture?: (event: FocusEvent) => void
    onKeyDown?: (event: KeyboardEvent) => void
    onKeyDownCapture?: (event: KeyboardEvent) => void
    onMouseEnter?: () => void
    onMouseLeave?: () => void
  }

/**
 * Resolves a color value that may be a theme key to a raw Color.
 */
function resolveColor(
  color: keyof Theme | Color | undefined,
  theme: Theme,
): Color | undefined {
  if (!color) return undefined
  // Check if it's a raw color (starts with rgb(, #, ansi256(, or ansi:)
  if (
    color.startsWith('rgb(') ||
    color.startsWith('#') ||
    color.startsWith('ansi256(') ||
    color.startsWith('ansi:')
  ) {
    return color as Color
  }
  // It's a theme key - resolve it
  return theme[color as keyof Theme] as Color
}

/**
 * Theme-aware Box component that resolves theme color keys to raw colors.
 * This wraps the base Box component with theme resolution for border colors.
 */
function ThemedBox({
  borderColor,
  borderTopColor,
  borderBottomColor,
  borderLeftColor,
  borderRightColor,
  backgroundColor,
  children,
  ref,
  ...rest
}: PropsWithChildren<Props>): React.ReactNode {
  const [themeName] = useTheme()
  const theme = getTheme(themeName)

  // Resolve theme keys to raw colors
  const resolvedBorderColor = resolveColor(borderColor, theme)
  const resolvedBorderTopColor = resolveColor(borderTopColor, theme)
  const resolvedBorderBottomColor = resolveColor(borderBottomColor, theme)
  const resolvedBorderLeftColor = resolveColor(borderLeftColor, theme)
  const resolvedBorderRightColor = resolveColor(borderRightColor, theme)
  const resolvedBackgroundColor = resolveColor(backgroundColor, theme)

  return (
    <Box
      ref={ref}
      borderColor={resolvedBorderColor}
      borderTopColor={resolvedBorderTopColor}
      borderBottomColor={resolvedBorderBottomColor}
      borderLeftColor={resolvedBorderLeftColor}
      borderRightColor={resolvedBorderRightColor}
      backgroundColor={resolvedBackgroundColor}
      {...rest}
    >
      {children}
    </Box>
  )
}

export default ThemedBox

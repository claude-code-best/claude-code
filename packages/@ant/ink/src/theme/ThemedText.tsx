import type { ReactNode } from 'react'
import React, { useContext } from 'react'
import Text from '../components/Text.js'
import type { Color, Styles } from '../core/styles.js'
import { getTheme, type Theme } from './theme-types.js'
import { useTheme } from './ThemeProvider.js'

/** Colors uncolored ThemedText in the subtree. Precedence: explicit `color` >
 *  this > dimColor. Crosses Box boundaries (Ink's style cascade doesn't). */
export const TextHoverColorContext = React.createContext<
  keyof Theme | undefined
>(undefined)

export type Props = {
  /**
   * Change text color. Accepts a theme key or raw color value.
   */
  readonly color?: keyof Theme | Color

  /**
   * Same as `color`, but for background. Must be a theme key.
   */
  readonly backgroundColor?: keyof Theme

  /**
   * Dim the color using the theme's inactive color.
   * This is compatible with bold (unlike ANSI dim).
   */
  readonly dimColor?: boolean

  /**
   * Make the text bold.
   */
  readonly bold?: boolean

  /**
   * Make the text italic.
   */
  readonly italic?: boolean

  /**
   * Make the text underlined.
   */
  readonly underline?: boolean

  /**
   * Make the text crossed with a line.
   */
  readonly strikethrough?: boolean

  /**
   * Inverse background and foreground colors.
   */
  readonly inverse?: boolean

  /**
   * This property tells Ink to wrap or truncate text if its width is larger than container.
   * If `wrap` is passed (by default), Ink will wrap text and split it into multiple lines.
   * If `truncate-*` is passed, Ink will truncate text instead, which will result in one line of text with the rest cut off.
   */
  readonly wrap?: Styles['textWrap']

  readonly children?: ReactNode
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
 * Theme-aware Text component that resolves theme color keys to raw colors.
 * This wraps the base Text component with theme resolution.
 */
export default function ThemedText({
  color,
  backgroundColor,
  dimColor = false,
  bold = false,
  italic = false,
  underline = false,
  strikethrough = false,
  inverse = false,
  wrap = 'wrap',
  children,
}: Props): React.ReactNode {
  const [themeName] = useTheme()
  const theme = getTheme(themeName)
  const hoverColor = useContext(TextHoverColorContext)

  // Resolve theme keys to raw colors
  const resolvedColor =
    !color && hoverColor
      ? resolveColor(hoverColor, theme)
      : dimColor
        ? (theme.inactive as Color)
        : resolveColor(color, theme)
  const resolvedBackgroundColor = backgroundColor
    ? (theme[backgroundColor] as Color)
    : undefined

  return (
    <Text
      color={resolvedColor}
      backgroundColor={resolvedBackgroundColor}
      bold={bold}
      italic={italic}
      underline={underline}
      strikethrough={strikethrough}
      inverse={inverse}
      wrap={wrap}
    >
      {children}
    </Text>
  )
}

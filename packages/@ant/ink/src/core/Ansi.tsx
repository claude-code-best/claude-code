import React from 'react'
import Link from '../components/Link.js'
import Text from '../components/Text.js'
import type { Color } from './styles.js'
import {
  type NamedColor,
  Parser,
  type Color as TermioColor,
  type TextStyle,
} from './termio.js'

type Props = {
  children: string
  /** When true, force all text to be rendered with dim styling */
  dimColor?: boolean
}

type SpanProps = {
  color?: Color
  backgroundColor?: Color
  dim?: boolean
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  inverse?: boolean
  hyperlink?: string
}

/**
 * Component that parses ANSI escape codes and renders them using Text components.
 *
 * Use this as an escape hatch when you have pre-formatted ANSI strings from
 * external tools (like cli-highlight) that need to be rendered in Ink.
 *
 * Memoized to prevent re-renders when parent changes but children string is the same.
 */
export const Ansi = React.memo(function Ansi({
  children,
  dimColor,
}: Props): React.ReactNode {
  if (typeof children !== 'string') {
    return dimColor ? (
      <Text dim>{String(children)}</Text>
    ) : (
      <Text>{String(children)}</Text>
    )
  }

  if (children === '') {
    return null
  }

  const spans = parseToSpans(children)

  if (spans.length === 0) {
    return null
  }

  if (spans.length === 1 && !hasAnyProps(spans[0]!.props)) {
    return dimColor ? (
      <Text dim>{spans[0]!.text}</Text>
    ) : (
      <Text>{spans[0]!.text}</Text>
    )
  }

  const content = spans.map((span, i) => {
    const hyperlink = span.props.hyperlink
    // When dimColor is forced, override the span's dim prop
    if (dimColor) {
      span.props.dim = true
    }
    const hasTextProps = hasAnyTextProps(span.props)

    if (hyperlink) {
      return hasTextProps ? (
        <Link key={i} url={hyperlink}>
          <StyledText
            color={span.props.color}
            backgroundColor={span.props.backgroundColor}
            dim={span.props.dim}
            bold={span.props.bold}
            italic={span.props.italic}
            underline={span.props.underline}
            strikethrough={span.props.strikethrough}
            inverse={span.props.inverse}
          >
            {span.text}
          </StyledText>
        </Link>
      ) : (
        <Link key={i} url={hyperlink}>
          {span.text}
        </Link>
      )
    }

    return hasTextProps ? (
      <StyledText
        key={i}
        color={span.props.color}
        backgroundColor={span.props.backgroundColor}
        dim={span.props.dim}
        bold={span.props.bold}
        italic={span.props.italic}
        underline={span.props.underline}
        strikethrough={span.props.strikethrough}
        inverse={span.props.inverse}
      >
        {span.text}
      </StyledText>
    ) : (
      span.text
    )
  })

  return dimColor ? <Text dim>{content}</Text> : <Text>{content}</Text>
})

type Span = {
  text: string
  props: SpanProps
}

/**
 * Parse an ANSI string into spans using the termio parser.
 */
function parseToSpans(input: string): Span[] {
  const parser = new Parser()
  const actions = parser.feed(input)
  const spans: Span[] = []

  let currentHyperlink: string | undefined

  for (const action of actions) {
    if (action.type === 'link') {
      if (action.action.type === 'start') {
        currentHyperlink = action.action.url
      } else {
        currentHyperlink = undefined
      }
      continue
    }

    if (action.type === 'text') {
      const text = action.graphemes.map(g => g.value).join('')
      if (!text) continue

      const props = textStyleToSpanProps(action.style)
      if (currentHyperlink) {
        props.hyperlink = currentHyperlink
      }

      // Try to merge with previous span if props match
      const lastSpan = spans[spans.length - 1]
      if (lastSpan && propsEqual(lastSpan.props, props)) {
        lastSpan.text += text
      } else {
        spans.push({ text, props })
      }
    }
  }

  return spans
}

/**
 * Convert termio's TextStyle to SpanProps.
 */
function textStyleToSpanProps(style: TextStyle): SpanProps {
  const props: SpanProps = {}

  if (style.bold) props.bold = true
  if (style.dim) props.dim = true
  if (style.italic) props.italic = true
  if (style.underline !== 'none') props.underline = true
  if (style.strikethrough) props.strikethrough = true
  if (style.inverse) props.inverse = true

  const fgColor = colorToString(style.fg)
  if (fgColor) props.color = fgColor

  const bgColor = colorToString(style.bg)
  if (bgColor) props.backgroundColor = bgColor

  return props
}

// Map termio named colors to the ansi: format
const NAMED_COLOR_MAP: Record<NamedColor, string> = {
  black: 'ansi:black',
  red: 'ansi:red',
  green: 'ansi:green',
  yellow: 'ansi:yellow',
  blue: 'ansi:blue',
  magenta: 'ansi:magenta',
  cyan: 'ansi:cyan',
  white: 'ansi:white',
  brightBlack: 'ansi:blackBright',
  brightRed: 'ansi:redBright',
  brightGreen: 'ansi:greenBright',
  brightYellow: 'ansi:yellowBright',
  brightBlue: 'ansi:blueBright',
  brightMagenta: 'ansi:magentaBright',
  brightCyan: 'ansi:cyanBright',
  brightWhite: 'ansi:whiteBright',
}

/**
 * Convert termio's Color to the string format used by Ink.
 */
function colorToString(color: TermioColor): Color | undefined {
  switch (color.type) {
    case 'named':
      return NAMED_COLOR_MAP[color.name] as Color
    case 'indexed':
      return `ansi256(${color.index})` as Color
    case 'rgb':
      return `rgb(${color.r},${color.g},${color.b})` as Color
    case 'default':
      return undefined
  }
}

/**
 * Check if two SpanProps are equal for merging.
 */
function propsEqual(a: SpanProps, b: SpanProps): boolean {
  return (
    a.color === b.color &&
    a.backgroundColor === b.backgroundColor &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough &&
    a.inverse === b.inverse &&
    a.hyperlink === b.hyperlink
  )
}

function hasAnyProps(props: SpanProps): boolean {
  return (
    props.color !== undefined ||
    props.backgroundColor !== undefined ||
    props.dim === true ||
    props.bold === true ||
    props.italic === true ||
    props.underline === true ||
    props.strikethrough === true ||
    props.inverse === true ||
    props.hyperlink !== undefined
  )
}

function hasAnyTextProps(props: SpanProps): boolean {
  return (
    props.color !== undefined ||
    props.backgroundColor !== undefined ||
    props.dim === true ||
    props.bold === true ||
    props.italic === true ||
    props.underline === true ||
    props.strikethrough === true ||
    props.inverse === true
  )
}

// Text style props without weight (bold/dim) - these are handled separately
type BaseTextStyleProps = {
  color?: Color
  backgroundColor?: Color
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  inverse?: boolean
}

// Wrapper component that handles bold/dim mutual exclusivity for Text
function StyledText({
  bold,
  dim,
  children,
  ...rest
}: BaseTextStyleProps & {
  bold?: boolean
  dim?: boolean
  children: string
}): React.ReactNode {
  // dim takes precedence over bold when both are set (terminals treat them as mutually exclusive)
  if (dim) {
    return (
      <Text {...rest} dim>
        {children}
      </Text>
    )
  }
  if (bold) {
    return (
      <Text {...rest} bold>
        {children}
      </Text>
    )
  }
  return <Text {...rest}>{children}</Text>
}

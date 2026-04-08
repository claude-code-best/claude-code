import React from 'react'

type Props = {
  /**
   * Pre-rendered ANSI lines. Each element must be exactly one terminal row
   * (already wrapped to `width` by the producer) with ANSI escape codes inline.
   */
  lines: string[]
  /** Column width the producer wrapped to. Sent to Yoga as the fixed leaf width. */
  width: number
}

/**
 * Bypass the <Ansi> → React tree → Yoga → squash → re-serialize roundtrip for
 * content that is already terminal-ready.
 *
 * Use this when an external renderer (e.g. the ColorDiff NAPI module) has
 * already produced ANSI-escaped, width-wrapped output. A normal <Ansi> mount
 * reparses that output into one React <Text> per style span, lays out each
 * span as a Yoga flex child, then walks the tree to re-emit the same escape
 * codes it was given. For a long transcript full of syntax-highlighted diffs
 * that roundtrip is the dominant cost of the render.
 *
 * This component emits a single Yoga leaf with a constant-time measure func
 * (width × lines.length) and hands the joined string straight to output.write(),
 * which already splits on '\n' and parses ANSI into the screen buffer.
 */
export function RawAnsi({ lines, width }: Props): React.ReactNode {
  if (lines.length === 0) {
    return null
  }
  return (
    <ink-raw-ansi
      rawText={lines.join('\n')}
      rawWidth={width}
      rawHeight={lines.length}
    />
  )
}

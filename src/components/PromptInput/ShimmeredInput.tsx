import * as React from 'react'
import { Ansi, Box, Text, useAnimationFrame } from '@anthropic/ink'
import {
  segmentTextByHighlights,
  type TextHighlight,
} from '../../utils/textHighlighting.js'
import { ShimmerChar } from '../Spinner/ShimmerChar.js'

type Props = {
  text: string
  highlights: TextHighlight[]
}

type LinePart = {
  text: string
  highlight: TextHighlight | undefined
  start: number
}

export function HighlightedInput({ text, highlights }: Props): React.ReactNode {
  // The shimmer animation (below) re-renders this component at 20fps while the
  // ultrathink keyword is present. text/highlights are referentially stable
  // across animation ticks (parent doesn't re-render), so memoize everything
  // that derives from them: segmentTextByHighlights alone is ~85µs/call
  // (tokenize + sort + O(n²) overlap), which adds up fast at 20fps.
  const { lines, hasShimmer, sweepStart, cycleLength } = React.useMemo(() => {
    const segments = segmentTextByHighlights(text, highlights)

    // Split segments by newlines into per-line groups. Ink's row-direction Box
    // indents continuation lines of a multi-line child to that child's X offset.
    // By splitting at newlines, each line renders as its own row, avoiding the
    // incorrect indentation when highlighted text is followed by wrapped content.
    const lines: LinePart[][] = [[]]
    let pos = 0
    for (const segment of segments) {
      const parts = segment.text.split('\n')
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          lines.push([])
          pos += 1
        }
        const part = parts[i]!
        if (part.length > 0) {
          lines[lines.length - 1]!.push({
            text: part,
            highlight: segment.highlight,
            start: pos,
          })
        }
        pos += part.length
      }
    }

    // Scope the sweep to shimmer-highlighted ranges so cycle time doesn't grow
    // with input length. Padding creates an offscreen pause between sweeps.
    const hasShimmer = highlights.some(h => h.shimmerColor)
    let sweepStart = 0
    let cycleLength = 1
    if (hasShimmer) {
      const padding = 10
      let lo = Infinity
      let hi = -Infinity
      for (const h of highlights) {
        if (h.shimmerColor) {
          lo = Math.min(lo, h.start)
          hi = Math.max(hi, h.end)
        }
      }
      sweepStart = lo - padding
      cycleLength = hi - lo + padding * 2
    }

    return { lines, hasShimmer, sweepStart, cycleLength }
  }, [text, highlights])

  const [ref, time] = useAnimationFrame(hasShimmer ? 50 : null)
  const glimmerIndex = hasShimmer
    ? sweepStart + (Math.floor(time / 50) % cycleLength)
    : -100

  return (
    <Box ref={ref} flexDirection="column">
      {lines.map((lineParts, lineIndex) => (
        <Box key={lineIndex}>
          {lineParts.length === 0 ? (
            <Text> </Text>
          ) : (
            lineParts.map((part, partIndex) => {
              if (part.highlight?.shimmerColor && part.highlight.color) {
                return (
                  <Text key={partIndex}>
                    {part.text.split('').map((char, charIndex) => (
                      <ShimmerChar
                        key={charIndex}
                        char={char}
                        index={part.start + charIndex}
                        glimmerIndex={glimmerIndex}
                        messageColor={part.highlight!.color!}
                        shimmerColor={part.highlight!.shimmerColor!}
                      />
                    ))}
                  </Text>
                )
              }
              return (
                <Text
                  key={partIndex}
                  color={part.highlight?.color}
                  dimColor={part.highlight?.dimColor}
                  inverse={part.highlight?.inverse}
                >
                  <Ansi>{part.text}</Ansi>
                </Text>
              )
            })
          )}
        </Box>
      ))}
    </Box>
  )
}

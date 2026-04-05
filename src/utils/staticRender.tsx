import * as React from 'react'
import { useLayoutEffect } from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { render, useApp } from '../ink.js'

// This is a workaround for the fact that Ink doesn't support multiple <Static>
// components in the same render tree. Instead of using a <Static> we just render
// the component to a string and then print it to stdout

/**
 * Wrapper component that exits after rendering.
 * Uses useLayoutEffect to ensure we wait for React's commit phase to complete
 * before exiting. This is more robust than process.nextTick() for React 19's
 * async render cycle.
 */
function RenderOnceAndExit({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  const { exit } = useApp()

  // useLayoutEffect runs synchronously after React commits DOM mutations.
  // setTimeout(0) defers exit to allow Ink to flush output to the stream.
  useLayoutEffect(() => {
    const timer = setTimeout(exit, 0)
    return () => clearTimeout(timer)
  }, [exit])

  return <>{children}</>
}

// DEC synchronized update markers used by terminals
const SYNC_START = '\x1B[?2026h'
const SYNC_END = '\x1B[?2026l'

/**
 * Extracts content from the first complete frame in Ink's output.
 * Ink with non-TTY stdout outputs multiple frames, each wrapped in DEC synchronized
 * update sequences ([?2026h ... [?2026l). We only want the first frame's content.
 */
function extractFirstFrame(output: string): string {
  const startIndex = output.indexOf(SYNC_START)
  if (startIndex === -1) return output

  const contentStart = startIndex + SYNC_START.length
  const endIndex = output.indexOf(SYNC_END, contentStart)
  if (endIndex === -1) return output

  return output.slice(contentStart, endIndex)
}

/**
 * Renders a React node to a string with ANSI escape codes (for terminal output).
 */
export function renderToAnsiString(
  node: React.ReactNode,
  columns?: number,
): Promise<string> {
  return new Promise(async resolve => {
    let output = ''

    // Capture all writes. Set .columns so Ink (ink.tsx:~165) picks up a
    // chosen width instead of PassThrough's undefined → 80 fallback —
    // useful for rendering at terminal width for file dumps that should
    // match what the user sees on screen.
    const stream = new PassThrough()
    if (columns !== undefined) {
      ;(stream as unknown as { columns: number }).columns = columns
    }
    stream.on('data', chunk => {
      output += chunk.toString()
    })

    // Render the component wrapped in RenderOnceAndExit
    // Non-TTY stdout (PassThrough) gives full-frame output instead of diffs
    const instance = await render(
      <RenderOnceAndExit>{node}</RenderOnceAndExit>,
      {
        stdout: stream as unknown as NodeJS.WriteStream,
        patchConsole: false,
      },
    )

    // Wait for the component to exit naturally
    await instance.waitUntilExit()

    // Extract only the first frame's content to avoid duplication
    // (Ink outputs multiple frames in non-TTY mode)
    await resolve(extractFirstFrame(output))
  })
}

/**
 * Renders a React node to a plain text string (ANSI codes stripped).
 */
export async function renderToString(
  node: React.ReactNode,
  columns?: number,
): Promise<string> {
  const output = await renderToAnsiString(node, columns)
  return stripAnsi(output)
}

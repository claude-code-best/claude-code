import codeExcerpt, { type CodeExcerpt } from 'code-excerpt'
import { readFileSync } from 'fs'
import React from 'react'
import StackUtils from 'stack-utils'
import Box from './Box.js'
import Text from './Text.js'

/* eslint-disable custom-rules/no-process-cwd -- stack trace file:// paths are relative to the real OS cwd, not the virtual cwd */

// Error's source file is reported as file:///home/user/file.js
// This function removes the file://[cwd] part
const cleanupPath = (path: string | undefined): string | undefined => {
  return path?.replace(`file://${process.cwd()}/`, '')
}

let stackUtils: StackUtils | undefined
function getStackUtils(): StackUtils {
  return (stackUtils ??= new StackUtils({
    cwd: process.cwd(),
    internals: StackUtils.nodeInternals(),
  }))
}

/* eslint-enable custom-rules/no-process-cwd */

type Props = {
  readonly error: Error
}

export default function ErrorOverview({ error }: Props) {
  const stack = error.stack ? error.stack.split('\n').slice(1) : undefined
  const origin = stack ? getStackUtils().parseLine(stack[0]!) : undefined
  const filePath = cleanupPath(origin?.file)
  let excerpt: CodeExcerpt[] | undefined
  let lineWidth = 0

  if (filePath && origin?.line) {
    try {
      // eslint-disable-next-line custom-rules/no-sync-fs -- sync render path; error overlay can't go async without suspense restructuring
      const sourceCode = readFileSync(filePath, 'utf8')
      excerpt = codeExcerpt(sourceCode, origin.line)

      if (excerpt) {
        for (const { line } of excerpt) {
          lineWidth = Math.max(lineWidth, String(line).length)
        }
      }
    } catch {
      // file not readable — skip source context
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text backgroundColor="ansi:red" color="ansi:white">
          {' '}
          ERROR{' '}
        </Text>

        <Text> {error.message}</Text>
      </Box>

      {origin && filePath && (
        <Box marginTop={1}>
          <Text dim>
            {filePath}:{origin.line}:{origin.column}
          </Text>
        </Box>
      )}

      {origin && excerpt && (
        <Box marginTop={1} flexDirection="column">
          {excerpt.map(({ line, value }) => (
            <Box key={line}>
              <Box width={lineWidth + 1}>
                <Text
                  dim={line !== origin.line}
                  backgroundColor={
                    line === origin.line ? 'ansi:red' : undefined
                  }
                  color={line === origin.line ? 'ansi:white' : undefined}
                >
                  {String(line).padStart(lineWidth, ' ')}:
                </Text>
              </Box>

              <Text
                key={line}
                backgroundColor={line === origin.line ? 'ansi:red' : undefined}
                color={line === origin.line ? 'ansi:white' : undefined}
              >
                {' ' + value}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {error.stack && (
        <Box marginTop={1} flexDirection="column">
          {error.stack
            .split('\n')
            .slice(1)
            .map(line => {
              const parsedLine = getStackUtils().parseLine(line)

              // If the line from the stack cannot be parsed, we print out the unparsed line.
              if (!parsedLine) {
                return (
                  <Box key={line}>
                    <Text dim>- </Text>
                    <Text bold>{line}</Text>
                  </Box>
                )
              }

              return (
                <Box key={line}>
                  <Text dim>- </Text>
                  <Text bold>{parsedLine.function}</Text>
                  <Text dim>
                    {' '}
                    ({cleanupPath(parsedLine.file) ?? ''}:{parsedLine.line}:
                    {parsedLine.column})
                  </Text>
                </Box>
              )
            })}
        </Box>
      )}
    </Box>
  )
}

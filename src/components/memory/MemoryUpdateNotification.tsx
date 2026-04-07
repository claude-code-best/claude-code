import { homedir } from 'os'
import { relative } from 'path'
import React from 'react'
import { Box, Text } from '../../ink.js'
import { getCwd } from '../../utils/cwd.js'

export function getRelativeMemoryPath(path: string): string {
  const homeDir = homedir()
  const cwd = getCwd()

  // Calculate relative paths
  const relativeToHome = path.startsWith(homeDir)
    ? '~' + path.slice(homeDir.length)
    : null

  const relativeToCwd = path.startsWith(cwd) ? './' + relative(cwd, path) : null

  // Return the shorter path, or absolute if neither is applicable
  if (relativeToHome && relativeToCwd) {
    return relativeToHome.length <= relativeToCwd.length
      ? relativeToHome
      : relativeToCwd
  }

  return relativeToHome || relativeToCwd || path
}

export function MemoryUpdateNotification({
  memoryPath,
}: {
  memoryPath: string
}): React.ReactNode {
  const displayPath = getRelativeMemoryPath(memoryPath)

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text color="text">
        Memory updated in {displayPath} · /memory to edit
      </Text>
    </Box>
  )
}

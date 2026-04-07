import React from 'react'
import { Box, Text, useTheme } from '@anthropic/ink'
import { FallbackPermissionRequest } from '../FallbackPermissionRequest.js'
import { FilePermissionDialog } from '../FilePermissionDialog/FilePermissionDialog.js'
import type { ToolInput } from '../FilePermissionDialog/useFilePermissionDialog.js'
import type {
  PermissionRequestProps,
  ToolUseConfirm,
} from '../PermissionRequest.js'

function pathFromToolUse(toolUseConfirm: ToolUseConfirm): string | null {
  const tool = toolUseConfirm.tool
  if ('getPath' in tool && typeof tool.getPath === 'function') {
    try {
      return tool.getPath(toolUseConfirm.input)
    } catch {
      return null
    }
  }
  return null
}

export function FilesystemPermissionRequest({
  toolUseConfirm,
  onDone,
  onReject,
  verbose,
  toolUseContext,
  workerBadge,
}: PermissionRequestProps): React.ReactNode {
  const [theme] = useTheme()
  const path = pathFromToolUse(toolUseConfirm)
  const userFacingName = toolUseConfirm.tool.userFacingName(
    toolUseConfirm.input as never,
  )

  const isReadOnly = toolUseConfirm.tool.isReadOnly(toolUseConfirm.input)
  const userFacingReadOrEdit = isReadOnly ? 'Read' : 'Edit'

  // Use simple singular form - the actual operation details are shown in content
  const title = `${userFacingReadOrEdit} file`

  // Simple pass-through parser since we don't need to transform the input
  const parseInput = (input: unknown): ToolInput => input as ToolInput

  // Fall back to generic permission request if no path is found
  if (!path) {
    return (
      <FallbackPermissionRequest
        toolUseConfirm={toolUseConfirm}
        toolUseContext={toolUseContext}
        onDone={onDone}
        onReject={onReject}
        verbose={verbose}
        workerBadge={workerBadge}
      />
    )
  }

  // Render tool use message content
  const content = (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text>
        {userFacingName}(
        {toolUseConfirm.tool.renderToolUseMessage(
          toolUseConfirm.input as never,
          { theme, verbose },
        )}
        )
      </Text>
    </Box>
  )

  return (
    <FilePermissionDialog
      toolUseConfirm={toolUseConfirm}
      toolUseContext={toolUseContext}
      onDone={onDone}
      onReject={onReject}
      workerBadge={workerBadge}
      title={title}
      content={content}
      path={path}
      parseInput={parseInput}
      operationType={isReadOnly ? 'read' : 'write'}
      completionType="tool_use_single"
    />
  )
}

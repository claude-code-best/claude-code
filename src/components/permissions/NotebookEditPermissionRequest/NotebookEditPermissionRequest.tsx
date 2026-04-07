import { basename } from 'path'
import React from 'react'
import type { z } from 'zod/v4'
import { Text } from '@anthropic/ink'
import { NotebookEditTool } from '../../../tools/NotebookEditTool/NotebookEditTool.js'
import { logError } from '../../../utils/log.js'
import { FilePermissionDialog } from '../FilePermissionDialog/FilePermissionDialog.js'
import type { PermissionRequestProps } from '../PermissionRequest.js'
import { NotebookEditToolDiff } from './NotebookEditToolDiff.js'

type NotebookEditInput = z.infer<typeof NotebookEditTool.inputSchema>

export function NotebookEditPermissionRequest(
  props: PermissionRequestProps,
): React.ReactNode {
  const parseInput = (input: unknown): NotebookEditInput => {
    const result = NotebookEditTool.inputSchema.safeParse(input)
    if (!result.success) {
      logError(
        new Error(
          `Failed to parse notebook edit input: ${result.error.message}`,
        ),
      )
      // Return a default value to avoid crashing
      return {
        notebook_path: '',
        new_source: '',
        cell_id: '',
      } as NotebookEditInput
    }
    return result.data
  }

  const parsed = parseInput(props.toolUseConfirm.input)
  const { notebook_path, edit_mode, cell_type } = parsed

  const language = cell_type === 'markdown' ? 'markdown' : 'python'

  const editTypeText =
    edit_mode === 'insert'
      ? 'insert this cell into'
      : edit_mode === 'delete'
        ? 'delete this cell from'
        : 'make this edit to'

  return (
    <FilePermissionDialog
      toolUseConfirm={props.toolUseConfirm}
      toolUseContext={props.toolUseContext}
      onDone={props.onDone}
      onReject={props.onReject}
      workerBadge={props.workerBadge}
      title="Edit notebook"
      question={
        <Text>
          Do you want to {editTypeText}{' '}
          <Text bold>{basename(notebook_path)}</Text>?
        </Text>
      }
      content={
        <NotebookEditToolDiff
          notebook_path={parsed.notebook_path}
          cell_id={parsed.cell_id}
          new_source={parsed.new_source}
          cell_type={parsed.cell_type}
          edit_mode={parsed.edit_mode}
          verbose={props.verbose}
          width={props.verbose ? 120 : 80}
        />
      }
      path={notebook_path}
      completionType="tool_use_single"
      languageName={language}
      parseInput={parseInput}
    />
  )
}

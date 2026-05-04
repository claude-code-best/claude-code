import { feature } from 'bun:bundle'
import { extname, isAbsolute, resolve } from 'path'
import {
  fileHistoryEnabled,
  fileHistoryTrackEdit,
} from 'src/utils/fileHistory.js'
import { z } from 'zod/v4'
import { buildTool, type ToolDef, type ToolUseContext } from 'src/Tool.js'
import type { NotebookCell, NotebookContent } from 'src/types/notebook.js'
import { getCwd } from 'src/utils/cwd.js'
import { isENOENT } from 'src/utils/errors.js'
import { getFileModificationTime, writeTextContent } from 'src/utils/file.js'
import { readFileSyncWithMetadata } from 'src/utils/fileRead.js'
import { safeParseJSON } from 'src/utils/json.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { parseCellId } from 'src/utils/notebook.js'
import { checkWritePermissionForTool } from 'src/utils/permissions/filesystem.js'
import type { PermissionDecision } from 'src/utils/permissions/PermissionResult.js'
import { jsonParse, jsonStringify } from 'src/utils/slowOperations.js'
import { NOTEBOOK_EDIT_TOOL_NAME } from './constants.js'
import { DESCRIPTION, PROMPT } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage,
} from './UI.js'

export const inputSchema = lazySchema(() =>
  z.strictObject({
    notebook_path: z
      .string()
      .describe(
        '要编辑的 Jupyter notebook 文件的绝对路径（必须是绝对路径，不能是相对路径）',
      ),
    cell_id: z
      .string()
      .optional()
      .describe(
        '要编辑的单元格 ID。插入新单元格时，新单元格将插入到此 ID 对应的单元格之后，如果未指定则插入到开头。',
      ),
    new_source: z.string().describe('单元格的新源代码'),
    cell_type: z
      .enum(['code', 'markdown'])
      .optional()
      .describe(
        '单元格的类型（code 或 markdown）。如果未指定，则默认为当前单元格类型。如果使用 edit_mode=insert，则此项为必填。',
      ),
    edit_mode: z
      .enum(['replace', 'insert', 'delete'])
      .optional()
      .describe('编辑类型（replace、insert、delete）。默认为 replace。'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export const outputSchema = lazySchema(() =>
  z.object({
    new_source: z.string().describe('写入单元格的新源代码'),
    cell_id: z.string().optional().describe('被编辑的单元格 ID'),
    cell_type: z.enum(['code', 'markdown']).describe('单元格的类型'),
    language: z.string().describe('notebook 的编程语言'),
    edit_mode: z.string().describe('使用的编辑模式'),
    error: z.string().optional().describe('操作失败时的错误消息'),
    // 用于归属跟踪的字段
    notebook_path: z.string().describe('notebook 文件的路径'),
    original_file: z.string().describe('修改前的原始 notebook 内容'),
    updated_file: z.string().describe('修改后的更新 notebook 内容'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const NotebookEditTool = buildTool({
  name: NOTEBOOK_EDIT_TOOL_NAME,
  searchHint: '编辑 Jupyter notebook 单元格（.ipynb）',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  userFacingName() {
    return '编辑 Notebook'
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `正在编辑 notebook ${summary}` : '正在编辑 notebook'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  toAutoClassifierInput(input) {
    if (feature('TRANSCRIPT_CLASSIFIER')) {
      const mode = input.edit_mode ?? 'replace'
      return `${input.notebook_path} ${mode}: ${input.new_source}`
    }
    return ''
  },
  getPath(input): string {
    return input.notebook_path
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    return checkWritePermissionForTool(
      NotebookEditTool,
      input,
      appState.toolPermissionContext,
    )
  },
  mapToolResultToToolResultBlockParam(
    { cell_id, edit_mode, new_source, error },
    toolUseID,
  ) {
    if (error) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: error,
        is_error: true,
      }
    }
    switch (edit_mode) {
      case 'replace':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `已将单元格 ${cell_id} 更新为：${new_source}`,
        }
      case 'insert':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `已插入单元格 ${cell_id}，内容为：${new_source}`,
        }
      case 'delete':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `已删除单元格 ${cell_id}`,
        }
      default:
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: '未知的编辑模式',
        }
    }
  },
  renderToolUseMessage,
  renderToolUseRejectedMessage,
  renderToolUseErrorMessage,
  renderToolResultMessage,
  async validateInput(
    { notebook_path, cell_type, cell_id, edit_mode = 'replace' },
    toolUseContext: ToolUseContext,
  ) {
    const fullPath = isAbsolute(notebook_path)
      ? notebook_path
      : resolve(getCwd(), notebook_path)

    // 安全：跳过对 UNC 路径的文件系统操作，以防止 NTLM 凭据泄露
    if (fullPath.startsWith('\\\\') || fullPath.startsWith('//')) {
      return { result: true }
    }

    if (extname(fullPath) !== '.ipynb') {
      return {
        result: false,
        message:
          '文件必须是 Jupyter notebook（.ipynb 文件）。要编辑其他类型的文件，请使用 FileEdit 工具。',
        errorCode: 2,
      }
    }

    if (
      edit_mode !== 'replace' &&
      edit_mode !== 'insert' &&
      edit_mode !== 'delete'
    ) {
      return {
        result: false,
        message: '编辑模式必须是 replace、insert 或 delete。',
        errorCode: 4,
      }
    }

    if (edit_mode === 'insert' && !cell_type) {
      return {
        result: false,
        message: '使用 edit_mode=insert 时必须指定单元格类型。',
        errorCode: 5,
      }
    }

    // 要求先读后写（与 FileEditTool/FileWriteTool 一致）。如果没有这个，
    // 模型可能编辑一个从未读取过的 notebook，或者在外部更改后基于过时的视图进行编辑 —— 导致静默数据丢失。
    const readTimestamp = toolUseContext.readFileState.get(fullPath)
    if (!readTimestamp) {
      return {
        result: false,
        message: '文件尚未读取。在写入之前请先读取它。',
        errorCode: 9,
      }
    }
    if (getFileModificationTime(fullPath) > readTimestamp.timestamp) {
      return {
        result: false,
        message:
          '自读取以来文件已被修改（可能是用户或代码检查工具）。在尝试写入之前请重新读取它。',
        errorCode: 10,
      }
    }

    let content: string
    try {
      content = readFileSyncWithMetadata(fullPath).content
    } catch (e) {
      if (isENOENT(e)) {
        return {
          result: false,
          message: 'Notebook 文件不存在。',
          errorCode: 1,
        }
      }
      throw e
    }
    const notebook = safeParseJSON(content) as NotebookContent | null
    if (!notebook) {
      return {
        result: false,
        message: 'Notebook 不是有效的 JSON。',
        errorCode: 6,
      }
    }
    if (!cell_id) {
      if (edit_mode !== 'insert') {
        return {
          result: false,
          message: '在不插入新单元格时，必须指定单元格 ID。',
          errorCode: 7,
        }
      }
    } else {
      // First try to find the cell by its actual ID
      const cellIndex = notebook.cells.findIndex(
        (cell: NotebookCell) => cell.id === cell_id,
      )

      if (cellIndex === -1) {
        // 如果未找到，尝试解析为数字索引（cell-N 格式）
        const parsedCellIndex = parseCellId(cell_id)
        if (parsedCellIndex !== undefined) {
          if (!notebook.cells[parsedCellIndex]) {
            return {
              result: false,
              message: `索引为 ${parsedCellIndex} 的单元格在 notebook 中不存在。`,
              errorCode: 7,
            }
          }
        } else {
          return {
            result: false,
            message: `未在 notebook 中找到 ID 为“${cell_id}”的单元格。`,
            errorCode: 8,
          }
        }
      }
    }

    return { result: true }
  },
  async call(
    {
      notebook_path,
      new_source,
      cell_id,
      cell_type,
      edit_mode: originalEditMode,
    },
    { readFileState, updateFileHistoryState },
    _,
    parentMessage,
  ) {
    const fullPath = isAbsolute(notebook_path)
      ? notebook_path
      : resolve(getCwd(), notebook_path)

    if (fileHistoryEnabled()) {
      await fileHistoryTrackEdit(
        updateFileHistoryState,
        fullPath,
        parentMessage.uuid,
      )
    }

    try {
      // readFileSyncWithMetadata 在一次 safeResolvePath + readFileSync 调用中提供内容、编码和行结束符，
      // 取代了之前 detectFileEncoding + readFile + detectLineEndings 的链条（每个链条都重新执行 safeResolvePath 和/或 4KB readSync）。
      const { content, encoding, lineEndings } =
        readFileSyncWithMetadata(fullPath)
      // 此处必须使用非记忆化的 jsonParse：safeParseJSON 按内容字符串缓存并返回共享对象引用，
      // 但我们在下面会原地修改 notebook（cells.splice、targetCell.source = ...）。
      // 使用记忆化版本会污染 validateInput() 和后续任何具有相同文件内容的 call() 的缓存。
      let notebook: NotebookContent
      try {
        notebook = jsonParse(content) as NotebookContent
      } catch {
        return {
          data: {
            new_source,
            cell_type: cell_type ?? 'code',
            language: 'python',
            edit_mode: 'replace',
            error: 'Notebook 不是有效的 JSON。',
            cell_id,
            notebook_path: fullPath,
            original_file: '',
            updated_file: '',
          },
        }
      }

      let cellIndex
      if (!cell_id) {
        cellIndex = 0 // 如果未提供 cell_id，默认插入到开头
      } else {
        // First try to find the cell by its actual ID
        cellIndex = notebook.cells.findIndex(
          (cell: NotebookCell) => cell.id === cell_id,
        )

        // 如果未找到，尝试解析为数字索引（cell-N 格式）
        if (cellIndex === -1) {
          const parsedCellIndex = parseCellId(cell_id)
          if (parsedCellIndex !== undefined) {
            cellIndex = parsedCellIndex
          }
        }

        if (originalEditMode === 'insert') {
          cellIndex += 1 // 在此 ID 对应的单元格之后插入
        }
      }

      // 如果尝试替换最后一个单元格之后的位置，则将 replace 转换为 insert
      let edit_mode = originalEditMode
      if (edit_mode === 'replace' && cellIndex === notebook.cells.length) {
        edit_mode = 'insert'
        if (!cell_type) {
          cell_type = 'code' // 如果未指定 cell_type，默认为 code
        }
      }

      const language = notebook.metadata.language_info?.name ?? 'python'
      let new_cell_id
      if (
        notebook.nbformat > 4 ||
        (notebook.nbformat === 4 && notebook.nbformat_minor >= 5)
      ) {
        if (edit_mode === 'insert') {
          new_cell_id = Math.random().toString(36).substring(2, 15)
        } else if (cell_id !== null) {
          new_cell_id = cell_id
        }
      }

      if (edit_mode === 'delete') {
        // 删除指定单元格
        notebook.cells.splice(cellIndex, 1)
      } else if (edit_mode === 'insert') {
        let new_cell: NotebookCell
        if (cell_type === 'markdown') {
          new_cell = {
            cell_type: 'markdown',
            id: new_cell_id,
            source: new_source,
            metadata: {},
          }
        } else {
          new_cell = {
            cell_type: 'code',
            id: new_cell_id,
            source: new_source,
            metadata: {},
            execution_count: null,
            outputs: [],
          }
        }
        // 插入新单元格
        notebook.cells.splice(cellIndex, 0, new_cell)
      } else {
        // 查找指定单元格
        const targetCell = notebook.cells[cellIndex]! // validateInput 确保 cell_number 在边界内
        targetCell.source = new_source
        if (targetCell.cell_type === 'code') {
          // 重置执行计数并清除输出，因为单元格已被修改
          targetCell.execution_count = null
          targetCell.outputs = []
        }
        if (cell_type && cell_type !== targetCell.cell_type) {
          targetCell.cell_type = cell_type
        }
      }
      // 写回文件
      const IPYNB_INDENT = 1
      const updatedContent = jsonStringify(notebook, null, IPYNB_INDENT)
      writeTextContent(fullPath, updatedContent, encoding, lineEndings)
      // 使用写入后的 mtime 更新 readFileState（与 FileEditTool/FileWriteTool 一致）。offset:undefined 会破坏 FileReadTool 的去重匹配 —
      // 如果没有这个，在同一毫秒内执行 Read→NotebookEdit→Read 会针对过时的上下文内容返回 file_unchanged 存根。
      readFileState.set(fullPath, {
        content: updatedContent,
        timestamp: getFileModificationTime(fullPath),
        offset: undefined,
        limit: undefined,
      })
      const data = {
        new_source,
        cell_type: cell_type ?? 'code',
        language,
        edit_mode: edit_mode ?? 'replace',
        cell_id: new_cell_id || undefined,
        error: '',
        notebook_path: fullPath,
        original_file: content,
        updated_file: updatedContent,
      }
      return {
        data,
      }
    } catch (error) {
      if (error instanceof Error) {
        const data = {
          new_source,
          cell_type: cell_type ?? 'code',
          language: 'python',
          edit_mode: 'replace',
          error: error.message,
          cell_id,
          notebook_path: fullPath,
          original_file: '',
          updated_file: '',
        }
        return {
          data,
        }
      }
      const data = {
        new_source,
        cell_type: cell_type ?? 'code',
        language: 'python',
        edit_mode: 'replace',
        error: '编辑 notebook 时发生未知错误',
        cell_id,
        notebook_path: fullPath,
        original_file: '',
        updated_file: '',
      }
      return {
        data,
      }
    }
  },
} satisfies ToolDef<InputSchema, Output>)

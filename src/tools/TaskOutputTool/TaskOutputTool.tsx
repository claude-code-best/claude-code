import React from 'react'
import { z } from 'zod/v4'
import { FallbackToolUseErrorMessage } from '../../components/FallbackToolUseErrorMessage.js'
import { FallbackToolUseRejectedMessage } from '../../components/FallbackToolUseRejectedMessage.js'
import { MessageResponse } from '../../components/MessageResponse.js'
import { Box, Text } from '@anthropic/ink'
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js'
import type { TaskType } from '../../Task.js'
import type { Tool } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { LocalShellTaskState } from '../../tasks/LocalShellTask/guards.js'
import type { RemoteAgentTaskState } from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import type { TaskState } from '../../tasks/types.js'
import { AbortError } from '../../utils/errors.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { extractTextContent } from '../../utils/messages.js'
import { semanticBoolean } from '../../utils/semanticBoolean.js'
import { sleep } from '../../utils/sleep.js'
import { jsonParse } from '../../utils/slowOperations.js'
import { countCharInString } from '../../utils/stringUtils.js'
import { getTaskOutput } from '../../utils/task/diskOutput.js'
import { updateTaskState } from '../../utils/task/framework.js'
import { formatTaskOutput } from '../../utils/task/outputFormatting.js'
import type { ThemeName } from '../../utils/theme.js'
import { AgentPromptDisplay, AgentResponseDisplay } from '../AgentTool/UI.js'
import BashToolResultMessage from '../BashTool/BashToolResultMessage.js'
import { TASK_OUTPUT_TOOL_NAME } from './constants.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    task_id: z.string().describe('The task ID to get output from'),
    block: semanticBoolean(z.boolean().default(true)).describe(
      'Whether to wait for completion',
    ),
    timeout: z
      .number()
      .min(0)
      .max(600000)
      .default(30000)
      .describe('Max wait time in ms'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

type TaskOutputToolInput = z.infer<InputSchema>

// Unified output type covering all task types
type TaskOutput = {
  task_id: string
  task_type: TaskType
  status: string
  description: string
  output: string
  exitCode?: number | null
  error?: string
  // For agents
  prompt?: string
  result?: string
}

type TaskOutputToolOutput = {
  retrieval_status: 'success' | 'timeout' | 'not_ready'
  task: TaskOutput | null
}

// Re-export Progress from centralized types to break import cycles
export type { TaskOutputProgress as Progress } from '../../types/tools.js'

// Get output for any task type
async function getTaskOutputData(task: TaskState): Promise<TaskOutput> {
  let output: string
  if (task.type === 'local_bash') {
    const bashTask = task as LocalShellTaskState
    const taskOutputObj = bashTask.shellCommand?.taskOutput
    if (taskOutputObj) {
      const stdout = await taskOutputObj.getStdout()
      const stderr = taskOutputObj.getStderr()
      output = [stdout, stderr].filter(Boolean).join('\n')
    } else {
      output = await getTaskOutput(task.id)
    }
  } else {
    output = await getTaskOutput(task.id)
  }

  const baseOutput: TaskOutput = {
    task_id: task.id,
    task_type: task.type,
    status: task.status,
    description: task.description,
    output,
  }

  // Add type-specific fields
  if (task.type === 'local_bash') {
    const bashTask = task as LocalShellTaskState
    return {
      ...baseOutput,
      exitCode: bashTask.result?.code ?? null,
    }
  }

  if (task.type === 'local_agent') {
    const agentTask = task as LocalAgentTaskState
    // Prefer the clean final answer from the in-memory result over the raw
    // JSONL transcript on disk. The disk output is a symlink to the full
    // session transcript (every message, tool use, etc.), not just the
    // subagent's answer. The in-memory result contains only the final
    // assistant text content blocks.
    const cleanResult = agentTask.result
      ? extractTextContent(agentTask.result.content, '\n')
      : undefined
    return {
      ...baseOutput,
      prompt: agentTask.prompt,
      result: cleanResult || output,
      output: cleanResult || output,
      error: agentTask.error,
    }
  }

  if (task.type === 'remote_agent') {
    const remoteTask = task as RemoteAgentTaskState
    return {
      ...baseOutput,
      prompt: remoteTask.command,
    }
  }

  return baseOutput
}

// Wait for task to complete
async function waitForTaskCompletion(
  taskId: string,
  getAppState: () => { tasks?: Record<string, TaskState> },
  timeoutMs: number,
  abortController?: AbortController,
): Promise<TaskState | null> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    // Check abort signal
    if (abortController?.signal.aborted) {
      throw new AbortError()
    }

    const state = getAppState()
    const task = state.tasks?.[taskId] as TaskState | undefined

    if (!task) {
      return null
    }

    if (task.status !== 'running' && task.status !== 'pending') {
      return task
    }

    // Wait before polling again
    await sleep(100)
  }

  // Timeout - return current state
  const finalState = getAppState()
  return (finalState.tasks?.[taskId] as TaskState) ?? null
}

export const TaskOutputTool: Tool<InputSchema, TaskOutputToolOutput> =
  buildTool({
    name: TASK_OUTPUT_TOOL_NAME,
    searchHint: 'read output/logs from a background task',
    maxResultSizeChars: 100_000,
    shouldDefer: true,
    // Backwards-compatible aliases for renamed tools
    aliases: ['AgentOutputTool', 'BashOutputTool'],

    userFacingName() {
      return 'Task Output'
    },

    get inputSchema(): InputSchema {
      return inputSchema()
    },

    async description() {
      return '[Deprecated] — prefer Read on the task output file path'
    },

    isConcurrencySafe(_input) {
      return this.isReadOnly?.(_input) ?? false
    },

    isEnabled() {
      return "external" !== 'ant'
    },

    isReadOnly(_input) {
      return true
    },
    toAutoClassifierInput(input) {
      return input.task_id
    },

    async prompt() {
      return `DEPRECATED: Prefer using the Read tool on the task's output file path instead. Background tasks return their output file path in the tool result, and you receive a <task-notification> with the same path when the task completes — Read that file directly.

- Retrieves output from a running or completed task (background shell, agent, or remote session)
- Takes a task_id parameter identifying the task
- Returns the task output along with status information
- Use block=true (default) to wait for task completion
- Use block=false for non-blocking check of current status
- Task IDs can be found using the /tasks command
- Works with all task types: background shells, async agents, and remote sessions`
    },

    async validateInput({ task_id }, { getAppState }) {
      if (!task_id) {
        return {
          result: false,
          message: 'Task ID is required',
          errorCode: 1,
        }
      }

      const appState = getAppState()
      const task = appState.tasks?.[task_id] as TaskState | undefined

      if (!task) {
        return {
          result: false,
          message: `No task found with ID: ${task_id}`,
          errorCode: 2,
        }
      }

      return { result: true }
    },

    async call(
      input: TaskOutputToolInput,
      toolUseContext,
      _canUseTool,
      _parentMessage,
      onProgress,
    ) {
      const { task_id, block, timeout } = input

      const appState = toolUseContext.getAppState()
      const task = appState.tasks?.[task_id] as TaskState | undefined

      if (!task) {
        throw new Error(`No task found with ID: ${task_id}`)
      }

      if (!block) {
        // Non-blocking: return current state
        if (task.status !== 'running' && task.status !== 'pending') {
          // Mark as notified
          updateTaskState(task_id, toolUseContext.setAppState, t => ({
            ...t,
            notified: true,
          }))
          return {
            data: {
              retrieval_status: 'success' as const,
              task: await getTaskOutputData(task),
            },
          }
        }
        return {
          data: {
            retrieval_status: 'not_ready' as const,
            task: await getTaskOutputData(task),
          },
        }
      }

      // Blocking: wait for completion
      if (onProgress) {
        onProgress({
          toolUseID: `task-output-waiting-${Date.now()}`,
          data: {
            type: 'waiting_for_task',
            taskDescription: task.description,
            taskType: task.type,
          },
        })
      }

      const completedTask = await waitForTaskCompletion(
        task_id,
        toolUseContext.getAppState,
        timeout,
        toolUseContext.abortController,
      )

      if (!completedTask) {
        return {
          data: {
            retrieval_status: 'timeout' as const,
            task: null,
          },
        }
      }

      if (
        completedTask.status === 'running' ||
        completedTask.status === 'pending'
      ) {
        return {
          data: {
            retrieval_status: 'timeout' as const,
            task: await getTaskOutputData(completedTask),
          },
        }
      }

      // Mark as notified
      updateTaskState(task_id, toolUseContext.setAppState, t => ({
        ...t,
        notified: true,
      }))

      return {
        data: {
          retrieval_status: 'success' as const,
          task: await getTaskOutputData(completedTask),
        },
      }
    },

    mapToolResultToToolResultBlockParam(data, toolUseID) {
      const parts: string[] = []

      parts.push(
        `<retrieval_status>${data.retrieval_status}</retrieval_status>`,
      )

      if (data.task) {
        parts.push(`<task_id>${data.task.task_id}</task_id>`)
        parts.push(`<task_type>${data.task.task_type}</task_type>`)
        parts.push(`<status>${data.task.status}</status>`)

        if (data.task.exitCode !== undefined && data.task.exitCode !== null) {
          parts.push(`<exit_code>${data.task.exitCode}</exit_code>`)
        }

        if (data.task.output?.trim()) {
          const { content } = formatTaskOutput(
            data.task.output,
            data.task.task_id,
          )
          parts.push(`<output>\n${content.trimEnd()}\n</output>`)
        }

        if (data.task.error) {
          parts.push(`<error>${data.task.error}</error>`)
        }
      }

      return {
        tool_use_id: toolUseID,
        type: 'tool_result' as const,
        content: parts.join('\n\n'),
      }
    },

    renderToolUseMessage(input) {
      const { block = true } = input
      if (!block) {
        return 'non-blocking'
      }
      return ''
    },

    renderToolUseTag(input) {
      if (!input.task_id) {
        return null
      }
      return <Text dimColor> {input.task_id}</Text>
    },

    renderToolUseProgressMessage(progressMessages) {
      const lastProgress = progressMessages[progressMessages.length - 1]
      const progressData = lastProgress?.data as
        | { taskDescription?: string; taskType?: string }
        | undefined

      return (
        <Box flexDirection="column">
          {progressData?.taskDescription && (
            <Text>&nbsp;&nbsp;{progressData.taskDescription}</Text>
          )}
          <Text>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Waiting for task{' '}
            <Text dimColor>(esc to give additional instructions)</Text>
          </Text>
        </Box>
      )
    },

    renderToolResultMessage(content, _, { verbose, theme }) {
      return (
        <TaskOutputResultDisplay
          content={content}
          verbose={verbose}
          theme={theme}
        />
      )
    },

    renderToolUseRejectedMessage() {
      return <FallbackToolUseRejectedMessage />
    },

    renderToolUseErrorMessage(result, { verbose }) {
      return <FallbackToolUseErrorMessage result={result} verbose={verbose} />
    },
  } satisfies ToolDef<InputSchema, TaskOutputToolOutput>)

function TaskOutputResultDisplay({
  content,
  verbose = false,
  theme,
}: {
  content: string | TaskOutputToolOutput
  verbose?: boolean
  theme: ThemeName
}): React.ReactNode {
  const expandShortcut = useShortcutDisplay(
    'app:toggleTranscript',
    'Global',
    'ctrl+o',
  )
  const result: TaskOutputToolOutput =
    typeof content === 'string' ? jsonParse(content) : content

  if (!result.task) {
    return (
      <MessageResponse>
        <Text dimColor>No task output available</Text>
      </MessageResponse>
    )
  }

  const { task } = result

  // For shell tasks, render like BashToolResultMessage
  if (task.task_type === 'local_bash') {
    const bashOut = {
      stdout: task.output,
      stderr: '',
      isImage: false,
      dangerouslyDisableSandbox: true,
      returnCodeInterpretation: task.error,
    }
    return <BashToolResultMessage content={bashOut} verbose={verbose} />
  }

  // For agent tasks, render with prompt/response display
  if (task.task_type === 'local_agent') {
    const lineCount = task.result ? countCharInString(task.result, '\n') + 1 : 0

    if (result.retrieval_status === 'success') {
      if (verbose) {
        return (
          <Box flexDirection="column">
            <Text>
              {task.description} ({lineCount} lines)
            </Text>
            <Box flexDirection="column" paddingLeft={2} marginTop={1}>
              {task.prompt && (
                <AgentPromptDisplay prompt={task.prompt} theme={theme} dim />
              )}
              {task.result && (
                <Box marginTop={1}>
                  <AgentResponseDisplay
                    content={[{ type: 'text', text: task.result }]}
                    theme={theme}
                  />
                </Box>
              )}
              {task.error && (
                <Box flexDirection="column" marginTop={1}>
                  <Text color="error" bold>
                    Error:
                  </Text>
                  <Box paddingLeft={2}>
                    <Text color="error">{task.error}</Text>
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        )
      }
      return (
        <MessageResponse>
          <Text dimColor>Read output ({expandShortcut} to expand)</Text>
        </MessageResponse>
      )
    }

    if (result.retrieval_status === 'timeout' || task.status === 'running') {
      return (
        <MessageResponse>
          <Text dimColor>Task is still running…</Text>
        </MessageResponse>
      )
    }

    if (result.retrieval_status === 'not_ready') {
      return (
        <MessageResponse>
          <Text dimColor>Task is still running…</Text>
        </MessageResponse>
      )
    }

    return (
      <MessageResponse>
        <Text dimColor>Task not ready</Text>
      </MessageResponse>
    )
  }

  // For remote agent tasks
  if (task.task_type === 'remote_agent') {
    return (
      <Box flexDirection="column">
        <Text>
          &nbsp;&nbsp;{task.description} [{task.status}]
        </Text>
        {task.output && verbose && (
          <Box paddingLeft={4} marginTop={1}>
            <Text>{task.output}</Text>
          </Box>
        )}
        {!verbose && task.output && (
          <Text dimColor>
            {'     '}({expandShortcut} to expand)
          </Text>
        )}
      </Box>
    )
  }

  // Default rendering
  return (
    <Box flexDirection="column">
      <Text>
        &nbsp;&nbsp;{task.description} [{task.status}]
      </Text>
      {task.output && (
        <Box paddingLeft={4}>
          <Text>{task.output.slice(0, 500)}</Text>
        </Box>
      )}
    </Box>
  )
}

export default TaskOutputTool

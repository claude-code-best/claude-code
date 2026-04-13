import { feature } from 'bun:bundle'
import { ASK_USER_QUESTION_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/AskUserQuestionTool/prompt.js'
import { ENTER_PLAN_MODE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/EnterPlanModeTool/constants.js'
import { EXIT_PLAN_MODE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/ExitPlanModeTool/constants.js'
import { FILE_READ_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/FileReadTool/prompt.js'
import { GLOB_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/GrepTool/prompt.js'
import { LIST_MCP_RESOURCES_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/ListMcpResourcesTool/prompt.js'
import { LSP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/LSPTool/prompt.js'
import { SEND_MESSAGE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SendMessageTool/constants.js'
import { SLEEP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SleepTool/prompt.js'
import { TASK_CREATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskCreateTool/constants.js'
import { TASK_GET_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskGetTool/constants.js'
import { TASK_LIST_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskListTool/constants.js'
import { TASK_OUTPUT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskOutputTool/constants.js'
import { TASK_STOP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskStopTool/prompt.js'
import { TASK_UPDATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskUpdateTool/constants.js'
import { TEAM_CREATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TeamCreateTool/constants.js'
import { TEAM_DELETE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TeamDeleteTool/constants.js'
import { TODO_WRITE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TodoWriteTool/constants.js'
import { TOOL_SEARCH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/ToolSearchTool/prompt.js'
import { YOLO_CLASSIFIER_TOOL_NAME } from './yoloClassifier.js'

// Ant-only tool names: conditional require so Bun can DCE these in external builds.
// Gates mirror tools.ts. Keeps the tool name strings out of cli.js.
/* eslint-disable @typescript-eslint/no-require-imports */
const TERMINAL_CAPTURE_TOOL_NAME = feature('TERMINAL_PANEL')
  ? (
      require('@claude-code-best/builtin-tools/tools/TerminalCaptureTool/prompt.js') as typeof import('@claude-code-best/builtin-tools/tools/TerminalCaptureTool/prompt.js')
    ).TERMINAL_CAPTURE_TOOL_NAME
  : null
const OVERFLOW_TEST_TOOL_NAME = feature('OVERFLOW_TEST_TOOL')
  ? (
      require('@claude-code-best/builtin-tools/tools/OverflowTestTool/OverflowTestTool.js') as typeof import('@claude-code-best/builtin-tools/tools/OverflowTestTool/OverflowTestTool.js')
    ).OVERFLOW_TEST_TOOL_NAME
  : null
const VERIFY_PLAN_EXECUTION_TOOL_NAME =
  process.env.USER_TYPE === 'ant'
    ? (
        require('@claude-code-best/builtin-tools/tools/VerifyPlanExecutionTool/constants.js') as typeof import('@claude-code-best/builtin-tools/tools/VerifyPlanExecutionTool/constants.js')
      ).VERIFY_PLAN_EXECUTION_TOOL_NAME
    : null
const WORKFLOW_TOOL_NAME = feature('WORKFLOW_SCRIPTS')
  ? (
      require('@claude-code-best/builtin-tools/tools/WorkflowTool/constants.js') as typeof import('@claude-code-best/builtin-tools/tools/WorkflowTool/constants.js')
    ).WORKFLOW_TOOL_NAME
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Tools that are safe and don't need any classifier checking.
 * Used by the auto mode classifier to skip unnecessary API calls.
 * Does NOT include write/edit tools — those are handled by the
 * acceptEdits fast path (allowed in CWD, classified outside CWD).
 */
const SAFE_YOLO_ALLOWLISTED_TOOLS = new Set([
  // Read-only file operations
  FILE_READ_TOOL_NAME,
  // Search / read-only
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  LSP_TOOL_NAME,
  TOOL_SEARCH_TOOL_NAME,
  LIST_MCP_RESOURCES_TOOL_NAME,
  'ReadMcpResourceTool', // no exported constant
  // Task management (metadata only)
  TODO_WRITE_TOOL_NAME,
  TASK_CREATE_TOOL_NAME,
  TASK_GET_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME,
  TASK_LIST_TOOL_NAME,
  TASK_STOP_TOOL_NAME,
  TASK_OUTPUT_TOOL_NAME,
  // Plan mode / UI
  ASK_USER_QUESTION_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  // Swarm coordination (internal mailbox/team state only — teammates have
  // their own permission checks, so no actual security bypass).
  TEAM_CREATE_TOOL_NAME,
  // Agent cleanup
  TEAM_DELETE_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  // Workflow orchestration — subagents go through canUseTool individually
  ...(WORKFLOW_TOOL_NAME ? [WORKFLOW_TOOL_NAME] : []),
  // Misc safe
  SLEEP_TOOL_NAME,
  // Ant-only safe tools (gates mirror tools.ts)
  ...(TERMINAL_CAPTURE_TOOL_NAME ? [TERMINAL_CAPTURE_TOOL_NAME] : []),
  ...(OVERFLOW_TEST_TOOL_NAME ? [OVERFLOW_TEST_TOOL_NAME] : []),
  ...(VERIFY_PLAN_EXECUTION_TOOL_NAME ? [VERIFY_PLAN_EXECUTION_TOOL_NAME] : []),
  // Internal classifier tool
  YOLO_CLASSIFIER_TOOL_NAME,
])

export function isAutoModeAllowlistedTool(toolName: string): boolean {
  return SAFE_YOLO_ALLOWLISTED_TOOLS.has(toolName)
}

// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { feature } from 'bun:bundle'
import { TASK_OUTPUT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskOutputTool/constants.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/ExitPlanModeTool/constants.js'
import { ENTER_PLAN_MODE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/EnterPlanModeTool/constants.js'
import { AGENT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/AgentTool/constants.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/AskUserQuestionTool/prompt.js'
import { TASK_STOP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskStopTool/prompt.js'
import { FILE_READ_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/FileReadTool/prompt.js'
import { WEB_SEARCH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/WebSearchTool/prompt.js'
import { TODO_WRITE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TodoWriteTool/constants.js'
import { GREP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/GrepTool/prompt.js'
import { WEB_FETCH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/WebFetchTool/prompt.js'
import { GLOB_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/GlobTool/prompt.js'
import { SHELL_TOOL_NAMES } from '../utils/shell/shellToolUtils.js'
import { FILE_EDIT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/FileEditTool/constants.js'
import { FILE_WRITE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/FileWriteTool/prompt.js'
import { NOTEBOOK_EDIT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/NotebookEditTool/constants.js'
import { SKILL_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SkillTool/constants.js'
import { SEND_MESSAGE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SendMessageTool/constants.js'
import { TASK_CREATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskCreateTool/constants.js'
import { TASK_GET_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskGetTool/constants.js'
import { TASK_LIST_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskListTool/constants.js'
import { TASK_UPDATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskUpdateTool/constants.js'
import { TOOL_SEARCH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/ToolSearchTool/constants.js'
import { SYNTHETIC_OUTPUT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SyntheticOutputTool/SyntheticOutputTool.js'
import { SLEEP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SleepTool/prompt.js'
import { LSP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/LSPTool/prompt.js'
import { VERIFY_PLAN_EXECUTION_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/VerifyPlanExecutionTool/constants.js'
import { TEAM_CREATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TeamCreateTool/constants.js'
import { TEAM_DELETE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TeamDeleteTool/constants.js'
import { EXECUTE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/ExecuteTool/constants.js'
import { ENTER_WORKTREE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/EnterWorktreeTool/constants.js'
import { EXIT_WORKTREE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/ExitWorktreeTool/constants.js'
import { WORKFLOW_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/WorkflowTool/constants.js'
import {
  CRON_CREATE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
  CRON_LIST_TOOL_NAME,
} from '@claude-code-best/builtin-tools/tools/ScheduleCronTool/prompt.js'

export const ALL_AGENT_DISALLOWED_TOOLS = new Set([
  TASK_OUTPUT_TOOL_NAME,
  EXIT_PLAN_MODE_V2_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  // Allow Agent tool for agents when user is ant (enables nested agents)
  ...(process.env.USER_TYPE === 'ant' ? [] : [AGENT_TOOL_NAME]),
  ASK_USER_QUESTION_TOOL_NAME,
  TASK_STOP_TOOL_NAME,
  // Prevent recursive workflow execution inside subagents.
  ...(feature('WORKFLOW_SCRIPTS') ? [WORKFLOW_TOOL_NAME] : []),
])

export const CUSTOM_AGENT_DISALLOWED_TOOLS = new Set([
  ...ALL_AGENT_DISALLOWED_TOOLS,
])

/*
 * Async Agent Tool Availability Status (Source of Truth)
 */
export const ASYNC_AGENT_ALLOWED_TOOLS = new Set([
  FILE_READ_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
  GREP_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  GLOB_TOOL_NAME,
  ...SHELL_TOOL_NAMES,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
  NOTEBOOK_EDIT_TOOL_NAME,
  SKILL_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
  TOOL_SEARCH_TOOL_NAME,
  ENTER_WORKTREE_TOOL_NAME,
  EXIT_WORKTREE_TOOL_NAME,
])
/**
 * Tools allowed only for in-process teammates (not general async agents).
 * These are injected by inProcessRunner.ts and allowed through filterToolsForAgent
 * via isInProcessTeammate() check.
 */
export const IN_PROCESS_TEAMMATE_ALLOWED_TOOLS = new Set([
  TASK_CREATE_TOOL_NAME,
  TASK_GET_TOOL_NAME,
  TASK_LIST_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  // Teammate-created crons are tagged with the creating agentId and routed to
  // that teammate's pendingUserMessages queue (see useScheduledTasks.ts).
  CRON_CREATE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
  CRON_LIST_TOOL_NAME,
])

/*
 * BLOCKED FOR ASYNC AGENTS:
 * - AgentTool: Blocked to prevent recursion
 * - TaskOutputTool: Blocked to prevent recursion
 * - ExitPlanModeTool: Plan mode is a main thread abstraction.
 * - TaskStopTool: Requires access to main thread task state.
 * - TungstenTool: Uses singleton virtual terminal abstraction that conflicts between agents.
 *
 * ENABLE LATER (NEED WORK):
 * - MCPTool: TBD
 * - ListMcpResourcesTool: TBD
 * - ReadMcpResourceTool: TBD
 */

/**
 * Tools allowed in coordinator mode - only output and agent management tools for the coordinator
 */
export const COORDINATOR_MODE_ALLOWED_TOOLS = new Set([
  AGENT_TOOL_NAME,
  TASK_STOP_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
])

/**
 * Core tools that are always loaded with full schema at initialization.
 * These tools are never deferred — they appear in the initial prompt.
 * All other tools (non-core built-in + all MCP tools) are deferred
 * and must be discovered via ToolSearchTool / ExecuteExtraTool.
 */
export const CORE_TOOLS = new Set([
  // File operations
  ...SHELL_TOOL_NAMES, // 'Bash', 'Shell'
  FILE_READ_TOOL_NAME, // 'Read'
  FILE_EDIT_TOOL_NAME, // 'Edit'
  FILE_WRITE_TOOL_NAME, // 'Write'
  GLOB_TOOL_NAME, // 'Glob'
  GREP_TOOL_NAME, // 'Grep'
  NOTEBOOK_EDIT_TOOL_NAME, // 'NotebookEdit'
  // Agent & interaction
  AGENT_TOOL_NAME, // 'Agent'
  ASK_USER_QUESTION_TOOL_NAME, // 'AskUserQuestion'
  SEND_MESSAGE_TOOL_NAME, // 'SendMessage'
  // Team (swarm)
  TEAM_CREATE_TOOL_NAME, // 'TeamCreate'
  TEAM_DELETE_TOOL_NAME, // 'TeamDelete'
  // Task management
  TASK_OUTPUT_TOOL_NAME, // 'TaskOutput'
  TASK_STOP_TOOL_NAME, // 'TaskStop'
  TASK_CREATE_TOOL_NAME, // 'TaskCreate'
  TASK_GET_TOOL_NAME, // 'TaskGet'
  TASK_LIST_TOOL_NAME, // 'TaskList'
  TASK_UPDATE_TOOL_NAME, // 'TaskUpdate'
  TODO_WRITE_TOOL_NAME, // 'TodoWrite'
  // Planning
  ENTER_PLAN_MODE_TOOL_NAME, // 'EnterPlanMode'
  EXIT_PLAN_MODE_V2_TOOL_NAME, // 'ExitPlanMode'
  VERIFY_PLAN_EXECUTION_TOOL_NAME, // 'VerifyPlanExecution'
  // Web
  WEB_FETCH_TOOL_NAME, // 'WebFetch'
  WEB_SEARCH_TOOL_NAME, // 'WebSearch'
  // Code intelligence
  LSP_TOOL_NAME, // 'LSP'
  // Skills
  SKILL_TOOL_NAME, // 'Skill'
  // Scheduling & monitoring
  SLEEP_TOOL_NAME, // 'Sleep'
  // Tool discovery (always loaded)
  TOOL_SEARCH_TOOL_NAME, // 'ToolSearch'
  EXECUTE_TOOL_NAME, // 'ExecuteExtraTool'
  SYNTHETIC_OUTPUT_TOOL_NAME, // 'SyntheticOutput'
]) as ReadonlySet<string>

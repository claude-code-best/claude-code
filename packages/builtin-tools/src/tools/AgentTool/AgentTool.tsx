import { feature } from 'bun:bundle';
import * as React from 'react';
import { buildTool, type ToolDef, toolMatchesName } from 'src/Tool.js';
import type { AssistantMessage, Message as MessageType, NormalizedUserMessage } from 'src/types/message.js';
import { getQuerySourceForAgent } from 'src/utils/promptCategory.js';
import { z } from 'zod/v4';
import { clearInvokedSkillsForAgent, getSdkAgentProgressSummariesEnabled } from 'src/bootstrap/state.js';
import { enhanceSystemPromptWithEnvDetails, getSystemPrompt } from 'src/constants/prompts.js';
import { isCoordinatorMode } from 'src/coordinator/coordinatorMode.js';
import { startAgentSummarization } from 'src/services/AgentSummary/agentSummary.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import { clearDumpState } from 'src/services/api/dumpPrompts.js';
import {
  completeAgentTask as completeAsyncAgent,
  createActivityDescriptionResolver,
  createProgressTracker,
  enqueueAgentNotification,
  failAgentTask as failAsyncAgent,
  getProgressUpdate,
  getTokenCountFromTracker,
  isLocalAgentTask,
  killAsyncAgent,
  registerAgentForeground,
  registerAsyncAgent,
  unregisterAgentForeground,
  updateAgentProgress as updateAsyncAgentProgress,
  updateProgressFromMessage,
} from 'src/tasks/LocalAgentTask/LocalAgentTask.js';
import {
  checkRemoteAgentEligibility,
  formatPreconditionError,
  getRemoteTaskSessionUrl,
  registerRemoteAgentTask,
  type BackgroundRemoteSessionPrecondition,
} from 'src/tasks/RemoteAgentTask/RemoteAgentTask.js';
import { assembleToolPool } from 'src/tools.js';
import { asAgentId } from 'src/types/ids.js';
import { runWithAgentContext, type SubagentContext } from 'src/utils/agentContext.js';
import { isAgentSwarmsEnabled } from 'src/utils/agentSwarmsEnabled.js';
import { getCwd, runWithCwdOverride } from 'src/utils/cwd.js';
import { logForDebugging } from 'src/utils/debug.js';
import { isEnvTruthy } from 'src/utils/envUtils.js';
import { AbortError, errorMessage, toError } from 'src/utils/errors.js';
import type { CacheSafeParams } from 'src/utils/forkedAgent.js';
import { lazySchema } from 'src/utils/lazySchema.js';
import { createUserMessage, extractTextContent, isSyntheticMessage, normalizeMessages } from 'src/utils/messages.js';
import { getAgentModel } from 'src/utils/model/agent.js';
import { permissionModeSchema } from 'src/utils/permissions/PermissionMode.js';
import type { PermissionResult } from 'src/utils/permissions/PermissionResult.js';
import { filterDeniedAgents, getDenyRuleForAgent } from 'src/utils/permissions/permissions.js';
import { enqueueSdkEvent } from 'src/utils/sdkEventQueue.js';
import { writeAgentMetadata } from 'src/utils/sessionStorage.js';
import { sleep } from 'src/utils/sleep.js';
import { buildEffectiveSystemPrompt } from 'src/utils/systemPrompt.js';
import { asSystemPrompt } from 'src/utils/systemPromptType.js';
import { getTaskOutputPath } from 'src/utils/task/diskOutput.js';
import { getParentSessionId, isTeammate } from 'src/utils/teammate.js';
import { isInProcessTeammate } from 'src/utils/teammateContext.js';
import { teleportToRemote } from 'src/utils/teleport.js';
import { getAssistantMessageContentLength } from 'src/utils/tokens.js';
import { createAgentId } from 'src/utils/uuid.js';
import { createAgentWorktree, hasWorktreeChanges, removeAgentWorktree } from 'src/utils/worktree.js';
import { BASH_TOOL_NAME } from '../BashTool/toolName.js';
import { BackgroundHint } from '../BashTool/UI.js';
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js';
import { spawnTeammate } from '../shared/spawnMultiAgent.js';
import { setAgentColor } from './agentColorManager.js';
import {
  agentToolResultSchema,
  classifyHandoffIfNeeded,
  emitTaskProgress,
  extractPartialResult,
  finalizeAgentTool,
  getLastToolUseName,
  runAsyncAgentLifecycle,
} from './agentToolUtils.js';
import { GENERAL_PURPOSE_AGENT } from './built-in/generalPurposeAgent.js';
import { AGENT_TOOL_NAME, LEGACY_AGENT_TOOL_NAME, ONE_SHOT_BUILTIN_AGENT_TYPES } from './constants.js';
import {
  buildForkedMessages,
  buildWorktreeNotice,
  FORK_AGENT,
  isForkSubagentEnabled,
  isInForkChild,
} from './forkSubagent.js';
import type { AgentDefinition } from './loadAgentsDir.js';
import { filterAgentsByMcpRequirements, hasRequiredMcpServers, isBuiltInAgent } from './loadAgentsDir.js';
import { getPrompt } from './prompt.js';
import { runAgent } from './runAgent.js';
import {
  renderGroupedAgentToolUse,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseRejectedMessage,
  renderToolUseTag,
  userFacingName,
  userFacingNameBackgroundColor,
} from './UI.js';

/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS')
    ? (require('src/proactive/index.js') as typeof import('src/proactive/index.js'))
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */

// Progress display constants (for showing background hint)
const PROGRESS_THRESHOLD_MS = 2000; // Show background hint after 2 seconds

// 检查模块加载时后台任务是否被禁用
const isBackgroundTasksDisabled =
  // eslint-disable-next-line custom-rules/no-process-env-top-level -- Intentional: schema must be defined at module load
  isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS);

// 在此毫秒数后自动执行后台代理任务（0 = 禁用）通过环境变
// 量或 GrowthBook 功能开关启用（延迟检查，因为模块加载时 GB 可能尚未就绪）
function getAutoBackgroundMs(): number {
  if (
    isEnvTruthy(process.env.CLAUDE_AUTO_BACKGROUND_TASKS) ||
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_auto_background_agents', false)
  ) {
    return 120_000;
  }
  return 0;
}

// 多代理类型常量在功能开关控制的代码块内联定义，以启用死代码消除

// 不包含多代理参数的基础输入模式
const baseInputSchema = lazySchema(() =>
  z.object({
    description: z.string().describe('A short (3-5 word) description of the task'),
    prompt: z.string().describe('The task for the agent to perform'),
    subagent_type: z.string().optional().describe('The type of specialized agent to use for this task'),
    model: z
      .enum(['sonnet', 'opus', 'haiku'])
      .optional()
      .describe(
        '此代理的可选模型覆盖。优先级高于代理定义中的模型 frontmatter。如果省略，则使用代理定义的模型，或从父级继承。',
      ),
    run_in_background: z
      .boolean()
      .optional()
      .describe('Set to true to run this agent in the background. You will be notified when it completes.'),
  }),
);

// 结合基础参数、多代理参数和隔离的完整模式
const fullInputSchema = lazySchema(() => {
  // 多代理参数
  const multiAgentInputSchema = z.object({
    name: z
      .string()
      .optional()
      .describe('Name for the spawned agent. Makes it addressable via SendMessage({to: name}) while running.'),
    team_name: z.string().optional().describe('Team name for spawning. Uses current team context if omitted.'),
    mode: permissionModeSchema()
      .optional()
      .describe('Permission mode for spawned teammate (e.g., "plan" to require plan approval).'),
  });

  return baseInputSchema()
    .merge(multiAgentInputSchema)
    .extend({
      isolation: (process.env.USER_TYPE === 'ant' ? z.enum(['worktree', 'remote']) : z.enum(['worktree']))
        .optional()
        .describe(
          process.env.USER_TYPE === 'ant'
            ? '隔离模式。"worktree" 创建一个临时的 git worktree，使代理在仓库的隔离副本上工作。"remote" 在远程 CCR 环境中启动代理（始终在后台运行）。'
            : '隔离模式。"worktree" 创建一个临时的 git worktree，使代理在仓库的隔离副本上工作。',
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          '运行代理的绝对路径。覆盖此代理内所有文件系统和 shell 操作的工作目录。与 isolation: "worktree" 互斥。',
        ),
    });
});

// 当底层功能关闭时，从模式中移除可选字段，这样模型就永远不会看到它
// 们。通过 .omit() 完成，而不是在 .extend() 内部
// 使用条件展开，因为展开三元运算符会破坏 Zod 的类型推断（字段
// 类型坍缩为 `unknown`）。三元运算符返回一个联合类型，但
// call() 通过下面显式的 AgentToolInput 类
// 型进行解构，该类型始终包含所有可选字段。
export const inputSchema = lazySchema(() => {
  const schema = feature('KAIROS') ? fullInputSchema() : fullInputSchema().omit({ cwd: true });

  // GrowthBook-in-lazySchema is acceptable here (unlike subagent_type, which
  // was removed in 906da6c723): the divergence window is one-session-per-
  // gate-flip via _CACHED_MAY_BE_STALE disk read, and worst case is either
  // "schema shows a no-op param" (gate flips on mid-session: param ignored
  // by forceAsync) or "schema hides a param that would've worked" (gate
  // flips off mid-session: everything still runs async via memoized
  // forceAsync). No Zod rejection, no crash — unlike required→optional.
  return isBackgroundTasksDisabled || isForkSubagentEnabled() ? schema.omit({ run_in_background: true }) : schema;
});
type InputSchema = ReturnType<typeof inputSchema>;

// 显式类型拓宽了模式推断，使其始终包含所有可选字段，即使 .omit(
// ) 因功能开关而移除了它们（cwd, run_in_backgrou
// nd）。subagent_type 是可选的；当分叉开关关闭时，ca
// ll() 默认其为通用类型，当开关打开时，则路由到分叉路径。
type AgentToolInput = z.infer<ReturnType<typeof baseInputSchema>> & {
  name?: string;
  team_name?: string;
  mode?: z.infer<ReturnType<typeof permissionModeSchema>>;
  isolation?: 'worktree' | 'remote';
  cwd?: string;
};

// 输出模式 - 启用时在运行时动态添加的多代理衍生模式
export const outputSchema = lazySchema(() => {
  const syncOutputSchema = agentToolResultSchema().extend({
    status: z.literal('completed'),
    prompt: z.string(),
  });

  const asyncOutputSchema = z.object({
    status: z.literal('async_launched'),
    agentId: z.string().describe('The ID of the async agent'),
    description: z.string().describe('The description of the task'),
    prompt: z.string().describe('The prompt for the agent'),
    outputFile: z.string().describe('Path to the output file for checking agent progress'),
    canReadOutputFile: z
      .boolean()
      .optional()
      .describe('Whether the calling agent has Read/Bash tools to check progress'),
  });

  return z.union([syncOutputSchema, asyncOutputSchema]);
});
type OutputSchema = ReturnType<typeof outputSchema>;
type Output = z.input<OutputSchema>;

// Private type for teammate spawn results - excluded from exported schema for dead code elimination
// The 'teammate_spawned' status string is only included when ENABLE_AGENT_SWARMS is true
type TeammateSpawnedOutput = {
  status: 'teammate_spawned';
  prompt: string;
  teammate_id: string;
  agent_id: string;
  agent_type?: string;
  model?: string;
  name: string;
  color?: string;
  tmux_session_name: string;
  tmux_window_name: string;
  tmux_pane_id: string;
  team_name?: string;
  is_splitpane?: boolean;
  plan_mode_required?: boolean;
};

// 包含公共和内部类型的组合输出类型。注意：Teammate
// SpawnedOutput 类型没问题 - TypeScript 类型在编译时
// 会被擦除。远程启动结果的私有类型 — 为消除死代码，已像 Team
// mateSpawnedOutput 一样从导出模式中排除。导出供
// UI.tsx 使用，以便进行正确的可辨识联合类型收窄，而非临时类型转换。
export type RemoteLaunchedOutput = {
  status: 'remote_launched';
  taskId: string;
  sessionUrl: string;
  description: string;
  prompt: string;
  outputFile: string;
};

type InternalOutput = Output | TeammateSpawnedOutput | RemoteLaunchedOutput;

import type { AgentToolProgress, ShellProgress } from 'src/types/tools.js';
// AgentTool forwards both its own progress events and shell progress
// events from the sub-agent so the SDK receives tool_progress updates during bash/powershell runs.
export type Progress = AgentToolProgress | ShellProgress;

export const AgentTool = buildTool({
  async prompt({ agents, tools, getToolPermissionContext, allowedAgentTypes }) {
    const toolPermissionContext = await getToolPermissionContext();

    // Get MCP servers that have tools available
    const mcpServersWithTools: string[] = [];
    for (const tool of tools) {
      if (tool.name?.startsWith('mcp__')) {
        const parts = tool.name.split('__');
        const serverName = parts[1];
        if (serverName && !mcpServersWithTools.includes(serverName)) {
          mcpServersWithTools.push(serverName);
        }
      }
    }

    // Filter agents: first by MCP requirements, then by permission rules
    const agentsWithMcpRequirementsMet = filterAgentsByMcpRequirements(agents, mcpServersWithTools);
    const filteredAgents = filterDeniedAgents(agentsWithMcpRequirementsMet, toolPermissionContext, AGENT_TOOL_NAME);

    // Use inline env check instead of coordinatorModule to avoid circular
    // dependency issues during test module loading.
    const isCoordinator = feature('COORDINATOR_MODE') ? isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE) : false;
    return await getPrompt(filteredAgents, isCoordinator, allowedAgentTypes);
  },
  name: AGENT_TOOL_NAME,
  searchHint: '将工作委托给子代理',
  aliases: [LEGACY_AGENT_TOOL_NAME],
  maxResultSizeChars: 100_000,
  async description() {
    return 'Launch a new agent';
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  async call(
    {
      prompt,
      subagent_type,
      description,
      model: modelParam,
      run_in_background,
      name,
      team_name,
      mode: spawnMode,
      isolation,
      cwd,
    }: AgentToolInput,
    toolUseContext,
    canUseTool,
    assistantMessage,
    onProgress?,
  ) {
    const startTime = Date.now();
    const model = isCoordinatorMode() ? undefined : modelParam;

    // Get app state for permission mode and agent filtering
    const appState = toolUseContext.getAppState();
    const permissionMode = appState.toolPermissionContext.mode;
    // In-process teammates get a no-op setAppState; setAppStateForTasks
    // reaches the root store so task registration/progress/kill stay visible.
    const rootSetAppState = toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState;

    // 检查用户是否试图使用其无权访问的代理团队
    if (team_name && !isAgentSwarmsEnabled()) {
      throw new Error('Agent Teams is not yet available on your plan.');
    }

    // Teammates (in-process or tmux) passing `name` would trigger spawnTeammate()
    // below, but TeamFile.members is a flat array with one leadAgentId — nested
    // teammates land in the roster with no provenance and confuse the lead.
    const teamName = resolveTeamName({ team_name }, appState);
    if (isTeammate() && teamName && name) {
      throw new Error(
        'Teammates cannot spawn other teammates — the team roster is flat. To spawn a subagent instead, omit the `name` parameter.',
      );
    }
    // 进程内队友不能生成后台代理（其生命周期与
    // 主进程绑定）。Tmux 队友是独立进程，可
    // 以管理自己的后台代理。
    if (isInProcessTeammate() && teamName && run_in_background === true) {
      throw new Error(
        'In-process teammates cannot spawn background agents. Use run_in_background=false for synchronous subagents.',
      );
    }

    // 检查这是否为多代理生成请求。当设置了
    // team_name（来自参数或上下文）且提供了 name 时，会触发生成。
    if (teamName && name) {
      // 在生成前，为分组 UI 显示设置代理定义颜色
      const agentDef = subagent_type
        ? toolUseContext.options.agentDefinitions.activeAgents.find(a => a.agentType === subagent_type)
        : undefined;
      if (agentDef?.color) {
        setAgentColor(subagent_type!, agentDef.color);
      }
      const result = await spawnTeammate(
        {
          name,
          prompt,
          description,
          team_name: teamName,
          use_splitpane: true,
          plan_mode_required: spawnMode === 'plan',
          model: model ?? agentDef?.model,
          agent_type: subagent_type,
          invokingRequestId: assistantMessage?.requestId as string | undefined,
        },
        toolUseContext,
      );

      // 类型断言使用 TeammateSpawnedOutput（上文定义）而非
      // any。此类型为消除死代码已从导出的 outputSchema 中排除。通过 un
      // known 进行转换，因为 TeammateSpawnedOutpu
      // t 有意不作为导出的 Output 联合类型的一部分（出于消除死代码的目的）。
      const spawnResult: TeammateSpawnedOutput = {
        status: 'teammate_spawned' as const,
        prompt,
        ...result.data,
      };
      return { data: spawnResult } as unknown as { data: Output };
    }

    // Fork subagent experiment routing:
    // - subagent_type set: use it (explicit wins)
    // - subagent_type omitted, gate on: fork path (undefined)
    // - subagent_type omitted, gate off: default general-purpose
    const effectiveType = subagent_type ?? (isForkSubagentEnabled() ? undefined : GENERAL_PURPOSE_AGENT.agentType);
    const isForkPath = effectiveType === undefined;

    let selectedAgent: AgentDefinition;
    if (isForkPath) {
      // 递归分叉防护：分叉子进程在其工具池中保留 Agent 工具
      // （用于缓存相同的工具定义），因此在调用时拒绝分叉尝试。主要检
      // 查是 querySource（抗压缩 — 在生成时于 con
      // text.options 上设置，在自动压缩的消息重写后
      // 仍存在）。消息扫描回退用于捕获任何未传递 querySour
      // ce 的路径。
      if (
        toolUseContext.options.querySource === `agent:builtin:${FORK_AGENT.agentType}` ||
        isInForkChild(toolUseContext.messages)
      ) {
        throw new Error('Fork is not available inside a forked worker. Complete your task directly using your tools.');
      }
      selectedAgent = FORK_AGENT;
    } else {
      // Filter agents to exclude those denied via Agent(AgentName) syntax
      const allAgents = toolUseContext.options.agentDefinitions.activeAgents;
      const { allowedAgentTypes } = toolUseContext.options.agentDefinitions;
      const agents = filterDeniedAgents(
        // When allowedAgentTypes is set (from Agent(x,y) tool spec), restrict to those types
        allowedAgentTypes ? allAgents.filter(a => allowedAgentTypes.includes(a.agentType)) : allAgents,
        appState.toolPermissionContext,
        AGENT_TOOL_NAME,
      );

      const found = agents.find(agent => agent.agentType === effectiveType);
      if (!found) {
        // Check if the agent exists but is denied by permission rules
        const agentExistsButDenied = allAgents.find(agent => agent.agentType === effectiveType);
        if (agentExistsButDenied) {
          const denyRule = getDenyRuleForAgent(appState.toolPermissionContext, AGENT_TOOL_NAME, effectiveType);
          throw new Error(
            `Agent type '${effectiveType}' has been denied by permission rule '${AGENT_TOOL_NAME}(${effectiveType})' from ${denyRule?.source ?? 'settings'}.`,
          );
        }
        throw new Error(
          `Agent type '${effectiveType}' not found. Available agents: ${agents.map(a => a.agentType).join(', ')}`,
        );
      }
      selectedAgent = found;
    }

    // Same lifecycle constraint as the run_in_background guard above, but for
    // agent definitions that force background via `background: true`. Checked
    // here because selectedAgent is only now resolved.
    if (isInProcessTeammate() && teamName && selectedAgent.background === true) {
      throw new Error(
        `In-process teammates cannot spawn background agents. Agent '${selectedAgent.agentType}' has background: true in its definition.`,
      );
    }

    // Capture for type narrowing — `let selectedAgent` prevents TS from
    // narrowing property types across the if-else assignment above.
    const requiredMcpServers = selectedAgent.requiredMcpServers;

    // 检查必需的 MCP 服务器是否有可
    // 用工具。已连接但未认证的服务器将没有任何工具。
    if (requiredMcpServers?.length) {
      // 如果任何必需的服务器仍在连接中，则在检查工
      // 具可用性之前等待它们。这避免了在 MCP
      // 服务器完成连接之前调用代理的竞态条件。
      const hasPendingRequiredServers = appState.mcp.clients.some(
        c =>
          c.type === 'pending' &&
          requiredMcpServers.some(pattern => c.name.toLowerCase().includes(pattern.toLowerCase())),
      );

      let currentAppState = appState;
      if (hasPendingRequiredServers) {
        const MAX_WAIT_MS = 30_000;
        const POLL_INTERVAL_MS = 500;
        const deadline = Date.now() + MAX_WAIT_MS;

        while (Date.now() < deadline) {
          await sleep(POLL_INTERVAL_MS);
          currentAppState = toolUseContext.getAppState();

          // 提前退出：如果任何必需的服务器已经失败，则无需等
          // 待其他连接中的服务器 —— 无论如何检查都会失败。
          const hasFailedRequiredServer = currentAppState.mcp.clients.some(
            c =>
              c.type === 'failed' &&
              requiredMcpServers.some(pattern => c.name.toLowerCase().includes(pattern.toLowerCase())),
          );
          if (hasFailedRequiredServer) break;

          const stillPending = currentAppState.mcp.clients.some(
            c =>
              c.type === 'pending' &&
              requiredMcpServers.some(pattern => c.name.toLowerCase().includes(pattern.toLowerCase())),
          );
          if (!stillPending) break;
        }
      }

      // Get servers that actually have tools (meaning they're connected AND authenticated)
      const serversWithTools: string[] = [];
      for (const tool of currentAppState.mcp.tools) {
        if (tool.name?.startsWith('mcp__')) {
          // Extract server name from tool name (format: mcp__serverName__toolName)
          const parts = tool.name.split('__');
          const serverName = parts[1];
          if (serverName && !serversWithTools.includes(serverName)) {
            serversWithTools.push(serverName);
          }
        }
      }

      if (!hasRequiredMcpServers(selectedAgent, serversWithTools)) {
        const missing = requiredMcpServers.filter(
          pattern => !serversWithTools.some(server => server.toLowerCase().includes(pattern.toLowerCase())),
        );
        throw new Error(
          `Agent '${selectedAgent.agentType}' requires MCP servers matching: ${missing.join(', ')}. ` +
            `MCP servers with tools: ${serversWithTools.length > 0 ? serversWithTools.join(', ') : 'none'}. ` +
            `Use /mcp to configure and authenticate the required MCP servers.`,
        );
      }
    }

    // 如果此代理有预定义的颜色，则初始化其颜色
    if (selectedAgent.color) {
      setAgentColor(selectedAgent.agentType, selectedAgent.color);
    }

    // 解析用于日志记录的代理参数（这些参数已在 runAgent 中解析）
    const resolvedAgentModel = getAgentModel(
      selectedAgent.model,
      toolUseContext.options.mainLoopModel,
      isForkPath ? undefined : model,
      permissionMode,
    );

    logEvent('tengu_agent_tool_selected', {
      agent_type: selectedAgent.agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      model: resolvedAgentModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source: selectedAgent.source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      color: selectedAgent.color as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      is_built_in_agent: isBuiltInAgent(selectedAgent),
      is_resume: false,
      is_async: (run_in_background === true || selectedAgent.background === true) && !isBackgroundTasksDisabled,
      is_fork: isForkPath,
    });

    // Resolve effective isolation mode (explicit param overrides agent def)
    const effectiveIsolation = isolation ?? selectedAgent.isolation;

    // 远程隔离：委托给 CCR。仅限内部访问的防护门 ——
    // 该守卫使得外部构建时能对整个代码块进行死代码消除。
    if (process.env.USER_TYPE === 'ant' && effectiveIsolation === 'remote') {
      const eligibility = await checkRemoteAgentEligibility();
      if (!eligibility.eligible) {
        const reasons = (eligibility as { eligible: false; errors: BackgroundRemoteSessionPrecondition[] }).errors
          .map(formatPreconditionError)
          .join('\n');
        throw new Error(`Cannot launch remote agent:\n${reasons}`);
      }

      let bundleFailHint: string | undefined;
      const session = await teleportToRemote({
        initialMessage: prompt,
        description,
        signal: toolUseContext.abortController.signal,
        onBundleFail: msg => {
          bundleFailHint = msg;
        },
      });
      if (!session) {
        throw new Error(bundleFailHint ?? 'Failed to create remote session');
      }

      const { taskId, sessionId } = registerRemoteAgentTask({
        remoteTaskType: 'remote-agent',
        session: { id: session.id, title: session.title || description },
        command: prompt,
        context: toolUseContext,
        toolUseId: toolUseContext.toolUseId,
      });

      logEvent('tengu_agent_tool_remote_launched', {
        agent_type: selectedAgent.agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });

      const remoteResult: RemoteLaunchedOutput = {
        status: 'remote_launched',
        taskId,
        sessionUrl: getRemoteTaskSessionUrl(sessionId),
        description,
        prompt,
        outputFile: getTaskOutputPath(taskId),
      };
      return { data: remoteResult } as unknown as { data: Output };
    }
    // 系统提示 + 提示消息：根据 fork 路径分支处理。
    //
    // Fork 路径：子进程继承父进程的系统提示（而非 FORK_AGENT 的
    // ），以实现缓存一致的 API 请求前缀。提示消息通过 buildForke
    // dMessages() 构建，该方法克隆父进程的完整助手消息（所有 too
    // l_use 块）+ 占位符 tool_results + 每个子进程的指令。
    //
    // Normal path: build the selected agent's own system prompt with env
    // details, and use a simple user message for the prompt.
    let enhancedSystemPrompt: string[] | undefined;
    let forkParentSystemPrompt: ReturnType<typeof buildEffectiveSystemPrompt> | undefined;
    let promptMessages: MessageType[];

    if (isForkPath) {
      if (toolUseContext.renderedSystemPrompt) {
        forkParentSystemPrompt = toolUseContext.renderedSystemPrompt;
      } else {
        // 后备方案：重新计算。如果 GrowthBook 状态在父回合开
        // 始和 fork 生成之间发生变化，可能与父进程缓存的字节产生差异。
        const mainThreadAgentDefinition = appState.agent
          ? appState.agentDefinitions.activeAgents.find(a => a.agentType === appState.agent)
          : undefined;
        const additionalWorkingDirectories = Array.from(
          appState.toolPermissionContext.additionalWorkingDirectories.keys(),
        );
        const defaultSystemPrompt = await getSystemPrompt(
          toolUseContext.options.tools,
          toolUseContext.options.mainLoopModel,
          additionalWorkingDirectories,
          toolUseContext.options.mcpClients,
        );
        forkParentSystemPrompt = buildEffectiveSystemPrompt({
          mainThreadAgentDefinition,
          toolUseContext,
          customSystemPrompt: toolUseContext.options.customSystemPrompt,
          defaultSystemPrompt,
          appendSystemPrompt: toolUseContext.options.appendSystemPrompt,
        });
      }
      promptMessages = buildForkedMessages(prompt, assistantMessage);
    } else {
      try {
        const additionalWorkingDirectories = Array.from(
          appState.toolPermissionContext.additionalWorkingDirectories.keys(),
        );

        // All agents have getSystemPrompt - pass toolUseContext to all
        const agentPrompt = selectedAgent.getSystemPrompt({ toolUseContext });

        // 记录子代理的代理内存加载事件
        if (selectedAgent.memory) {
          logEvent('tengu_agent_memory_loaded', {
            ...(process.env.USER_TYPE === 'ant' && {
              agent_type: selectedAgent.agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            }),
            scope: selectedAgent.memory as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            source: 'subagent' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          });
        }

        // 应用环境详情增强
        enhancedSystemPrompt = await enhanceSystemPromptWithEnvDetails(
          [agentPrompt],
          resolvedAgentModel,
          additionalWorkingDirectories,
        );
      } catch (error) {
        logForDebugging(`Failed to get system prompt for agent ${selectedAgent.agentType}: ${errorMessage(error)}`);
      }
      promptMessages = [createUserMessage({ content: prompt })];
    }

    const metadata = {
      prompt,
      resolvedAgentModel,
      isBuiltInAgent: isBuiltInAgent(selectedAgent),
      startTime,
      agentType: selectedAgent.agentType,
      isAsync: (run_in_background === true || selectedAgent.background === true) && !isBackgroundTasksDisabled,
    };

    // Use inline env check instead of coordinatorModule to avoid circular
    // dependency issues during test module loading.
    const isCoordinator = feature('COORDINATOR_MODE') ? isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE) : false;

    // Fork subagent experiment: force ALL spawns async for a unified
    // <task-notification> interaction model (not just fork spawns — all of them).
    const forceAsync = isForkSubagentEnabled();

    // Assistant mode: force all agents async. Synchronous subagents hold the
    // main loop's turn open until they complete — the daemon's inputQueue
    // backs up, and the first overdue cron catch-up on spawn becomes N
    // serial subagent turns blocking all user input. Same gate as
    // executeForkedSlashCommand's fire-and-forget path; the
    // <task-notification> re-entry there is handled by the else branch
    // below (registerAsyncAgentTask + notifyOnCompletion).
    const assistantForceAsync = feature('KAIROS') ? appState.kairosEnabled : false;

    const shouldRunAsync =
      (run_in_background === true ||
        selectedAgent.background === true ||
        isCoordinator ||
        forceAsync ||
        assistantForceAsync ||
        (proactiveModule?.isProactiveActive() ?? false)) &&
      !isBackgroundTasksDisabled;
    // Assemble the worker's tool pool independently of the parent's.
    // Workers always get their tools from assembleToolPool with their own
    // permission mode, so they aren't affected by the parent's tool
    // restrictions. This is computed here so that runAgent doesn't need to
    // import from tools.ts (which would create a circular dependency).
    const workerPermissionContext = {
      ...appState.toolPermissionContext,
      mode: selectedAgent.permissionMode ?? 'acceptEdits',
    };
    const workerTools = assembleToolPool(workerPermissionContext, appState.mcp.tools);

    // Create a stable agent ID early so it can be used for worktree slug
    const earlyAgentId = createAgentId();

    // 如果请求，则设置工作树隔离
    let worktreeInfo: {
      worktreePath: string;
      worktreeBranch?: string;
      headCommit?: string;
      gitRoot?: string;
      hookBased?: boolean;
    } | null = null;

    if (effectiveIsolation === 'worktree') {
      const slug = `agent-${earlyAgentId.slice(0, 8)}`;
      worktreeInfo = await createAgentWorktree(slug);
    }

    // Fork + 工作树：注入一条通知，告知子进程转换
    // 路径并重新读取可能已过时的文件。追加在 fork
    // 指令之后，使其成为子进程看到的最新指导。
    if (isForkPath && worktreeInfo) {
      promptMessages.push(
        createUserMessage({
          content: buildWorktreeNotice(getCwd(), worktreeInfo.worktreePath),
        }),
      );
    }

    const runAgentParams: Parameters<typeof runAgent>[0] = {
      agentDefinition: selectedAgent,
      promptMessages,
      toolUseContext,
      canUseTool,
      isAsync: shouldRunAsync,
      querySource:
        toolUseContext.options.querySource ??
        getQuerySourceForAgent(selectedAgent.agentType, isBuiltInAgent(selectedAgent)),
      model: isForkPath ? undefined : model,
      // 分叉路径：传递父级的系统提示词和父级完全相同的工具数组（缓存相同
      // 的前缀）。workerTools 在权限模式为 'bubble
      // ' 时被重建，该模式与父级模式不同，因此其工具定义序列化会偏离，并
      // 在第一个不同的工具处破坏缓存。useExactTools 也会继承父
      // 级的 thinkingConfig 和 isNonInte
      // ractiveSession（参见 runAgent.ts）。
      //
      // 正常路径：当 cwd 覆盖生效时（工作树隔离或显式 cwd），跳过预构建
      // 的系统提示词，以便 runAgent 的 buildAgentSyst
      // emPrompt() 在 wrapWithCwd 内部运行，其中 ge
      // tCwd() 返回覆盖路径。
      override: isForkPath
        ? { systemPrompt: forkParentSystemPrompt }
        : enhancedSystemPrompt && !worktreeInfo && !cwd
          ? { systemPrompt: asSystemPrompt(enhancedSystemPrompt) }
          : undefined,
      availableTools: isForkPath ? toolUseContext.options.tools : workerTools,
      // 当分叉子代理路径需要完整上下文时，传递父级对话。useExactTool
      // s 继承 thinkingConfig（runAgent.ts:624）。
      forkContextMessages: isForkPath ? toolUseContext.messages : undefined,
      ...(isForkPath && { useExactTools: true }),
      worktreePath: worktreeInfo?.worktreePath,
      description,
    };

    // Helper to wrap execution with a cwd override: explicit cwd arg (KAIROS)
    // takes precedence over worktree isolation path.
    const cwdOverridePath = cwd ?? worktreeInfo?.worktreePath;
    const wrapWithCwd = <T,>(fn: () => T): T => (cwdOverridePath ? runWithCwdOverride(cwdOverridePath, fn) : fn());

    // 用于在代理完成后清理工作树的辅助函数
    const cleanupWorktreeIfNeeded = async (): Promise<{
      worktreePath?: string;
      worktreeBranch?: string;
    }> => {
      if (!worktreeInfo) return {};
      const { worktreePath, worktreeBranch, headCommit, gitRoot, hookBased } = worktreeInfo;
      // Null out to make idempotent — guards against double-call if code
      // between cleanup and end of try throws into catch
      worktreeInfo = null;
      if (hookBased) {
        // Hook-based worktrees are always kept since we can't detect VCS changes
        logForDebugging(`Hook-based agent worktree kept at: ${worktreePath}`);
        return { worktreePath };
      }
      if (headCommit) {
        const changed = await hasWorktreeChanges(worktreePath, headCommit);
        if (!changed) {
          await removeAgentWorktree(worktreePath, worktreeBranch, gitRoot);
          // Clear worktreePath from metadata so resume doesn't try to use
          // a deleted directory. Fire-and-forget to match runAgent's
          // writeAgentMetadata handling.
          void writeAgentMetadata(asAgentId(earlyAgentId), {
            agentType: selectedAgent.agentType,
            description,
          }).catch(_err => logForDebugging(`Failed to clear worktree metadata: ${_err}`));
          return {};
        }
      }
      logForDebugging(`Agent worktree has changes, keeping: ${worktreePath}`);
      return { worktreePath, worktreeBranch };
    };

    if (shouldRunAsync) {
      const asyncAgentId = earlyAgentId;
      const agentBackgroundTask = registerAsyncAgent({
        agentId: asyncAgentId,
        description,
        prompt,
        selectedAgent,
        setAppState: rootSetAppState,
        // 不要链接到父级的中止控制器——当用户按下 ESC 取消
        // 主线程时，后台代理应该继续存活。它们通过 cha
        // t:killAgents 被显式终止。
        toolUseId: toolUseContext.toolUseId,
      });

      // 为 SendMessage 路由注册名称 → agentId。在 registe
      // rAsyncAgent 之后进行，这样如果生成失败就不会留下过时的条目。同步代
      // 理被跳过——协调器被阻塞，因此 SendMessage 路由不适用。
      if (name) {
        rootSetAppState(prev => {
          const next = new Map(prev.agentNameRegistry);
          next.set(name, asAgentId(asyncAgentId));
          return { ...prev, agentNameRegistry: next };
        });
      }

      // 将异步代理执行包装在代理上下文中，以便进行分析归因
      const asyncAgentContext: SubagentContext = {
        agentId: asyncAgentId,
        // 对于来自队友的子代理：使用团队负责人的会话。对于来自
        // 主 REPL 的子代理：undefined（无父级会话）
        parentSessionId: getParentSessionId(),
        agentType: 'subagent' as const,
        subagentName: selectedAgent.agentType,
        isBuiltIn: isBuiltInAgent(selectedAgent),
        invokingRequestId: assistantMessage?.requestId as string | undefined,
        invocationKind: 'spawn' as const,
        invocationEmitted: false,
      };

      // 工作负载传播：handlePromptSubmit 将整个轮次包装
      // 在 runWithWorkload（AsyncLocalStor
      // age）中。ALS 上下文在调用时捕获——当这个 `void` 触发
      // 时——并在内部的每个 await 中持续存在。无需捕获/恢复；分
      // 离的闭包自动看到父级轮次的工作负载，与其 finally 块隔离。
      void runWithAgentContext(asyncAgentContext, () =>
        wrapWithCwd(() =>
          runAsyncAgentLifecycle({
            taskId: agentBackgroundTask.agentId,
            abortController: agentBackgroundTask.abortController!,
            makeStream: onCacheSafeParams =>
              runAgent({
                ...runAgentParams,
                override: {
                  ...runAgentParams.override,
                  agentId: asAgentId(agentBackgroundTask.agentId),
                  abortController: agentBackgroundTask.abortController!,
                },
                onCacheSafeParams,
              }),
            metadata,
            description,
            toolUseContext,
            rootSetAppState,
            agentIdForCleanup: asyncAgentId,
            enableSummarization: isCoordinator || isForkSubagentEnabled() || getSdkAgentProgressSummariesEnabled(),
            getWorktreeResult: cleanupWorktreeIfNeeded,
          }),
        ),
      );

      const canReadOutputFile = toolUseContext.options.tools.some(
        t => toolMatchesName(t, FILE_READ_TOOL_NAME) || toolMatchesName(t, BASH_TOOL_NAME),
      );
      return {
        data: {
          isAsync: true as const,
          status: 'async_launched' as const,
          agentId: agentBackgroundTask.agentId,
          description: description,
          prompt: prompt,
          outputFile: getTaskOutputPath(agentBackgroundTask.agentId),
          canReadOutputFile,
        },
      };
    } else {
      // Create an explicit agentId for sync agents
      const syncAgentId = asAgentId(earlyAgentId);

      // 为同步执行设置代理上下文（用于分析归因）
      const syncAgentContext: SubagentContext = {
        agentId: syncAgentId,
        // 对于来自队友的子代理：使用团队负责人的会话。对于来自
        // 主 REPL 的子代理：undefined（无父级会话）
        parentSessionId: getParentSessionId(),
        agentType: 'subagent' as const,
        subagentName: selectedAgent.agentType,
        isBuiltIn: isBuiltInAgent(selectedAgent),
        invokingRequestId: assistantMessage?.requestId as string | undefined,
        invocationKind: 'spawn' as const,
        invocationEmitted: false,
      };

      // 将整个同步代理执行包装在上下文中，用于分析归因，并可选择
      // 性地包装在工作树 cwd 覆盖中，以实现文件系统隔离
      return runWithAgentContext(syncAgentContext, () =>
        wrapWithCwd(async () => {
          const agentMessages: MessageType[] = [];
          const agentStartTime = Date.now();
          const syncTracker = createProgressTracker();
          const syncResolveActivity = createActivityDescriptionResolver(toolUseContext.options.tools);

          // 产生初始进度消息以携带元数据（提示词）
          if (promptMessages.length > 0) {
            const normalizedPromptMessages = normalizeMessages(promptMessages);
            const normalizedFirstMessage = normalizedPromptMessages.find(
              (m): m is NormalizedUserMessage => m.type === 'user',
            );
            if (normalizedFirstMessage && normalizedFirstMessage.type === 'user' && onProgress) {
              onProgress({
                toolUseID: `agent_${assistantMessage.message.id}`,
                data: {
                  message: normalizedFirstMessage,
                  type: 'agent_progress',
                  prompt,
                  agentId: syncAgentId,
                },
              });
            }
          }

          // Register as foreground task immediately so it can be backgrounded at any time
          // Skip registration if background tasks are disabled
          let foregroundTaskId: string | undefined;
          // Create the background race promise once outside the loop — otherwise
          // each iteration adds a new .then() reaction to the same pending
          // promise, accumulating callbacks for the lifetime of the agent.
          let backgroundPromise: Promise<{ type: 'background' }> | undefined;
          let cancelAutoBackground: (() => void) | undefined;
          if (!isBackgroundTasksDisabled) {
            const registration = registerAgentForeground({
              agentId: syncAgentId,
              description,
              prompt,
              selectedAgent,
              setAppState: rootSetAppState,
              toolUseId: toolUseContext.toolUseId,
              autoBackgroundMs: getAutoBackgroundMs() || undefined,
            });
            foregroundTaskId = registration.taskId;
            backgroundPromise = registration.backgroundSignal.then(() => ({
              type: 'background' as const,
            }));
            cancelAutoBackground = registration.cancelAutoBackground;
          }

          // Track if we've shown the background hint UI
          let backgroundHintShown = false;
          // Track if the agent was backgrounded (cleanup handled by backgrounded finally)
          let wasBackgrounded = false;
          // Per-scope stop function — NOT shared with the backgrounded closure.
          // idempotent: startAgentSummarization's stop() checks `stopped` flag.
          let stopForegroundSummarization: (() => void) | undefined;
          // const capture for sound type narrowing inside the callback below
          const summaryTaskId = foregroundTaskId;

          // 获取代理的异步迭代器
          const agentIterator = runAgent({
            ...runAgentParams,
            override: {
              ...runAgentParams.override,
              agentId: syncAgentId,
            },
            onCacheSafeParams:
              summaryTaskId && getSdkAgentProgressSummariesEnabled()
                ? (params: CacheSafeParams) => {
                    const { stop } = startAgentSummarization(summaryTaskId, syncAgentId, params, rootSetAppState);
                    stopForegroundSummarization = stop;
                  }
                : undefined,
          })[Symbol.asyncIterator]();

          // Track if an error occurred during iteration
          let syncAgentError: Error | undefined;
          let wasAborted = false;
          let worktreeResult: {
            worktreePath?: string;
            worktreeBranch?: string;
          } = {};

          try {
            while (true) {
              const elapsed = Date.now() - agentStartTime;

              // 在阈值后显示后台提示（但任务已注册）。如果
              // 后台任务被禁用，则跳过
              if (
                !isBackgroundTasksDisabled &&
                !backgroundHintShown &&
                elapsed >= PROGRESS_THRESHOLD_MS &&
                toolUseContext.setToolJSX
              ) {
                backgroundHintShown = true;
                toolUseContext.setToolJSX({
                  jsx: <BackgroundHint />,
                  shouldHidePromptInput: false,
                  shouldContinueAnimation: true,
                  showSpinner: true,
                });
              }

              // Race between next message and background signal
              // If background tasks are disabled, just await the next message directly
              const nextMessagePromise = agentIterator.next();
              const raceResult = backgroundPromise
                ? await Promise.race([
                    nextMessagePromise.then(r => ({
                      type: 'message' as const,
                      result: r,
                    })),
                    backgroundPromise,
                  ])
                : {
                    type: 'message' as const,
                    result: await nextMessagePromise,
                  };

              // 检查我们是否通过 backgroundAll() 被置于后台 如果
              // raceResult.type 是 'background'，则 foregroundTaskId 保证已
              // 定义，因为 backgroundPromise 仅在 foregroundTaskId 定义时才被定义
              if (raceResult.type === 'background' && foregroundTaskId) {
                const appState = toolUseContext.getAppState();
                const task = appState.tasks[foregroundTaskId];
                if (isLocalAgentTask(task) && task.isBackgrounded) {
                  // Capture the taskId for use in the async callback
                  const backgroundedTaskId = foregroundTaskId;
                  wasBackgrounded = true;
                  // Stop foreground summarization; the backgrounded closure
                  // below owns its own independent stop function.
                  stopForegroundSummarization?.();

                  // 工作负载：通过 ALS 在 `void`
                  // 调用时继承，与上述的异步启动路
                  // 径相同。在后台继续运行代理并返回异步结果
                  void runWithAgentContext(syncAgentContext, async () => {
                    let stopBackgroundedSummarization: (() => void) | undefined;
                    try {
                      // Clean up the foreground iterator so its finally block runs
                      // (releases MCP connections, session hooks, prompt cache tracking, etc.)
                      // Timeout prevents blocking if MCP server cleanup hangs.
                      // .catch() prevents unhandled rejection if timeout wins the race.
                      await Promise.race([agentIterator.return(undefined).catch(() => {}), sleep(1000)]);
                      // Initialize progress tracking from existing messages
                      const tracker = createProgressTracker();
                      const resolveActivity2 = createActivityDescriptionResolver(toolUseContext.options.tools);
                      for (const existingMsg of agentMessages) {
                        updateProgressFromMessage(tracker, existingMsg, resolveActivity2, toolUseContext.options.tools);
                      }
                      for await (const msg of runAgent({
                        ...runAgentParams,
                        isAsync: true, // 代理现已在后台运行
                        override: {
                          ...runAgentParams.override,
                          agentId: asAgentId(backgroundedTaskId),
                          abortController: task.abortController,
                        },
                        onCacheSafeParams: getSdkAgentProgressSummariesEnabled()
                          ? (params: CacheSafeParams) => {
                              const { stop } = startAgentSummarization(
                                backgroundedTaskId,
                                asAgentId(backgroundedTaskId),
                                params,
                                rootSetAppState,
                              );
                              stopBackgroundedSummarization = stop;
                            }
                          : undefined,
                      })) {
                        agentMessages.push(msg);

                        // Track progress for backgrounded agents
                        updateProgressFromMessage(tracker, msg, resolveActivity2, toolUseContext.options.tools);
                        updateAsyncAgentProgress(backgroundedTaskId, getProgressUpdate(tracker), rootSetAppState);

                        const lastToolName = getLastToolUseName(msg);
                        if (lastToolName) {
                          emitTaskProgress(
                            tracker,
                            backgroundedTaskId,
                            toolUseContext.toolUseId,
                            description,
                            startTime,
                            lastToolName,
                          );
                        }
                      }
                      const agentResult = finalizeAgentTool(agentMessages, backgroundedTaskId, metadata);

                      // Mark task completed FIRST so TaskOutput(block=true)
                      // unblocks immediately. classifyHandoffIfNeeded and
                      // cleanupWorktreeIfNeeded can hang — they must not gate
                      // the status transition (gh-20236).
                      completeAsyncAgent(agentResult, rootSetAppState);

                      // Extract text from agent result content for the notification
                      let finalMessage = extractTextContent(agentResult.content, '\n');

                      if (feature('TRANSCRIPT_CLASSIFIER')) {
                        const backgroundedAppState = toolUseContext.getAppState();
                        const handoffWarning = await classifyHandoffIfNeeded({
                          agentMessages,
                          tools: toolUseContext.options.tools,
                          toolPermissionContext: backgroundedAppState.toolPermissionContext,
                          abortSignal: task.abortController!.signal,
                          subagentType: selectedAgent.agentType,
                          totalToolUseCount: agentResult.totalToolUseCount,
                        });
                        if (handoffWarning) {
                          finalMessage = `${handoffWarning}\n\n${finalMessage}`;
                        }
                      }

                      // Clean up worktree before notification so we can include it
                      const worktreeResult = await cleanupWorktreeIfNeeded();

                      enqueueAgentNotification({
                        taskId: backgroundedTaskId,
                        description,
                        status: 'completed',
                        setAppState: rootSetAppState,
                        finalMessage,
                        usage: {
                          totalTokens: getTokenCountFromTracker(tracker),
                          toolUses: agentResult.totalToolUseCount,
                          durationMs: agentResult.totalDurationMs,
                        },
                        toolUseId: toolUseContext.toolUseId,
                        ...worktreeResult,
                      });
                    } catch (error) {
                      if (error instanceof AbortError) {
                        // Transition status BEFORE worktree cleanup so
                        // TaskOutput unblocks even if git hangs (gh-20236).
                        killAsyncAgent(backgroundedTaskId, rootSetAppState);
                        logEvent('tengu_agent_tool_terminated', {
                          agent_type: metadata.agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                          model:
                            metadata.resolvedAgentModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                          duration_ms: Date.now() - metadata.startTime,
                          is_async: true,
                          is_built_in_agent: metadata.isBuiltInAgent,
                          reason:
                            'user_cancel_background' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                        });
                        const worktreeResult = await cleanupWorktreeIfNeeded();
                        const partialResult = extractPartialResult(agentMessages);
                        enqueueAgentNotification({
                          taskId: backgroundedTaskId,
                          description,
                          status: 'killed',
                          setAppState: rootSetAppState,
                          toolUseId: toolUseContext.toolUseId,
                          finalMessage: partialResult,
                          ...worktreeResult,
                        });
                        return;
                      }
                      const errMsg = errorMessage(error);
                      failAsyncAgent(backgroundedTaskId, errMsg, rootSetAppState);
                      const worktreeResult = await cleanupWorktreeIfNeeded();
                      enqueueAgentNotification({
                        taskId: backgroundedTaskId,
                        description,
                        status: 'failed',
                        error: errMsg,
                        setAppState: rootSetAppState,
                        toolUseId: toolUseContext.toolUseId,
                        ...worktreeResult,
                      });
                    } finally {
                      stopBackgroundedSummarization?.();
                      clearInvokedSkillsForAgent(syncAgentId);
                      clearDumpState(syncAgentId);
                      // Note: worktree cleanup is done before enqueueAgentNotification
                      // in both try and catch paths so we can include worktree info
                    }
                  });

                  // 立即返回 async_launched 结果
                  const canReadOutputFile = toolUseContext.options.tools.some(
                    t => toolMatchesName(t, FILE_READ_TOOL_NAME) || toolMatchesName(t, BASH_TOOL_NAME),
                  );
                  return {
                    data: {
                      isAsync: true as const,
                      status: 'async_launched' as const,
                      agentId: backgroundedTaskId,
                      description: description,
                      prompt: prompt,
                      outputFile: getTaskOutputPath(backgroundedTaskId),
                      canReadOutputFile,
                    },
                  };
                }
              }

              // 处理来自竞态结果的消息
              if (raceResult.type !== 'message') {
                // This shouldn't happen - background case handled above
                continue;
              }
              const { result } = raceResult;
              if (result.done) break;
              const message = result.value as MessageType;

              agentMessages.push(message);

              // Emit task_progress for the VS Code subagent panel
              updateProgressFromMessage(syncTracker, message, syncResolveActivity, toolUseContext.options.tools);
              if (foregroundTaskId) {
                const lastToolName = getLastToolUseName(message);
                if (lastToolName) {
                  emitTaskProgress(
                    syncTracker,
                    foregroundTaskId,
                    toolUseContext.toolUseId,
                    description,
                    agentStartTime,
                    lastToolName,
                  );
                  // Keep AppState task.progress in sync when SDK summaries are
                  // enabled, so updateAgentSummary reads correct token/tool counts
                  // instead of zeros.
                  if (getSdkAgentProgressSummariesEnabled()) {
                    updateAsyncAgentProgress(foregroundTaskId, getProgressUpdate(syncTracker), rootSetAppState);
                  }
                }
              }

              // 将子代理的 bash_progress 事件转发给父级，
              // 以便 SDK 能像接收主代理的工具进度事件一样接收它们。
              if (
                message.type === 'progress' &&
                ((message.data as { type: string })?.type === 'bash_progress' ||
                  (message.data as { type: string })?.type === 'powershell_progress') &&
                onProgress
              ) {
                onProgress({
                  toolUseID: message.toolUseID as string,
                  data: message.data,
                });
              }

              if (message.type !== 'assistant' && message.type !== 'user') {
                continue;
              }

              // 在进度指示器中为助手消息增加令牌计数 子代理
              // 的流式事件在 runAgent.ts 中被过滤掉了，
              // 因此我们需要在此处统计已完成消息的令牌数
              if (message.type === 'assistant') {
                const contentLength = getAssistantMessageContentLength(message as AssistantMessage);
                if (contentLength > 0) {
                  toolUseContext.setResponseLength(len => len + contentLength);
                }
              }

              const normalizedNew = normalizeMessages([message]);
              for (const m of normalizedNew) {
                for (const content of (m.message?.content ?? []) as readonly { readonly type: string }[]) {
                  if (content.type !== 'tool_use' && content.type !== 'tool_result') {
                    continue;
                  }

                  // 转发进度更新
                  if (onProgress) {
                    onProgress({
                      toolUseID: `agent_${assistantMessage.message.id}`,
                      data: {
                        message: m,
                        type: 'agent_progress',
                        // 提示仅需在第一条进度消息时提供（UI.tsx:624 读取
                        // progressMessages[0]）。此处省略以避免重复。
                        prompt: '',
                        agentId: syncAgentId,
                      },
                    });
                  }
                }
              }
            }
          } catch (error) {
            // 处理来自同步代理循环的错误 A
            // bortError 应被重新抛出以进行适当的中断处理
            if (error instanceof AbortError) {
              wasAborted = true;
              logEvent('tengu_agent_tool_terminated', {
                agent_type: metadata.agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                model: metadata.resolvedAgentModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                duration_ms: Date.now() - metadata.startTime,
                is_async: false,
                is_built_in_agent: metadata.isBuiltInAgent,
                reason: 'user_cancel_sync' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              });
              throw error;
            }

            // 记录错误以供调试
            logForDebugging(`同步代理错误：${errorMessage(error)}`, {
              level: 'error',
            });

            // Store the error to handle after cleanup
            syncAgentError = toError(error);
          } finally {
            // 清除后台提示 UI
            if (toolUseContext.setToolJSX) {
              toolUseContext.setToolJSX(null);
            }

            // Stop foreground summarization. Idempotent — if already stopped at
            // the backgrounding transition, this is a no-op. The backgrounded
            // closure owns a separate stop function (stopBackgroundedSummarization).
            stopForegroundSummarization?.();

            // 如果代理在未被置于后台的情况下完成，则注销前台任务
            if (foregroundTaskId) {
              unregisterAgentForeground(foregroundTaskId, rootSetAppState);
              // Notify SDK consumers (e.g. VS Code subagent panel) that this
              // foreground agent is done. Goes through drainSdkEvents() — does
              // NOT trigger the print.ts XML task_notification parser or the LLM loop.
              if (!wasBackgrounded) {
                const progress = getProgressUpdate(syncTracker);
                enqueueSdkEvent({
                  type: 'system',
                  subtype: 'task_notification',
                  task_id: foregroundTaskId,
                  tool_use_id: toolUseContext.toolUseId,
                  status: syncAgentError ? 'failed' : wasAborted ? 'stopped' : 'completed',
                  output_file: '',
                  summary: description,
                  usage: {
                    total_tokens: progress.tokenCount,
                    tool_uses: progress.toolUseCount,
                    duration_ms: Date.now() - agentStartTime,
                  },
                });
              }
            }

            // Clean up scoped skills so they don't accumulate in the global map
            clearInvokedSkillsForAgent(syncAgentId);

            // 清理此代理的 dumpState 条目以防止无限增长。如果已
            // 后台化则跳过 —— 后台化代理的 finally 块会处理清理
            if (!wasBackgrounded) {
              clearDumpState(syncAgentId);
            }

            // Cancel auto-background timer if agent completed before it fired
            cancelAutoBackground?.();

            // 如果适用，清理工作树（在 finally 块中以处理中止/
            // 错误路径）。如果已后台化则跳过 —— 后台延续仍在其中运行
            if (!wasBackgrounded) {
              worktreeResult = await cleanupWorktreeIfNeeded();
            }
          }

          // Re-throw abort errors
          // TODO: Find a cleaner way to express this
          const lastMessage = agentMessages.findLast(_ => _.type !== 'system' && _.type !== 'progress');
          if (lastMessage && isSyntheticMessage(lastMessage)) {
            logEvent('tengu_agent_tool_terminated', {
              agent_type: metadata.agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              model: metadata.resolvedAgentModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              duration_ms: Date.now() - metadata.startTime,
              is_async: false,
              is_built_in_agent: metadata.isBuiltInAgent,
              reason: 'user_cancel_sync' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            });
            throw new AbortError();
          }

          // 如果在迭代过程中发生错误，尝试返回包含
          // 现有消息的结果。如果没有助手消息，
          // 则重新抛出错误，以便工具框架正确处理。
          if (syncAgentError) {
            // Check if we have any assistant messages to return
            const hasAssistantMessages = agentMessages.some(msg => msg.type === 'assistant');

            if (!hasAssistantMessages) {
              // No messages collected, re-throw the error
              throw syncAgentError;
            }

            // We have some messages, try to finalize and return them
            // This allows the parent agent to see partial progress even after an error
            logForDebugging(`Sync agent recovering from error with ${agentMessages.length} messages`);
          }

          const agentResult = finalizeAgentTool(agentMessages, syncAgentId, metadata);

          if (feature('TRANSCRIPT_CLASSIFIER')) {
            const currentAppState = toolUseContext.getAppState();
            const handoffWarning = await classifyHandoffIfNeeded({
              agentMessages,
              tools: toolUseContext.options.tools,
              toolPermissionContext: currentAppState.toolPermissionContext,
              abortSignal: toolUseContext.abortController.signal,
              subagentType: selectedAgent.agentType,
              totalToolUseCount: agentResult.totalToolUseCount,
            });
            if (handoffWarning) {
              agentResult.content = [{ type: 'text' as const, text: handoffWarning }, ...agentResult.content];
            }
          }

          return {
            data: {
              status: 'completed' as const,
              prompt,
              ...agentResult,
              ...worktreeResult,
            },
          };
        }),
      );
    }
  },
  isReadOnly() {
    return true; // delegates permission checks to its underlying tools
  },
  toAutoClassifierInput(input) {
    const i = input as AgentToolInput;
    const tags = [i.subagent_type, i.mode ? `mode=${i.mode}` : undefined].filter((t): t is string => t !== undefined);
    const prefix = tags.length > 0 ? `(${tags.join(', ')}): ` : ': ';
    return `${prefix}${i.prompt}`;
  },
  isConcurrencySafe() {
    return true;
  },
  userFacingName,
  userFacingNameBackgroundColor,
  getActivityDescription(input) {
    return input?.description ?? 'Running task';
  },
  async checkPermissions(input, context): Promise<PermissionResult> {
    const appState = context.getAppState();

    // Only route through auto mode classifier when in auto mode
    // In all other modes, auto-approve sub-agent generation
    // Note: process.env.USER_TYPE === 'ant' guard enables dead code elimination for external builds
    if (process.env.USER_TYPE === 'ant' && appState.toolPermissionContext.mode === 'auto') {
      return {
        behavior: 'passthrough',
        message: 'Agent tool requires permission to spawn sub-agents.',
      };
    }

    return { behavior: 'allow', updatedInput: input };
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    // Multi-agent spawn result
    const internalData = data as InternalOutput;
    if (
      typeof internalData === 'object' &&
      internalData !== null &&
      'status' in internalData &&
      internalData.status === 'teammate_spawned'
    ) {
      const spawnData = internalData as TeammateSpawnedOutput;
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: [
          {
            type: 'text',
            text: `成功生成。
代理ID: ${spawnData.teammate_id}
名称: ${spawnData.name}
团队名称: ${spawnData.team_name}
代理现已运行，将通过邮箱接收指令。`,
          },
        ],
      };
    }
    if ('status' in internalData && internalData.status === 'remote_launched') {
      const r = internalData;
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: [
          {
            type: 'text',
            text: `远程代理已在 CCR 中启动。
任务ID: ${r.taskId}
会话URL: ${r.sessionUrl}
输出文件: ${r.outputFile}
代理正在远程运行。完成后您将自动收到通知。
简要告知用户您启动了哪些内容并结束您的响应。`,
          },
        ],
      };
    }
    if (data.status === 'async_launched') {
      const prefix = `Async agent launched successfully.\nagentId: ${data.agentId} (internal ID - do not mention to user. Use SendMessage with to: '${data.agentId}' to continue this agent.)\nThe agent is working in the background. You will be notified automatically when it completes.`;
      const instructions = data.canReadOutputFile
        ? `Do not duplicate this agent's work — avoid working with the same files or topics it is using. Work on non-overlapping tasks, or briefly tell the user what you launched and end your response.\noutput_file: ${data.outputFile}\nIf asked, you can check progress before completion by using ${FILE_READ_TOOL_NAME} or ${BASH_TOOL_NAME} tail on the output file.`
        : `Briefly tell the user what you launched and end your response. Do not generate any other text — agent results will arrive in a subsequent message.`;
      const text = `${prefix}\n${instructions}`;
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: [
          {
            type: 'text',
            text,
          },
        ],
      };
    }
    if (data.status === 'completed') {
      const worktreeData = data as Record<string, unknown>;
      const worktreeInfoText = worktreeData.worktreePath
        ? `\nworktreePath: ${worktreeData.worktreePath}\nworktreeBranch: ${worktreeData.worktreeBranch}`
        : '';
      // If the subagent completes with no content, the tool_result is just the
      // agentId/usage trailer below — a metadata-only block at the prompt tail.
      // Some models read that as "nothing to act on" and end their turn
      // immediately. Say so explicitly so the parent has something to react to.
      const contentOrMarker =
        data.content.length > 0
          ? data.content
          : [
              {
                type: 'text' as const,
                text: '（子代理已完成但未返回任何输出。）',
              },
            ];
      // One-shot built-ins (Explore, Plan) are never continued via SendMessage
      // — the agentId hint and <usage> block are dead weight (~135 chars ×
      // 34M Explore runs/week ≈ 1-2 Gtok/week). Telemetry doesn't parse this
      // block (it uses logEvent in finalizeAgentTool), so dropping is safe.
      // agentType is optional for resume compat — missing means show trailer.
      if (data.agentType && ONE_SHOT_BUILTIN_AGENT_TYPES.has(data.agentType) && !worktreeInfoText) {
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: contentOrMarker,
        };
      }
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: [
          ...contentOrMarker,
          {
            type: 'text',
            text: `代理ID: ${data.agentId}（使用 SendMessage 并指定 to: '${data.agentId}' 来继续此代理）${worktreeInfoText}
<usage>总令牌数: ${data.totalTokens}
工具使用次数: ${data.totalToolUseCount}
持续时间（毫秒）: ${data.totalDurationMs}</usage>`,
          },
        ],
      };
    }
    data satisfies never;
    throw new Error(`Unexpected agent tool result status: ${(data as { status: string }).status}`);
  },
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseTag,
  renderToolUseProgressMessage,
  renderToolUseRejectedMessage,
  renderToolUseErrorMessage,
  renderGroupedToolUse: renderGroupedAgentToolUse,
} satisfies ToolDef<InputSchema, Output, Progress>);

function resolveTeamName(
  input: { team_name?: string },
  appState: { teamContext?: { teamName: string } },
): string | undefined {
  if (!isAgentSwarmsEnabled()) return undefined;
  return input.team_name || appState.teamContext?.teamName;
}

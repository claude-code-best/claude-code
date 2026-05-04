import { feature } from 'bun:bundle';
import type { ContentBlockParam, TextBlockParam } from '@anthropic-ai/sdk/resources';
import { randomUUID } from 'crypto';
import { setPromptId } from 'src/bootstrap/state.js';
import {
  builtInCommandNames,
  type Command,
  type CommandBase,
  findCommand,
  getCommand,
  getCommandName,
  hasCommand,
  type PromptCommand,
} from 'src/commands.js';
import { NO_CONTENT_MESSAGE } from 'src/constants/messages.js';
import type { SetToolJSXFn, ToolUseContext } from 'src/Tool.js';
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  NormalizedUserMessage,
  ProgressMessage,
  UserMessage,
} from 'src/types/message.js';
import type { QueuedCommand } from 'src/types/textInputTypes.js';
import { addInvokedSkill, getSessionId } from '../../bootstrap/state.js';
import { COMMAND_MESSAGE_TAG, COMMAND_NAME_TAG } from '../../constants/xml.js';
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
  logEvent,
} from '../../services/analytics/index.js';
import { getDumpPromptsPath } from '../../services/api/dumpPrompts.js';
import { buildPostCompactMessages } from '../../services/compact/compact.js';
import { resetMicrocompactState } from '../../services/compact/microCompact.js';
import type { Progress as AgentProgress } from '@claude-code-best/builtin-tools/tools/AgentTool/AgentTool.js';
import { runAgent } from '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js';
import { renderToolUseProgressMessage } from '@claude-code-best/builtin-tools/tools/AgentTool/UI.js';
import type { CommandResultDisplay } from '../../types/command.js';
import { createAbortController } from '../abortController.js';
import { getAgentContext } from '../agentContext.js';
import { createAttachmentMessage, getAttachmentMessages } from '../attachments.js';
import { logForDebugging } from '../debug.js';
import { isEnvTruthy } from '../envUtils.js';
import { AbortError, MalformedCommandError } from '../errors.js';
import { getDisplayPath } from '../file.js';
import { extractResultText, prepareForkedCommandContext } from '../forkedAgent.js';
import { getFsImplementation } from '../fsOperations.js';
import { isFullscreenEnvEnabled } from '../fullscreen.js';
import { toArray } from '../generators.js';
import { registerSkillHooks } from '../hooks/registerSkillHooks.js';
import { logError } from '../log.js';
import { enqueue, enqueuePendingNotification } from '../messageQueueManager.js';
import {
  createCommandInputMessage,
  createSyntheticUserCaveatMessage,
  createSystemMessage,
  createUserInterruptionMessage,
  createUserMessage,
  formatCommandInputTags,
  isCompactBoundaryMessage,
  isSystemLocalCommandMessage,
  normalizeMessages,
  prepareUserContent,
} from '../messages.js';
import type { ModelAlias } from '../model/aliases.js';
import { parseToolListFromCLI } from '../permissions/permissionSetup.js';
import { hasPermissionsToUseTool } from '../permissions/permissions.js';
import { isOfficialMarketplaceName, parsePluginIdentifier } from '../plugins/pluginIdentifier.js';
import { isRestrictedToPluginOnly, isSourceAdminTrusted } from '../settings/pluginOnlyPolicy.js';
import { parseSlashCommand } from '../slashCommandParsing.js';
import { sleep } from '../sleep.js';
import { recordSkillUsage } from '../suggestions/skillUsageTracking.js';
import { logOTelEvent, redactIfDisabled } from '../telemetry/events.js';
import { buildPluginCommandTelemetryFields } from '../telemetry/pluginTelemetry.js';
import { getAssistantMessageContentLength } from '../tokens.js';
import { createAgentId } from '../uuid.js';
import { finalizeAutonomyRunCompleted, finalizeAutonomyRunFailed } from '../autonomyRuns.js';
import { getWorkload } from '../workloadContext.js';
import type { ProcessUserInputBaseResult, ProcessUserInputContext } from './processUserInput.js';

type SlashCommandResult = ProcessUserInputBaseResult & {
  command: Command;
};

// Poll interval and deadline for MCP settle before launching a background
// forked subagent. MCP servers typically connect within 1-3s of startup;
// 10s headroom covers slow SSE handshakes.
const MCP_SETTLE_POLL_MS = 200;
const MCP_SETTLE_TIMEOUT_MS = 10_000;

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test';
}

function assertBackgroundForkedSlashCommandTestOverrideAllowed(): void {
  if (!isTestRuntime()) {
    throw new Error(
      'ToolUseContext.options.allowBackgroundForkedSlashCommands is test-only and cannot be enabled outside NODE_ENV=test.',
    );
  }
}

/** * 在上下文中执行斜杠命令：在子代理中分叉执行。 */
async function executeForkedSlashCommand(
  command: CommandBase & PromptCommand,
  args: string,
  context: ProcessUserInputContext,
  precedingInputBlocks: ContentBlockParam[],
  setToolJSX: SetToolJSXFn,
  canUseTool: CanUseToolFn,
  autonomy?: QueuedCommand['autonomy'],
): Promise<SlashCommandResult> {
  const agentId = createAgentId();

  const pluginMarketplace = command.pluginInfo
    ? parsePluginIdentifier(command.pluginInfo.repository).marketplace
    : undefined;
  logEvent('tengu_slash_command_forked', {
    command_name: command.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    invocation_trigger: 'user-slash' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    ...(command.pluginInfo && {
      _PROTO_plugin_name: command.pluginInfo.pluginManifest.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      ...(pluginMarketplace && {
        _PROTO_marketplace_name: pluginMarketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      }),
      ...buildPluginCommandTelemetryFields(command.pluginInfo),
    }),
  });

  const { skillContent, modifiedGetAppState, baseAgent, promptMessages } = await prepareForkedCommandContext(
    command,
    args,
    context,
  );

  // Merge skill's effort into the agent definition so runAgent applies it
  const agentDefinition = command.effort !== undefined ? { ...baseAgent, effort: command.effort } : baseAgent;

  logForDebugging(`Executing forked slash command /${command.name} with agent ${agentDefinition.agentType}`);

  // Assistant mode: fire-and-forget. Launch subagent in background, return
  // immediately, re-enqueue the result as an isMeta prompt when done.
  // Without this, N scheduled tasks on startup = N serial (subagent + main
  // agent turn) cycles blocking user input. With this, N subagents run in
  // parallel and results trickle into the queue as they finish.
  //
  // Gated on kairosEnabled (not CLAUDE_CODE_BRIEF) because the closed loop
  // depends on assistant-mode invariants: scheduled_tasks.json exists,
  // the main agent knows to pipe results through SendUserMessage, and
  // isMeta prompts are hidden. Outside assistant mode, context:fork commands
  // are user-invoked skills (/commit etc.) that should run synchronously
  // with the progress UI.
  const appState = await context.getAppState();
  const allowBackgroundForkedSlashCommands = context.options.allowBackgroundForkedSlashCommands === true;
  if (allowBackgroundForkedSlashCommands) {
    assertBackgroundForkedSlashCommandTestOverrideAllowed();
  }
  let canRunBackgroundForkedSlashCommand = false;
  if (appState.kairosEnabled) {
    if (feature('KAIROS')) {
      canRunBackgroundForkedSlashCommand = true;
    } else if (allowBackgroundForkedSlashCommands) {
      canRunBackgroundForkedSlashCommand = true;
    }
  }
  if (canRunBackgroundForkedSlashCommand) {
    // Standalone abortController — background subagents survive main-thread
    // ESC (same policy as AgentTool's async path). They're cron-driven; if
    // killed mid-run they just re-fire on the next schedule.
    const bgAbortController = createAbortController();
    const commandName = getCommandName(command);

    // Workload: handlePromptSubmit wraps the entire turn in runWithWorkload
    // (AsyncLocalStorage). ALS context is captured when this `void` fires
    // and survives every await inside — isolated from the parent's
    // continuation. The detached closure's runAgent calls see the cron tag
    // automatically. We still capture the value here ONLY for the
    // re-enqueued result prompt below: that second turn runs in a fresh
    // handlePromptSubmit → fresh runWithWorkload boundary (which always
    // establishes a new context, even for `undefined`) → so it needs its
    // own QueuedCommand.workload tag to preserve attribution.
    const spawnTimeWorkload = getWorkload();

    // 作为隐藏提示重新进入队列。isMeta：在队列预览、占
    // 位符和记录中隐藏。skipSlashCommands：
    // 如果结果文本恰好以 '/' 开头，则防止重新解析。当
    // 被处理时，这会触发一个主代理轮次，该轮次看到结果并决定是
    // 否 SendUserMessage。传播工作负载，以
    // 便第二个轮次也被标记。
    const enqueueResult = (value: string): void =>
      enqueuePendingNotification({
        value,
        mode: 'prompt',
        priority: 'later',
        isMeta: true,
        skipSlashCommands: true,
        workload: spawnTimeWorkload,
      });
    const finalizeDeferredAutonomyRunCompleted = async (): Promise<void> => {
      if (!autonomy?.runId) {
        return;
      }
      const nextCommands = await finalizeAutonomyRunCompleted({
        runId: autonomy.runId,
        rootDir: autonomy.rootDir,
        priority: 'later',
        workload: spawnTimeWorkload,
      });
      for (const nextCommand of nextCommands) {
        enqueue(nextCommand);
      }
    };
    const finalizeDeferredAutonomyRunFailed = async (error: unknown): Promise<void> => {
      if (!autonomy?.runId) {
        return;
      }
      await finalizeAutonomyRunFailed({
        runId: autonomy.runId,
        rootDir: autonomy.rootDir,
        error: error instanceof Error ? error.message : String(error),
      });
    };

    void (async () => {
      // Wait for MCP servers to settle. Scheduled tasks fire at startup and
      // all N drain within ~1ms (since we return immediately), capturing
      // context.options.tools before MCP connects. The sync path
      // accidentally avoided this — tasks serialized, so task N's drain
      // happened after task N-1's 30s run, by which time MCP was up.
      // Poll until no 'pending' clients remain, then refresh.
      const deadline = Date.now() + MCP_SETTLE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const s = context.getAppState();
        if (!s.mcp.clients.some(c => c.type === 'pending')) break;
        await sleep(MCP_SETTLE_POLL_MS);
      }
      const freshTools = context.options.refreshTools?.() ?? context.options.tools;

      const agentMessages: Message[] = [];
      for await (const message of runAgent({
        agentDefinition,
        promptMessages,
        toolUseContext: {
          ...context,
          getAppState: modifiedGetAppState,
          abortController: bgAbortController,
        },
        canUseTool,
        isAsync: true,
        querySource: 'agent:custom',
        model: command.model as ModelAlias | undefined,
        availableTools: freshTools,
        override: { agentId },
      })) {
        agentMessages.push(message);
      }
      const resultText = extractResultText(agentMessages, 'Command completed');
      logForDebugging(`Background forked command /${commandName} completed (agent ${agentId})`);
      // Enqueue the worker's result before finalizing the autonomy run so the
      // <scheduled-task-result> notification is observed before any follow-up
      // autonomy commands the finalizer enqueues at the same priority. Without
      // this ordering, both land at `priority: 'later'` and the next autonomy
      // step can run before the main thread sees this worker's output.
      enqueueResult(`<scheduled-task-result command="/${commandName}">\n${resultText}\n</scheduled-task-result>`);
      // The slash command itself succeeded; an error from the finalize call
      // must not surface as a contradictory <scheduled-task-result status="failed">
      // via the outer catch below. Log it locally and stop.
      try {
        await finalizeDeferredAutonomyRunCompleted();
      } catch (finalizeError) {
        logError(finalizeError);
      }
    })().catch(async err => {
      logError(err);
      enqueueResult(
        `<scheduled-task-result command="/${commandName}" status="failed">\n${err instanceof Error ? err.message : String(err)}\n</scheduled-task-result>`,
      );
      await finalizeDeferredAutonomyRunFailed(err);
    });

    // Nothing to render, nothing to query — the background runner re-enters
    // the queue on its own schedule.
    return {
      messages: [],
      shouldQuery: false,
      command,
      deferAutonomyCompletion: Boolean(autonomy?.runId),
    };
  }

  // Collect messages from the forked agent
  const agentMessages: Message[] = [];

  // Build progress messages for the agent progress UI
  const progressMessages: ProgressMessage<AgentProgress>[] = [];
  const parentToolUseID = `forked-command-${command.name}`;
  let toolUseCounter = 0;

  // Helper to create a progress message from an agent message
  const createProgressMessage = (message: AssistantMessage | NormalizedUserMessage): ProgressMessage<AgentProgress> => {
    toolUseCounter++;
    return {
      type: 'progress',
      data: {
        message,
        type: 'agent_progress',
        prompt: skillContent,
        agentId,
      },
      parentToolUseID,
      toolUseID: `${parentToolUseID}-${toolUseCounter}`,
      timestamp: new Date().toISOString(),
      uuid: randomUUID(),
    };
  };

  // 使用代理进度 UI 更新进度显示的辅助函数
  const updateProgress = (): void => {
    setToolJSX({
      jsx: renderToolUseProgressMessage(progressMessages, {
        tools: context.options.tools,
        verbose: false,
      }),
      shouldHidePromptInput: false,
      shouldContinueAnimation: true,
      showSpinner: true,
    });
  };

  // Show initial "Initializing…" state
  updateProgress();

  // 运行子代理
  try {
    for await (const message of runAgent({
      agentDefinition,
      promptMessages,
      toolUseContext: {
        ...context,
        getAppState: modifiedGetAppState,
      },
      canUseTool,
      isAsync: false,
      querySource: 'agent:custom',
      model: command.model as ModelAlias | undefined,
      availableTools: context.options.tools,
    })) {
      agentMessages.push(message);
      const normalizedNew = normalizeMessages([message]);

      // 为助手消息（包含工具使用）添加进度消息
      if (message.type === 'assistant') {
        // Increment token count in spinner for assistant messages
        const contentLength = getAssistantMessageContentLength(message as AssistantMessage);
        if (contentLength > 0) {
          context.setResponseLength(len => len + contentLength);
        }

        const normalizedMsg = normalizedNew[0];
        if (normalizedMsg && normalizedMsg.type === 'assistant') {
          progressMessages.push(createProgressMessage(message as AssistantMessage));
          updateProgress();
        }
      }

      // 为用户消息（包含工具结果）添加进度消息
      if (message.type === 'user') {
        const normalizedMsg = normalizedNew[0];
        if (normalizedMsg && normalizedMsg.type === 'user') {
          progressMessages.push(createProgressMessage(normalizedMsg as AssistantMessage));
          updateProgress();
        }
      }
    }
  } finally {
    // Clear the progress display
    setToolJSX(null);
  }

  let resultText = extractResultText(agentMessages, 'Command completed');

  logForDebugging(`Forked slash command /${command.name} completed with agent ${agentId}`);

  // 为 ant 用户添加调试日志前缀，使其出现在命令输出内部
  if (process.env.USER_TYPE === 'ant') {
    resultText = `[ANT-ONLY] API calls: ${getDisplayPath(getDumpPromptsPath(agentId))}\n${resultText}`;
  }

  // 将结果作为用户消息返回（模拟代理的输出）
  const messages: UserMessage[] = [
    createUserMessage({
      content: prepareUserContent({
        inputString: `/${getCommandName(command)} ${args}`.trim(),
        precedingInputBlocks,
      }),
    }),
    createUserMessage({
      content: `<本地命令标准输出>
${resultText}
</本地命令标准输出>`,
    }),
  ];

  return {
    messages,
    shouldQuery: false,
    command,
    resultText,
  };
}

/**
 * Determines if a string looks like a valid command name.
 * Valid command names only contain letters, numbers, colons, hyphens, and underscores.
 *
 * @param commandName - The potential command name to check
 * @returns true if it looks like a command name, false if it contains non-command characters
 */
export function looksLikeCommand(commandName: string): boolean {
  // Command names should only contain [a-zA-Z0-9:_-]
  // If it contains other characters, it's probably a file path or other input
  return !/[^a-zA-Z0-9:\-_]/.test(commandName);
}

export async function processSlashCommand(
  inputString: string,
  precedingInputBlocks: ContentBlockParam[],
  imageContentBlocks: ContentBlockParam[],
  attachmentMessages: AttachmentMessage[],
  context: ProcessUserInputContext,
  setToolJSX: SetToolJSXFn,
  uuid?: string,
  isAlreadyProcessing?: boolean,
  canUseTool?: CanUseToolFn,
  autonomy?: QueuedCommand['autonomy'],
): Promise<ProcessUserInputBaseResult> {
  const parsed = parseSlashCommand(inputString);
  if (!parsed) {
    logEvent('tengu_input_slash_missing', {});
    const errorMessage = 'Commands are in the form `/command [args]`';
    return {
      messages: [
        createSyntheticUserCaveatMessage(),
        ...attachmentMessages,
        createUserMessage({
          content: prepareUserContent({
            inputString: errorMessage,
            precedingInputBlocks,
          }),
        }),
      ],
      shouldQuery: false,
      resultText: errorMessage,
    };
  }

  const { commandName, args: parsedArgs, isMcp } = parsed;

  const sanitizedCommandName = isMcp ? 'mcp' : !builtInCommandNames().has(commandName) ? 'custom' : commandName;

  // 处理前检查是否为真实命令
  if (!hasCommand(commandName, context.options.commands)) {
    // Check if this looks like a command name vs a file path or other input
    // Also check if it's an actual file path that exists
    let isFilePath = false;
    try {
      await getFsImplementation().stat(`/${commandName}`);
      isFilePath = true;
    } catch {
      // 非文件路径 — 视为命令名称
    }
    if (looksLikeCommand(commandName) && !isFilePath) {
      logEvent('tengu_input_slash_invalid', {
        input: commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });

      const unknownMessage = `Unknown skill: ${commandName}`;
      return {
        messages: [
          createSyntheticUserCaveatMessage(),
          ...attachmentMessages,
          createUserMessage({
            content: prepareUserContent({
              inputString: unknownMessage,
              precedingInputBlocks,
            }),
          }),
          // gh-32591: preserve args so the user can copy/resubmit without
          // retyping. System warning is UI-only (filtered before API).
          ...(parsedArgs ? [createSystemMessage(`Args from unknown skill: ${parsedArgs}`, 'warning')] : []),
        ],
        shouldQuery: false,
        resultText: unknownMessage,
      };
    }

    const promptId = randomUUID();
    setPromptId(promptId);
    logEvent('tengu_input_prompt', {});
    // Log user prompt event for OTLP
    void logOTelEvent('user_prompt', {
      prompt_length: String(inputString.length),
      prompt: redactIfDisabled(inputString),
      'prompt.id': promptId,
    });
    return {
      messages: [
        createUserMessage({
          content: prepareUserContent({ inputString, precedingInputBlocks }),
          uuid: uuid,
        }),
        ...attachmentMessages,
      ],
      shouldQuery: true,
    };
  }

  // 跟踪斜杠命令使用情况以进行功能发现

  const {
    messages: newMessages,
    shouldQuery: messageShouldQuery,
    allowedTools,
    model,
    effort,
    command: returnedCommand,
    resultText,
    nextInput,
    submitNextInput,
    deferAutonomyCompletion,
  } = await getMessagesForSlashCommand(
    commandName,
    parsedArgs,
    setToolJSX,
    context,
    precedingInputBlocks,
    imageContentBlocks,
    isAlreadyProcessing,
    canUseTool,
    uuid,
    autonomy,
  );

  // 跳过消息的本地斜杠命令
  if (newMessages.length === 0) {
    const eventData: Record<string, boolean | number | undefined> = {
      input: sanitizedCommandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    };

    // 若为插件命令，则添加插件元数据
    if (returnedCommand.type === 'prompt' && returnedCommand.pluginInfo) {
      const { pluginManifest, repository } = returnedCommand.pluginInfo;
      const { marketplace } = parsePluginIdentifier(repository);
      const isOfficial = isOfficialMarketplaceName(marketplace);
      // _PROTO_* routes to PII-tagged plugin_name/marketplace_name BQ columns
      // (unredacted, all users); plugin_name/plugin_repository stay in
      // additional_metadata as redacted variants for general-access dashboards.
      eventData._PROTO_plugin_name = pluginManifest.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED;
      if (marketplace) {
        eventData._PROTO_marketplace_name = marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED;
      }
      eventData.plugin_repository = (
        isOfficial ? repository : 'third-party'
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS;
      eventData.plugin_name = (
        isOfficial ? pluginManifest.name : 'third-party'
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS;
      if (isOfficial && pluginManifest.version) {
        eventData.plugin_version = pluginManifest.version as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS;
      }
      Object.assign(eventData, buildPluginCommandTelemetryFields(returnedCommand.pluginInfo));
    }

    logEvent('tengu_input_command', {
      ...eventData,
      invocation_trigger: 'user-slash' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...(process.env.USER_TYPE === 'ant' && {
        skill_name: commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ...(returnedCommand.type === 'prompt' && {
          skill_source: returnedCommand.source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        }),
        ...(returnedCommand.loadedFrom && {
          skill_loaded_from: returnedCommand.loadedFrom as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        }),
        ...(returnedCommand.kind && {
          skill_kind: returnedCommand.kind as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        }),
      }),
    });
    return {
      messages: [],
      shouldQuery: false,

      model,
      nextInput,
      submitNextInput,
      deferAutonomyCompletion,
    };
  }

  // 对于无效命令，同时保留用户消息和错误信息
  if (
    newMessages.length === 2 &&
    newMessages[1]!.type === 'user' &&
    typeof newMessages[1]!.message.content === 'string' &&
    newMessages[1]!.message.content.startsWith('Unknown command:')
  ) {
    // 若输入类似常见文件路径，则不记录为无效命令
    const looksLikeFilePath =
      inputString.startsWith('/var') || inputString.startsWith('/tmp') || inputString.startsWith('/private');

    if (!looksLikeFilePath) {
      logEvent('tengu_input_slash_invalid', {
        input: commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
    }

    return {
      messages: [createSyntheticUserCaveatMessage(), ...newMessages],
      shouldQuery: messageShouldQuery,
      allowedTools,

      model,
    };
  }

  // 有效命令
  const eventData: Record<string, boolean | number | undefined> = {
    input: sanitizedCommandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  };

  // 若为插件命令，则添加插件元数据
  if (returnedCommand.type === 'prompt' && returnedCommand.pluginInfo) {
    const { pluginManifest, repository } = returnedCommand.pluginInfo;
    const { marketplace } = parsePluginIdentifier(repository);
    const isOfficial = isOfficialMarketplaceName(marketplace);
    eventData._PROTO_plugin_name = pluginManifest.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED;
    if (marketplace) {
      eventData._PROTO_marketplace_name = marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED;
    }
    eventData.plugin_repository = (
      isOfficial ? repository : 'third-party'
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS;
    eventData.plugin_name = (
      isOfficial ? pluginManifest.name : 'third-party'
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS;
    if (isOfficial && pluginManifest.version) {
      eventData.plugin_version = pluginManifest.version as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS;
    }
    Object.assign(eventData, buildPluginCommandTelemetryFields(returnedCommand.pluginInfo));
  }

  logEvent('tengu_input_command', {
    ...eventData,
    invocation_trigger: 'user-slash' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    ...(process.env.USER_TYPE === 'ant' && {
      skill_name: commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...(returnedCommand.type === 'prompt' && {
        skill_source: returnedCommand.source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
      ...(returnedCommand.loadedFrom && {
        skill_loaded_from: returnedCommand.loadedFrom as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
      ...(returnedCommand.kind && {
        skill_kind: returnedCommand.kind as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
    }),
  });

  // Check if this is a compact result which handle their own synthetic caveat message ordering
  const isCompactResult = newMessages.length > 0 && newMessages[0] && isCompactBoundaryMessage(newMessages[0]);

  return {
    messages:
      messageShouldQuery || newMessages.every(isSystemLocalCommandMessage) || isCompactResult
        ? newMessages
        : [createSyntheticUserCaveatMessage(), ...newMessages],
    shouldQuery: messageShouldQuery,
    allowedTools,
    model,
    effort,
    resultText,
    nextInput,
    submitNextInput,
    deferAutonomyCompletion,
  };
}

async function getMessagesForSlashCommand(
  commandName: string,
  args: string,
  setToolJSX: SetToolJSXFn,
  context: ProcessUserInputContext,
  precedingInputBlocks: ContentBlockParam[],
  imageContentBlocks: ContentBlockParam[],
  _isAlreadyProcessing?: boolean,
  canUseTool?: CanUseToolFn,
  uuid?: string,
  autonomy?: QueuedCommand['autonomy'],
): Promise<SlashCommandResult> {
  const command = getCommand(commandName, context.options.commands);

  // 跟踪技能使用情况以进行排名（仅适用于用户可调用的提示命令）
  if (command.type === 'prompt' && command.userInvocable !== false) {
    recordSkillUsage(commandName);
  }

  // 检查命令是否可由用户调用。userIn
  // vocable === false 的技能只能通过 SkillTool 由模型调用
  if (command.userInvocable === false) {
    return {
      messages: [
        createUserMessage({
          content: prepareUserContent({
            inputString: `/${commandName}`,
            precedingInputBlocks,
          }),
        }),
        createUserMessage({
          content: `此技能只能由 Claude 调用，用户无法直接调用。请让 Claude 为您使用“${commandName}”技能。`,
        }),
      ],
      shouldQuery: false,
      command,
    };
  }

  try {
    switch (command.type) {
      case 'local-jsx': {
        return new Promise<SlashCommandResult>(resolve => {
          let doneWasCalled = false;
          const onDone = (
            result?: string,
            options?: {
              display?: CommandResultDisplay;
              shouldQuery?: boolean;
              metaMessages?: string[];
              nextInput?: string;
              submitNextInput?: boolean;
            },
          ) => {
            doneWasCalled = true;
            // If display is 'skip', don't add any messages to the conversation
            if (options?.display === 'skip') {
              void resolve({
                messages: [],
                shouldQuery: false,
                command,
                nextInput: options?.nextInput,
                submitNextInput: options?.submitNextInput,
              });
              return;
            }

            // Meta messages are model-visible but hidden from the user
            const metaMessages = (options?.metaMessages ?? []).map((content: string) =>
              createUserMessage({ content, isMeta: true }),
            );

            // 在全屏模式下，命令仅显示为居中的模态窗格 — 瞬时通知已
            // 足够提供反馈。“❯ /config” + “⎿ dism
            // issed” 转录条目类型为 type:syst
            // em subtype:local_command（用户可见
            // 但不会发送给模型），因此跳过它们不会影响模型上下文。非全屏模
            // 式下保留这些条目，以便滚动历史显示已执行内容。仅跳过“<
            // 名称> dismissed”模态关闭通知 — 在显示模
            // 态前提前退出的命令（/ultraplan 使用、/rena
            // me、/proactive）使用 display:sys
            // tem 处理必须到达转录的实际输出。
            const skipTranscript =
              isFullscreenEnvEnabled() && typeof result === 'string' && result.endsWith(' dismissed');

            void resolve({
              messages:
                options?.display === 'system'
                  ? skipTranscript
                    ? metaMessages
                    : [
                        createCommandInputMessage(formatCommandInput(command, args)),
                        createCommandInputMessage(`<local-command-stdout>${result}</local-command-stdout>`),
                        ...metaMessages,
                      ]
                  : [
                      createUserMessage({
                        content: prepareUserContent({
                          inputString: formatCommandInput(command, args),
                          precedingInputBlocks,
                        }),
                      }),
                      result
                        ? createUserMessage({
                            content: `<local-command-stdout>${result}</local-command-stdout>`,
                          })
                        : createUserMessage({
                            content: `<local-command-stdout>${NO_CONTENT_MESSAGE}</local-command-stdout>`,
                          }),
                      ...metaMessages,
                    ],
              shouldQuery: options?.shouldQuery ?? false,
              command,
              nextInput: options?.nextInput,
              submitNextInput: options?.submitNextInput,
            });
          };

          void command
            .load()
            .then(mod => mod.call(onDone, { ...context, canUseTool }, args))
            .then(jsx => {
              if (jsx == null) return;
              if (context.options.isNonInteractiveSession) {
                void resolve({
                  messages: [],
                  shouldQuery: false,
                  command,
                });
                return;
              }
              // Guard: if onDone fired during mod.call() (early-exit path
              // that calls onDone then returns JSX), skip setToolJSX. This
              // chain is fire-and-forget — the outer Promise resolves when
              // onDone is called, so executeUserInput may have already run
              // its setToolJSX({clearLocalJSX: true}) before we get here.
              // Setting isLocalJSXCommand after clear leaves it stuck true,
              // blocking useQueueProcessor and TextInput focus.
              if (doneWasCalled) return;
              setToolJSX({
                jsx,
                shouldHidePromptInput: true,
                showSpinner: false,
                isLocalJSXCommand: true,
                isImmediate: command.immediate === true,
              });
            })
            .catch(e => {
              // If load()/call() throws and onDone never fired, the outer
              // Promise hangs forever, leaving queryGuard stuck in
              // 'dispatching' and deadlocking the queue processor.
              logError(e);
              if (doneWasCalled) return;
              doneWasCalled = true;
              setToolJSX({
                jsx: null,
                shouldHidePromptInput: false,
                clearLocalJSX: true,
              });
              void resolve({ messages: [], shouldQuery: false, command });
            });
        });
      }
      case 'local': {
        const displayArgs = command.isSensitive && args.trim() ? '***' : args;
        const userMessage = createUserMessage({
          content: prepareUserContent({
            inputString: formatCommandInput(command, displayArgs),
            precedingInputBlocks,
          }),
        });

        try {
          const syntheticCaveatMessage = createSyntheticUserCaveatMessage();
          const mod = await command.load();
          const result = await mod.call(args, context);

          if (result.type === 'skip') {
            return {
              messages: [],
              shouldQuery: false,
              command,
            };
          }

          // 使用可辨识联合处理不同的结果类型
          if (result.type === 'compact') {
            // 将斜杠命令消息附加到 messagesToKeep，确
            // 保附件和 hookResults 位于用户消息之后
            const slashCommandMessages = [
              syntheticCaveatMessage,
              userMessage,
              ...(result.displayText
                ? [
                    createUserMessage({
                      content: `<local-command-stdout>${result.displayText}</local-command-stdout>`,
                      // --resume 查看最新时间戳消息以确定从哪条消息
                      // 恢复。此为性能优化，避免每次重新计算叶节点。由于我
                      // 们为紧凑模式创建了大量合成消息，将最后一条消息的时间
                      // 戳设置为略晚于当前时间至关重要。这对 SDK
                      // / -p 模式尤为重要。
                      timestamp: new Date(Date.now() + 100).toISOString(),
                    }),
                  ]
                : []),
            ];
            const compactionResultWithSlashMessages = {
              ...result.compactionResult,
              messagesToKeep: [...(result.compactionResult.messagesToKeep ?? []), ...slashCommandMessages],
            };
            // Reset microcompact state since full compact replaces all
            // messages — old tool IDs are no longer relevant. Budget state
            // (on toolUseContext) needs no reset: stale entries are inert
            // (UUIDs never repeat, so they're never looked up).
            resetMicrocompactState();
            return {
              messages: buildPostCompactMessages(compactionResultWithSlashMessages) as AssistantMessage[],
              shouldQuery: false,
              command,
            };
          }

          // 文本结果 — 使用系统消息，避免渲染为用户气泡
          return {
            messages: [
              userMessage,
              createCommandInputMessage(`<local-command-stdout>${result.value}</local-command-stdout>`),
            ],
            shouldQuery: false,
            command,
            resultText: result.value,
          };
        } catch (e) {
          logError(e);
          return {
            messages: [
              userMessage,
              createCommandInputMessage(`<local-command-stderr>${String(e)}</local-command-stderr>`),
            ],
            shouldQuery: false,
            command,
          };
        }
      }
      case 'prompt': {
        try {
          // 检查命令是否应作为分叉子代理运行
          if (command.context === 'fork') {
            return await executeForkedSlashCommand(
              command,
              args,
              context,
              precedingInputBlocks,
              setToolJSX,
              canUseTool ?? hasPermissionsToUseTool,
              autonomy,
            );
          }

          return await getMessagesForPromptSlashCommand(
            command,
            args,
            context,
            precedingInputBlocks,
            imageContentBlocks,
            uuid,
          );
        } catch (e) {
          // 特殊处理中止错误，以显示正确的“已中断”消息
          if (e instanceof AbortError) {
            return {
              messages: [
                createUserMessage({
                  content: prepareUserContent({
                    inputString: formatCommandInput(command, args),
                    precedingInputBlocks,
                  }),
                }),
                createUserInterruptionMessage({ toolUse: false }),
              ],
              shouldQuery: false,
              command,
            };
          }
          return {
            messages: [
              createUserMessage({
                content: prepareUserContent({
                  inputString: formatCommandInput(command, args),
                  precedingInputBlocks,
                }),
              }),
              createUserMessage({
                content: `<local-command-stderr>${String(e)}</local-command-stderr>`,
              }),
            ],
            shouldQuery: false,
            command,
          };
        }
      }
    }
  } catch (e) {
    if (e instanceof MalformedCommandError) {
      return {
        messages: [
          createUserMessage({
            content: prepareUserContent({
              inputString: e.message,
              precedingInputBlocks,
            }),
          }),
        ],
        shouldQuery: false,
        command,
      };
    }
    throw e;
  }
}

function formatCommandInput(command: CommandBase, args: string): string {
  return formatCommandInputTags(getCommandName(command), args);
}

/**
 * Formats the metadata for a skill loading message.
 * Used by the Skill tool and for subagent skill preloading.
 */
export function formatSkillLoadingMetadata(skillName: string, _progressMessage: string = 'loading'): string {
  // Use skill name only - UserCommandMessage renders as "Skill(name)"
  return [
    `<${COMMAND_MESSAGE_TAG}>${skillName}</${COMMAND_MESSAGE_TAG}>`,
    `<${COMMAND_NAME_TAG}>${skillName}</${COMMAND_NAME_TAG}>`,
    `<skill-format>true</skill-format>`,
  ].join('\n');
}

/**
 * Formats the metadata for a slash command loading message.
 */
function formatSlashCommandLoadingMetadata(commandName: string, args?: string): string {
  return [
    `<${COMMAND_MESSAGE_TAG}>${commandName}</${COMMAND_MESSAGE_TAG}>`,
    `<${COMMAND_NAME_TAG}>/${commandName}</${COMMAND_NAME_TAG}>`,
    args ? `<command-args>${args}</command-args>` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Formats the loading metadata for a command (skill or slash command).
 * User-invocable skills use slash command format (/name), while model-only
 * skills use the skill format ("The X skill is running").
 */
function formatCommandLoadingMetadata(command: CommandBase & PromptCommand, args?: string): string {
  // Use command.name (the qualified name including plugin prefix, e.g.
  // "product-management:feature-spec") instead of userFacingName() which may
  // strip the plugin prefix via displayName fallback.
  // User-invocable skills should show as /command-name like regular slash commands
  if (command.userInvocable !== false) {
    return formatSlashCommandLoadingMetadata(command.name, args);
  }
  // Model-only skills (userInvocable: false) show as "The X skill is running"
  if (command.loadedFrom === 'skills' || command.loadedFrom === 'plugin' || command.loadedFrom === 'mcp') {
    return formatSkillLoadingMetadata(command.name, command.progressMessage);
  }
  return formatSlashCommandLoadingMetadata(command.name, args);
}

export async function processPromptSlashCommand(
  commandName: string,
  args: string,
  commands: Command[],
  context: ToolUseContext,
  imageContentBlocks: ContentBlockParam[] = [],
): Promise<SlashCommandResult> {
  const command = findCommand(commandName, commands);
  if (!command) {
    throw new MalformedCommandError(`Unknown command: ${commandName}`);
  }
  if (command.type !== 'prompt') {
    throw new Error(
      `Unexpected ${command.type} command. Expected 'prompt' command. Use /${commandName} directly in the main conversation.`,
    );
  }
  return getMessagesForPromptSlashCommand(command, args, context, [], imageContentBlocks);
}

async function getMessagesForPromptSlashCommand(
  command: CommandBase & PromptCommand,
  args: string,
  context: ToolUseContext,
  precedingInputBlocks: ContentBlockParam[] = [],
  imageContentBlocks: ContentBlockParam[] = [],
  uuid?: string,
): Promise<SlashCommandResult> {
  // 在协调器模式（仅主线程）下，跳过加载完整的技能内容和权限。协
  // 调器仅拥有 Agent + TaskStop 工具，因此
  // 技能内容和 allowedTools 无用。相反，发送一个
  // 简短的摘要，告诉协调器如何将此技能委派给工作线程。
  //
  // Workers run in-process and inherit CLAUDE_CODE_COORDINATOR_MODE from the
  // parent env, so we also check !context.agentId: agentId is only set for
  // subagents, letting workers fall through to getPromptForCommand and receive
  // the real skill content when they invoke the Skill tool.
  if (feature('COORDINATOR_MODE') && isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE) && !context.agentId) {
    const metadata = formatCommandLoadingMetadata(command, args);
    const parts: string[] = [`Skill "/${command.name}" is available for workers.`];
    if (command.description) {
      parts.push(`Description: ${command.description}`);
    }
    if (command.whenToUse) {
      parts.push(`When to use: ${command.whenToUse}`);
    }
    const skillAllowedTools = command.allowedTools ?? [];
    if (skillAllowedTools.length > 0) {
      parts.push(`This skill grants workers additional tool permissions: ${skillAllowedTools.join(', ')}`);
    }
    parts.push(
      `\nInstruct a worker to use this skill by including "Use the /${command.name} skill" in your Agent prompt. The worker has access to the Skill tool and will receive the skill's content and permissions when it invokes it.`,
    );
    const summaryContent: ContentBlockParam[] = [{ type: 'text', text: parts.join('\n') }];
    return {
      messages: [
        createUserMessage({ content: metadata, uuid }),
        createUserMessage({ content: summaryContent, isMeta: true }),
      ],
      shouldQuery: true,
      model: command.model,
      effort: command.effort,
      command,
    };
  }

  const result = await command.getPromptForCommand(args, context);

  // Register skill hooks if defined. Under ["hooks"]-only (skills not locked),
  // user skills still load and reach this point — block hook REGISTRATION here
  // where source is known. Mirrors the agent frontmatter gate in runAgent.ts.
  const hooksAllowedForThisSkill = !isRestrictedToPluginOnly('hooks') || isSourceAdminTrusted(command.source);
  if (command.hooks && hooksAllowedForThisSkill) {
    const sessionId = getSessionId();
    registerSkillHooks(
      context.setAppState,
      sessionId,
      command.hooks,
      command.name,
      command.type === 'prompt' ? command.skillRoot : undefined,
    );
  }

  // Record skill invocation for compaction preservation, scoped by agent context.
  // Skills are tagged with their agentId so only skills belonging to the current
  // agent are restored during compaction (preventing cross-agent leaks).
  const skillPath = command.source ? `${command.source}:${command.name}` : command.name;
  const skillContent = result
    .filter((b): b is TextBlockParam => b.type === 'text')
    .map(b => b.text)
    .join('\n\n');
  addInvokedSkill(command.name, skillPath, skillContent, getAgentContext()?.agentId ?? null);

  const metadata = formatCommandLoadingMetadata(command, args);

  const additionalAllowedTools = parseToolListFromCLI(command.allowedTools ?? []);

  // 为主消息创建内容，包括任何粘贴的图片
  const mainMessageContent: ContentBlockParam[] =
    imageContentBlocks.length > 0 || precedingInputBlocks.length > 0
      ? [...imageContentBlocks, ...precedingInputBlocks, ...result]
      : result;

  // 从命令参数中提取附件（@-提及、MCP 资源、SKILL.md
  // 中的代理提及）。skipSkillDiscovery 可防止
  // SKILL.md 内容本身触发发现——它是元内容，而非用户意
  // 图，并且一个大型的 SKILL.md（例如 110KB）会触发分
  // 块的 AKI 查询，给每次技能调用增加数秒延迟。
  const attachmentMessages = await toArray(
    getAttachmentMessages(
      result
        .filter((block): block is TextBlockParam => block.type === 'text')
        .map(block => block.text)
        .join(' '),
      context,
      null,
      [], // queuedCommands - handled by query.ts for mid-turn attachments
      context.messages,
      'repl_main_thread',
      { skipSkillDiscovery: true },
    ),
  );

  const messages = [
    createUserMessage({
      content: metadata,
      uuid,
    }),
    createUserMessage({
      content: mainMessageContent,
      isMeta: true,
    }),
    ...attachmentMessages,
    createAttachmentMessage({
      type: 'command_permissions',
      allowedTools: additionalAllowedTools,
      model: command.model,
    }),
  ];

  return {
    messages,
    shouldQuery: true,
    allowedTools: additionalAllowedTools,
    model: command.model,
    effort: command.effort,
    command,
  };
}

// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得重新排序
import { feature } from 'bun:bundle';
import { spawnSync } from 'child_process';
import {
  snapshotOutputTokensForTurn,
  getCurrentTurnTokenBudget,
  getTurnOutputTokens,
  getBudgetContinuationCount,
  getTotalInputTokens,
} from '../bootstrap/state.js';
import { parseTokenBudget } from '../utils/tokenBudget.js';
import { count } from '../utils/array.js';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import figures from 'figures';
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- / n N Esc [ v 是转录模态上下文中的裸字母，与 ScrollKeybindingHandler 中的 g/G/j/k 属于同一类别
import { useInput } from '@anthropic/ink';
import { useSearchInput } from '../hooks/useSearchInput.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useSearchHighlight } from '@anthropic/ink';
import type { JumpHandle } from '../components/VirtualMessageList.js';
import { renderMessagesToPlainText } from '../utils/exportRenderer.js';
import { openFileInExternalEditor } from '../utils/editor.js';
import { writeFile } from 'fs/promises';
import {
  type TabStatusKind,
  Box,
  Text,
  useStdin,
  useTheme,
  useTerminalFocus,
  useTerminalTitle,
  useTabStatus,
} from '@anthropic/ink';
import { CostThresholdDialog } from '../components/CostThresholdDialog.js';
import { IdleReturnDialog } from '../components/IdleReturnDialog.js';
import * as React from 'react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useDeferredValue,
  useLayoutEffect,
  type RefObject,
} from 'react';
import { useNotifications } from '../context/notifications.js';
import { sendNotification } from '../services/notifier.js';
import { startPreventSleep, stopPreventSleep } from '../services/preventSleep.js';
import { useTerminalNotification, hasCursorUpViewportYankBug } from '@anthropic/ink';
import {
  createFileStateCacheWithSizeLimit,
  mergeFileStateCaches,
  READ_FILE_STATE_CACHE_SIZE,
} from '../utils/fileStateCache.js';
import {
  updateLastInteractionTime,
  getLastInteractionTime,
  getOriginalCwd,
  getProjectRoot,
  getSessionId,
  switchSession,
  setCostStateForRestore,
  getTurnHookDurationMs,
  getTurnHookCount,
  resetTurnHookDuration,
  getTurnToolDurationMs,
  getTurnToolCount,
  resetTurnToolDuration,
  getTurnClassifierDurationMs,
  getTurnClassifierCount,
  resetTurnClassifierDuration,
} from '../bootstrap/state.js';
import { asSessionId, asAgentId } from '../types/ids.js';
import { logForDebugging } from '../utils/debug.js';
import { QueryGuard } from '../utils/QueryGuard.js';
import { isEnvTruthy } from '../utils/envUtils.js';
import { formatTokens, truncateToWidth } from '../utils/format.js';
import { consumeEarlyInput } from '../utils/earlyInput.js';
import {
  claimConsumableQueuedAutonomyCommands,
  finalizeAutonomyCommandsForTurn,
} from '../utils/autonomyQueueLifecycle.js';

import { setMemberActive } from '../utils/swarm/teamHelpers.js';
import {
  isSwarmWorker,
  generateSandboxRequestId,
  sendSandboxPermissionRequestViaMailbox,
  sendSandboxPermissionResponseViaMailbox,
} from '../utils/swarm/permissionSync.js';
import { registerSandboxPermissionCallback } from '../hooks/useSwarmPermissionPoller.js';
import { getTeamName, getAgentName } from '../utils/teammate.js';
import { WorkerPendingPermission } from '../components/permissions/WorkerPendingPermission.js';
import {
  injectUserMessageToTeammate,
  getAllInProcessTeammateTasks,
} from '../tasks/InProcessTeammateTask/InProcessTeammateTask.js';
import {
  isLocalAgentTask,
  queuePendingMessage,
  appendMessageToLocalAgent,
  type LocalAgentTaskState,
} from '../tasks/LocalAgentTask/LocalAgentTask.js';
import {
  registerLeaderToolUseConfirmQueue,
  unregisterLeaderToolUseConfirmQueue,
  registerLeaderSetToolPermissionContext,
  unregisterLeaderSetToolPermissionContext,
} from '../utils/swarm/leaderPermissionBridge.js';
import { endInteractionSpan } from '../utils/telemetry/sessionTracing.js';
import { useLogMessages } from '../hooks/useLogMessages.js';
import { useReplBridge } from '../hooks/useReplBridge.js';
import {
  type Command,
  type CommandResultDisplay,
  type ResumeEntrypoint,
  getCommandName,
  isCommandEnabled,
} from '../commands.js';
import type { PromptInputMode, QueuedCommand, VimMode } from '../types/textInputTypes.js';
import {
  MessageSelector,
  selectableUserMessagesFilter,
  messagesAfterAreOnlySynthetic,
} from '../components/MessageSelector.js';
import { useIdeLogging } from '../hooks/useIdeLogging.js';
import { PermissionRequest, type ToolUseConfirm } from '../components/permissions/PermissionRequest.js';
import { ElicitationDialog } from '../components/mcp/ElicitationDialog.js';
import { PromptDialog } from '../components/hooks/PromptDialog.js';
import type { PromptRequest, PromptResponse } from '../types/hooks.js';
import PromptInput from '../components/PromptInput/PromptInput.js';
import { PromptInputQueuedCommands } from '../components/PromptInput/PromptInputQueuedCommands.js';
import { useRemoteSession } from '../hooks/useRemoteSession.js';
import { useDirectConnect } from '../hooks/useDirectConnect.js';
import type { DirectConnectConfig } from '../server/directConnectManager.js';
import { useSSHSession } from '../hooks/useSSHSession.js';
import { useAssistantHistory } from '../hooks/useAssistantHistory.js';
import type { SSHSession } from '../ssh/createSSHSession.js';
import { SkillImprovementSurvey } from '../components/SkillImprovementSurvey.js';
import { useSkillImprovementSurvey } from '../hooks/useSkillImprovementSurvey.js';
import { useMoreRight } from '../moreright/useMoreRight.js';
import { SpinnerWithVerb, BriefIdleStatus, type SpinnerMode } from '../components/Spinner.js';
import { getSystemPrompt } from '../constants/prompts.js';
import { buildEffectiveSystemPrompt } from '../utils/systemPrompt.js';
import { getSystemContext, getUserContext } from '../context.js';
import { getMemoryFiles } from '../utils/claudemd.js';
import { startBackgroundHousekeeping } from '../utils/backgroundHousekeeping.js';
import { getTotalCost, saveCurrentSessionCosts, resetCostState, getStoredSessionCosts } from '../cost-tracker.js';
import { useCostSummary } from '../costHook.js';
import { useFpsMetrics } from '../context/fpsMetrics.js';
import { useAfterFirstRender } from '../hooks/useAfterFirstRender.js';
import { useDeferredHookMessages } from '../hooks/useDeferredHookMessages.js';
import { addToHistory, removeLastFromHistory, expandPastedTextRefs, parseReferences } from '../history.js';
import { prependModeCharacterToInput } from '../components/PromptInput/inputModes.js';
import { prependToShellHistoryCache } from '../utils/suggestions/shellHistoryCompletion.js';
import { useApiKeyVerification } from '../hooks/useApiKeyVerification.js';
import { GlobalKeybindingHandlers } from '../hooks/useGlobalKeybindings.js';
import { CommandKeybindingHandlers } from '../hooks/useCommandKeybindings.js';
import { KeybindingSetup } from '../keybindings/KeybindingProviderSetup.js';
import { useShortcutDisplay } from '../keybindings/useShortcutDisplay.js';
import { getShortcutDisplay } from '../keybindings/shortcutFormat.js';
import { CancelRequestHandler } from '../hooks/useCancelRequest.js';
import { useBackgroundTaskNavigation } from '../hooks/useBackgroundTaskNavigation.js';
import { useSwarmInitialization } from '../hooks/useSwarmInitialization.js';
import { useTeammateViewAutoExit } from '../hooks/useTeammateViewAutoExit.js';
import { errorMessage, toError } from '../utils/errors.js';
import { isHumanTurn } from '../utils/messagePredicates.js';
import { logError } from '../utils/log.js';
import { getCwd } from '../utils/cwd.js';
// 死代码消除：条件导入
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const useVoiceIntegration: typeof import('../hooks/useVoiceIntegration.js').useVoiceIntegration = feature('VOICE_MODE')
  ? require('../hooks/useVoiceIntegration.js').useVoiceIntegration
  : () => ({
      stripTrailing: () => 0,
      handleKeyEvent: () => {},
      resetAnchor: () => {},
    });
const VoiceKeybindingHandler: typeof import('../hooks/useVoiceIntegration.js').VoiceKeybindingHandler = feature(
  'VOICE_MODE',
)
  ? require('../hooks/useVoiceIntegration.js').VoiceKeybindingHandler
  : () => null;
// 挫折检测功能仅限 ANT 使用（内部测试）。使用条件 require 以便外部
// 构建完全消除该模块（包括其在每次消息变更时运行的两个 O(n) useMemos，
// 以及 GrowthBook 获取）。
const useFrustrationDetection: typeof import('../components/FeedbackSurvey/useFrustrationDetection.js').useFrustrationDetection =
  process.env.USER_TYPE === 'ant'
    ? require('../components/FeedbackSurvey/useFrustrationDetection.js').useFrustrationDetection
    : () => ({ state: 'closed', handleTranscriptSelect: () => {} });
// 仅限 ANT 组织的警告。使用条件 require 以便组织 UUID 列表
// 在外部构建中被消除（一个 UUID 在 excluded-strings 中）。
const useAntOrgWarningNotification: typeof import('../hooks/notifs/useAntOrgWarningNotification.js').useAntOrgWarningNotification =
  process.env.USER_TYPE === 'ant'
    ? require('../hooks/notifs/useAntOrgWarningNotification.js').useAntOrgWarningNotification
    : () => {};
// 死代码消除：协调器模式的条件导入
const getCoordinatorUserContext: (
  mcpClients: ReadonlyArray<{ name: string }>,
  scratchpadDir?: string,
) => { [k: string]: string } = feature('COORDINATOR_MODE')
  ? require('../coordinator/coordinatorMode.js').getCoordinatorUserContext
  : () => ({});
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
import useCanUseTool from '../hooks/useCanUseTool.js';
import type { ToolPermissionContext, Tool } from '../Tool.js';
import { notifyAutomationStateChanged } from '../utils/sessionState.js';
import {
  applyPermissionUpdate,
  applyPermissionUpdates,
  persistPermissionUpdate,
} from '../utils/permissions/PermissionUpdate.js';
import { buildPermissionUpdates } from '../components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.js';
import { stripDangerousPermissionsForAutoMode } from '../utils/permissions/permissionSetup.js';
import { getScratchpadDir, isScratchpadEnabled } from '../utils/permissions/filesystem.js';
import { WEB_FETCH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/WebFetchTool/prompt.js';
import { SLEEP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SleepTool/prompt.js';
import { clearSpeculativeChecks } from '@claude-code-best/builtin-tools/tools/BashTool/bashPermissions.js';
import type { AutoUpdaterResult } from '../utils/autoUpdater.js';
import { getGlobalConfig, saveGlobalConfig, getGlobalConfigWriteCount } from '../utils/config.js';
import { hasConsoleBillingAccess } from '../utils/billing.js';
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js';
import {
  textForResubmit,
  handleMessageFromStream,
  type StreamingToolUse,
  type StreamingThinking,
  isCompactBoundaryMessage,
  getMessagesAfterCompactBoundary,
  getContentText,
  createUserMessage,
  createAssistantMessage,
  createTurnDurationMessage,
  createAgentsKilledMessage,
  createApiMetricsMessage,
  createSystemMessage,
  createCommandInputMessage,
  formatCommandInputTags,
} from '../utils/messages.js';
import { generateSessionTitle } from '../utils/sessionTitle.js';
import { BASH_INPUT_TAG, COMMAND_MESSAGE_TAG, COMMAND_NAME_TAG, LOCAL_COMMAND_STDOUT_TAG } from '../constants/xml.js';
import { escapeXml } from '../utils/xml.js';
import type { ThinkingConfig } from '../utils/thinking.js';
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js';
import { handlePromptSubmit, type PromptInputHelpers } from '../utils/handlePromptSubmit.js';
import { useQueueProcessor } from '../hooks/useQueueProcessor.js';
import { useMailboxBridge } from '../hooks/useMailboxBridge.js';
import { queryCheckpoint, logQueryProfileReport } from '../utils/queryProfiler.js';
import type {
  Message as MessageType,
  UserMessage,
  ProgressMessage,
  HookResultMessage,
  PartialCompactDirection,
} from '../types/message.js';
import { query } from '../query.js';
import { mergeClients, useMergedClients } from '../hooks/useMergedClients.js';
import { getQuerySourceForREPL } from '../utils/promptCategory.js';
import { useMergedTools } from '../hooks/useMergedTools.js';
import { mergeAndFilterTools } from '../utils/toolPool.js';
import { useMergedCommands } from '../hooks/useMergedCommands.js';
import { useSkillsChange } from '../hooks/useSkillsChange.js';
import { useManagePlugins } from '../hooks/useManagePlugins.js';
import { Messages } from '../components/Messages.js';
import { TaskListV2 } from '../components/TaskListV2.js';
import { TeammateViewHeader } from '../components/TeammateViewHeader.js';
import { getPipeDisplayRole, getPipeIpc, isPipeControlled } from '../utils/pipeTransport.js';
import { useTasksV2WithCollapseEffect } from '../hooks/useTasksV2.js';
import { maybeMarkProjectOnboardingComplete } from '../projectOnboardingState.js';
import type { MCPServerConnection } from '../services/mcp/types.js';
import type { ScopedMcpServerConfig } from '../services/mcp/types.js';
import { randomUUID, type UUID } from 'crypto';
import { processSessionStartHooks } from '../utils/sessionStart.js';
import { executeSessionEndHooks, getSessionEndHookTimeoutMs } from '../utils/hooks.js';
import { type IDESelection, useIdeSelection } from '../hooks/useIdeSelection.js';
import { getTools, assembleToolPool } from '../tools.js';
import type { AgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js';
import { resolveAgentTools } from '@claude-code-best/builtin-tools/tools/AgentTool/agentToolUtils.js';
import { resumeAgentBackground } from '@claude-code-best/builtin-tools/tools/AgentTool/resumeAgent.js';
import { useMainLoopModel } from '../hooks/useMainLoopModel.js';
import { useAppState, useSetAppState, useAppStateStore } from '../state/AppState.js';
import type { ContentBlockParam, ContentBlock, ImageBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs';
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js';
import type { PastedContent } from '../utils/config.js';
import type { InternalPermissionMode } from '../types/permissions.js';
import { copyPlanForFork, copyPlanForResume, getPlanSlug, setPlanSlug } from '../utils/plans.js';
import {
  clearSessionMetadata,
  resetSessionFilePointer,
  adoptResumedSessionFile,
  removeTranscriptMessage,
  restoreSessionMetadata,
  getCurrentSessionTitle,
  isEphemeralToolProgress,
  isLoggableMessage,
  saveWorktreeState,
  getAgentTranscript,
} from '../utils/sessionStorage.js';
import { deserializeMessages } from '../utils/conversationRecovery.js';
import { extractReadFilesFromMessages, extractBashToolsFromMessages } from '../utils/queryHelpers.js';
import { resetMicrocompactState } from '../services/compact/microCompact.js';
import { runPostCompactCleanup, registerCompactCleanup } from '../services/compact/postCompactCleanup.js';
import {
  createContentReplacementState,
  provisionContentReplacementState,
  reconstructContentReplacementState,
  type ContentReplacementRecord,
} from '../utils/toolResultStorage.js';
import { partialCompactConversation } from '../services/compact/compact.js';
import type { LogOption } from '../types/logs.js';
import type { AgentColorName } from '@claude-code-best/builtin-tools/tools/AgentTool/agentColorManager.js';
import {
  fileHistoryMakeSnapshot,
  type FileHistoryState,
  fileHistoryRewind,
  type FileHistorySnapshot,
  copyFileHistoryForResume,
  fileHistoryEnabled,
  fileHistoryHasAnyChanges,
} from '../utils/fileHistory.js';
import { type AttributionState, incrementPromptCount } from '../utils/commitAttribution.js';
import { recordAttributionSnapshot } from '../utils/sessionStorage.js';
import {
  computeStandaloneAgentContext,
  restoreAgentFromSession,
  restoreSessionStateFromLog,
  restoreWorktreeForResume,
  exitRestoredWorktree,
} from '../utils/sessionRestore.js';
import { isBgSession, updateSessionName, updateSessionActivity } from '../utils/concurrentSessions.js';
import { isInProcessTeammateTask, type InProcessTeammateTaskState } from '../tasks/InProcessTeammateTask/types.js';
import { restoreRemoteAgentTasks } from '../tasks/RemoteAgentTask/RemoteAgentTask.js';
import { useInboxPoller } from '../hooks/useInboxPoller.js';
// 死代码消除：循环模式的条件导入
/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule = feature('PROACTIVE') || feature('KAIROS') ? require('../proactive/index.js') : null;
const PROACTIVE_NO_OP_SUBSCRIBE = (_cb: () => void) => () => {};
const PROACTIVE_FALSE = () => false;
const PROACTIVE_NULL = (): number | null => null;
const SUGGEST_BG_PR_NOOP = (_p: string, _n: string): boolean => false;
const useProactive =
  feature('PROACTIVE') || feature('KAIROS') ? require('../proactive/useProactive.js').useProactive : null;
const useScheduledTasks = feature('AGENT_TRIGGERS') ? require('../hooks/useScheduledTasks.js').useScheduledTasks : null;
const useMasterMonitor = feature('UDS_INBOX')
  ? require('../hooks/useMasterMonitor.js').useMasterMonitor
  : () => undefined;
const useSlaveNotifications = feature('UDS_INBOX')
  ? require('../hooks/useSlaveNotifications.js').useSlaveNotifications
  : () => undefined;
const usePipeIpc = feature('UDS_INBOX') ? require('../hooks/usePipeIpc.js').usePipeIpc : () => undefined;
const usePipeRelay = feature('UDS_INBOX')
  ? require('../hooks/usePipeRelay.js').usePipeRelay
  : () => ({ relayPipeMessage: () => false, pipeReturnHadErrorRef: { current: false } });
const usePipePermissionForward = feature('UDS_INBOX')
  ? require('../hooks/usePipePermissionForward.js').usePipePermissionForward
  : () => undefined;
const usePipeMuteSync = feature('UDS_INBOX') ? require('../hooks/usePipeMuteSync.js').usePipeMuteSync : () => undefined;
const usePipeRouter = feature('UDS_INBOX')
  ? require('../hooks/usePipeRouter.js').usePipeRouter
  : () => ({ routeToSelectedPipes: () => false });
/* eslint-enable @typescript-eslint/no-require-imports */
import { isAgentSwarmsEnabled } from '../utils/agentSwarmsEnabled.js';
import { useTaskListWatcher } from '../hooks/useTaskListWatcher.js';
import type { SandboxAskCallback, NetworkHostPattern } from '../utils/sandbox/sandbox-adapter.js';

import {
  type IDEExtensionInstallationStatus,
  closeOpenDiffs,
  getConnectedIdeClient,
  type IdeType,
} from '../utils/ide.js';
import { useIDEIntegration } from '../hooks/useIDEIntegration.js';
import exit from '../commands/exit/index.js';
import { ExitFlow } from '../components/ExitFlow.js';
import { getCurrentWorktreeSession } from '../utils/worktree.js';
import {
  popAllEditable,
  enqueue,
  type SetAppState,
  getCommandQueue,
  getCommandQueueLength,
  removeByFilter,
} from '../utils/messageQueueManager.js';
import { useCommandQueue } from '../hooks/useCommandQueue.js';
import { SessionBackgroundHint } from '../components/SessionBackgroundHint.js';
import { startBackgroundSession } from '../tasks/LocalMainSessionTask.js';
import { useSessionBackgrounding } from '../hooks/useSessionBackgrounding.js';
import { diagnosticTracker } from '../services/diagnosticTracking.js';
import { handleSpeculationAccept, type ActiveSpeculationState } from '../services/PromptSuggestion/speculation.js';
import { IdeOnboardingDialog } from '../components/IdeOnboardingDialog.js';
import { EffortCallout, shouldShowEffortCallout } from '../components/EffortCallout.js';
import type { EffortValue } from '../utils/effort.js';
import { RemoteCallout } from '../components/RemoteCallout.js';
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const AntModelSwitchCallout =
  process.env.USER_TYPE === 'ant' ? require('../components/AntModelSwitchCallout.js').AntModelSwitchCallout : null;
const shouldShowAntModelSwitch =
  process.env.USER_TYPE === 'ant'
    ? require('../components/AntModelSwitchCallout.js').shouldShowModelSwitchCallout
    : (): boolean => false;
const UndercoverAutoCallout =
  process.env.USER_TYPE === 'ant' ? require('../components/UndercoverAutoCallout.js').UndercoverAutoCallout : null;
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
import { activityManager } from '../utils/activityManager.js';
import { createAbortController } from '../utils/abortController.js';
import { MCPConnectionManager } from 'src/services/mcp/MCPConnectionManager.js';
import { useFeedbackSurvey } from 'src/components/FeedbackSurvey/useFeedbackSurvey.js';
import { useMemorySurvey } from 'src/components/FeedbackSurvey/useMemorySurvey.js';
import { usePostCompactSurvey } from 'src/components/FeedbackSurvey/usePostCompactSurvey.js';
import { FeedbackSurvey } from 'src/components/FeedbackSurvey/FeedbackSurvey.js';
import { useInstallMessages } from 'src/hooks/notifs/useInstallMessages.js';
import { useAwaySummary } from 'src/hooks/useAwaySummary.js';
import { useChromeExtensionNotification } from 'src/hooks/useChromeExtensionNotification.js';
import { useOfficialMarketplaceNotification } from 'src/hooks/useOfficialMarketplaceNotification.js';
import { usePromptsFromClaudeInChrome } from 'src/hooks/usePromptsFromClaudeInChrome.js';
import { getTipToShowOnSpinner, recordShownTip } from 'src/services/tips/tipScheduler.js';
import type { Theme } from 'src/utils/theme.js';
import {
  checkAndDisableAutoModeIfNeeded,
  useKickOffCheckAndDisableAutoModeIfNeeded,
} from 'src/utils/permissions/bypassPermissionsKillswitch.js';
import { SandboxManager } from 'src/utils/sandbox/sandbox-adapter.js';
import { SANDBOX_NETWORK_ACCESS_TOOL_NAME } from 'src/cli/structuredIO.js';
import { useFileHistorySnapshotInit } from 'src/hooks/useFileHistorySnapshotInit.js';
import { SandboxPermissionRequest } from 'src/components/permissions/SandboxPermissionRequest.js';
import { SandboxViolationExpandedView } from 'src/components/SandboxViolationExpandedView.js';
import { useSettingsErrors } from 'src/hooks/notifs/useSettingsErrors.js';
import { useMcpConnectivityStatus } from 'src/hooks/notifs/useMcpConnectivityStatus.js';
import { AUTO_MODE_DESCRIPTION } from 'src/components/AutoModeOptInDialog.js';
import { useLspInitializationNotification } from 'src/hooks/notifs/useLspInitializationNotification.js';
import { useLspPluginRecommendation } from 'src/hooks/useLspPluginRecommendation.js';
import { LspRecommendationMenu } from 'src/components/LspRecommendation/LspRecommendationMenu.js';
import { useClaudeCodeHintRecommendation } from 'src/hooks/useClaudeCodeHintRecommendation.js';
import { PluginHintMenu } from 'src/components/ClaudeCodeHint/PluginHintMenu.js';
import {
  DesktopUpsellStartup,
  shouldShowDesktopUpsellStartup,
} from 'src/components/DesktopUpsell/DesktopUpsellStartup.js';
import { usePluginInstallationStatus } from 'src/hooks/notifs/usePluginInstallationStatus.js';
import { usePluginAutoupdateNotification } from 'src/hooks/notifs/usePluginAutoupdateNotification.js';
import { performStartupChecks } from 'src/utils/plugins/performStartupChecks.js';
import { UserTextMessage } from 'src/components/messages/UserTextMessage.js';
import { AwsAuthStatusBox } from '../components/AwsAuthStatusBox.js';
import { useRateLimitWarningNotification } from 'src/hooks/notifs/useRateLimitWarningNotification.js';
import { useDeprecationWarningNotification } from 'src/hooks/notifs/useDeprecationWarningNotification.js';
import { useNpmDeprecationNotification } from 'src/hooks/notifs/useNpmDeprecationNotification.js';
import { useIDEStatusIndicator } from 'src/hooks/notifs/useIDEStatusIndicator.js';
import { useModelMigrationNotifications } from 'src/hooks/notifs/useModelMigrationNotifications.js';
import { useCanSwitchToExistingSubscription } from 'src/hooks/notifs/useCanSwitchToExistingSubscription.js';
import { useTeammateLifecycleNotification } from 'src/hooks/notifs/useTeammateShutdownNotification.js';
import { useFastModeNotification } from 'src/hooks/notifs/useFastModeNotification.js';
import {
  AutoRunIssueNotification,
  shouldAutoRunIssue,
  getAutoRunIssueReasonText,
  getAutoRunCommand,
  type AutoRunIssueReason,
} from '../utils/autoRunIssue.js';
import type { HookProgress } from '../types/hooks.js';
import { TungstenLiveMonitor } from '@claude-code-best/builtin-tools/tools/TungstenTool/TungstenLiveMonitor.js';
// WebBrowserPanel removed — browser-lite returns results inline via tool_result.
// For full browser interaction use Claude-in-Chrome MCP tools.
import { IssueFlagBanner } from '../components/PromptInput/IssueFlagBanner.js';
import { useIssueFlagBanner } from '../hooks/useIssueFlagBanner.js';
import { CompanionSprite, CompanionFloatingBubble, MIN_COLS_FOR_FULL_SPRITE } from '../buddy/CompanionSprite.js';
import { DevBar } from '../components/DevBar.js';
import { UltraplanChoiceDialog } from '../components/ultraplan/UltraplanChoiceDialog.js';
import { UltraplanLaunchDialog } from '../components/ultraplan/UltraplanLaunchDialog.js';
import { launchUltraplan } from '../commands/ultraplan.js';
// 会话管理器已移除 - 现在使用 AppState
import type { RemoteSessionConfig } from '../remote/RemoteSessionManager.js';
import { REMOTE_SAFE_COMMANDS } from '../commands.js';
import type { RemoteMessageContent } from '../utils/teleport/api.js';
import { FullscreenLayout, useUnseenDivider, computeUnseenDivider } from '../components/FullscreenLayout.js';
import { isFullscreenEnvEnabled, maybeGetTmuxMouseHint, isMouseTrackingEnabled } from '../utils/fullscreen.js';
import { AlternateScreen } from '@anthropic/ink';
import { ScrollKeybindingHandler } from '../components/ScrollKeybindingHandler.js';
import {
  useMessageActions,
  MessageActionsKeybindings,
  MessageActionsBar,
  type MessageActionsState,
  type MessageActionsNav,
  type MessageActionCaps,
} from '../components/messageActions.js';
import { setClipboard } from '@anthropic/ink';
import type { ScrollBoxHandle } from '@anthropic/ink';
import { createAttachmentMessage, getQueuedCommandAttachments } from '../utils/attachments.js';

// 为接受 MCPServerConnection[] 的钩子提供稳定的空数组 — 避免
// 在远程模式下每次渲染都创建一个新的 [] 字面量，否则会导致
// useEffect 依赖项变更和无限重新渲染循环。
const EMPTY_MCP_CLIENTS: MCPServerConnection[] = [];

// 为 useAssistantHistory 的非 KAIROS 分支提供稳定的存根 — 避免每次
// 渲染都产生新的函数标识，否则会破坏 composedOnScroll 的 memo。
const HISTORY_STUB = { maybeLoadOlder: (_: ScrollBoxHandle) => {} };
// 在用户发起的滚动期间，type-into-empty 不会重新固定到底部的窗口。
// Josh Rosen 的工作流程：Claude 输出长内容 → 向上滚动阅读开头 → 开始输入 → 在此修复前，会突然跳到底部。
// 使用 LRU 缓存防止内存无限增长
// https://anthropic.slack.com/archives/C07VBSHV7EV/p1773545449871739
const RECENT_SCROLL_REPIN_WINDOW_MS = 3000;

// 100 个文件对于大多数编码会话应该足够，同时可以防止
// 在大型项目中跨多个文件工作时出现内存问题
// 在大型项目中处理多个文件时出现内存问题

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

/** * 用于显示带有动态快捷键绑定的转录模式页脚的小型组件。
 * 必须在 KeybindingSetup 内部渲染以访问快捷键绑定上下文。 */
function TranscriptModeFooter({
  showAllInTranscript,
  virtualScroll,
  searchBadge,
  suppressShowAll = false,
  status,
}: {
  showAllInTranscript: boolean;
  virtualScroll: boolean;
  /** 在导航关闭栏搜索时显示的小地图。显示 n/N 提示 +
   * 右对齐的计数，而非滚动提示。 */
  searchBadge?: { current: number; count: number };
  /** 隐藏 ctrl+e 提示。[ 转储路径与此页脚共享
   * 环境选项转储（CLAUDE_CODE_NO_FLICKER=0 / DISABLE_VIRTUAL_SCROLL=1），
   * 但 ctrl+e 仅在环境选项情况下有效 — useGlobalKeybindings.tsx
   * 根据 !virtualScrollActive 进行门控，该状态源自环境，不知道
   * [ 已发生。 */
  suppressShowAll?: boolean;
  /** 临时状态（v-for 编辑器进度）。通知在 PromptInput 内部渲染，
   * 但 PromptInput 在转录中未挂载 — addNotification 会排队
   * 但没有任何内容绘制它。 */
  status?: string;
}): React.ReactNode {
  const toggleShortcut = useShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o');
  const showAllShortcut = useShortcutDisplay('transcript:toggleShowAll', 'Transcript', 'ctrl+e');
  return (
    <Box
      noSelect
      alignItems="center"
      alignSelf="center"
      borderTopDimColor
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderStyle="single"
      marginTop={1}
      paddingLeft={2}
      width="100%"
    >
      <Text dimColor>
        Showing detailed transcript · {toggleShortcut} to toggle
        {searchBadge
          ? ' · 按 n/N 键导航'
          : virtualScroll
            ? ` · ${figures.arrowUp}${figures.arrowDown} 滚动 · home/end 顶部/底部`
            : suppressShowAll
              ? ''
              : ` · ${showAllShortcut} 到 ${showAllInTranscript ? 'collapse' : 'show all'}`}
      </Text>
      {status ? (
        // v-for-editor 渲染进度 — 瞬态的，抢占搜索徽章，因为用户刚刚按下 v 并想看到正在发生的事情。4 秒后清除。
        <>
          <Box flexGrow={1} />
          <Text>{status} </Text>
        </>
      ) : searchBadge ? (
        // 引擎计数 — 对于粗略的位置提示来说足够接近。可能会因幽灵/幻影消息而与渲染计数存在偏差。
        // VML 尚未挂载 — 罕见情况，跳过指示器。
        <>
          <Box flexGrow={1} />
          <Text dimColor>
            {searchBadge.current}/{searchBadge.count}
            {'  '}
          </Text>
        </>
      ) : null}
    </Box>
  );
}

/** less 风格 / 栏。单行，与 TranscriptModeFooter 具有相同的上边框样式，
 * 以便在底部插槽中交换它们时不会改变 ScrollBox 的高度。
 * useSearchInput 处理 readline 编辑；我们报告查询更改并
 * 渲染计数器。增量式 — 每次按键都会重新搜索 + 高亮显示。 */
function TranscriptSearchBar({
  jumpRef,
  count,
  current,
  onClose,
  onCancel,
  setHighlight,
  initialQuery,
}: {
  jumpRef: RefObject<JumpHandle | null>;
  count: number;
  current: number;
  /** Enter — 提交。查询会持续用于 n/N。 */
  onClose: (lastQuery: string) => void;
  /** Esc/ctrl+c/ctrl+g — 撤销到先前状态。 */
  onCancel: () => void;
  setHighlight: (query: string) => void;
  // 使用先前的查询作为种子（less: / 显示上一个模式）。挂载时触发
  // 该副作用会使用相同的查询重新扫描 — 幂等（相同的匹配项、
  // 最近指针、相同的高亮）。用户可以编辑或清除。
  initialQuery: string;
}): React.ReactNode {
  const { query, cursorOffset } = useSearchInput({
    isActive: true,
    initialQuery,
    onExit: () => onClose(query),
    onCancel,
  });
  // 索引预热在查询副作用之前运行，以便测量真实的
  // 成本 — 否则 setSearchQuery 会先填充缓存，而预热
  // 报告约 0 毫秒，而用户却感受到了实际的延迟。
  // 转录会话中的第一次 / 需要支付 extractSearchText 的成本。
  // 后续的 / 立即返回 0（VML 中的 indexWarmed ref）。
  // 转录在 ctrl+o 时被冻结，因此缓存保持有效。
  // 初始状态为 'building'，因此在挂载时 warmDone 为 false — [query] 副作用
  // 等待预热副作用的首次解析完成，而不是与其竞争。如果
  // 初始值为 null，则挂载时 warmDone 为 true → [query] 触发 →
  // setSearchQuery 填充缓存 → 预热报告约 0 毫秒，而用户却
  // 感受到了真实的延迟。
  const [indexStatus, setIndexStatus] = React.useState<'building' | { ms: number } | null>('building');
  React.useEffect(() => {
    let alive = true;
    let hideTimeout: ReturnType<typeof setTimeout> | undefined;
    const warm = jumpRef.current?.warmSearchIndex;
    if (!warm) {
      setIndexStatus(null); // VML 尚未挂载 — 罕见情况，跳过指示器
      return;
    }
    setIndexStatus('building');
    warm().then(ms => {
      if (!alive) return;
      // <20 毫秒 = 无法察觉。显示“在 3 毫秒内建立索引”没有意义。
      if (ms < 20) {
        setIndexStatus(null);
      } else {
        setIndexStatus({ ms });
        hideTimeout = setTimeout(() => alive && setIndexStatus(null), 2000);
      }
    });
    return () => {
      alive = false;
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [jumpRef]); // mount-only per stable search bar ref
  // Gate the query effect on warm completion. setHighlight stays instant
  // (screen-space overlay, no indexing). setSearchQuery (the scan) waits.
  const warmDone = indexStatus !== 'building';
  useEffect(() => {
    if (!warmDone) return;
    jumpRef.current?.setSearchQuery(query);
    setHighlight(query);
  }, [jumpRef, query, setHighlight, warmDone]);
  const off = cursorOffset;
  const cursorChar = off < query.length ? query[off] : ' ';
  return (
    <Box
      borderTopDimColor
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderStyle="single"
      marginTop={1}
      paddingLeft={2}
      width="100%"
      // applySearchHighlight 会扫描整个屏幕缓冲区。这
      // 里渲染的查询文本确实在屏幕上 — /foo 匹配其自身在条中的 'f
      // oo'。如果没有内容匹配，这就是唯一可见的匹配项 → 获得 CURR
      // ENT 状态 → 带下划线。noSelect 使 searchHig
      // hlight.ts:76 跳过这些单元格（与边栏采用相同的排除规则
      // ）。你也不能文本选中该条；它是临时的界面装饰，没问题。
      noSelect
    >
      <Text>/</Text>
      <Text>{query.slice(0, off)}</Text>
      <Text inverse>{cursorChar}</Text>
      {off < query.length && <Text>{query.slice(off + 1)}</Text>}
      <Box flexGrow={1} />
      {indexStatus === 'building' ? (
        <Text dimColor>indexing… </Text>
      ) : indexStatus ? (
        <Text dimColor>indexed in {indexStatus.ms}ms </Text>
      ) : count === 0 && query ? (
        <Text color="error">no matches </Text>
      ) : count > 0 ? (
        // 引擎计数（基于 extractSearchText 的 inde
        // xOf）。可能与渲染计数因幽灵/幻影消息产生偏差 — 徽章仅作
        // 为大致位置提示。scanElement 能给出每条消息的精确位置
        // ，但统计所有消息的成本约为 ~1-3ms × 匹配消息数。
        <Text dimColor>
          {current}/{count}
          {'  '}
        </Text>
      ) : null}
    </Box>
  );
}

const TITLE_ANIMATION_FRAMES = ['⠂', '⠐'];
const TITLE_STATIC_PREFIX = '✳';
const TITLE_ANIMATION_INTERVAL_MS = 960;

/** * 设置终端标签页标题，在查询运行时显示带动画的前缀字形。与 REPL 隔离，
 * 因此 960 毫秒的动画计时器仅重新渲染此叶子组件（它返回 null — 纯副作用），
 * 而非整个 REPL 树。在提取之前，计时器在每次对话期间以约 1 次 REPL 渲染/秒的速度运行，
 * 拖拽着 PromptInput 及其相关组件。 */
function AnimatedTerminalTitle({
  isAnimating,
  title,
  disabled,
  noPrefix,
}: {
  isAnimating: boolean;
  title: string;
  disabled: boolean;
  noPrefix: boolean;
}): null {
  const terminalFocused = useTerminalFocus();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (disabled || noPrefix || !isAnimating || !terminalFocused) return;
    const interval = setInterval(
      setFrame => setFrame(f => (f + 1) % TITLE_ANIMATION_FRAMES.length),
      TITLE_ANIMATION_INTERVAL_MS,
      setFrame,
    );
    return () => clearInterval(interval);
  }, [disabled, noPrefix, isAnimating, terminalFocused]);
  const prefix = isAnimating ? (TITLE_ANIMATION_FRAMES[frame] ?? TITLE_STATIC_PREFIX) : TITLE_STATIC_PREFIX;
  useTerminalTitle(disabled ? null : noPrefix ? title : `${prefix} ${title}`);
  return null;
}

export type Props = {
  commands: Command[];
  debug: boolean;
  initialTools: Tool[];
  // 用于初始化 REPL 的初始消息
  initialMessages?: MessageType[];
  // 延迟钩子消息的 Promise —— REPL 立即渲染并注入
  // 钩子消息在其解析时注入。在首次 API 调用前等待。
  pendingHookMessages?: Promise<HookResultMessage[]>;
  initialFileHistorySnapshots?: FileHistorySnapshot[];
  // 来自恢复会话记录的内容替换记录 —— 用于
  // 重建 contentReplacementState，以便重新替换相同的结果
  initialContentReplacements?: ContentReplacementRecord[];
  // 用于会话恢复的初始智能体上下文（通过 /rename 或 /color 设置名称/颜色）
  initialAgentName?: string;
  initialAgentColor?: AgentColorName;
  mcpClients?: MCPServerConnection[];
  dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>;
  autoConnectIdeFlag?: boolean;
  strictMcpConfig?: boolean;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  // 查询执行前调用的可选回调
  // 在用户消息添加到对话后、API 调用前调用
  // 返回 false 以阻止查询执行
  onBeforeQuery?: (input: string, newMessages: MessageType[]) => Promise<boolean>;
  // 轮次完成时（模型完成响应）的可选回调
  onTurnComplete?: (messages: MessageType[]) => void | Promise<void>;
  // 为 true 时，禁用 REPL 输入（隐藏提示符并阻止消息选择器）
  disabled?: boolean;
  // 用于主线程的可选智能体定义
  mainThreadAgentDefinition?: AgentDefinition;
  // 为 true 时，禁用所有斜杠命令
  disableSlashCommands?: boolean;
  // 任务列表 ID：设置后，启用任务模式，监视任务列表并自动处理任务。
  taskListId?: string;
  // 用于 --remote 模式的远程会话配置（使用 CCR 作为执行引擎）
  remoteSessionConfig?: RemoteSessionConfig;
  // `claude connect` 模式的直连配置（连接到 claude 服务器）
  directConnectConfig?: DirectConnectConfig;
  // `claude ssh` 模式的 SSH 会话（本地 REPL，通过 ssh 的远程工具）
  sshSession?: SSHSession;
  // 启用思考功能时使用的思考配置
  thinkingConfig: ThinkingConfig;
};

export type Screen = 'prompt' | 'transcript';

export function REPL({
  commands: initialCommands,
  debug,
  initialTools,
  initialMessages,
  pendingHookMessages,
  initialFileHistorySnapshots,
  initialContentReplacements,
  initialAgentName,
  initialAgentColor,
  mcpClients: initialMcpClients,
  dynamicMcpConfig: initialDynamicMcpConfig,
  autoConnectIdeFlag,
  strictMcpConfig = false,
  systemPrompt: customSystemPrompt,
  appendSystemPrompt,
  onBeforeQuery,
  onTurnComplete,
  disabled = false,
  mainThreadAgentDefinition: initialMainThreadAgentDefinition,
  disableSlashCommands = false,
  taskListId,
  remoteSessionConfig,
  directConnectConfig,
  sshSession,
  thinkingConfig,
}: Props): React.ReactNode {
  const isRemoteSession = !!remoteSessionConfig;

  // 提升到挂载时的环境变量门控 —— isEnvTruthy 执行 toLowerCase+trim+
  // includes，并且这些在渲染路径上（在 PageUp 刷屏期间是热点）。
  const titleDisabled = useMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE), []);
  const moreRightEnabled = useMemo(
    () => process.env.USER_TYPE === 'ant' && isEnvTruthy(process.env.CLAUDE_MORERIGHT),
    [],
  );
  const disableVirtualScroll = useMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL), []);
  const disableMessageActions = feature('MESSAGE_ACTIONS')
    ? useMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_MESSAGE_ACTIONS), [])
    : false;

  // 记录 REPL 挂载/卸载生命周期
  useEffect(() => {
    logForDebugging(`[REPL:mount] REPL 已挂载，disabled=${disabled}`);
    return () => logForDebugging(`[REPL:unmount] REPL 正在卸载`);
  }, [disabled]);

  // 智能体定义是状态，因此 /resume 可以在会话中途更新它
  const [mainThreadAgentDefinition, setMainThreadAgentDefinition] = useState(initialMainThreadAgentDefinition);

  const toolPermissionContext = useAppState(s => s.toolPermissionContext);
  const verbose = useAppState(s => s.verbose);
  const mcp = useAppState(s => s.mcp);
  const plugins = useAppState(s => s.plugins);
  const agentDefinitions = useAppState(s => s.agentDefinitions);
  const fileHistory = useAppState(s => s.fileHistory);
  const initialMessage = useAppState(s => s.initialMessage);
  const queuedCommands = useCommandQueue();
  // feature() 是编译时常量 —— 死代码消除会移除钩子
  // 在外部构建中完全移除调用，因此尽管看起来有条件，但这是安全的。
  // 这些字段包含不得出现在外部构建中的排除字符串。
  const spinnerTip = useAppState(s => s.spinnerTip);
  const showExpandedTodos = useAppState(s => s.expandedView) === 'tasks';
  const pendingWorkerRequest = useAppState(s => s.pendingWorkerRequest);
  const pendingSandboxRequest = useAppState(s => s.pendingSandboxRequest);
  const teamContext = useAppState(s => s.teamContext);
  const tasks = useAppState(s => s.tasks);
  const workerSandboxPermissions = useAppState(s => s.workerSandboxPermissions);
  const elicitation = useAppState(s => s.elicitation);
  const ultraplanPendingChoice = useAppState(s => s.ultraplanPendingChoice);
  const ultraplanLaunchPending = useAppState(s => s.ultraplanLaunchPending);
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId);
  const setAppState = useSetAppState();

  // 引导：保留尚未加载磁盘的 local_agent → 读取
  // 侧链 JSONL 并与流迄今为止追加的内容进行 UUID 合并。
  // 流在保留时立即追加（不延迟）；引导填充
  // 前缀。Disk-write-before-yield 意味着 live 始终是 disk 的后缀。
  const viewedLocalAgent = viewingAgentTaskId ? tasks[viewingAgentTaskId] : undefined;
  const needsBootstrap = isLocalAgentTask(viewedLocalAgent) && viewedLocalAgent.retain && !viewedLocalAgent.diskLoaded;
  useEffect(() => {
    if (!viewingAgentTaskId || !needsBootstrap) return;
    const taskId = viewingAgentTaskId;
    void getAgentTranscript(asAgentId(taskId)).then(result => {
      setAppState(prev => {
        const t = prev.tasks[taskId];
        if (!isLocalAgentTask(t) || t.diskLoaded || !t.retain) return prev;
        const live = t.messages ?? [];
        const liveUuids = new Set(live.map(m => m.uuid));
        const diskOnly = result ? result.messages.filter(m => !liveUuids.has(m.uuid)) : [];
        return {
          ...prev,
          tasks: {
            ...prev.tasks,
            [taskId]: {
              ...t,
              messages: [...diskOnly, ...live],
              diskLoaded: true,
            },
          },
        };
      });
    });
  }, [viewingAgentTaskId, needsBootstrap, setAppState]);

  const store = useAppStateStore();
  const terminal = useTerminalNotification();
  const mainLoopModel = useMainLoopModel();

  // 注意：standaloneAgentContext 在 main.tsx 中初始化（通过 initialState）或
  // ResumeConversation.tsx 中初始化（通过渲染 REPL 前的 setAppState），以避免
  // 在挂载时使用基于 useEffect 的状态初始化（遵循 CLAUDE.md 指南）

  // 命令的本地状态（技能文件更改时可热重载）
  const [localCommands, setLocalCommands] = useState(initialCommands);

  // 监听技能文件变化并重新加载所有命令
  useSkillsChange(isRemoteSession ? undefined : getProjectRoot(), setLocalCommands);

  // 跟踪工具依赖的主动模式 - SleepTool 根据主动状态进行过滤
  const proactiveActive = React.useSyncExternalStore(
    proactiveModule?.subscribeToProactiveChanges ?? PROACTIVE_NO_OP_SUBSCRIBE,
    proactiveModule?.isProactiveActive ?? PROACTIVE_FALSE,
  );
  const proactiveNextTickAt = React.useSyncExternalStore<number | null>(
    proactiveModule?.subscribeToProactiveChanges ?? PROACTIVE_NO_OP_SUBSCRIBE,
    proactiveModule?.getNextTickAt ?? PROACTIVE_NULL,
  );

  // BriefTool.isEnabled() 从引导状态读取 getUserMsgOptIn()，而
  // /brief 会在会话中与 isBriefOnly 一同切换。下面的 memo 需要一个
  // React 可见的依赖项，以便在此发生时重新运行 getTools()；isBriefOnly 是
  // 触发重新渲染的 AppState 镜像。没有这个，在会话中切换
  // /brief 会留下过时的工具列表（没有 SendUserMessage），并且
  // 模型会输出简要过滤器隐藏的纯文本。
  const isBriefOnly = useAppState(s => s.isBriefOnly);

  const localTools = useMemo(
    () => getTools(toolPermissionContext),
    [toolPermissionContext, proactiveActive, isBriefOnly],
  );

  useKickOffCheckAndDisableAutoModeIfNeeded();

  const [dynamicMcpConfig, setDynamicMcpConfig] = useState<Record<string, ScopedMcpServerConfig> | undefined>(
    initialDynamicMcpConfig,
  );

  const onChangeDynamicMcpConfig = useCallback(
    (config: Record<string, ScopedMcpServerConfig>) => {
      setDynamicMcpConfig(config);
    },
    [setDynamicMcpConfig],
  );

  const [screen, setScreen] = useState<Screen>('prompt');
  const [showAllInTranscript, setShowAllInTranscript] = useState(false);
  // [ 强制在转录模式下使用 dump-to-scrollback 路径。与
  // CLAUDE_CODE_NO_FLICKER=0（进程生命周期）分开 — 这是
  // 临时的，在退出转录时重置。诊断逃生口，以便
  // 终端/tmux 原生 cmd-F 可以搜索完整的平面渲染。
  const [dumpMode, setDumpMode] = useState(false);
  // v-for-editor 渲染进度。内联在页脚 — 通知
  // 在 PromptInput 内渲染，而 PromptInput 在转录中未挂载。
  const [editorStatus, setEditorStatus] = useState('');
  // 在转录退出时递增。异步 v-render 在开始时捕获此值；
  // 如果过时，每次状态写入都会无操作（用户在渲染中途离开转录 —
  // 否则稳定的 setState 会将幽灵 toast 印记到下一个
  // 会话中）。同时清除任何待处理的 4 秒自动清除。
  const editorGenRef = useRef(0);
  const editorTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editorRenderingRef = useRef(false);
  const { addNotification, removeNotification } = useNotifications();

  // eslint-disable-next-line prefer-const
  let trySuggestBgPRIntercept = SUGGEST_BG_PR_NOOP;

  const mcpClients = useMergedClients(initialMcpClients, mcp.clients);

  // IDE 集成
  const [ideSelection, setIDESelection] = useState<IDESelection | undefined>(undefined);
  const [ideToInstallExtension, setIDEToInstallExtension] = useState<IdeType | null>(null);
  const [ideInstallationStatus, setIDEInstallationStatus] = useState<IDEExtensionInstallationStatus | null>(null);
  const [showIdeOnboarding, setShowIdeOnboarding] = useState(false);
  // 死代码消除：模型切换标注状态（仅限 ant）
  const [showModelSwitchCallout, setShowModelSwitchCallout] = useState(() => {
    if (process.env.USER_TYPE === 'ant') {
      return shouldShowAntModelSwitch();
    }
    return false;
  });
  const [showEffortCallout, setShowEffortCallout] = useState(() => shouldShowEffortCallout(mainLoopModel));
  const showRemoteCallout = useAppState(s => s.showRemoteCallout);
  const [showDesktopUpsellStartup, setShowDesktopUpsellStartup] = useState(() => shouldShowDesktopUpsellStartup());
  // 通知
  useModelMigrationNotifications();
  useCanSwitchToExistingSubscription();
  useIDEStatusIndicator({ ideSelection, mcpClients, ideInstallationStatus });
  useMcpConnectivityStatus({ mcpClients });
  usePluginInstallationStatus();
  usePluginAutoupdateNotification();
  useSettingsErrors();
  useRateLimitWarningNotification(mainLoopModel);
  useFastModeNotification();
  useDeprecationWarningNotification(mainLoopModel);
  useNpmDeprecationNotification();
  useAntOrgWarningNotification();
  useInstallMessages();
  useChromeExtensionNotification();
  useOfficialMarketplaceNotification();
  useLspInitializationNotification();
  useTeammateLifecycleNotification();
  const { recommendation: lspRecommendation, handleResponse: handleLspResponse } = useLspPluginRecommendation();
  const { recommendation: hintRecommendation, handleResponse: handleHintResponse } = useClaudeCodeHintRecommendation();

  // Memoize 组合的初始工具数组以防止引用更改
  const combinedInitialTools = useMemo(() => {
    return [...localTools, ...initialTools];
  }, [localTools, initialTools]);

  // 初始化插件管理
  useManagePlugins({ enabled: !isRemoteSession });

  const tasksV2 = useTasksV2WithCollapseEffect();

  // 启动后台插件安装

  // 安全：此代码保证仅在“信任此文件夹”对话框后运行
  // 已由用户确认。信任对话框显示在 cli.tsx 中（约第 387 行）
  // 在 REPL 组件渲染之前。该对话框会阻塞执行，直到用户
  // 接受，只有在此之后 REPL 组件才会挂载并运行此副作用。
  // 这确保了来自仓库和用户设置的插件安装只会在
  // 用户明确同意信任当前工作目录之后发生。
  useEffect(() => {
    if (isRemoteSession) return;
    void performStartupChecks(setAppState);
  }, [setAppState, isRemoteSession]);

  // 允许 Chrome MCP 中的 Claude 通过 MCP 通知发送提示
  // 并将权限模式更改同步到 Chrome 扩展
  usePromptsFromClaudeInChrome(isRemoteSession ? EMPTY_MCP_CLIENTS : mcpClients, toolPermissionContext.mode);

  // 初始化群组功能：队友钩子和上下文
  // 处理新创建的队友会话和恢复的队友会话
  useSwarmInitialization(setAppState, initialMessages, {
    enabled: !isRemoteSession,
  });

  const mergedTools = useMergedTools(combinedInitialTools, mcp.tools, toolPermissionContext);

  // 如果设置了 mainThreadAgentDefinition，则应用代理工具限制
  const { tools, allowedAgentTypes } = useMemo(() => {
    if (!mainThreadAgentDefinition) {
      return {
        tools: mergedTools,
        allowedAgentTypes: undefined as string[] | undefined,
      };
    }
    const resolved = resolveAgentTools(mainThreadAgentDefinition, mergedTools, false, true);
    return {
      tools: resolved.resolvedTools,
      allowedAgentTypes: resolved.allowedAgentTypes,
    };
  }, [mainThreadAgentDefinition, mergedTools]);

  // 合并来自本地状态、插件和 MCP 的命令
  const commandsWithPlugins = useMergedCommands(localCommands, plugins.commands as Command[]);
  const mergedCommands = useMergedCommands(commandsWithPlugins, mcp.commands as Command[]);
  // 如果 disableSlashCommands 为 true，则过滤掉所有命令
  const commands = useMemo(() => (disableSlashCommands ? [] : mergedCommands), [disableSlashCommands, mergedCommands]);

  useIdeLogging(isRemoteSession ? EMPTY_MCP_CLIENTS : mcp.clients);
  useIdeSelection(isRemoteSession ? EMPTY_MCP_CLIENTS : mcp.clients, setIDESelection);

  const [streamMode, setStreamMode] = useState<SpinnerMode>('responding');
  // 引用镜像，以便 onSubmit 可以读取最新值，而无需将
  // streamMode 添加到其依赖项中。streamMode 在流式传输期间
  // 每个回合在请求/响应/工具使用之间切换约 10 次；将其
  // 放在 onSubmit 的依赖项中会导致每次切换都重新创建 onSubmit，这
  // 会级联导致 PromptInput 属性变动和下游 useCallback/useMemo
  // 失效。回调中唯一的使用者是调试日志记录和
  // 遥测（handlePromptSubmit.ts），因此落后一个渲染周期的值是
  // 无害的——但引用镜像在每次渲染时都会同步，所以它总是最新的。
  const streamModeRef = useRef(streamMode);
  streamModeRef.current = streamMode;
  const [streamingToolUses, setStreamingToolUses] = useState<StreamingToolUse[]>([]);
  const [streamingThinking, setStreamingThinking] = useState<StreamingThinking | null>(null);

  // 完成 30 秒后自动隐藏流式思考
  useEffect(() => {
    if (streamingThinking && !streamingThinking.isStreaming && streamingThinking.streamingEndedAt) {
      const elapsed = Date.now() - streamingThinking.streamingEndedAt;
      const remaining = 30000 - elapsed;
      if (remaining > 0) {
        const timer = setTimeout(setStreamingThinking, remaining, null);
        return () => clearTimeout(timer);
      } else {
        setStreamingThinking(null);
      }
    }
  }, [streamingThinking]);

  const [abortController, setAbortController] = useState<AbortController | null>(null);
  // 始终指向当前中止控制器的引用，供 REPL 桥接器使用，
  // 以便在远程中断到达时中止活动查询。
  const abortControllerRef = useRef<AbortController | null>(null);
  abortControllerRef.current = abortController;

  // 桥接结果回调的引用——在 useReplBridge 初始化后设置，
  // 在 onQuery 的 finally 块中读取，以通知移动客户端回合已结束。
  const sendBridgeResultRef = useRef<() => void>(() => {});

  // 同步恢复回调的引用——在 restoreMessageSync 定义后设置，
  // 在 onQuery 的 finally 块中读取，用于中断时自动恢复。
  const restoreMessageSyncRef = useRef<(m: UserMessage) => void>(() => {});

  // 指向全屏布局滚动框的引用，用于键盘滚动。
  // 当全屏模式禁用时为 null（引用从未附加）。
  const scrollRef = useRef<ScrollBoxHandle>(null);
  // 模态槽内部 ScrollBox 的独立引用——通过传递
  // FullscreenLayout → ModalContext，以便 Tabs 可以将其附加到自身的
  // ScrollBox 以容纳高内容（例如 /status 的 MCP 服务器列表）。非
  // 键盘驱动 — ScrollKeybindingHandler 保留在外部 ref 上，因此
  // PgUp/PgDn/滚轮始终滚动模态框后面的对话记录。
  // 保留管道以便未来连接模态框滚动。
  const modalScrollRef = useRef<ScrollBoxHandle>(null);
  // 最后一次用户发起的滚动时间戳（滚轮、PgUp/PgDn、ctrl+u、
  // End/Home、G、拖拽滚动）。在 composedOnScroll 中标记 — 这是
  // ScrollKeybindingHandler 为每个用户滚动动作调用的唯一瓶颈点。
  // 程序化滚动（repinScroll 的 scrollToBottom、粘性自动跟随）
  // 不经过 composedOnScroll，因此不会标记此时间戳。使用 ref 而非
  // state：避免每次滚轮滚动都触发重新渲染。
  const lastUserScrollTsRef = useRef(0);

  // 查询生命周期的同步状态机。取代了容易出错的
  // 双状态模式，在该模式中 isLoading（React state，异步批处理）
  // 和 isQueryRunning（ref，同步）可能不同步。参见 QueryGuard.ts。
  const queryGuard = React.useRef(new QueryGuard()).current;

  // 订阅此 guard — 在调度或运行时为 true。
  // 这是判断“是否有本地查询正在执行”的唯一事实来源。
  const isQueryActive = React.useSyncExternalStore(queryGuard.subscribe, queryGuard.getSnapshot);

  // 用于本地查询 guard 之外操作的独立加载标志：
  // 远程会话（useRemoteSession / useDirectConnect）和前台化
  // 的后台任务（useSessionBackgrounding）。这些不经过
  // onQuery / queryGuard，因此需要自己的加载指示器可见性状态。
  // 如果远程模式带有初始提示（CCR 正在处理），则初始化为 true。
  const [isExternalLoading, setIsExternalLoadingRaw] = React.useState(remoteSessionConfig?.hasInitialPrompt ?? false);

  // 派生状态：任何加载源处于活动状态。只读 — 无 setter。本地查询
  // 加载由 queryGuard 驱动（reserve/tryStart/end/cancelReservation），
  // 外部加载由 setIsExternalLoading 驱动。
  const isLoading = isQueryActive || isExternalLoading;

  // SpinnerWithVerb 在每一帧根据这些 ref 计算耗时，
  // 避免了使用 useInterval 导致整个 REPL 重新渲染。
  const [userInputOnProcessing, setUserInputOnProcessingRaw] = React.useState<string | undefined>(undefined);
  // 设置 userInputOnProcessing 时 messagesRef.current.length 的值。
  // 一旦 displayedMessages 超过此值，占位符就会隐藏 — 即
  // 真实的用户消息已出现在可见的对话记录中。
  const userInputBaselineRef = React.useRef(0);
  // 当提交的提示正在处理但其用户消息
  // 尚未到达 setMessages。setMessages 利用此机制在窗口期内，当无关的异步消息（桥接状态、钩子结果、计划任务）到达时，保持基线同步。
  // 基线同步，当无关的异步消息（桥接状态、钩子
  // 结果、计划任务）在该窗口期内到达时。
  const userMessagePendingRef = React.useRef(false);

  // 用于精确计算已用时间的挂钟时间跟踪引用
  const loadingStartTimeRef = React.useRef<number>(0);
  const totalPausedMsRef = React.useRef(0);
  const pauseStartTimeRef = React.useRef<number | null>(null);
  const resetTimingRefs = React.useCallback(() => {
    loadingStartTimeRef.current = Date.now();
    totalPausedMsRef.current = 0;
    pauseStartTimeRef.current = null;
  }, []);

  // 当 isQueryActive 从 false 过渡到 true 时，内联重置计时引用。
  // queryGuard.reserve()（在 executeUserInput 中）在 processUserInput 的
  // 第一个 await 之前触发，但 onQuery 的 try 块中的引用重置在之后运行。在此期间，
  // React 使用 loadingStartTimeRef=0 渲染加载指示器，计算
  // elapsedTimeMs = Date.now() - 0 ≈ 56 年。此内联重置在首次观察到
  // isQueryActive 为 true 的渲染中运行——即首次显示加载指示器的同一渲染——
  // 因此当加载指示器读取该引用时，其值是正确的。参见 INC-4549。
  // 参见 INC-4549。
  const wasQueryActiveRef = React.useRef(false);
  if (isQueryActive && !wasQueryActiveRef.current) {
    resetTimingRefs();
  }
  wasQueryActiveRef.current = isQueryActive;

  // setIsExternalLoading 的包装器，在过渡到 true 时重置计时引用
  // —— SpinnerWithVerb 读取这些引用以计算已用时间，因此它们也必须为
  // 远程会话/前台任务重置（而不仅仅是本地查询，后者在 onQuery 中重置）。
  // 若无此操作，纯远程会话将显示约 56 年的已用时间（Date.now() - 0）。
  // 若无此操作，纯远程会话将显示约 56 年的已用时间（Date.now() - 0）。
  const setIsExternalLoading = React.useCallback(
    (value: boolean) => {
      setIsExternalLoadingRaw(value);
      if (value) resetTimingRefs();
    },
    [resetTimingRefs],
  );

  // 首次有群组队友运行的轮次开始时间
  // 用于计算延迟消息的总已用时间（包括队友执行时间）
  const swarmStartTimeRef = React.useRef<number | null>(null);
  const swarmBudgetInfoRef = React.useRef<{ tokens: number; limit: number; nudges: number } | undefined>(undefined);

  // 用于在回调中跟踪当前 focusedInputDialog 的引用
  // 这避免了在定时器回调中检查对话框状态时出现闭包过时问题
  const focusedInputDialogRef = React.useRef<ReturnType<typeof getFocusedInputDialog>>(undefined);

  // 最后一次按键后，延迟对话框显示前的等待时长
  const PROMPT_SUPPRESSION_MS = 1500;
  // 当用户正在主动输入时为 true——延迟中断对话框，以免按键
  // 意外关闭或回答用户尚未阅读的权限提示。
  const [isPromptInputActive, setIsPromptInputActive] = React.useState(false);

  const [autoUpdaterResult, setAutoUpdaterResult] = useState<AutoUpdaterResult | null>(null);

  useEffect(() => {
    if (autoUpdaterResult?.notifications) {
      autoUpdaterResult.notifications.forEach(notification => {
        addNotification({
          key: 'auto-updater-notification',
          text: notification,
          priority: 'low',
        });
      });
    }
  }, [autoUpdaterResult, addNotification]);

  // tmux + 全屏 + `mouse off`：一次性提示，说明滚轮不会滚动。
  // 我们不再修改 tmux 的会话范围鼠标选项（它曾污染
  // 相邻窗格）；tmux 用户已从 vim/less 中了解此权衡。
  useEffect(() => {
    if (isFullscreenEnvEnabled()) {
      void maybeGetTmuxMouseHint().then(hint => {
        if (hint) {
          addNotification({
            key: 'tmux-mouse-hint',
            text: hint,
            priority: 'low',
          });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showUndercoverCallout, setShowUndercoverCallout] = useState(false);
  useEffect(() => {
    if (process.env.USER_TYPE === 'ant') {
      void (async () => {
        // 等待仓库分类稳定（已记忆化，若已准备则无操作）。
        const { isInternalModelRepo } = await import('../utils/commitAttribution.js');
        await isInternalModelRepo();
        const { shouldShowUndercoverAutoNotice } = await import('../utils/undercover.js');
        if (shouldShowUndercoverAutoNotice()) {
          setShowUndercoverCallout(true);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [toolJSX, setToolJSXInternal] = useState<{
    jsx: React.ReactNode | null;
    shouldHidePromptInput: boolean;
    shouldContinueAnimation?: true;
    showSpinner?: boolean;
    isLocalJSXCommand?: boolean;
    isImmediate?: boolean;
  } | null>(null);

  // 将本地 JSX 命令单独追踪，防止工具覆盖它们。
  // 这使得“即时”命令（如 /btw）能在 Claude 处理时保持显示。
  const localJSXCommandRef = useRef<{
    jsx: React.ReactNode | null;
    shouldHidePromptInput: boolean;
    shouldContinueAnimation?: true;
    showSpinner?: boolean;
    isLocalJSXCommand: true;
  } | null>(null);

  // setToolJSX 的包装器，用于保留本地 JSX 命令（如 /btw）。
  // 当有本地 JSX 命令处于活动状态时，我们忽略来自工具的更新
  // 除非它们明确设置 clearLocalJSX: true（来自 onDone 回调）。
  //
  // 添加新的即时命令步骤：
  // 1. 在命令定义中设置 `immediate: true`
  // 2. 在命令的 JSX 中调用 setToolJSX 时设置 `isLocalJSXCommand: true`
  // 3. 在 onDone 回调中，使用 `setToolJSX({ jsx: null, shouldHidePromptInput: false, clearLocalJSX: true })`
  // 以便在用户关闭覆盖层时显式清除它
  const setToolJSX = useCallback(
    (
      args: {
        jsx: React.ReactNode | null;
        shouldHidePromptInput: boolean;
        shouldContinueAnimation?: true;
        showSpinner?: boolean;
        isLocalJSXCommand?: boolean;
        clearLocalJSX?: boolean;
      } | null,
    ) => {
      // 如果设置本地 JSX 命令，将其存储在 ref 中
      if (args?.isLocalJSXCommand) {
        const { clearLocalJSX: _, ...rest } = args;
        localJSXCommandRef.current = { ...rest, isLocalJSXCommand: true };
        setToolJSXInternal(rest);
        return;
      }

      // 如果 ref 中存在活动的本地 JSX 命令
      if (localJSXCommandRef.current) {
        // 仅当明确请求时才允许清除（来自 onDone 回调）
        if (args?.clearLocalJSX) {
          localJSXCommandRef.current = null;
          setToolJSXInternal(null);
          return;
        }
        // 否则，保持本地 JSX 命令可见——忽略工具更新
        return;
      }

      // 没有活动的本地 JSX 命令，允许任何更新
      if (args?.clearLocalJSX) {
        setToolJSXInternal(null);
        return;
      }
      setToolJSXInternal(args);
    },
    [],
  );
  const [toolUseConfirmQueue, setToolUseConfirmQueue] = useState<ToolUseConfirm[]>([]);
  // 由权限请求组件注册的粘性底部 JSX（目前
  // 仅 ExitPlanModePermissionRequest）。在 FullscreenLayout 的 `bottom`
  // 插槽中渲染，使用户在滚动长计划时响应选项保持可见。
  const [permissionStickyFooter, setPermissionStickyFooter] = useState<React.ReactNode | null>(null);
  const [sandboxPermissionRequestQueue, setSandboxPermissionRequestQueue] = useState<
    Array<{
      hostPattern: NetworkHostPattern;
      resolvePromise: (allowConnection: boolean) => void;
    }>
  >([]);
  const [promptQueue, setPromptQueue] = useState<
    Array<{
      request: PromptRequest;
      title: string;
      toolInputSummary?: string | null;
      resolve: (response: PromptResponse) => void;
      reject: (error: Error) => void;
    }>
  >([]);

  // 追踪沙箱权限请求的桥接清理函数，以便
  // 本地对话框处理程序能在本地用户先响应时取消远程提示。
  // 按主机键控以支持并发同主机请求。
  const sandboxBridgeCleanupRef = useRef<Map<string, Array<() => void>>>(new Map());

  // -- 终端标题管理
  // 会话标题（通过 /rename 设置或恢复时加载）优先于
  // 代理名称，代理名称优先于 Haiku 提取的主题；
  // 所有情况都回退到产品名称。
  const terminalTitleFromRename = useAppState(s => s.settings.terminalTitleFromRename) !== false;
  const sessionTitle = terminalTitleFromRename ? getCurrentSessionTitle(getSessionId()) : undefined;
  const [haikuTitle, setHaikuTitle] = useState<string>();
  // 控制生成标签标题的一次性 Haiku 调用。恢复时
  // 设为 true（存在 initialMessages），避免从对话中途的上下文重新标题化已恢复的会话。
  // 来自对话中途上下文的会话。
  const haikuTitleAttemptedRef = useRef((initialMessages?.length ?? 0) > 0);
  const agentTitle = mainThreadAgentDefinition?.agentType;
  const terminalTitle = sessionTitle ?? agentTitle ?? haikuTitle ?? 'Claude Code';
  const isWaitingForApproval =
    toolUseConfirmQueue.length > 0 || promptQueue.length > 0 || pendingWorkerRequest || pendingSandboxRequest;
  // 本地 JSX 命令（如 /plugin、/config）显示面向用户的对话框，
  // 等待输入。要求 jsx != null —— 如果标志卡在 true 但 jsx
  // 为 null，则视为未显示，以便 TextInput 焦点和队列处理器
  // 不会被幽灵覆盖层死锁。
  const isShowingLocalJSXCommand = toolJSX?.isLocalJSXCommand === true && toolJSX?.jsx != null;
  const titleIsAnimating = isLoading && !isWaitingForApproval && !isShowingLocalJSXCommand;
  // 标题动画状态位于 <AnimatedTerminalTitle> 中，因此 960ms 的计时器
  // 不会重新渲染 REPL。titleDisabled/terminalTitle 仍在此处计算
  // 因为 onQueryImpl 会读取它们（后台会话描述、
  // 俳句标题提取门控）。

  // 在 Claude 工作时阻止 macOS 进入睡眠状态
  useEffect(() => {
    if (isLoading && !isWaitingForApproval && !isShowingLocalJSXCommand) {
      startPreventSleep();
      return () => stopPreventSleep();
    }
  }, [isLoading, isWaitingForApproval, isShowingLocalJSXCommand]);

  const sessionStatus: TabStatusKind =
    isWaitingForApproval || isShowingLocalJSXCommand ? 'waiting' : isLoading ? 'busy' : 'idle';

  const waitingFor =
    sessionStatus !== 'waiting'
      ? undefined
      : toolUseConfirmQueue.length > 0
        ? `批准 ${toolUseConfirmQueue[0]!.tool.name}`
        : pendingWorkerRequest
          ? 'worker 请求'
          : pendingSandboxRequest
            ? 'sandbox 请求'
            : isShowingLocalJSXCommand
              ? '对话框打开'
              : '需要输入';

  // 将状态推送到 PID 文件供 `claude ps` 使用。采用即发即弃方式；当此信息缺失或过时时，ps 会
  // 回退到转录尾部推导。
  useEffect(() => {
    if (feature('BG_SESSIONS')) {
      void updateSessionActivity({ status: sessionStatus, waitingFor });
    }
  }, [sessionStatus, waitingFor]);

  // 第三方默认：关闭 —— OSC 21337 在规范稳定前仅供 ant 使用。
  // 设置门控，以便在侧边栏指示器与
  // 同时渲染两者的终端中的标题旋转器冲突时可以回滚。当标志
  // 开启时，面向用户的配置设置控制其是否激活。
  const tabStatusGateEnabled = getFeatureValue_CACHED_MAY_BE_STALE('tengu_terminal_sidebar', false);
  const showStatusInTerminalTab = tabStatusGateEnabled && (getGlobalConfig().showStatusInTerminalTab ?? false);
  useTabStatus(titleDisabled || !showStatusInTerminalTab ? null : sessionStatus);

  // 为进程内队友注册领导者的 setToolUseConfirmQueue
  useEffect(() => {
    registerLeaderToolUseConfirmQueue(setToolUseConfirmQueue);
    return () => unregisterLeaderToolUseConfirmQueue();
  }, [setToolUseConfirmQueue]);

  const [messages, rawSetMessages] = useState<MessageType[]>(initialMessages ?? []);
  const messagesRef = useRef(messages);
  // 存储已显示的 willowMode 变体（如果未显示提示，则为 false）。
  // 在 hint_shown 时捕获，以便 hint_converted 遥测报告相同的
  // 变体 —— GrowthBook 值不应在会话中途更改，但读取
  // 一次可确保配对事件之间的一致性。
  const idleHintShownRef = useRef<string | false>(false);
  // 包装 setMessages，以便在调用返回的瞬间 messagesRef 始终是最新的
  // —— 而不是在 React 稍后处理批次时。 立即对 ref 应用
  // 更新器，然后将计算出的值交给 React
  // （而不是函数）。 rawSetMessages 批处理变为最后写入获胜，
  // 且最后一次写入是正确的，因为每次调用都基于
  // 已更新的 ref 进行组合。 这是 Zustand 模式：ref 是
  // 实际上，React 状态是渲染投影。没有这个，那些先排队功能更新器然后同步读取引用
  // （例如 handleSpeculationAccept → onQuery）的路径会看到陈旧数据。
  // 收缩（压缩/回退/清除）——进行限制，使得 placeholderText 的长度
  const setMessages = useCallback((action: React.SetStateAction<MessageType[]>) => {
    const prev = messagesRef.current;
    const next = typeof action === 'function' ? action(messagesRef.current) : action;
    messagesRef.current = next;
    if (next.length < userInputBaselineRef.current) {
      // 检查不会变得陈旧。
      // 在提交的用户消息尚未落地时增长。如果
      userInputBaselineRef.current = 0;
    } else if (next.length > prev.length && userMessagePendingRef.current) {
      // 新增的消息不包含它（桥接状态、钩子结果、
      // 在 processUserInputBase 期间异步落地的计划任务），则提升
      // 基线，以便占位符保持可见。一旦用户消息
      // 落地，就停止追踪——后续的添加（助手流）
      // 不应重新显示占位符。
      // 捕获基线消息数量以及占位符文本，以便
      const delta = next.length - prev.length;
      const added = prev.length === 0 || next[0] === prev[0] ? next.slice(-delta) : next.slice(0, delta);
      if (added.some(isHumanTurn)) {
        userMessagePendingRef.current = false;
      } else {
        userInputBaselineRef.current = next.length;
      }
    }
    rawSetMessages(next);
  }, []);
  // 当 displayedMessages 增长超过基线时，渲染可以隐藏它。
  // 全屏模式：追踪未读分隔符位置。dividerIndex 仅
  const setUserInputOnProcessing = useCallback((input: string | undefined) => {
    if (input !== undefined) {
      userInputBaselineRef.current = messagesRef.current.length;
      userMessagePendingRef.current = true;
    } else {
      userMessagePendingRef.current = false;
    }
    setUserInputOnProcessingRaw(input);
  }, []);
  // 在每次滚动会话中变化约两次（首次滚动离开 + 重新固定）。pillVisible
  // 和 stickyPrompt 现在位于 FullscreenLayout 中——它们直接订阅
  // ScrollBox，因此每帧滚动永远不会重新渲染 REPL。
  // 已记忆化，以便 Messages 的 React.memo 保持。
  const { dividerIndex, dividerYRef, onScrollAway, onRepin, jumpToNew, shiftDivider } = useUnseenDivider(
    messages.length,
  );
  if (feature('AWAY_SUMMARY')) {
    useAwaySummary(messages, setMessages, isLoading);
  }
  const [cursor, setCursor] = useState<MessageActionsState | null>(null);
  const cursorNavRef = useRef<MessageActionsNav | null>(null);
  // 将滚动重新固定到底部并清除未读消息基线。在
  const unseenDivider = useMemo(
    () => computeUnseenDivider(messages, dividerIndex),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 长度变化覆盖追加操作；useUnseenDivider 的计数下降保护会在替换/回退时清除 dividerIndex
    [dividerIndex, messages.length],
  );
  // 任何用户驱动的返回实时操作（提交、在空输入框中键入、
  // 覆盖层出现/消失）时调用。
  // 作为 onSubmit 处提交处理器重新固定的后备方案。如果缓冲的 stdin
  const repinScroll = useCallback(() => {
    scrollRef.current?.scrollToBottom();
    onRepin();
    setCursor(null);
  }, [onRepin, setCursor]);
  // 事件（滚轮/拖拽）在处理器触发和状态提交之间发生竞争，
  // 处理器的 scrollToBottom 可能会被撤销。此效果在用户消息
  // 实际落地的渲染时触发——与 React 的提交周期绑定，
  // 因此不会与 stdin 竞争。基于 lastMsg 标识（而非 messages.length）
  // 进行键控，因此 useAssistantHistory 的预置不会错误地触发重新固定。
  // 助手聊天：在向上滚动时懒加载远程历史记录。除非是
  const lastMsg = messages.at(-1);
  const lastMsgIsHuman = lastMsg != null && isHumanTurn(lastMsg);
  useEffect(() => {
    if (lastMsgIsHuman) {
      repinScroll();
    }
  }, [lastMsgIsHuman, lastMsg, repinScroll]);
  // KAIROS 构建 + config.viewerOnly，否则无操作。feature() 是构建时常量，因此
  // 该分支在非 KAIROS 构建中会被死代码消除（相同模式
  // 该分支在非 KAIROS 构建中会被死代码消除（相同模式
  // （如上方的 useUnseenDivider）。
  const { maybeLoadOlder } = feature('KAIROS')
    ? useAssistantHistory({
        config: remoteSessionConfig,
        setMessages,
        scrollRef,
        onPrepend: shiftDivider,
      })
    : HISTORY_STUB;
  // 将 useUnseenDivider 的回调与懒加载触发器组合使用。
  const composedOnScroll = useCallback(
    (sticky: boolean, handle: ScrollBoxHandle) => {
      lastUserScrollTsRef.current = Date.now();
      if (sticky) {
        onRepin();
      } else {
        onScrollAway(handle);
        if (feature('KAIROS')) maybeLoadOlder(handle);
        // 滚动时关闭伴随气泡——它是绝对定位的
        // 位于右下角，会覆盖对话内容。滚动意味着用户
        // 正试图阅读其下方的某些内容。
        if (feature('BUDDY')) {
          setAppState(prev =>
            prev.companionReaction === undefined ? prev : { ...prev, companionReaction: undefined },
          );
        }
      }
    },
    [onRepin, onScrollAway, maybeLoadOlder, setAppState],
  );
  // 延迟的 SessionStart 钩子消息——REPL 立即渲染，
  // 钩子消息在解析后注入。awaitPendingHooks()
  // 必须在首次 API 调用前调用，以便模型能感知钩子上下文。
  const awaitPendingHooks = useDeferredHookMessages(pendingHookMessages, setMessages);

  // Deferred messages for the Messages component — renders at transition
  // priority so the reconciler yields every 5ms, keeping input responsive
  // while the expensive message processing pipeline runs.
  // Cap at 500 messages to limit memory double-buffering. The bypass
  // at display-time uses sync messages during streaming and non-loading,
  // so this cap only affects reduced-motion scenarios.
  const DEFERRED_CAP = 500;
  const cappedMessages = React.useMemo(
    () => (messages.length > DEFERRED_CAP ? messages.slice(-DEFERRED_CAP) : messages),
    [messages],
  );
  const deferredMessages = useDeferredValue(cappedMessages);
  const deferredBehind = messages.length - deferredMessages.length;
  if (deferredBehind > 0) {
    logForDebugging(`[useDeferredValue] 消息延迟 ${deferredBehind} (${deferredMessages.length}→${messages.length})`);
  }

  // 对话模式的冻结状态——存储长度而非克隆数组以提高内存效率
  const [frozenTranscriptState, setFrozenTranscriptState] = useState<{
    messagesLength: number;
    streamingToolUsesLength: number;
  } | null>(null);
  // 使用任何在 REPL 就绪前捕获的早期输入来初始化输入。
  // 使用惰性初始化确保 PromptInput 中的光标偏移量设置正确。
  const [inputValue, setInputValueRaw] = useState(() => consumeEarlyInput());
  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const insertTextRef = useRef<{
    insert: (text: string) => void;
    setInputWithCursor: (value: string, cursor: number) => void;
    cursorOffset: number;
  } | null>(null);

  // 包装 setInputValue 以将抑制状态更新放在同一位置。
  // 两个 setState 调用发生在同一个同步上下文中，因此 React
  // 将它们批处理为一次渲染，消除了之前
  // useEffect → setState 模式导致的额外渲染。
  const setInputValue = useCallback(
    (value: string) => {
      if (trySuggestBgPRIntercept(inputValueRef.current, value)) return;
      // 在全屏模式下，向空提示符输入内容会将滚动重新固定到
      // 底部。仅在空→非空时触发，因此在撰写消息时向上滚动
      // 参考内容不会在每次按键时都将视图拉回。恢复了全屏前
      // 通过输入快速回到对话末尾的肌肉记忆。
      // 如果用户在过去 3 秒内滚动过则跳过——他们正在主动
      // 阅读，而非迷失。lastUserScrollTsRef 初始为 0，因此首次
      // 按键（尚未滚动）总是会重新固定。
      // 立即同步引用（如 setMessages），以便在 React 提交前读取
      if (
        inputValueRef.current === '' &&
        value !== '' &&
        Date.now() - lastUserScrollTsRef.current >= RECENT_SCROLL_REPIN_WINDOW_MS
      ) {
        repinScroll();
      }
      // inputValueRef 的调用方——例如自动恢复 finally
      // 块中的 `=== ''` 守卫——能看到新值，而非过时的渲染值。
      // 块的 `=== ''` 守卫 —— 看到的是新值，而非过时的渲染值。
      inputValueRef.current = value;
      setInputValueRaw(value);
      setIsPromptInputActive(value.trim().length > 0);
    },
    [setIsPromptInputActive, repinScroll, trySuggestBgPRIntercept],
  );

  // 设置超时，在用户停止输入后停止抑制对话框。
  // 仅管理超时——立即激活由上面的 setInputValue 处理。
  useEffect(() => {
    if (inputValue.trim().length === 0) return;
    const timer = setTimeout(setIsPromptInputActive, PROMPT_SUPPRESSION_MS, false);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const [inputMode, setInputMode] = useState<PromptInputMode>('prompt');
  const [stashedPrompt, setStashedPrompt] = useState<
    | {
        text: string;
        cursorOffset: number;
        pastedContents: Record<number, PastedContent>;
      }
    | undefined
  >();

  // 根据 CCR 可用的斜杠命令过滤命令的回调函数
  const handleRemoteInit = useCallback(
    (remoteSlashCommands: string[]) => {
      const remoteCommandSet = new Set(remoteSlashCommands);
      // 保留 CCR 列出的命令或位于本地安全集合中的命令
      setLocalCommands(prev => prev.filter(cmd => remoteCommandSet.has(cmd.name) || REMOTE_SAFE_COMMANDS.has(cmd)));
    },
    [setLocalCommands],
  );

  const [inProgressToolUseIDs, setInProgressToolUseIDs] = useState<Set<string>>(new Set());
  const hasInterruptibleToolInProgressRef = useRef(false);

  // 远程会话钩子 - 管理 --remote 模式的 WebSocket 连接和消息处理
  const remoteSession = useRemoteSession({
    config: remoteSessionConfig,
    setMessages,
    setIsLoading: setIsExternalLoading,
    onInit: handleRemoteInit,
    setToolUseConfirmQueue,
    tools: combinedInitialTools,
    setStreamingToolUses,
    setStreamMode,
    setInProgressToolUseIDs,
  });

  // 直连钩子 - 为 `claude connect` 模式管理到 claude 服务器的 WebSocket
  const directConnect = useDirectConnect({
    config: directConnectConfig,
    setMessages,
    setIsLoading: setIsExternalLoading,
    setToolUseConfirmQueue,
    tools: combinedInitialTools,
  });

  // SSH 会话钩子 - 为 `claude ssh` 模式管理 ssh 子进程。
  // 与 useDirectConnect 的回调函数形状相同；只是底层的传输
  // 方式不同（ChildProcess stdin/stdout 对比 WebSocket）。
  const sshRemote = useSSHSession({
    session: sshSession,
    setMessages,
    setIsLoading: setIsExternalLoading,
    setToolUseConfirmQueue,
    tools: combinedInitialTools,
  });

  // 使用当前处于活动状态的任一远程模式
  const activeRemote = sshRemote.isRemoteMode ? sshRemote : directConnect.isRemoteMode ? directConnect : remoteSession;

  const [pastedContents, setPastedContents] = useState<Record<number, PastedContent>>({});
  const [submitCount, setSubmitCount] = useState(0);
  // 使用 Ref 而非 state，以避免每次流式 text_delta 都触发 React
  // 重新渲染。旋转指示器通过其动画定时器读取此值。
  const responseLengthRef = useRef(0);
  // 仅用于 ant 旋转指示器显示的 API 性能指标 ref（TTFT/OTPS）。
  // 累积一轮中所有 API 请求的指标，用于 P50 聚合。
  const apiMetricsRef = useRef<
    Array<{
      ttftMs: number;
      firstTokenTime: number;
      lastTokenTime: number;
      responseLengthBaseline: number;
      // 追踪最后一次内容添加时的 responseLengthRef。
      // 由流式增量（deltas）和子代理消息内容更新。
      // lastTokenTime 也在同一时间更新，因此 OTPS
      // 的分母正确地包含了子代理处理时间。
      endResponseLength: number;
    }>
  >([]);
  const setResponseLength = useCallback((f: (prev: number) => number) => {
    const prev = responseLengthRef.current;
    responseLengthRef.current = f(prev);
    // 当添加内容时（非压缩重置），更新最新的
    // 指标条目，使 OTPS 反映所有内容生成活动。
    // 在此处更新 lastTokenTime 确保分母同时包含
    // 流式时间和子代理执行时间，防止数值虚高。
    if (responseLengthRef.current > prev) {
      const entries = apiMetricsRef.current;
      if (entries.length > 0) {
        const lastEntry = entries.at(-1)!;
        lastEntry.lastTokenTime = Date.now();
        lastEntry.endResponseLength = responseLengthRef.current;
      }
    }
  }, []);

  // 流式文本显示：根据每个增量直接设置状态（Ink 的 16ms 渲染
  // 节流会批量处理快速更新）。在消息到达时清除（messages.ts）
  // 以便 displayedMessages 原子性地从 deferredMessages 切换到 messages。
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const reducedMotion = useAppState(s => s.settings.prefersReducedMotion) ?? false;
  const showStreamingText = !reducedMotion && !hasCursorUpViewportYankBug();
  const onStreamingText = useCallback(
    (f: (current: string | null) => string | null) => {
      if (!showStreamingText) return;
      setStreamingText(f);
    },
    [showStreamingText],
  );

  // 隐藏进行中的源代码行，使文本逐行流式显示，而非
  // 逐字符显示。当没有换行符时，lastIndexOf 返回 -1，给出 '' → null。
  // 对 showStreamingText 进行防护，以便在流式传输中途切换 reducedMotion
  // 时能立即隐藏流式预览。
  const visibleStreamingText =
    streamingText && showStreamingText ? streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null : null;

  const [lastQueryCompletionTime, setLastQueryCompletionTime] = useState(0);
  const [spinnerMessage, setSpinnerMessage] = useState<string | null>(null);
  const [spinnerColor, setSpinnerColor] = useState<keyof Theme | null>(null);
  const [spinnerShimmerColor, setSpinnerShimmerColor] = useState<keyof Theme | null>(null);
  const [isMessageSelectorVisible, setIsMessageSelectorVisible] = useState(false);
  const [messageSelectorPreselect, setMessageSelectorPreselect] = useState<UserMessage | undefined>(undefined);
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [conversationId, setConversationId] = useState(randomUUID());

  // 空闲返回对话框：当用户在长时间空闲间隔后提交时显示
  const [idleReturnPending, setIdleReturnPending] = useState<{
    input: string;
    idleMinutes: number;
  } | null>(null);
  const skipIdleCheckRef = useRef(false);
  const lastQueryCompletionTimeRef = useRef(lastQueryCompletionTime);
  lastQueryCompletionTimeRef.current = lastQueryCompletionTime;

  // 聚合工具结果预算：按对话决策追踪。
  // 当 GrowthBook 标志开启时，query.ts 强制执行预算；当
  // 关闭（未定义）时，完全跳过强制执行。在 /clear、回退或压缩后
  // 的陈旧条目是无害的（tool_use_ids 是 UUID，陈旧的
  // 键永远不会被查找）。内存受限于 REPL 生命周期内的总替换次数
  // × 约 2KB 预览——可忽略不计。
  //
  // 通过 useState 初始化器惰性初始化——useRef(expr) 在每次
  // 渲染时都会计算 expr（React 在首次后忽略它，但计算仍会运行）。
  // 对于大型恢复的会话，重建需要 O(消息数 × 块数)
  // 的工作量；我们只希望执行一次。
  const [contentReplacementStateRef] = useState(() => ({
    current: provisionContentReplacementState(initialMessages, initialContentReplacements),
  }));
  registerCompactCleanup(() => {
    contentReplacementStateRef.current = createContentReplacementState();
  });

  const [haveShownCostDialog, setHaveShownCostDialog] = useState(getGlobalConfig().hasAcknowledgedCostThreshold);
  const [vimMode, setVimMode] = useState<VimMode>('INSERT');
  const [showBashesDialog, setShowBashesDialog] = useState<string | boolean>(false);
  const [isSearchingHistory, setIsSearchingHistory] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // showBashesDialog 是 REPL 级别的，因此它在 PromptInput 卸载后仍存在。
  // 当药丸对话框打开时触发 ultraplan 批准，PromptInput
  // 会卸载（focusedInputDialog → 'ultraplan-choice'），但此状态保持为真；
  // 接受后，PromptInput 重新挂载到一个空的“无任务”对话框
  // （已完成的 ultraplan 任务已被过滤掉）。在此处关闭它。
  useEffect(() => {
    if (ultraplanPendingChoice && showBashesDialog) {
      setShowBashesDialog(false);
    }
  }, [ultraplanPendingChoice, showBashesDialog]);

  const isTerminalFocused = useTerminalFocus();
  const terminalFocusRef = useRef(isTerminalFocused);
  terminalFocusRef.current = isTerminalFocused;

  const [theme] = useTheme();

  // resetLoadingState 每轮运行两次（onQueryImpl 尾部 + onQuery finally）。
  // 没有此防护，两次调用都会选择一个提示 → 两次 recordShownTip → 两次
  // saveGlobalConfig 连续写回。在 onSubmit 的提交处重置。
  const tipPickedThisTurnRef = React.useRef(false);
  const pickNewSpinnerTip = useCallback(() => {
    if (tipPickedThisTurnRef.current) return;
    tipPickedThisTurnRef.current = true;
    const newMessages = messagesRef.current.slice(bashToolsProcessedIdx.current);
    for (const tool of extractBashToolsFromMessages(newMessages)) {
      bashTools.current.add(tool);
    }
    bashToolsProcessedIdx.current = messagesRef.current.length;
    void getTipToShowOnSpinner({
      theme,
      readFileState: readFileState.current,
      bashTools: bashTools.current,
    }).then(async tip => {
      if (tip) {
        const content = await tip.content({ theme });
        setAppState(prev => ({
          ...prev,
          spinnerTip: content,
        }));
        recordShownTip(tip);
      } else {
        setAppState(prev => {
          if (prev.spinnerTip === undefined) return prev;
          return { ...prev, spinnerTip: undefined };
        });
      }
    });
  }, [setAppState, theme]);

  // 重置 UI 加载状态。不调用 onTurnComplete——该函数应
  // 仅在查询轮次实际完成时显式调用。
  const resetLoadingState = useCallback(() => {
    // isLoading 现在派生自 queryGuard——无需调用 setter。
    // queryGuard.end()（onQuery finally）或 cancelReservation()（executeUserInput
    // finally）在此函数运行时已将防护转换为空闲状态。
    // 外部加载（远程/后台化）由那些钩子单独重置。
    setIsExternalLoading(false);
    setUserInputOnProcessing(undefined);
    responseLengthRef.current = 0;
    apiMetricsRef.current = [];
    setStreamingText(null);
    setStreamingToolUses([]);
    setSpinnerMessage(null);
    setSpinnerColor(null);
    setSpinnerShimmerColor(null);
    pickNewSpinnerTip();
    endInteractionSpan();
    // 推测性 bash 分类器检查仅对当前
    // 轮次的命令有效——每轮后清除，以避免为未消耗的
    // 检查（被拒绝/中止的路径）累积 Promise 链。
    clearSpeculativeChecks();
  }, [pickNewSpinnerTip]);

  // 会话后台化——钩子在下方，位于 getToolUseContext 之后

  const hasRunningTeammates = useMemo(
    () => getAllInProcessTeammateTasks(tasks).some(t => t.status === 'running'),
    [tasks],
  );

  // 当所有群组队友完成时，显示延迟轮次时长消息
  useEffect(() => {
    if (!hasRunningTeammates && swarmStartTimeRef.current !== null) {
      const totalMs = Date.now() - swarmStartTimeRef.current;
      const deferredBudget = swarmBudgetInfoRef.current;
      swarmStartTimeRef.current = null;
      swarmBudgetInfoRef.current = undefined;
      setMessages(prev => [
        ...prev,
        createTurnDurationMessage(
          totalMs,
          deferredBudget,
          // 仅统计 recordTranscript 将持久化的内容 — 临
          // 时的进度标记和非 ant 附件会被 isLoggableMe
          // ssage 过滤，永远不会写入磁盘。使用原始的 prev.lengt
          // h 会导致 checkResumeConsistency 为每个
          // 运行了产生进度工具的回合报告错误的 delta<0。
          count(prev, isLoggableMessage),
        ),
      ]);
    }
  }, [hasRunningTeammates, setMessages]);

  // 进入自动模式时显示自动权限警告
  // （通过 Shift+Tab 切换或启动时触发）。已进行防抖处理，以避免
  // 用户在快速切换模式时出现闪烁。
  // 在整个会话期间最多只显示 3 次。
  const safeYoloMessageShownRef = useRef(false);
  useEffect(() => {
    if (feature('TRANSCRIPT_CLASSIFIER')) {
      if (toolPermissionContext.mode !== 'auto') {
        safeYoloMessageShownRef.current = false;
        return;
      }
      if (safeYoloMessageShownRef.current) return;
      const config = getGlobalConfig();
      const count = config.autoPermissionsNotificationCount ?? 0;
      if (count >= 3) return;
      const timer = setTimeout(
        (ref, setMessages) => {
          ref.current = true;
          saveGlobalConfig(prev => {
            const prevCount = prev.autoPermissionsNotificationCount ?? 0;
            if (prevCount >= 3) return prev;
            return {
              ...prev,
              autoPermissionsNotificationCount: prevCount + 1,
            };
          });
          setMessages(prev => [...prev, createSystemMessage(AUTO_MODE_DESCRIPTION, 'warning')]);
        },
        800,
        safeYoloMessageShownRef,
        setMessages,
      );
      return () => clearTimeout(timer);
    }
  }, [toolPermissionContext.mode, setMessages]);

  // 如果工作区创建缓慢且未配置稀疏检出，
  // 则提示用户设置 worktree.sparsePaths。
  const worktreeTipShownRef = useRef(false);
  useEffect(() => {
    if (worktreeTipShownRef.current) return;
    const wt = getCurrentWorktreeSession();
    if (!wt?.creationDurationMs || wt.usedSparsePaths) return;
    if (wt.creationDurationMs < 15_000) return;
    worktreeTipShownRef.current = true;
    const secs = Math.round(wt.creationDurationMs / 1000);
    setMessages(prev => [
      ...prev,
      createSystemMessage(
        `工作区创建耗时 ${secs} 秒。对于大型仓库，请在 .claude/settings.json 中设置 \`worktree.sparsePaths\` 以仅检出所需目录 —— 例如 \`{"worktree": {"sparsePaths": ["src", "packages/foo"]}}\`。`,
        'info',
      ),
    ]);
  }, [setMessages]);

  // 当唯一进行中的工具是 Sleep 时隐藏加载指示器
  const onlySleepToolActive = useMemo(() => {
    const lastAssistant = messages.findLast(m => m.type === 'assistant');
    if (lastAssistant?.type !== 'assistant') return false;
    const content = lastAssistant.message?.content;
    const contentArray = Array.isArray(content) ? content : [];
    const inProgressToolUses = contentArray.filter(
      (b): b is ContentBlock & { type: 'tool_use'; id: string } =>
        b.type === 'tool_use' && inProgressToolUseIDs.has((b as { id: string }).id),
    );
    return (
      inProgressToolUses.length > 0 &&
      inProgressToolUses.every(b => b.type === 'tool_use' && b.name === SLEEP_TOOL_NAME)
    );
  }, [messages, inProgressToolUseIDs]);

  const {
    onBeforeQuery: mrOnBeforeQuery,
    onTurnComplete: mrOnTurnComplete,
    render: mrRender,
  } = useMoreRight({
    enabled: moreRightEnabled,
    setMessages,
    inputValue,
    setInputValue,
    setToolJSX,
  });

  const showSpinner =
    (!toolJSX || toolJSX.showSpinner === true) &&
    toolUseConfirmQueue.length === 0 &&
    promptQueue.length === 0 &&
    // 在输入处理、API 调用、队友运行期间或待处
    // 理任务通知排队时显示加载指示器（防止连续通知间的指示器跳动）
    (isLoading ||
      userInputOnProcessing ||
      hasRunningTeammates ||
      // 当任务通知排队等待处理时，保持加载指示器可见。没有
      // 此逻辑，指示器会在连续通知之间短暂消失（例如，多个后台
      // 智能体快速连续完成），因为 isLoading 在
      // 处理每个通知的间隙会短暂变为 false。
      getCommandQueueLength() > 0) &&
    // 等待负责人批准权限请求时隐藏加载指示器
    !pendingWorkerRequest &&
    !onlySleepToolActive &&
    // 当流式文本可见时隐藏加载指示器（文本本身就是反馈），但当
    // isBriefOnly 抑制流式文本显示时保持指示器
    (!visibleStreamingText || isBriefOnly);

  // 检查当前是否有任何权限请求或询问提示可见
  // 用于防止在提示框活跃时打开调查问卷
  const hasActivePrompt =
    toolUseConfirmQueue.length > 0 ||
    promptQueue.length > 0 ||
    sandboxPermissionRequestQueue.length > 0 ||
    elicitation.queue.length > 0 ||
    workerSandboxPermissions.queue.length > 0;

  const feedbackSurveyOriginal = useFeedbackSurvey(messages, isLoading, submitCount, 'session', hasActivePrompt);

  const skillImprovementSurvey = useSkillImprovementSurvey(setMessages);

  const showIssueFlagBanner = useIssueFlagBanner(messages, submitCount);

  // 包装反馈调查处理程序以触发自动运行 /issue
  const feedbackSurvey = useMemo(
    () => ({
      ...feedbackSurveyOriginal,
      handleSelect: (selected: 'dismissed' | 'bad' | 'fine' | 'good') => {
        // 当收到新的调查响应时重置引用
        didAutoRunIssueRef.current = false;
        const showedTranscriptPrompt = feedbackSurveyOriginal.handleSelect(selected);
        // 如果未显示转录提示，则为“差评”自动运行 /issue
        if (selected === 'bad' && !showedTranscriptPrompt && shouldAutoRunIssue('feedback_survey_bad')) {
          setAutoRunIssueReason('feedback_survey_bad');
          didAutoRunIssueRef.current = true;
        }
      },
    }),
    [feedbackSurveyOriginal],
  );

  // 压缩后调查：在压缩完成后显示（如果功能开关已启用）
  const postCompactSurvey = usePostCompactSurvey(messages, isLoading, hasActivePrompt, { enabled: !isRemoteSession });

  // 内存调查：当助手提及内存且本次对话中
  // 读取了内存文件时显示
  const memorySurvey = useMemorySurvey(messages, isLoading, hasActivePrompt, {
    enabled: !isRemoteSession,
  });

  // 挫折检测：检测到沮丧消息后显示转录分享提示
  const frustrationDetection = useFrustrationDetection(
    messages,
    isLoading,
    hasActivePrompt,
    feedbackSurvey.state !== 'closed' || postCompactSurvey.state !== 'closed' || memorySurvey.state !== 'closed',
  );

  // 初始化 IDE 集成
  useIDEIntegration({
    autoConnectIdeFlag,
    ideToInstallExtension,
    setDynamicMcpConfig,
    setShowIdeOnboarding,
    setIDEInstallationState: setIDEInstallationStatus,
  });

  useFileHistorySnapshotInit(initialFileHistorySnapshots, fileHistory, fileHistoryState =>
    setAppState(prev => ({
      ...prev,
      fileHistory: fileHistoryState,
    })),
  );

  const resume = useCallback(
    async (sessionId: UUID, log: LogOption, entrypoint: ResumeEntrypoint) => {
      const resumeStart = performance.now();
      try {
        // 反序列化消息以正确清理对话
        // 此操作过滤未解决的工具使用，并在需要时添加合成的助手消息
        const messages = deserializeMessages(log.messages);

        // 将协调器/普通模式与恢复的会话匹配
        if (feature('COORDINATOR_MODE')) {
          /* eslint-disable @typescript-eslint/no-require-imports */
          const coordinatorModule =
            require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js');
          /* eslint-enable @typescript-eslint/no-require-imports */
          const warning = coordinatorModule.matchSessionMode(log.mode);
          if (warning) {
            // 在模式切换后重新推导代理定义，使内置代理
            // 反映新的协调器/普通模式
            /* eslint-disable @typescript-eslint/no-require-imports */
            const { getAgentDefinitionsWithOverrides, getActiveAgentsFromList } =
              require('@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js') as typeof import('@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js');
            /* eslint-enable @typescript-eslint/no-require-imports */
            getAgentDefinitionsWithOverrides.cache.clear?.();
            const freshAgentDefs = await getAgentDefinitionsWithOverrides(getOriginalCwd());

            setAppState(prev => ({
              ...prev,
              agentDefinitions: {
                ...freshAgentDefs,
                allAgents: freshAgentDefs.allAgents,
                activeAgents: getActiveAgentsFromList(freshAgentDefs.allAgents),
              },
            }));
            messages.push(createSystemMessage(warning, 'warning'));
          }
        }

        // 在开始恢复的会话之前，为当前会话触发 SessionEnd 钩子，
        // 以匹配 conversation.ts 中的 /clear 流程。
        const sessionEndTimeoutMs = getSessionEndHookTimeoutMs();
        await executeSessionEndHooks('resume', {
          getAppState: () => store.getState(),
          setAppState,
          signal: AbortSignal.timeout(sessionEndTimeoutMs),
          timeoutMs: sessionEndTimeoutMs,
        });

        // 为恢复的会话处理会话启动钩子
        const hookMessages = await processSessionStartHooks('resume', {
          sessionId,
          agentType: mainThreadAgentDefinition?.agentType,
          model: mainLoopModel,
        });

        // 将钩子消息附加到对话中
        messages.push(...hookMessages);
        // 对于分支，生成新的计划标识并复制计划内容，以便
        // 原始会话和分支会话不会互相覆盖对方的计划文件。
        // 对于常规恢复，重用原始会话的计划标识。
        if (entrypoint === 'fork') {
          void copyPlanForFork(log, asSessionId(sessionId));
        } else {
          void copyPlanForResume(log, asSessionId(sessionId));
        }

        // 从恢复的对话中恢复文件历史和归属状态
        restoreSessionStateFromLog(log, setAppState);
        if (log.fileHistorySnapshots) {
          void copyFileHistoryForResume(log);
        }

        // 从恢复的对话中恢复代理设置
        // 始终重置为新会话的值（如果没有则清空），
        // 与下方的独立代理上下文模式保持一致
        const { agentDefinition: restoredAgent } = restoreAgentFromSession(
          log.agentSetting,
          initialMainThreadAgentDefinition,
          agentDefinitions,
        );
        setMainThreadAgentDefinition(restoredAgent);
        setAppState(prev => ({ ...prev, agent: restoredAgent?.agentType }));

        // 从恢复的对话中恢复独立代理上下文
        // 始终重置为新会话的值（如果没有则清空）
        setAppState(prev => ({
          ...prev,
          standaloneAgentContext: computeStandaloneAgentContext(log.agentName, log.agentColor),
        }));
        void updateSessionName(log.agentName);

        // 从消息历史中恢复读取文件状态
        restoreReadFileState(messages, log.projectPath ?? getOriginalCwd());

        // 清除任何活动的加载状态（没有 queryId，因为我们不在查询中）
        resetLoadingState();
        setAbortController(null);

        setConversationId(sessionId);

        // 在保存当前会话之前获取目标会话的成本
        // （saveCurrentSessionCosts 会覆盖配置，所以我们需要先读取）
        const targetSessionCosts = getStoredSessionCosts(sessionId);

        // 在切换前保存当前会话的成本，以避免丢失累积成本
        saveCurrentSessionCosts();

        // 在恢复目标会话前重置成本状态，以便从头开始
        resetCostState();

        // 切换会话（id 和项目目录原子操作）。fullPath 可能指向
        // 一个不同的项目（跨工作树，/分支）；null 派生自
        // 当前的 originalCwd。
        switchSession(asSessionId(sessionId), log.fullPath ? dirname(log.fullPath) : null);
        // 重命名 asciicast 录制文件以匹配恢复的会话 ID
        const { renameRecordingForSession } = await import('../utils/asciicast.js');
        await renameRecordingForSession();
        await resetSessionFilePointer();

        // 先清除再恢复会话元数据，以便在退出时通过
        // reAppendSessionMetadata 重新追加。必须先调用 clearSessionMetadata：
        // restoreSessionMetadata 仅在值为真时设置，所以如果不先清除，
        // 没有代理名称的会话会继承前一个会话的
        // 缓存名称，并在第一条消息时将其写入错误的转录本。
        clearSessionMetadata();
        restoreSessionMetadata(log);
        // 恢复的会话不应从对话中途的上下文重新生成标题
        // （与 useRef 种子的逻辑相同），且前一个会话的
        // 俳句标题不应延续。
        haikuTitleAttemptedRef.current = true;
        setHaikuTitle(undefined);

        // 退出之前 /resume 进入的任何工作树，然后切换到当前会话所在的工作树。如果不退出，从工作树 B 恢复到非工作树 C 会导致 cwd/currentWorktreeSession 状态过时；
        // 此会话所在的工作树。如果不退出，从工作树 B 恢复到非工作树 C 会导致 cwd/currentWorktreeSession 状态过时；
        // 此会话所在的工作树。如果不退出，从工作树 B 恢复到非工作树 C 会导致 cwd/currentWorktreeSession 状态过时；
        // 恢复 B→C 时，若 C 也是工作树，则完全失败
        // （getCurrentWorktreeSession 守卫阻止了切换）。
        //
        // 为 /branch 跳过：forkLog 不携带 worktreeSession，因此
        // 这会将用户踢出他们仍在工作的一个工作树。
        // 与 adopt 的 processResumedConversation 采用相同的 fork 跳过——
        // fork 通过 REPL 挂载上的 recordTranscript 具体化自己的文件。
        if (entrypoint !== 'fork') {
          exitRestoredWorktree();
          restoreWorktreeForResume(log.worktreeSession);
          adoptResumedSessionFile();
          void restoreRemoteAgentTasks({
            abortController: new AbortController(),
            getAppState: () => store.getState(),
            setAppState,
          });
        } else {
          // Fork：与 /clear 相同的重新持久化（conversation.ts）。上面的 clear
          // 清除了 currentSessionWorktree，forkLog 不携带它，
          // 且进程仍在同一个工作树中。
          const ws = getCurrentWorktreeSession();
          if (ws) saveWorktreeState(ws);
        }

        // 持久化当前模式，以便未来恢复时知道此会话处于何种模式
        if (feature('COORDINATOR_MODE')) {
          /* eslint-disable @typescript-eslint/no-require-imports */
          const { saveMode } = require('../utils/sessionStorage.js');
          const { isCoordinatorMode } =
            require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js');
          /* eslint-enable @typescript-eslint/no-require-imports */
          saveMode(isCoordinatorMode() ? 'coordinator' : 'normal');
        }

        // 从先前读取的数据中恢复目标会话的成本
        if (targetSessionCosts) {
          setCostStateForRestore(targetSessionCosts);
        }

        // 为恢复的会话重建替换状态。在 setSessionId 之后运行，
        // 以便恢复后任何新的替换写入到
        // 恢复会话的 tool-results 目录。受 ref.current 门控：
        // 初始挂载已读取功能标志，因此我们不在此处
        // 重新读取它（会话中标志翻转在两者中均不可观察）
        // 方向）。
        //
        // 为会话内 /branch 跳过：现有的 ref 已经是正确的
        // （分支保留 tool_use_ids），因此无需重建。
        // createFork() 确实将内容替换条目写入到分叉的
        // JSONL 中，使用分叉的 sessionId，因此 `claude -r {forkId}` 也有效。
        if (contentReplacementStateRef.current && entrypoint !== 'fork') {
          contentReplacementStateRef.current = reconstructContentReplacementState(
            messages,
            log.contentReplacements ?? [],
          );
        }

        // 将消息重置为提供的初始消息
        // 使用回调以确保我们不依赖于过时状态
        setMessages(() => messages);

        // 清除任何活动的工具 JSX
        setToolJSX(null);

        // 清除输入以确保没有残留状态
        setInputValue('');

        logEvent('tengu_session_resumed', {
          entrypoint: entrypoint as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          success: true,
          resume_duration_ms: Math.round(performance.now() - resumeStart),
        });
      } catch (error) {
        logEvent('tengu_session_resumed', {
          entrypoint: entrypoint as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          success: false,
        });
        throw error;
      }
    },
    [resetLoadingState, setAppState],
  );

  // 惰性初始化：useRef(createX()) 会在每次渲染时调用 createX 并
  // 丢弃结果。FileStateCache 内部的 LRUCache 构造
  // 开销较大（约 170 毫秒），因此我们使用 useState 的惰性初始化器来
  // 精确创建一次，然后将该稳定引用提供给 useRef。
  const [initialReadFileState] = useState(() => createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE));
  const readFileState = useRef(initialReadFileState);
  const bashTools = useRef(new Set<string>());
  const bashToolsProcessedIdx = useRef(0);
  // 会话范围内的技能发现追踪（在 tengu_skill_tool_invocation 上设置 was_discovered 字段）。必须在会话内 getToolUseContext 重建时保持持久化：第 0 轮发现通过 processUserInput 写入，早于 onQuery 构建其自身上下文，且第 N 轮的发现仍必须归因于第 N+k 轮的 SkillTool 调用。在 clearConversation 中清除。
  // tengu_skill_tool_invocation）。必须在会话内 getToolUseContext 重建时保持持久化：第 0 轮发现通过 processUserInput 写入，早于 onQuery 构建其自身上下文，且第 N 轮的发现仍必须归因于第 N+k 轮的 SkillTool 调用。在 clearConversation 中清除。
  // 在会话内重建时保持持久化：第 0 轮发现通过 processUserInput 写入，早于 onQuery 构建其自身上下文，且第 N 轮的发现仍必须归因于第 N+k 轮的 SkillTool 调用。在 clearConversation 中清除。
  // 在 onQuery 构建其自身上下文之前，第 N 轮的发现仍必须归因于第 N+k 轮的 SkillTool 调用。在 clearConversation 中清除。
  // 仍必须归因于第 N+k 轮的 SkillTool 调用。在 clearConversation 中清除。
  const discoveredSkillNamesRef = useRef(new Set<string>());
  // 针对 nested_memory CLAUDE.md 附件的会话级去重。
  // readFileState 是一个 100 条目的 LRU 缓存；一旦它淘汰了某个 CLAUDE.md 路径，下一个发现周期会重新注入它。在 clearConversation 中清除。
  // 下一个发现周期会重新注入它。在 clearConversation 中清除。
  const loadedNestedMemoryPathsRef = useRef(new Set<string>());

  // 用于从消息中恢复已读文件状态的辅助函数（用于恢复流程）
  // 这允许 Claude 编辑在先前会话中读取的文件
  const restoreReadFileState = useCallback((messages: MessageType[], cwd: string) => {
    const extracted = extractReadFilesFromMessages(messages, cwd, READ_FILE_STATE_CACHE_SIZE);
    readFileState.current = mergeFileStateCaches(readFileState.current, extracted);
    for (const tool of extractBashToolsFromMessages(messages)) {
      bashTools.current.add(tool);
    }
  }, []);

  // 在挂载时从 initialMessages 提取已读文件状态
  // 这处理了 CLI 标志恢复（--resume-session）和 ResumeConversation 屏幕，其中消息是作为属性传递而非通过恢复回调
  // 其中消息是作为属性传递而非通过恢复回调
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      restoreReadFileState(initialMessages, getOriginalCwd());
      void restoreRemoteAgentTasks({
        abortController: new AbortController(),
        getAppState: () => store.getState(),
        setAppState,
      });
    }
    // 仅在挂载时运行 - initialMessages 在组件生命周期内不应改变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { status: apiKeyStatus, reverify } = useApiKeyVerification();

  // 自动运行 /issue 状态
  const [autoRunIssueReason, setAutoRunIssueReason] = useState<AutoRunIssueReason | null>(null);
  // 用于追踪本次调查周期是否触发了 autoRunIssue 的引用，以便我们即使在 autoRunIssueReason 被清除后也能抑制 [1] 后续提示。
  // 以便我们即使在 autoRunIssueReason 被清除后也能抑制 [1] 后续提示。
  // autoRunIssueReason 被清除后也能抑制 [1] 后续提示。
  const didAutoRunIssueRef = useRef(false);

  // 退出反馈流程的状态
  const [exitFlow, setExitFlow] = useState<React.ReactNode>(null);
  const [isExiting, setIsExiting] = useState(false);

  // 计算是否应显示成本对话框
  const showingCostDialog = !isLoading && showCostDialog;

  // 确定哪个对话框应获得焦点（如果有的话）
  // 权限和交互对话框即使在 toolJSX 已设置时也可以显示，只要 shouldContinueAnimation 为 true。这防止了代理在等待用户交互时设置后台提示导致的死锁。
  // 只要 shouldContinueAnimation 为 true。这防止了代理在等待用户交互时设置后台提示导致的死锁。
  // 代理在等待用户交互时设置后台提示导致的死锁。
  function getFocusedInputDialog():
    | 'message-selector'
    | 'sandbox-permission'
    | 'tool-permission'
    | 'prompt'
    | 'worker-sandbox-permission'
    | 'elicitation'
    | 'cost'
    | 'idle-return'
    | 'init-onboarding'
    | 'ide-onboarding'
    | 'model-switch'
    | 'undercover-callout'
    | 'effort-callout'
    | 'remote-callout'
    | 'lsp-recommendation'
    | 'plugin-hint'
    | 'desktop-upsell'
    | 'ultraplan-choice'
    | 'ultraplan-launch'
    | undefined {
    // 退出状态始终具有最高优先级
    if (isExiting || exitFlow) return undefined;

    // 高优先级对话框（无论是否正在输入都始终显示）
    if (isMessageSelectorVisible) return 'message-selector';

    // 在用户主动输入时抑制中断对话框
    if (isPromptInputActive) return undefined;

    if (sandboxPermissionRequestQueue[0]) return 'sandbox-permission';

    // 权限/交互对话框（除非被 toolJSX 阻止，否则显示）
    const allowDialogsWithAnimation = !toolJSX || toolJSX.shouldContinueAnimation;

    if (allowDialogsWithAnimation && toolUseConfirmQueue[0]) return 'tool-permission';
    if (allowDialogsWithAnimation && promptQueue[0]) return 'prompt';
    // 来自群组工作器的 Worker 沙箱权限提示（网络访问）
    if (allowDialogsWithAnimation && workerSandboxPermissions.queue[0]) return 'worker-sandbox-permission';
    if (allowDialogsWithAnimation && elicitation.queue[0]) return 'elicitation';
    if (allowDialogsWithAnimation && showingCostDialog) return 'cost';
    if (allowDialogsWithAnimation && idleReturnPending) return 'idle-return';

    if (feature('ULTRAPLAN') && allowDialogsWithAnimation && !isLoading && ultraplanPendingChoice)
      return 'ultraplan-choice';

    if (feature('ULTRAPLAN') && allowDialogsWithAnimation && !isLoading && ultraplanLaunchPending)
      return 'ultraplan-launch';

    // 新手引导对话框（特殊条件）
    if (allowDialogsWithAnimation && showIdeOnboarding) return 'ide-onboarding';

    // 模型切换提示（仅限内部版本，外部构建已移除）
    if (process.env.USER_TYPE === 'ant' && allowDialogsWithAnimation && showModelSwitchCallout) return 'model-switch';

    // 隐身模式自动启用说明（仅限内部版本，外部构建已移除）
    if (process.env.USER_TYPE === 'ant' && allowDialogsWithAnimation && showUndercoverCallout)
      return 'undercover-callout';

    // Effort 功能提示（为启用 effort 的 Opus 4.6 用户显示一次）
    if (allowDialogsWithAnimation && showEffortCallout) return 'effort-callout';

    // 远程连接提示（首次启用桥接前显示一次）
    if (allowDialogsWithAnimation && showRemoteCallout) return 'remote-callout';

    // LSP 插件推荐（最低优先级 - 非阻塞建议）
    if (allowDialogsWithAnimation && lspRecommendation) return 'lsp-recommendation';

    // 来自 CLI/SDK 标准错误输出的插件提示（与 LSP 推荐同优先级）
    if (allowDialogsWithAnimation && hintRecommendation) return 'plugin-hint';

    // 桌面应用升级推广（最多 3 次启动，最低优先级）
    if (allowDialogsWithAnimation && showDesktopUpsellStartup) return 'desktop-upsell';

    return undefined;
  }

  const focusedInputDialog = getFocusedInputDialog();

  // 当权限提示存在但因用户正在输入而被隐藏时为 true
  const hasSuppressedDialogs =
    isPromptInputActive &&
    (sandboxPermissionRequestQueue[0] ||
      toolUseConfirmQueue[0] ||
      promptQueue[0] ||
      workerSandboxPermissions.queue[0] ||
      elicitation.queue[0] ||
      showingCostDialog);

  // 保持引用同步，以便计时器回调能读取当前值
  focusedInputDialogRef.current = focusedInputDialog;

  // 当 focusedInputDialog 变化时立即捕获暂停/恢复状态
  // 这确保了即使在高系统负载下也能精确计时，而不是
  // 依赖 100 毫秒的轮询间隔来检测状态变化
  useEffect(() => {
    if (!isLoading) return;

    const isPaused = focusedInputDialog === 'tool-permission';
    const now = Date.now();

    if (isPaused && pauseStartTimeRef.current === null) {
      // 刚进入暂停状态 - 记录确切时刻
      pauseStartTimeRef.current = now;
    } else if (!isPaused && pauseStartTimeRef.current !== null) {
      // 刚退出暂停状态 - 立即累加暂停时间
      totalPausedMsRef.current += now - pauseStartTimeRef.current;
      pauseStartTimeRef.current = null;
    }
  }, [focusedInputDialog, isLoading]);

  // 每当权限覆盖层出现或消失时，重新将滚动固定到底部。
  // 覆盖层现在渲染在同一 ScrollBox 内的消息下方
  // （未重新挂载），因此我们需要显式调用 scrollToBottom 来处理：
  // - 出现时：用户可能已向上滚动（粘性定位失效）—
  // 对话框是阻塞式的且必须可见
  // - 消失时：用户可能在覆盖层显示期间向上滚动以阅读上下文，
  // 且 onScroll 被抑制，因此药丸状态已过时
  // 使用 useLayoutEffect 以便在 Ink 帧渲染前提交重新固定操作 —
  // 避免错误滚动位置闪烁一帧。
  const prevDialogRef = useRef(focusedInputDialog);
  useLayoutEffect(() => {
    const was = prevDialogRef.current === 'tool-permission';
    const now = focusedInputDialog === 'tool-permission';
    if (was !== now) repinScroll();
    prevDialogRef.current = focusedInputDialog;
  }, [focusedInputDialog, repinScroll]);

  function onCancel() {
    if (focusedInputDialog === 'elicitation') {
      // 引导对话框自行处理 Escape 键，关闭它不应影响任何加载状态。
      return;
    }

    logForDebugging(`[onCancel] focusedInputDialog=${focusedInputDialog} streamMode=${streamMode}`);

    // 暂停主动模式，以便用户重新获得控制权。
    // 当他们提交下一个输入时会恢复（参见 onSubmit）。
    if (feature('PROACTIVE') || feature('KAIROS')) {
      proactiveModule?.pauseProactive();
    }

    queryGuard.forceEnd();
    skipIdleCheckRef.current = false;

    // 保留部分流式传输的文本，以便用户能够阅读按下
    // Esc 前生成的内容。在 resetLoadingState 清除前推送
    // streamingText，以及在 query.ts 产生异步中断标记之前，
    // 给出最终顺序 [用户, 部分助手, [请求被用户中断]]。
    if (streamingText?.trim()) {
      setMessages(prev => [...prev, createAssistantMessage({ content: streamingText })]);
    }

    resetLoadingState();

    // 清除所有活跃的令牌预算，以防备用机制在
    // 查询生成器尚未退出时，基于过时的预算触发。
    if (feature('TOKEN_BUDGET')) {
      snapshotOutputTokensForTurn(null);
    }

    if (focusedInputDialog === 'tool-permission') {
      // 工具使用确认会自行处理中止信号
      toolUseConfirmQueue[0]?.onAbort();
      setToolUseConfirmQueue([]);
    } else if (focusedInputDialog === 'prompt') {
      // 拒绝所有待处理的提示并清空队列
      for (const item of promptQueue) {
        item.reject(new Error('提示被用户取消'));
      }
      setPromptQueue([]);
      abortController?.abort('user-cancel');
    } else if (activeRemote.isRemoteMode) {
      // 远程模式：向 CCR 发送中断信号
      activeRemote.cancelRequest();
    } else {
      abortController?.abort('user-cancel');
    }

    // 清除控制器，以便后续的 Escape 按键不会检测到过时的
    // 已中止信号。若不这样做，canCancelRunningTask 将为 false（信号
    // 已定义但 .aborted === true），因此如果没有其他
    // 激活条件成立，isActive 将变为 false —— 导致 Escape 快捷键失效。
    setAbortController(null);

    // forceEnd() 跳过 finally 路径 —— 直接触发（aborted=true）。
    void mrOnTurnComplete(messagesRef.current, true);
  }

  // 取消权限请求时处理队列命令的函数
  const handleQueuedCommandOnCancel = useCallback(() => {
    const result = popAllEditable(inputValue, 0);
    if (!result) return;
    setInputValue(result.text);
    setInputMode('prompt');

    // 将队列命令中的图像恢复到 pastedContents
    if (result.images.length > 0) {
      setPastedContents(prev => {
        const newContents = { ...prev };
        for (const image of result.images) {
          newContents[image.id] = image;
        }
        return newContents;
      });
    }
  }, [setInputValue, setInputMode, inputValue, setPastedContents]);

  // CancelRequestHandler 属性 - 在 KeybindingSetup 内部渲染
  const cancelRequestProps = {
    setToolUseConfirmQueue,
    onCancel,
    onAgentsKilled: () => setMessages(prev => [...prev, createAgentsKilledMessage()]),
    isMessageSelectorVisible: isMessageSelectorVisible || !!showBashesDialog,
    screen,
    abortSignal: abortController?.signal,
    popCommandFromQueue: handleQueuedCommandOnCancel,
    vimMode,
    isLocalJSXCommand: toolJSX?.isLocalJSXCommand,
    isSearchingHistory,
    isHelpOpen,
    inputMode,
    inputValue,
    streamMode,
  };

  useEffect(() => {
    const totalCost = getTotalCost();
    if (totalCost >= 5 /* $5 */ && !showCostDialog && !haveShownCostDialog) {
      logEvent('tengu_cost_threshold_reached', {});
      // 即使对话框不会渲染（无控制台计费
      // 访问权限），也标记为已显示。否则此效果会在会话剩余时间内
      // 每次消息变更时重复触发 —— 观察到超过 20 万次虚假事件。
      setHaveShownCostDialog(true);
      if (hasConsoleBillingAccess()) {
        setShowCostDialog(true);
      }
    }
  }, [messages, showCostDialog, haveShownCostDialog]);

  const sandboxAskCallback: SandboxAskCallback = useCallback(
    async (hostPattern: NetworkHostPattern) => {
      // 如果作为集群工作节点运行，通过邮箱将请求转发给领导者
      if (isAgentSwarmsEnabled() && isSwarmWorker()) {
        const requestId = generateSandboxRequestId();

        // 通过邮箱将请求发送给领导者
        const sent = await sendSandboxPermissionRequestViaMailbox(hostPattern.host, requestId);

        return new Promise(resolveShouldAllowHost => {
          if (!sent) {
            // 如果无法通过邮箱发送，则回退到本地处理
            setSandboxPermissionRequestQueue(prev => [
              ...prev,
              {
                hostPattern,
                resolvePromise: resolveShouldAllowHost,
              },
            ]);
            return;
          }

          // 注册领导者响应时的回调函数
          registerSandboxPermissionCallback({
            requestId,
            host: hostPattern.host,
            resolve: resolveShouldAllowHost,
          });

          // 更新 AppState 以显示待处理指示器
          setAppState(prev => ({
            ...prev,
            pendingSandboxRequest: {
              requestId,
              host: hostPattern.host,
            },
          }));
        });
      }

      // 非工作节点的正常流程：显示本地 UI，并在连接时可选地与
      // REPL 桥接（远程控制）进行竞争。
      return new Promise(resolveShouldAllowHost => {
        let resolved = false;
        function resolveOnce(allow: boolean): void {
          if (resolved) return;
          resolved = true;
          resolveShouldAllowHost(allow);
        }

        // 将本地沙盒权限对话框加入队列
        setSandboxPermissionRequestQueue(prev => [
          ...prev,
          {
            hostPattern,
            resolvePromise: resolveOnce,
          },
        ]);

        // 当 REPL 桥接连接时，同时将沙盒
        // 权限请求作为 can_use_tool control_request 转发，以便
        // 远程用户（例如在 claude.ai 上）也能批准它。
        if (feature('BRIDGE_MODE')) {
          const bridgeCallbacks = store.getState().replBridgePermissionCallbacks;
          if (bridgeCallbacks) {
            const bridgeRequestId = randomUUID();
            bridgeCallbacks.sendRequest(
              bridgeRequestId,
              SANDBOX_NETWORK_ACCESS_TOOL_NAME,
              { host: hostPattern.host },
              randomUUID(),
              `允许网络连接到 ${hostPattern.host} 吗？`,
            );

            const unsubscribe = bridgeCallbacks.onResponse(bridgeRequestId, response => {
              unsubscribe();
              const allow = response.behavior === 'allow';
              // 解析同一主机的所有待处理请求，而不仅仅是
              // 这一个——遵循本地对话框处理器的模式。
              setSandboxPermissionRequestQueue(queue => {
                queue
                  .filter(item => item.hostPattern.host === hostPattern.host)
                  .forEach(item => item.resolvePromise(allow));
                return queue.filter(item => item.hostPattern.host !== hostPattern.host);
              });
              // 在删除之前，清理此主机的所有兄弟桥接订阅
              // （其他并发的同一主机请求）。
              const siblingCleanups = sandboxBridgeCleanupRef.current.get(hostPattern.host);
              if (siblingCleanups) {
                for (const fn of siblingCleanups) {
                  fn();
                }
                sandboxBridgeCleanupRef.current.delete(hostPattern.host);
              }
            });

            // 注册清理操作，以便本地对话框处理器可以取消
            // 远程提示，并在本地用户先响应时取消订阅。
            // 响应时取消订阅。
            const cleanup = () => {
              unsubscribe();
              bridgeCallbacks.cancelRequest(bridgeRequestId);
            };
            const existing = sandboxBridgeCleanupRef.current.get(hostPattern.host) ?? [];
            existing.push(cleanup);
            sandboxBridgeCleanupRef.current.set(hostPattern.host, existing);
          }
        }
      });
    },
    [setAppState, store],
  );

  // #34044：如果用户显式设置 sandbox.enabled=true 但依赖项缺失，
  // isSandboxingEnabled() 会静默返回 false。在挂载时显示一次原因，
  // 以便用户知道其安全配置未生效。完整原因记录到调试日志；
  // 通知指向 /sandbox 获取详细信息。
  // addNotification 是稳定的（useCallback），因此效果只触发一次。
  useEffect(() => {
    const reason = SandboxManager.getSandboxUnavailableReason();
    if (!reason) return;
    if (SandboxManager.isSandboxRequired()) {
      process.stderr.write(
        `\n错误：需要沙盒但不可用：${reason}\n` +
          `  sandbox.failIfUnavailable 已设置——拒绝在没有可用沙盒的情况下启动。\n\n`,
      );
      gracefulShutdownSync(1, 'other');
      return;
    }
    logForDebugging(`沙盒已禁用：${reason}`, { level: 'warn' });
    addNotification({
      key: 'sandbox-unavailable',
      jsx: (
        <>
          <Text color="warning">sandbox disabled</Text>
          <Text dimColor> · /sandbox</Text>
        </>
      ),
      priority: 'medium',
    });
  }, [addNotification]);

  if (SandboxManager.isSandboxingEnabled()) {
    // 如果启用了沙盒（setting.sandbox 已定义），则初始化管理器
    SandboxManager.initialize(sandboxAskCallback).catch(err => {
      // 初始化/验证失败 - 显示错误并退出
      process.stderr.write(`\n❌ 沙盒错误：${errorMessage(err)}\n`);
      gracefulShutdownSync(1, 'other');
    });
  }

  const setToolPermissionContext = useCallback(
    (context: ToolPermissionContext, options?: { preserveMode?: boolean }) => {
      setAppState(prev => ({
        ...prev,
        toolPermissionContext: {
          ...context,
          // 仅在显式请求时保留协调器的模式。
          // Workers 的 getAppState() 返回一个带有模式 'acceptEdits' 的转换上下文，
          // 该模式不得通过权限规则更新泄漏到协调器的实际状态中——
          // 那些调用点传递 { preserveMode: true }。用户发起的模式更改（例如，
          // 选择“允许所有编辑”）不得被覆盖。
          // 选择“允许所有编辑”）不得被覆盖。
          mode: options?.preserveMode ? prev.toolPermissionContext.mode : context.mode,
        },
      }));

      // 当权限上下文更改时，重新检查所有队列中的项目
      // 这处理了以下情况：使用“不再询问”批准 item1
      // 应自动批准其他队列中现在符合更新规则的项目
      setImmediate(setToolUseConfirmQueue => {
        // 使用 setToolUseConfirmQueue 回调获取当前队列状态
        // 而不是在闭包中捕获它，以避免闭包过时问题
        setToolUseConfirmQueue(currentQueue => {
          currentQueue.forEach(item => {
            void item.recheckPermission();
          });
          return currentQueue;
        });
      }, setToolUseConfirmQueue);
    },
    [setAppState, setToolUseConfirmQueue],
  );

  // 为进程内队友注册领导者的 setToolPermissionContext
  useEffect(() => {
    registerLeaderSetToolPermissionContext(setToolPermissionContext);
    return () => unregisterLeaderSetToolPermissionContext();
  }, [setToolPermissionContext]);

  const canUseTool = useCanUseTool(setToolUseConfirmQueue, setToolPermissionContext);
  //llm向用户提问的回调函数，会先进promptQueue队列，用户同意会调用resolve函数，拒绝会调用reject函数
  const requestPrompt = useCallback(
    (title: string, toolInputSummary?: string | null) =>
      (request: PromptRequest): Promise<PromptResponse> =>
        new Promise<PromptResponse>((resolve, reject) => {
          setPromptQueue(prev => [...prev, { request, title, toolInputSummary, resolve, reject }]);
        }),
    [],
  );

  const getToolUseContext = useCallback(
    (
      messages: MessageType[],
      newMessages: MessageType[],
      abortController: AbortController,
      mainLoopModel: string,
    ): ProcessUserInputContext => {
      // 从存储中读取最新的可变值，而非通过闭包捕获
      // useAppState() 快照。当前值相同（闭包在回合间通过渲染刷新）；
      // 将数据新鲜度与 React 的渲染周期解耦，以支持未来无头对话循环。
      // 与 refreshTools() 使用的模式相同。
      const s = store.getState();

      // 从 store.getState() 计算最新的工具，而非闭包
      // 捕获的 `tools`。useManageMCPConnections 在服务器连接时异步填充 appState.mcp
      // ——存储可能拥有比渲染时闭包捕获的更新的 MCP 状态。
      // 同时兼作 refreshTools()，用于查询中工具列表更新。
      // 从存储中合并最新数据，而非闭包捕获 useMergedClients'
      const computeTools = () => {
        const state = store.getState();
        const assembled = assembleToolPool(state.toolPermissionContext, state.mcp.tools);
        const merged = mergeAndFilterTools(combinedInitialTools, assembled, state.toolPermissionContext.mode);
        if (!mainThreadAgentDefinition) return merged;
        return resolveAgentTools(mainThreadAgentDefinition, merged, false, true).resolvedTools;
      };

      return {
        abortController,
        options: {
          commands,
          tools: computeTools(),
          debug,
          verbose: s.verbose,
          mainLoopModel,
          thinkingConfig: s.thinkingEnabled !== false ? thinkingConfig : { type: 'disabled' },
          // 的记忆化输出。initialMcpClients 是一个属性（会话常量）。
          // 性能：当更新器返回相同引用时跳过 setState
          mcpClients: mergeClients(initialMcpClients, s.mcp.clients),
          mcpResources: s.mcp.resources,
          ideInstallationStatus: ideInstallationStatus,
          isNonInteractiveSession: false,
          dynamicMcpConfig,
          theme,
          agentDefinitions: allowedAgentTypes ? { ...s.agentDefinitions, allowedAgentTypes } : s.agentDefinitions,
          customSystemPrompt,
          appendSystemPrompt,
          refreshTools: computeTools,
        },
        getAppState: () => store.getState(),
        setAppState,
        messages,
        setMessages,
        updateFileHistoryState(updater: (prev: FileHistoryState) => FileHistoryState) {
          // （例如，当文件已被跟踪时，fileHistoryTrackEdit 返回 `state`）。
          // 否则每次无操作调用都会通知所有存储监听器。
          // 压缩对话
          setAppState(prev => {
            const updated = updater(prev.fileHistory);
            if (updated === prev.fileHistory) return prev;
            return { ...prev, fileHistory: updated };
          });
        },
        updateAttributionState(updater: (prev: AttributionState) => AttributionState) {
          setAppState(prev => {
            const updated = updater(prev.attribution);
            if (updated === prev.attribution) return prev;
            return { ...prev, attribution: updated };
          });
        },
        openMessageSelector: () => {
          if (!disabled) {
            setIsMessageSelectorVisible(true);
          }
        },
        onChangeAPIKey: reverify,
        readFileState: readFileState.current,
        setToolJSX,
        addNotification,
        appendSystemMessage: msg => setMessages(prev => [...prev, msg]),
        sendOSNotification: opts => {
          void sendNotification(opts, terminal);
        },
        onChangeDynamicMcpConfig,
        onInstallIDEExtension: setIDEToInstallExtension,
        nestedMemoryAttachmentTriggers: new Set<string>(),
        loadedNestedMemoryPaths: loadedNestedMemoryPathsRef.current,
        dynamicSkillDirTriggers: new Set<string>(),
        discoveredSkillNames: discoveredSkillNamesRef.current,
        setResponseLength,
        pushApiMetricsEntry:
          process.env.USER_TYPE === 'ant'
            ? (ttftMs: number) => {
                const now = Date.now();
                const baseline = responseLengthRef.current;
                apiMetricsRef.current.push({
                  ttftMs,
                  firstTokenTime: now,
                  lastTokenTime: now,
                  responseLengthBaseline: baseline,
                  endResponseLength: baseline,
                });
              }
            : undefined,
        setStreamMode,
        onCompactProgress: event => {
          switch (event.type) {
            case 'hooks_start':
              setSpinnerColor('claudeBlue_FOR_SYSTEM_SPINNER');
              setSpinnerShimmerColor('claudeBlueShimmer_FOR_SYSTEM_SPINNER');
              setSpinnerMessage(
                event.hookType === 'pre_compact'
                  ? 'Running PreCompact hooks\u2026'
                  : event.hookType === 'post_compact'
                    ? 'Running PostCompact hooks\u2026'
                    : 'Running SessionStart hooks\u2026',
              );
              break;
            case 'compact_start':
              setSpinnerMessage('会话后台化（Ctrl+B 切换到后台/前台）');
              break;
            case 'compact_end':
              setSpinnerMessage(null);
              setSpinnerColor(null);
              setSpinnerShimmerColor(null);
              break;
          }
        },
        setInProgressToolUseIDs,
        setHasInterruptibleToolInProgress: (v: boolean) => {
          hasInterruptibleToolInProgressRef.current = v;
        },
        resume,
        setConversationId,
        requestPrompt: feature('HOOK_PROMPTS') ? requestPrompt : undefined,
        contentReplacementState: contentReplacementStateRef.current,
      };
    },
    [
      commands,
      combinedInitialTools,
      mainThreadAgentDefinition,
      debug,
      initialMcpClients,
      ideInstallationStatus,
      dynamicMcpConfig,
      theme,
      allowedAgentTypes,
      store,
      setAppState,
      reverify,
      addNotification,
      setMessages,
      onChangeDynamicMcpConfig,
      resume,
      requestPrompt,
      disabled,
      customSystemPrompt,
      appendSystemPrompt,
      setConversationId,
    ],
  );

  // 停止前台查询，以便后台查询接管
  const handleBackgroundQuery = useCallback(() => {
    // 中止子代理可能会产生任务完成通知。
    abortController?.abort('background');
    // 清除任务通知，以便队列处理器不会立即
    // 启动新的前台查询；将它们转发到后台会话。
    // 去重：如果查询循环在我们将其从队列中移除之前已经向
    const removedNotifications = removeByFilter(cmd => cmd.mode === 'task-notification');

    void (async () => {
      const toolUseContext = getToolUseContext(messagesRef.current, [], new AbortController(), mainLoopModel);

      const [defaultSystemPrompt, userContext, systemContext] = await Promise.all([
        getSystemPrompt(
          toolUseContext.options.tools,
          mainLoopModel,
          Array.from(toolPermissionContext.additionalWorkingDirectories.keys()),
          toolUseContext.options.mcpClients,
        ),
        getUserContext(),
        getSystemContext(),
      ]);

      const systemPrompt = buildEffectiveSystemPrompt({
        mainThreadAgentDefinition,
        toolUseContext,
        customSystemPrompt,
        defaultSystemPrompt,
        appendSystemPrompt,
      });
      toolUseContext.renderedSystemPrompt = systemPrompt;

      const notificationAttachments = await getQueuedCommandAttachments(removedNotifications).catch(() => []);
      const notificationMessages = notificationAttachments.map(createAttachmentMessage);

      // messagesRef 产生了一个通知，则跳过重复项。
      // 我们使用提示文本进行去重，因为 source_uuid 未在
      // task-notification QueuedCommands 上设置（enqueuePendingNotification 调用者
      // 未传递 uuid），因此它始终是未定义的。
      // 全屏：保留压缩前的消息以供回滚。query.ts
      const existingPrompts = new Set<string>();
      for (const m of messagesRef.current) {
        if (
          m.type === 'attachment' &&
          m.attachment!.type === 'queued_command' &&
          m.attachment!.commandMode === 'task-notification' &&
          typeof m.attachment!.prompt === 'string'
        ) {
          existingPrompts.add(m.attachment!.prompt);
        }
      }
      const uniqueNotifications = notificationMessages.filter(
        m =>
          m.attachment.type === 'queued_command' &&
          (typeof m.attachment.prompt !== 'string' || !existingPrompts.has(m.attachment.prompt)),
      );

      startBackgroundSession({
        messages: [...messagesRef.current, ...uniqueNotifications],
        queryParams: {
          systemPrompt,
          userContext,
          systemContext,
          canUseTool,
          toolUseContext,
          querySource: getQuerySourceForREPL(),
        },
        description: terminalTitle,
        setAppState,
        agentDefinition: mainThreadAgentDefinition,
      });
    })();
  }, [
    abortController,
    mainLoopModel,
    toolPermissionContext,
    mainThreadAgentDefinition,
    getToolUseContext,
    customSystemPrompt,
    appendSystemPrompt,
    canUseTool,
    setAppState,
  ]);

  const { handleBackgroundSession } = useSessionBackgrounding({
    setMessages,
    setIsLoading: setIsExternalLoading,
    resetLoadingState,
    setAbortController,
    onBackgroundQuery: handleBackgroundQuery,
  });

  const onQueryEvent = useCallback(
    (event: Parameters<typeof handleMessageFromStream>[0]) => {
      handleMessageFromStream(
        event,
        newMessage => {
          if (isCompactBoundaryMessage(newMessage)) {
            // 在边界处切片以进行 API 调用，Messages.tsx 在全屏时跳过
            // 边界过滤器，而 useLogMessages 将此视为
            // 增量追加（第一个 uuid 不变）。限制为一个
            // 作为增量追加（首个 uuid 保持不变）。上限为一个
            // 滚动回退的紧凑区间 — normalizeMessages/applyGrouping
            // 每次渲染都是 O(n) 复杂度，因此丢弃之前边界之前的所有内容
            // 以在多日会话中保持 n 的有界性。
            if (isFullscreenEnvEnabled()) {
              setMessages(old => {
                const postBoundary = getMessagesAfterCompactBoundary(old, {
                  includeSnipped: true,
                });
                // Hard cap: keep at most 500 messages in fullscreen scrollback
                // to prevent unbounded memory growth in multi-day sessions.
                // normalizeMessages/applyGrouping are O(n), and Ink fiber
                // trees cost ~250KB RSS per message. Without this cap,
                // scrollback after several compactions can reach thousands
                // of messages (observed: 13k+, 1GB+ heap).
                const MAX_FULLSCREEN_SCROLLBACK = 500;
                const kept =
                  postBoundary.length > MAX_FULLSCREEN_SCROLLBACK
                    ? postBoundary.slice(-MAX_FULLSCREEN_SCROLLBACK)
                    : postBoundary;
                return [...kept, newMessage];
              });
            } else {
              setMessages(() => [newMessage]);
            }
            // 递增 conversationId，以便 Messages.tsx 的行键发生变化
            // 过时的记忆化行会重新挂载并包含紧凑化后的内容。
            setConversationId(randomUUID());
            // 紧凑化成功 — 清除上下文阻塞标志，以便计时恢复
            if (feature('PROACTIVE') || feature('KAIROS')) {
              proactiveModule?.setContextBlocked(false);
            }
          } else if (
            newMessage.type === 'progress' &&
            isEphemeralToolProgress((newMessage as unknown as { data?: { type?: string } }).data?.type)
          ) {
            // 替换同一工具调用的先前临时进度计时，而非追加。
            // Sleep/Bash 每秒发出一个计时，只有最后一个会被渲染；
            // 追加会导致消息数组（观察到超过 13k）和记录
            // （120MB 的 sleep_progress 行）爆炸式增长。useLogMessages 跟踪长度，因此相同长度的替换
            // 也会跳过记录写入。
            // agent_progress / hook_progress / skill_progress 不是临时的
            // — 每个都承载 UI 需要的不同状态（例如子代理工具历史）。
            // 替换这些会导致 AgentTool UI 卡在
            // “正在初始化…” 状态，因为它渲染的是完整的进度轨迹。
            // 在 API 错误时阻塞计时，以防止计时 → 错误 → 计时
            setMessages(oldMessages => {
              const newData = newMessage.data as Record<string, unknown>;
              // Scan backwards to find the last ephemeral progress with matching
              // parentToolUseID and type. Previously only checked the last message,
              // so interleaved non-ephemeral messages caused duplicate progress
              // entries to accumulate (observed 13k+ entries in sleep-heavy sessions).
              for (let i = oldMessages.length - 1; i >= 0; i--) {
                const m = oldMessages[i]!;
                if (m.type !== 'progress') break;
                const mData = m.data as Record<string, unknown> | undefined;
                if (m.parentToolUseID === newMessage.parentToolUseID && mData?.type === newData.type) {
                  const copy = oldMessages.slice();
                  copy[i] = newMessage;
                  return copy;
                }
              }
              return [...oldMessages, newMessage];
            });
          } else {
            setMessages(oldMessages => [...oldMessages, newMessage]);
          }
          // 失控循环（例如，认证失败、速率限制、阻塞限制）。
          // 在紧凑边界（上方）或成功响应（下方）时清除。
          // 在从属模式下将助手响应中继给主控端。
          if (feature('PROACTIVE') || feature('KAIROS')) {
            if (newMessage.type === 'assistant' && 'isApiErrorMessage' in newMessage && newMessage.isApiErrorMessage) {
              proactiveModule?.setContextBlocked(true);
            } else if (newMessage.type === 'assistant') {
              proactiveModule?.setContextBlocked(false);
            }
          }
          // 从内容块中提取文本（API 格式）
          if (feature('UDS_INBOX') && newMessage.type === 'assistant') {
            // 从属请求失败
            const msg = newMessage.message as any;
            const contentBlocks = msg?.content ?? (newMessage as any).content ?? [];
            const textParts: string[] = [];
            if (Array.isArray(contentBlocks)) {
              for (const block of contentBlocks) {
                if (typeof block === 'string') {
                  textParts.push(block);
                } else if (block?.type === 'text' && block.text) {
                  textParts.push(block.text);
                }
              }
            } else if (typeof contentBlocks === 'string') {
              textParts.push(contentBlocks);
            }
            const text = textParts.join('\n').trim();
            if ('isApiErrorMessage' in newMessage && newMessage.isApiErrorMessage) {
              pipeReturnHadErrorRef.current = true;
              relayPipeMessage({
                type: 'error',
                data: text || 'setResponseLength 负责更新 responseLengthRef（用于',
              });
            } else if (text) {
              relayPipeMessage({ type: 'stream', data: text });
            }
          }
        },
        newContent => {
          // 旋转动画）和 apiMetricsRef（用于 OTPS 的 endResponseLength/lastTokenTime）。
          // 此处无需单独的指标更新。
          // 为新提示准备 IDE 集成。从存储中重新读取 mcpClients —
          setResponseLength(length => length + newContent.length);
        },
        setStreamMode,
        setStreamingToolUses,
        tombstonedMessage => {
          setMessages(oldMessages => oldMessages.filter(m => m !== tombstonedMessage));
          void removeTranscriptMessage(tombstonedMessage.uuid);
        },
        setStreamingThinking,
        metrics => {
          const now = Date.now();
          const baseline = responseLengthRef.current;
          apiMetricsRef.current.push({
            ...metrics,
            firstTokenTime: now,
            lastTokenTime: now,
            responseLengthBaseline: baseline,
            endResponseLength: baseline,
          });
        },
        onStreamingText,
      );
    },
    [setMessages, setResponseLength, setStreamMode, setStreamingToolUses, setStreamingThinking, onStreamingText],
  );

  const onQueryImpl = useCallback(
    async (
      messagesIncludingNewMessages: MessageType[],
      newMessages: MessageType[],
      abortController: AbortController,
      shouldQuery: boolean,
      additionalAllowedTools: string[],
      mainLoopModelParam: string,
      effort?: EffortValue,
    ) => {
      // useManageMCPConnections 可能在此闭包捕获的渲染之后已填充它
      // （与 computeTools 相同的模式）。
      // 当任何用户消息发送给 Claude 时，标记入门引导为完成
      if (shouldQuery) {
        const freshClients = mergeClients(initialMcpClients, store.getState().mcp.clients);
        void diagnosticTracker.handleQueryStart(freshClients);
        const ideClient = getConnectedIdeClient(freshClients);
        if (ideClient) {
          void closeOpenDiffs(ideClient);
        }
      }

      // 从第一条真实的用户消息中提取会话标题。一次性
      void maybeMarkProjectOnboardingComplete();

      // 从第一条真实用户消息中提取会话标题。一次性
      // 通过 ref（原 tengu_birch_mist 实验：仅首条消息以节省
      // Haiku 调用）。该 ref 替换了旧的 `messages.length <= 1` 检查，
      // 该检查因 SessionStart 钩子消息（通过 useDeferredHookMessages 前置）
      // 和附件消息（由 processTextPrompt 追加）而失效 — 两者都在第一轮
      // 将长度推至超过 1，导致标题静默回退到默认的 "Claude Code"。
      // 跳过合成的面包屑 — 斜杠命令输出、提示技能扩展
      if (!titleDisabled && !sessionTitle && !agentTitle && !haikuTitleAttemptedRef.current) {
        const firstUserMessage = newMessages.find(m => m.type === 'user' && !m.isMeta);
        const text =
          firstUserMessage?.type === 'user'
            ? getContentText(firstUserMessage.message!.content as string | ContentBlockParam[])
            : null;
        // （/commit → <command-message>）、本地命令头
        // （/help → <command-name>）和 bash 模式（!cmd → <bash-input>）。
        // 这些都不是用户的主题；等待真实的文本内容。
        // 每轮将斜杠命令作用域内的 allowedTools（来自技能 frontmatter）
        if (
          text &&
          !text.startsWith(`<${LOCAL_COMMAND_STDOUT_TAG}>`) &&
          !text.startsWith(`<${COMMAND_MESSAGE_TAG}>`) &&
          !text.startsWith(`<${COMMAND_NAME_TAG}>`) &&
          !text.startsWith(`<${BASH_INPUT_TAG}>`)
        ) {
          haikuTitleAttemptedRef.current = true;
          void generateSessionTitle(text, new AbortController().signal).then(
            title => {
              if (title) setHaikuTitle(title);
              else haikuTitleAttemptedRef.current = false;
            },
            () => {
              haikuTitleAttemptedRef.current = false;
            },
          );
        }
      }

      // 应用到 store 一次。这也涵盖了重置：下一个非技能轮次
      // 传递 [] 并清除它。必须在 !shouldQuery 门之前运行：分叉命令
      // （executeForkedSlashCommand）返回 shouldQuery=false，并且
      // forkedAgent.ts 中的 createGetAppStateWithAllowedTools 会读取此字段，
      // 否则过时的技能工具会泄漏到分叉代理的权限中。
      // 之前这个写入操作隐藏在 getToolUseContext 的 getAppState 内部
      // （约 85 次调用/轮）；将其提升到这里使 getAppState 成为纯读取操作，并防止
      // 临时上下文（权限对话框、BackgroundTasksDialog）在轮次中
      // 意外清除它。
      // 如果用户输入是 bash 命令，或者用户输入是无效的斜杠命令，
      store.setState(prev => {
        const cur = prev.toolPermissionContext.alwaysAllowRules.command;
        if (
          cur === additionalAllowedTools ||
          (cur?.length === additionalAllowedTools.length && cur.every((v, i) => v === additionalAllowedTools[i]))
        ) {
          return prev;
        }
        return {
          ...prev,
          toolPermissionContext: {
            ...prev.toolPermissionContext,
            alwaysAllowRules: {
              ...prev.toolPermissionContext.alwaysAllowRules,
              command: additionalAllowedTools,
            },
          },
        };
      });

      // 则最后一条消息是助手消息。
      // 手动 /compact 直接设置消息（shouldQuery=false），绕过
      if (!shouldQuery) {
        // handleMessageFromStream。如果存在压缩边界，则清除 context-blocked，
        // 以便压缩后主动 tick 恢复。
        // 递增 conversationId，使 Messages.tsx 的行键改变，
        if (newMessages.some(isCompactBoundaryMessage)) {
          // 过时的记忆化行重新挂载压缩后的内容。
          // getToolUseContext 从 store.getState() 读取最新的 tools/mcpClients
          setConversationId(randomUUID());
          if (feature('PROACTIVE') || feature('KAIROS')) {
            proactiveModule?.setContextBlocked(false);
          }
        }
        resetLoadingState();
        setAbortController(null);
        return;
      }

      const toolUseContext = getToolUseContext(
        messagesIncludingNewMessages,
        newMessages,
        abortController,
        mainLoopModelParam,
      );
      //getToolUseContext 会从 store.getState()（通过 computeTools/mergeClients）
      // 读取最新的 tools/mcpClients。请使用这些，而不是闭包捕获的
      // `tools`/`mcpClients`——useManageMCPConnections 可能在捕获此闭包的渲染和现在之间刷新了新的 MCP 状态。
      // 通过 processInitialMessage 的第一轮调用是主要受益者。
      const { tools: freshTools, mcpClients: freshMcpClients } = toolUseContext.options;

      // 将技能的工作量覆盖范围限定于本轮上下文内
      // 包装 getAppState 可确保覆盖值不进入全局存储
      // 因此后台代理和 UI 订阅者（Spinner、LogoV2）永远不会看到它
      if (effort !== undefined) {
        const previousGetAppState = toolUseContext.getAppState;
        toolUseContext.getAppState = () => ({
          ...previousGetAppState(),
          effortValue: effort,
        });
      }

      queryCheckpoint('query_context_loading_start');
      const [, , defaultSystemPrompt, baseUserContext, systemContext] = await Promise.all([
        // 重要提示：请在上面的 setMessages() 函数之后执行此操作，以避免 UI 卡顿。
        undefined,
        // 根据 TRANSCRIPT_CLASSIFIER 进行门控，因此 GrowthBook 终止开关会在内置自动模式的任何地方运行。
        feature('TRANSCRIPT_CLASSIFIER')
          ? checkAndDisableAutoModeIfNeeded(toolPermissionContext, setAppState, store.getState().fastMode)
          : undefined,
        getSystemPrompt(
          freshTools,
          mainLoopModelParam,
          Array.from(toolPermissionContext.additionalWorkingDirectories.keys()),
          freshMcpClients,
        ),
        getUserContext(),
        getSystemContext(),
      ]);
      const userContext = {
        ...baseUserContext,
        ...getCoordinatorUserContext(freshMcpClients, isScratchpadEnabled() ? getScratchpadDir() : undefined),
        ...((feature('PROACTIVE') || feature('KAIROS')) &&
        proactiveModule?.isProactiveActive() &&
        !terminalFocusRef.current
          ? {
              terminalFocus: '终端未获得焦点 — 用户未在主动查看。',
            }
          : {}),
      };
      queryCheckpoint('query_context_loading_end');

      const systemPrompt = buildEffectiveSystemPrompt({
        mainThreadAgentDefinition,
        toolUseContext,
        customSystemPrompt,
        defaultSystemPrompt,
        appendSystemPrompt,
      });
      toolUseContext.renderedSystemPrompt = systemPrompt;

      queryCheckpoint('query_query_start');
      resetTurnHookDuration();
      resetTurnToolDuration();
      resetTurnClassifierDuration();

      for await (const event of query({
        messages: messagesIncludingNewMessages,
        systemPrompt,
        userContext,
        systemContext,
        canUseTool,
        toolUseContext,
        querySource: getQuerySourceForREPL(),
      })) {
        onQueryEvent(event);
      }

      if (feature('BUDDY') && typeof (globalThis as Record<string, unknown>).fireCompanionObserver === 'function') {
        const _fireCompanionObserver = (globalThis as Record<string, unknown>).fireCompanionObserver as (
          msgs: unknown,
          cb: (r: unknown) => void,
        ) => void;
        void _fireCompanionObserver(messagesRef.current, reaction =>
          setAppState(prev =>
            prev.companionReaction === (reaction as typeof prev.companionReaction)
              ? prev
              : { ...prev, companionReaction: reaction as typeof prev.companionReaction },
          ),
        );
      }

      queryCheckpoint('query_end');

      if (feature('UDS_INBOX')) {
        if (abortController.signal.aborted) {
          pipeReturnHadErrorRef.current = true;
          relayPipeMessage({
            type: 'error',
            data: '从属请求在完成前被中断',
          });
        }
      }

      // 在 resetLoadingState 清除引用前捕获仅限 ant 的 API 指标
      // 对于多请求轮次（工具使用循环），计算所有请求的 P50 值
      if (process.env.USER_TYPE === 'ant' && apiMetricsRef.current.length > 0) {
        const entries = apiMetricsRef.current;

        const ttfts = entries.map(e => e.ttftMs);
        // 仅使用活动流式传输时间和纯流式内容计算每请求 OTPS
        // endResponseLength 仅追踪流式增量添加的内容
        // 排除子代理/压缩操作导致的膨胀
        const otpsValues = entries.map(e => {
          const delta = Math.round((e.endResponseLength - e.responseLengthBaseline) / 4);
          const samplingMs = e.lastTokenTime - e.firstTokenTime;
          return samplingMs > 0 ? Math.round(delta / (samplingMs / 1000)) : 0;
        });

        const isMultiRequest = entries.length > 1;
        const hookMs = getTurnHookDurationMs();
        const hookCount = getTurnHookCount();
        const toolMs = getTurnToolDurationMs();
        const toolCount = getTurnToolCount();
        const classifierMs = getTurnClassifierDurationMs();
        const classifierCount = getTurnClassifierCount();
        const turnMs = Date.now() - loadingStartTimeRef.current;
        setMessages(prev => [
          ...prev,
          createApiMetricsMessage({
            ttftMs: isMultiRequest ? median(ttfts) : ttfts[0]!,
            otps: isMultiRequest ? median(otpsValues) : otpsValues[0]!,
            isP50: isMultiRequest,
            hookDurationMs: hookMs > 0 ? hookMs : undefined,
            hookCount: hookCount > 0 ? hookCount : undefined,
            turnDurationMs: turnMs > 0 ? turnMs : undefined,
            toolDurationMs: toolMs > 0 ? toolMs : undefined,
            toolCount: toolCount > 0 ? toolCount : undefined,
            classifierDurationMs: classifierMs > 0 ? classifierMs : undefined,
            classifierCount: classifierCount > 0 ? classifierCount : undefined,
            configWriteCount: getGlobalConfigWriteCount(),
          }),
        ]);
      }

      resetLoadingState();

      // 如果启用则记录查询性能分析报告
      logQueryProfileReport();

      // 发出查询轮次已成功完成的信号
      await onTurnComplete?.(messagesRef.current);
    },
    [
      initialMcpClients,
      resetLoadingState,
      getToolUseContext,
      toolPermissionContext,
      setAppState,
      customSystemPrompt,
      onTurnComplete,
      appendSystemPrompt,
      canUseTool,
      mainThreadAgentDefinition,
      onQueryEvent,
      sessionTitle,
      titleDisabled,
    ],
  );

  const onQuery = useCallback(
    async (
      newMessages: MessageType[],
      abortController: AbortController,
      shouldQuery: boolean,
      additionalAllowedTools: string[],
      mainLoopModelParam: string,
      onBeforeQueryCallback?: (input: string, newMessages: MessageType[]) => Promise<boolean>,
      input?: string,
      effort?: EffortValue,
    ): Promise<boolean> => {
      // If this is a teammate, mark them as active when starting a turn
      if (isAgentSwarmsEnabled()) {
        const teamName = getTeamName();
        const agentName = getAgentName();
        if (teamName && agentName) {
          // 触发即忘 - 轮次立即开始，写入操作在后台执行
          void setMemberActive(teamName, agentName, true);
        }
      }

      // 通过状态机实现并发防护。tryStart() 原子性地检查
      // 并执行 idle→running 状态转换，返回生成编号
      // 若已在运行则返回 null — 无需单独的检查再设置操作
      const thisGeneration = queryGuard.tryStart();
      if (thisGeneration === null) {
        logEvent('tengu_concurrent_onquery_detected', {});

        // 提取用户消息文本并加入队列，跳过不应作为
        // 用户可见文本回放的元消息
        // （例如扩展的技能内容、tick 提示）
        newMessages
          .filter((m): m is UserMessage => m.type === 'user' && !m.isMeta)
          .map(_ => getContentText(_.message.content as string | ContentBlockParam[]))
          .filter(_ => _ !== null)
          .forEach((msg, i) => {
            enqueue({ value: msg, mode: 'prompt' });
            if (i === 0) {
              logEvent('tengu_concurrent_onquery_enqueued', {});
            }
          });
        return false;
      }

      try {
        pipeReturnHadErrorRef.current = false;
        // isLoading 派生自 queryGuard — 上方的 tryStart() 已
        // 完成 dispatching→running 转换，因此此处无需调用 setter
        resetTimingRefs();
        setMessages(oldMessages => [...oldMessages, ...newMessages]);
        responseLengthRef.current = 0;
        if (feature('TOKEN_BUDGET')) {
          const parsedBudget = input ? parseTokenBudget(input) : null;
          snapshotOutputTokensForTurn(parsedBudget ?? getCurrentTurnTokenBudget());
        }
        apiMetricsRef.current = [];
        setStreamingToolUses([]);
        setStreamingText(null);

        // messagesRef 已通过上方的 setMessages 包装器同步更新
        // 因此已包含来自此 try 块顶部追加操作的 newMessages
        // 无需重建，也无需等待
        // React 的调度器（先前每个提示耗时 20-56ms；56ms 的
        // 情况是在 await 期间捕获的 GC 暂停）
        const latestMessages = messagesRef.current;

        if (input) {
          await mrOnBeforeQuery(input, latestMessages, newMessages.length);
        }

        // 将完整对话历史传递给回调函数
        if (onBeforeQueryCallback && input) {
          const shouldProceed = await onBeforeQueryCallback(input, latestMessages);
          if (!shouldProceed) {
            return true;
          }
        }

        try {
          await onQueryImpl(
            latestMessages,
            newMessages,
            abortController,
            shouldQuery,
            additionalAllowedTools,
            mainLoopModelParam,
            effort,
          );
        } catch (error) {
          if (feature('UDS_INBOX')) {
            pipeReturnHadErrorRef.current = true;
            relayPipeMessage({
              type: 'error',
              data: error instanceof Error ? error.message : String(error),
            });
          }
          throw error;
        }
      } finally {
        // queryGuard.end() 原子性地检查生成编号并执行状态转换
        // 运行→空闲。如果较新的查询持有该守卫，则返回 false
        // （取消+重新提交的竞态条件，其中过时的任务最终以微任务形式触发）。
        if (queryGuard.end(thisGeneration)) {
          setLastQueryCompletionTime(Date.now());
          skipIdleCheckRef.current = false;
          // 始终在 finally 中重置加载状态 - 这确保了即使
          // onQueryImpl 抛出异常也能进行清理。onTurnComplete 仅在
          // onQueryImpl 成功完成时被单独调用。
          resetLoadingState();

          await mrOnTurnComplete(messagesRef.current, abortController.signal.aborted);

          if (feature('UDS_INBOX') && !pipeReturnHadErrorRef.current) {
            relayPipeMessage({
              type: 'done',
              data: '',
            });
          }

          // 通知桥接客户端回合已完成，以便移动应用
          // 可以停止火花动画并显示回合后 UI。
          sendBridgeResultRef.current();

          // 在回合结束时自动隐藏 tungsten 面板内容（仅限 ant），但保持
          // tungstenActiveSession 设置，以便药丸状按钮保留在页脚且用户
          // 可以重新打开面板。后台 tmux 任务（例如 /hunter）会运行
          // 数分钟 — 清除会话会导致药丸完全消失，迫使用户
          // 必须重新调用 Tmux 才能查看。在中断时跳过此操作，以便面板
          // 保持打开以供检查（与下方的回合时长守卫匹配）。
          if (process.env.USER_TYPE === 'ant' && !abortController.signal.aborted) {
            setAppState(prev => {
              if (prev.tungstenActiveSession === undefined) return prev;
              if (prev.tungstenPanelAutoHidden === true) return prev;
              return { ...prev, tungstenPanelAutoHidden: true };
            });
          }

          // 在清除前捕获预算信息（仅限 ant）
          let budgetInfo: { tokens: number; limit: number; nudges: number } | undefined;
          if (feature('TOKEN_BUDGET')) {
            if (
              getCurrentTurnTokenBudget() !== null &&
              getCurrentTurnTokenBudget()! > 0 &&
              !abortController.signal.aborted
            ) {
              budgetInfo = {
                tokens: getTurnOutputTokens(),
                limit: getCurrentTurnTokenBudget()!,
                nudges: getBudgetContinuationCount(),
              };
            }
            snapshotOutputTokensForTurn(null);
          }

          // 为超过 30 秒或具有预算的回合添加回合时长消息
          // 如果用户中断或处于循环模式则跳过（在 tick 之间过于嘈杂）
          // 如果群组队友仍在运行则延迟显示（在他们完成时显示）
          const turnDurationMs = Date.now() - loadingStartTimeRef.current - totalPausedMsRef.current;
          if (
            (turnDurationMs > 30000 || budgetInfo !== undefined) &&
            !abortController.signal.aborted &&
            !proactiveActive
          ) {
            const hasRunningSwarmAgents = getAllInProcessTeammateTasks(store.getState().tasks).some(
              t => t.status === 'running',
            );
            if (hasRunningSwarmAgents) {
              // 仅在第一个延迟的回合上记录开始时间
              if (swarmStartTimeRef.current === null) {
                swarmStartTimeRef.current = loadingStartTimeRef.current;
              }
              // 始终更新预算 — 后续回合可能携带实际预算
              if (budgetInfo) {
                swarmBudgetInfoRef.current = budgetInfo;
              }
            } else {
              setMessages(prev => [
                ...prev,
                createTurnDurationMessage(turnDurationMs, budgetInfo, count(prev, isLoggableMessage)),
              ]);
            }
          }
          // 清除控制器，以便 CancelRequestHandler 的 canCancelRunningTask
          // 在空闲提示时读取 false。若不这样做，过时且未中断的
          // 控制器会使 ctrl+c 触发 onCancel()（不中断任何操作）而非
          // 传播到双击退出流程。
          setAbortController(null);
        }

        // 自动恢复：如果用户在收到任何有意义的响应前中断，
        // 则回滚对话并恢复其提示 — 等同于
        // 打开消息选择器并选择最后一条消息。
        // 这在 queryGuard.end() 检查之外运行，因为 onCancel 调用
        // forceEnd()，这会增加代次，导致上方的 end() 返回 false。
        // 守卫条件：reason === 'user-cancel'（onCancel/Esc；程序化中断
        // 使用 'background'/'interrupt' 且不得回滚 — 注意 abort() 带有
        // 无参数时 reason 设为 DOMException 而非 undefined，!isActive（无
        // 更新的查询已启动 — 取消+重新提交竞争），空输入（不
        // 覆盖加载期间键入的文本），无排队命令（用户排队
        // B 而 A 正在加载 → 用户已继续操作，不恢复 A；同时
        // 避免 removeLastFromHistory 误删 B 的条目而非 A 的），
        // 未查看队友消息（messagesRef 是主对话 —
        // 旧版上箭头快速恢复有此防护，予以保留）。
        if (
          abortController.signal.reason === 'user-cancel' &&
          !queryGuard.isActive &&
          inputValueRef.current === '' &&
          getCommandQueueLength() === 0 &&
          !store.getState().viewingAgentTaskId
        ) {
          const msgs = messagesRef.current;
          const lastUserMsg = msgs.findLast(selectableUserMessagesFilter);
          if (lastUserMsg) {
            const idx = msgs.lastIndexOf(lastUserMsg);
            if (messagesAfterAreOnlySynthetic(msgs, idx)) {
              // 提交正在被撤销 — 同时撤销其历史记录条目，
              // 否则上箭头会显示两次恢复的文本。
              removeLastFromHistory();
              restoreMessageSyncRef.current(lastUserMsg);
            }
          }
        }
      }
      return true;
    },
    [onQueryImpl, setAppState, resetLoadingState, queryGuard, mrOnBeforeQuery, mrOnTurnComplete],
  );

  // 处理初始消息（来自 CLI 参数或计划模式退出时上下文已清除）
  // 当 isLoading 变为 false 且有待处理消息时执行此效果
  const initialMessageRef = useRef(false);
  useEffect(() => {
    const pending = initialMessage;
    if (!pending || isLoading || initialMessageRef.current) return;

    // 标记为处理中以防止重复进入
    initialMessageRef.current = true;

    async function processInitialMessage(initialMsg: NonNullable<typeof pending>) {
      // 如请求则清除上下文（计划模式退出）
      if (initialMsg.clearContext) {
        // 清除上下文前保留计划标识符，以便新会话
        // 在 regenerateSessionId() 后能访问同一计划文件
        const oldPlanSlug = initialMsg.message.planContent ? getPlanSlug() : undefined;

        const { clearConversation } = await import('../commands/clear/conversation.js');
        await clearConversation({
          setMessages,
          readFileState: readFileState.current,
          discoveredSkillNames: discoveredSkillNamesRef.current,
          loadedNestedMemoryPaths: loadedNestedMemoryPathsRef.current,
          getAppState: () => store.getState(),
          setAppState,
          setConversationId,
        });
        haikuTitleAttemptedRef.current = false;
        setHaikuTitle(undefined);
        bashTools.current.clear();
        bashToolsProcessedIdx.current = 0;

        // 为新会话恢复计划标识符，使 getPlan() 能找到文件
        if (oldPlanSlug) {
          setPlanSlug(getSessionId(), oldPlanSlug);
        }
      }

      // 原子操作：清除初始消息，设置权限模式和规则
      setAppState(prev => {
        // 构建并应用权限更新（模式 + allowedPrompts 规则）
        let updatedToolPermissionContext = initialMsg.mode
          ? applyPermissionUpdates(
              prev.toolPermissionContext,
              buildPermissionUpdates(initialMsg.mode, initialMsg.allowedPrompts),
            )
          : prev.toolPermissionContext;
        // 对于自动模式，覆盖模式（buildPermissionUpdates 通过
        // toExternalPermissionMode 将其映射为 'default'）并移除危险规则
        if (feature('TRANSCRIPT_CLASSIFIER') && initialMsg.mode === 'auto') {
          updatedToolPermissionContext = stripDangerousPermissionsForAutoMode({
            ...updatedToolPermissionContext,
            mode: 'auto',
            prePlanMode: undefined,
          });
        }

        return {
          ...prev,
          initialMessage: null,
          toolPermissionContext: updatedToolPermissionContext,
        };
      });

      // 创建文件历史快照用于代码回退
      if (fileHistoryEnabled()) {
        void fileHistoryMakeSnapshot((updater: (prev: FileHistoryState) => FileHistoryState) => {
          setAppState(prev => ({
            ...prev,
            fileHistory: updater(prev.fileHistory),
          }));
        }, initialMsg.message.uuid);
      }

      // 确保首次 API 调用前 SessionStart 钩子上下文可用
      // onSubmit 内部调用此函数，但下方的 onQuery 路径
      // 绕过 onSubmit — 在此提升以使两条路径都能看到钩子消息
      await awaitPendingHooks();

      // 将所有初始提示通过 onSubmit 路由以确保 UserPromptSubmit 钩子触发
      // 待办：通过统一路由至 onSubmit 来简化（待其支持
      // ContentBlockParam 数组（图像）作为输入后）
      const content = initialMsg.message.message.content;

      // 将所有字符串内容通过 onSubmit 路由以确保钩子触发
      // 对于复杂内容（图像等），回退到直接 onQuery
      // 计划消息绕过 onSubmit 以保留用于渲染的 planContent 元数据
      if (typeof content === 'string' && !initialMsg.message.planContent) {
        // 通过 onSubmit 路由进行正确处理，包括 UserPromptSubmit 钩子
        void onSubmit(content, {
          setCursorOffset: () => {},
          clearBuffer: () => {},
          resetHistory: () => {},
        });
      } else {
        // 规划消息或复杂内容（图片等）- 直接发送给模型
        // 规划消息使用 onQuery 以保留用于渲染的 planContent 元数据
        // TODO: 一旦 onSubmit 支持 ContentBlockParam 数组，就移除这个分支
        const newAbortController = createAbortController();
        setAbortController(newAbortController);

        void onQuery(
          [initialMsg.message],
          newAbortController,
          true, // shouldQuery
          [], // additionalAllowedTools
          mainLoopModel,
        );
      }

      // 延迟后重置引用，以允许新的初始消息
      setTimeout(
        ref => {
          ref.current = false;
        },
        100,
        initialMessageRef,
      );
    }

    void processInitialMessage(pending);
  }, [initialMessage, isLoading, setMessages, setAppState, onQuery, mainLoopModel, tools]);

  const onSubmit = useCallback(
    async (
      input: string,
      helpers: PromptInputHelpers,
      speculationAccept?: {
        state: ActiveSpeculationState;
        speculationSessionTimeSavedMs: number;
        setAppState: SetAppState;
      },
      options?: { fromKeybinding?: boolean },
    ) => {
      // 提交时重新将滚动条固定到底部，这样用户总能看到新的
      // 交互（匹配 OpenCode 的自动滚动行为）。
      repinScroll();

      // 如果暂停则恢复循环模式
      if (feature('PROACTIVE') || feature('KAIROS')) {
        proactiveModule?.resumeProactive();
      }

      // 将用户输入路由到选定的管道目标（提取到 usePipeRouter）
      if (routeToSelectedPipes(input)) {
        // 在消息列表中显示用户的提示，以便他们能看到发送的内容
        const userMessage = createUserMessage({ content: input });
        setMessages(prev => [...prev, userMessage]);

        if (!options?.fromKeybinding) {
          addToHistory({
            display: prependModeCharacterToInput(input, inputMode),
            pastedContents,
          });
        }
        setInputValue('');
        helpers.setCursorOffset(0);
        helpers.clearBuffer();
        setPastedContents({});
        setInputMode('prompt');
        setIDESelection(undefined);
        return;
      }

      // 处理即时命令 - 这些命令绕过队列并立即执行
      // 即使在 Claude 处理时也是如此。命令通过 `immediate: true` 选择加入。
      // 通过快捷键触发的命令始终被视为即时命令。
      if (!speculationAccept && input.trim().startsWith('/')) {
        // 展开 [Pasted text #N] 引用，以便即时命令（例如 /btw）接收
        // 粘贴的内容，而不是占位符。非即时路径稍后会在
        // handlePromptSubmit 中获得此展开。
        const trimmedInput = expandPastedTextRefs(input, pastedContents).trim();
        const spaceIndex = trimmedInput.indexOf(' ');
        const commandName = spaceIndex === -1 ? trimmedInput.slice(1) : trimmedInput.slice(1, spaceIndex);
        const commandArgs = spaceIndex === -1 ? '' : trimmedInput.slice(spaceIndex + 1).trim();

        // 查找匹配的命令 - 如果满足以下条件则视为即时命令：
        // 1. 命令具有 `immediate: true`，或者
        // 2. 命令是通过快捷键触发的（fromKeybinding 选项）
        const matchingCommand = commands.find(
          cmd =>
            isCommandEnabled(cmd) &&
            (cmd.name === commandName || cmd.aliases?.includes(commandName) || getCommandName(cmd) === commandName),
        );
        if (matchingCommand?.name === 'clear' && idleHintShownRef.current) {
          logEvent('tengu_idle_return_action', {
            action: 'hint_converted' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            variant: idleHintShownRef.current as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            idleMinutes: Math.round((Date.now() - lastQueryCompletionTimeRef.current) / 60_000),
            messageCount: messagesRef.current.length,
            totalInputTokens: getTotalInputTokens(),
          });
          idleHintShownRef.current = false;
        }

        const shouldTreatAsImmediate = queryGuard.isActive && (matchingCommand?.immediate || options?.fromKeybinding);

        if (matchingCommand && shouldTreatAsImmediate && matchingCommand.type === 'local-jsx') {
          // 仅当提交的文本与提示中的内容匹配时才清除输入。
          // 当命令快捷键触发时，输入是 "/<command>"，但实际的
          // 输入值是用户现有的文本 - 在这种情况下不要清除它。
          if (input.trim() === inputValueRef.current.trim()) {
            setInputValue('');
            helpers.setCursorOffset(0);
            helpers.clearBuffer();
            setPastedContents({});
          }

          const pastedTextRefs = parseReferences(input).filter(r => pastedContents[r.id]?.type === 'text');
          const pastedTextCount = pastedTextRefs.length;
          const pastedTextBytes = pastedTextRefs.reduce(
            (sum, r) => sum + (pastedContents[r.id]?.content.length ?? 0),
            0,
          );
          logEvent('tengu_paste_text', { pastedTextCount, pastedTextBytes });
          logEvent('tengu_immediate_command_executed', {
            commandName: matchingCommand.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            fromKeybinding: options?.fromKeybinding ?? false,
          });

          // 直接执行命令
          const executeImmediateCommand = async (): Promise<void> => {
            let doneWasCalled = false;
            const onDone = (
              result?: string,
              doneOptions?: {
                display?: CommandResultDisplay;
                metaMessages?: string[];
              },
            ): void => {
              doneWasCalled = true;
              setToolJSX({
                jsx: null,
                shouldHidePromptInput: false,
                clearLocalJSX: true,
              });
              const newMessages: MessageType[] = [];
              if (result && doneOptions?.display !== 'skip') {
                addNotification({
                  key: `immediate-${matchingCommand.name}`,
                  text: result,
                  priority: 'immediate',
                });
                // 在全屏模式下，命令仅显示为居中的模态
                // 窗格 - 上面的通知已足够作为反馈。在
                // 记录中添加 "❯ /config" + "⎿ dismissed" 会造成混乱
                // （这些消息的类型是 type:system subtype:local_command -
                // 用户可见但不会发送给模型，因此跳过它们
                // 不会改变模型上下文）。在全屏模式外，
                // 记录条目会保留，以便滚动查看时显示运行过的内容。
                if (!isFullscreenEnvEnabled()) {
                  newMessages.push(
                    createCommandInputMessage(formatCommandInputTags(getCommandName(matchingCommand), commandArgs)),
                    createCommandInputMessage(
                      `<${LOCAL_COMMAND_STDOUT_TAG}>${escapeXml(result)}</${LOCAL_COMMAND_STDOUT_TAG}>`,
                    ),
                  );
                }
              }
              // 向对话记录中注入元消息（模型可见，用户隐藏）
              if (doneOptions?.metaMessages?.length) {
                newMessages.push(
                  ...doneOptions.metaMessages.map(content => createUserMessage({ content, isMeta: true })),
                );
              }
              if (newMessages.length) {
                setMessages(prev => [...prev, ...newMessages]);
              }
              // 在 local-jsx 命令完成后恢复暂存的提示词。
              // 跳过了正常的暂存恢复路径（下方），因为
              // local-jsx 命令会从 onSubmit 中提前返回。
              if (stashedPrompt !== undefined) {
                setInputValue(stashedPrompt.text);
                helpers.setCursorOffset(stashedPrompt.cursorOffset);
                setPastedContents(stashedPrompt.pastedContents);
                setStashedPrompt(undefined);
              }
            };

            // 为命令构建上下文（复用现有的 getToolUseContext）。
            // 通过 ref 读取消息，以保持 onSubmit 在消息
            // 更新期间的稳定性 — 与 L2384/L2400/L2662 处的模式匹配，并避免
            // 在下游闭包中固定过时的 REPL 渲染作用域。
            const context = getToolUseContext(messagesRef.current, [], createAbortController(), mainLoopModel);

            const mod = await matchingCommand.load();
            const jsx = await mod.call(onDone, context, commandArgs);

            // 如果 onDone 已触发则跳过 — 防止 isLocalJSXCommand 卡住
            // （完整机制请参阅 processSlashCommand.tsx 中的 local-jsx 分支）。
            if (jsx && !doneWasCalled) {
              // shouldHidePromptInput: false 保持 Notifications 挂载
              // 这样 onDone 的结果就不会丢失
              setToolJSX({
                jsx,
                shouldHidePromptInput: false,
                isLocalJSXCommand: true,
              });
            }
          };
          void executeImmediateCommand();
          return; // 始终提前返回 — 不要添加到历史记录或队列中
        }
      }

      // 远程模式：在任何状态变更之前，尽早跳过空输入
      if (activeRemote.isRemoteMode && !input.trim()) {
        return;
      }

      // 空闲返回：当对话规模大且缓存冷时，提示返回的用户重新开始。
      // tengu_willow_mode 控制处理方式："dialog"（阻塞）、"hint"（通知）、"off"。
      // 添加到历史记录中，用于直接的用户提交。
      {
        const willowMode = getFeatureValue_CACHED_MAY_BE_STALE('tengu_willow_mode', 'off');
        const idleThresholdMin = Number(process.env.CLAUDE_CODE_IDLE_THRESHOLD_MINUTES ?? 75);
        const tokenThreshold = Number(process.env.CLAUDE_CODE_IDLE_TOKEN_THRESHOLD ?? 100_000);
        if (
          willowMode !== 'off' &&
          !getGlobalConfig().idleReturnDismissed &&
          !skipIdleCheckRef.current &&
          !speculationAccept &&
          !input.trim().startsWith('/') &&
          lastQueryCompletionTimeRef.current > 0 &&
          getTotalInputTokens() >= tokenThreshold
        ) {
          const idleMs = Date.now() - lastQueryCompletionTimeRef.current;
          const idleMinutes = idleMs / 60_000;
          if (idleMinutes >= idleThresholdMin && willowMode === 'dialog') {
            setIdleReturnPending({ input, idleMinutes });
            setInputValue('');
            helpers.setCursorOffset(0);
            helpers.clearBuffer();
            return;
          }
        }
      }

      // 队列命令处理（executeQueuedInput）不调用 onSubmit，
      // 因此通知和已排队的用户输入不会在此处添加到历史记录。
      // 跳过由快捷键触发的命令的历史记录（用户未输入该命令）。
      // 将刚刚提交的命令添加到幽灵文本缓存的前端
      if (!options?.fromKeybinding) {
        addToHistory({
          display: speculationAccept ? input : prependModeCharacterToInput(input, inputMode),
          pastedContents: speculationAccept ? {} : pastedContents,
        });
        // 以便立即建议（而不是在 60 秒 TTL 之后）。
        // 如果存在暂存则恢复，但斜杠命令或加载时除外。
        if (inputMode === 'bash') {
          prependToShellHistoryCache(input.trim());
        }
      }

      // - 斜杠命令（尤其是交互式命令，如 /model、/context）会隐藏
      // 提示词并显示选择器 UI。在命令执行期间恢复暂存会将文本
      // 放入隐藏的输入框中，用户输入下一个命令时会丢失它。
      // 相反，保留暂存，使其在命令运行期间得以保留。
      // - 加载时，提交的输入将被排队，handlePromptSubmit
      // 将清空输入字段（onInputChange('')），这会覆盖
      // 恢复的暂存。将恢复推迟到 handlePromptSubmit 之后（下方）。
      // 恢复暂存。将恢复操作推迟到 handlePromptSubmit（下方）之后。
      // 远程模式例外：它通过 WebSocket 发送并提前返回，无需调用 handlePromptSubmit，因此不存在覆盖风险——可立即恢复。
      // 在两种延迟情况下，存储的内容会在 await handlePromptSubmit 之后恢复。
      // 当未处于加载状态、接受推测执行或在远程模式（通过 WebSocket 发送并提前返回，不调用 handlePromptSubmit）时，提交会“立即”运行（不排队）。
      const isSlashCommand = !speculationAccept && input.trim().startsWith('/');
      // 当未加载或未接受推测执行时，清空输入。
      // 为键盘快捷键触发的命令保留输入内容。
      // 在与 setInputValue('') 相同的 React 批次中显示占位符。
      const submitsNow = !isLoading || speculationAccept || activeRemote.isRemoteMode;
      if (stashedPrompt !== undefined && !isSlashCommand && submitsNow) {
        setInputValue(stashedPrompt.text);
        helpers.setCursorOffset(stashedPrompt.cursorOffset);
        setPastedContents(stashedPrompt.pastedContents);
        setStashedPrompt(undefined);
      } else if (submitsNow) {
        if (!options?.fromKeybinding) {
          // 斜杠命令和 bash 命令（它们有自己的回显）、推测执行和远程模式（两者都直接设置消息，无需填补间隙）跳过此步骤。
          // showSpinner 包含 userInputOnProcessing，因此加载指示器会在此次渲染中显示。现在重置计时引用（在 queryGuard.reserve() 之前），这样经过的时间就不会读取为 Date.now() - 0。上面的 isQueryActive 转换执行相同的重置——这是幂等的。
          setInputValue('');
          helpers.setCursorOffset(0);
        }
        setPastedContents({});
      }

      if (submitsNow) {
        setInputMode('prompt');
        setIDESelection(undefined);
        setSubmitCount(_ => _ + 1);
        helpers.clearBuffer();
        tipPickedThisTurnRef.current = false;

        // 为归因跟踪增加提示计数并保存快照
        // 快照会持久化 promptCount，使其在压缩后仍能保留
        // 归因：保存快照失败：{0}
        if (!isSlashCommand && inputMode === 'prompt' && !speculationAccept && !activeRemote.isRemoteMode) {
          setUserInputOnProcessing(input);
          // 处理推测执行接受
          // 远程模式：通过 stream-json 发送输入，而非本地查询。
          // 来自远程的权限请求会桥接到 toolUseConfirmQueue，并使用标准的 PermissionRequest 组件进行渲染。
          // 本地 JSX 斜杠命令（例如 /agents、/config）在本地进程中渲染 UI——它们没有远程等效项。让这些命令继续执行 handlePromptSubmit，以便在本地运行。提示命令和纯文本则发送到远程。
          resetTimingRefs();
        }

        // 当存在粘贴的附件（如图片）时，构建内容块
        // 创建用户消息并添加到 UI
        if (feature('COMMIT_ATTRIBUTION')) {
          setAppState(prev => ({
            ...prev,
            attribution: incrementPromptCount(prev.attribution, snapshot => {
              void recordAttributionSnapshot(snapshot).catch(error => {
                logForDebugging(`注意：空输入已由上述提前返回处理`);
              });
            }),
          }));
        }
      }

      // 发送到远程会话
      if (speculationAccept) {
        const { queryRequired } = await handleSpeculationAccept(
          speculationAccept.state,
          speculationAccept.speculationSessionTimeSavedMs,
          speculationAccept.setAppState,
          input,
          {
            setMessages,
            readFileState,
            cwd: getOriginalCwd(),
          },
        );
        if (queryRequired) {
          const newAbortController = createAbortController();
          setAbortController(newAbortController);
          void onQuery([], newAbortController, true, [], mainLoopModel);
        }
        return;
      }

      // 远程模式：通过 stream-json 发送输入，而非本地查询。
      // 来自远程的权限请求会桥接到 toolUseConfirmQueue
      // 并使用标准的 PermissionRequest 组件进行渲染。
      //
      // local-jsx 斜杠命令（例如 /agents、/config）在本地进程中渲染 UI — 它们没有远程对应项。让这些命令直接进入
      // handlePromptSubmit，以便在本地执行。提示命令和
      // 纯文本则发送到远程。
      // 当存在粘贴的附件（如图片）时，构建内容块
      if (
        activeRemote.isRemoteMode &&
        !(
          isSlashCommand &&
          commands.find(c => {
            const name = input.trim().slice(1).split(/\s/)[0];
            return isCommandEnabled(c) && (c.name === name || c.aliases?.includes(name!) || getCommandName(c) === name);
          })?.type === 'local-jsx'
        )
      ) {
        // 创建用户消息并添加到 UI
        const pastedValues = Object.values(pastedContents);
        const imageContents = pastedValues.filter(c => c.type === 'image');
        const imagePasteIds = imageContents.length > 0 ? imageContents.map(c => c.id) : undefined;

        let messageContent: string | ContentBlockParam[] = input.trim();
        let remoteContent: RemoteMessageContent = input.trim();
        if (pastedValues.length > 0) {
          const contentBlocks: ContentBlockParam[] = [];
          const remoteBlocks: Array<{ type: string; [key: string]: unknown }> = [];

          const trimmedInput = input.trim();
          if (trimmedInput) {
            contentBlocks.push({ type: 'text', text: trimmedInput });
            remoteBlocks.push({ type: 'text', text: trimmedInput });
          }

          for (const pasted of pastedValues) {
            if (pasted.type === 'image') {
              const source = {
                type: 'base64' as const,
                media_type: (pasted.mediaType ?? 'image/png') as
                  | 'image/jpeg'
                  | 'image/png'
                  | 'image/gif'
                  | 'image/webp',
                data: pasted.content,
              };
              contentBlocks.push({ type: 'image', source });
              remoteBlocks.push({ type: 'image', source });
            } else {
              contentBlocks.push({ type: 'text', text: pasted.content });
              remoteBlocks.push({ type: 'text', text: pasted.content });
            }
          }

          messageContent = contentBlocks;
          remoteContent = remoteBlocks;
        }

        // 注意：空输入已由上述提前返回处理
        // 发送到远程会话
        const userMessage = createUserMessage({
          content: messageContent,
          imagePasteIds,
        });
        setMessages(prev => [...prev, userMessage]);

        // 当 deferredMessages 滞后于 messages 时。在查看时被抑制
        await activeRemote.sendMessage(remoteContent, {
          uuid: userMessage.uuid,
        });
        return;
      }

      // 确保在首次 API 调用前，SessionStart 钩子上下文可用。
      await awaitPendingHooks();

      await handlePromptSubmit({
        input,
        helpers,
        queryGuard,
        isExternalLoading,
        mode: inputMode,
        commands,
        onInputChange: setInputValue,
        setPastedContents,
        setToolJSX,
        getToolUseContext,
        messages: messagesRef.current,
        mainLoopModel,
        pastedContents,
        ideSelection,
        setUserInputOnProcessing,
        setAbortController,
        abortController,
        onQuery,
        setAppState,
        querySource: getQuerySourceForREPL(),
        onBeforeQuery,
        canUseTool,
        addNotification,
        setMessages,
        // 通过 ref 读取，以便 streamMode 可以从 onSubmit 的依赖项中移除 ——
        // handlePromptSubmit 仅将其用于调试日志和遥测事件。
        streamMode: streamModeRef.current,
        hasInterruptibleToolInProgress: hasInterruptibleToolInProgressRef.current,
      });

      // 恢复之前延迟暂存的内容。有两种情况：
      // - 斜杠命令：handlePromptSubmit 等待了完整的命令执行
      // （包括交互式选择器）。现在恢复会将暂存内容放回
      // 可见的输入框中。
      // - 加载（已排队）：handlePromptSubmit 将内容排队并清空输入，然后
      // 快速返回。现在恢复会在清空后将暂存内容放回。
      if ((isSlashCommand || isLoading) && stashedPrompt !== undefined) {
        setInputValue(stashedPrompt.text);
        helpers.setCursorOffset(stashedPrompt.cursorOffset);
        setPastedContents(stashedPrompt.pastedContents);
        setStashedPrompt(undefined);
      }
    },
    [
      queryGuard,
      // isLoading 在用于清除输入和 submitCount 门控的 !isLoading 检查中被读取。
      // 它由 isQueryActive || isExternalLoading 派生而来，
      // 因此将其包含在此处可确保闭包捕获到最新值。
      isLoading,
      isExternalLoading,
      inputMode,
      commands,
      setInputValue,
      setInputMode,
      setPastedContents,
      setSubmitCount,
      setIDESelection,
      setToolJSX,
      getToolUseContext,
      // messages 通过回调内部的 messagesRef.current 读取，以保持 onSubmit
      // 在消息更新时稳定（参见 L2384/L2400/L2662）。如果没有这一点，
      // 每次 setMessages 调用（每轮约 30 次）都会重新创建 onSubmit，
      // 将 REPL 渲染作用域（1776B）以及该次渲染的 messages
      // 数组固定在下游闭包（PromptInput、handleAutoRunIssue）中。
      // 堆分析显示，在 #20174/#20175 之后，累计了约 9 个 REPL 作用域和
      // 约 15 个 messages 数组版本，都可追溯到该依赖项。
      mainLoopModel,
      pastedContents,
      ideSelection,
      setUserInputOnProcessing,
      setAbortController,
      addNotification,
      onQuery,
      stashedPrompt,
      setStashedPrompt,
      setAppState,
      onBeforeQuery,
      canUseTool,
      remoteSession,
      setMessages,
      awaitPendingHooks,
      repinScroll,
    ],
  );

  // 当用户查看队友的对话记录时提交输入的回调函数
  const onAgentSubmit = useCallback(
    async (input: string, task: InProcessTeammateTaskState | LocalAgentTaskState, helpers: PromptInputHelpers) => {
      if (isLocalAgentTask(task)) {
        appendMessageToLocalAgent(task.id, createUserMessage({ content: input }), setAppState);
        if (task.status === 'running') {
          queuePendingMessage(task.id, input, setAppState);
        } else {
          void resumeAgentBackground({
            agentId: task.id,
            prompt: input,
            toolUseContext: getToolUseContext(messagesRef.current, [], new AbortController(), mainLoopModel),
            canUseTool,
          }).catch(err => {
            logForDebugging(`resumeAgentBackground 失败：${errorMessage(err)}`);
            addNotification({
              key: `resume-agent-failed-${task.id}`,
              jsx: <Text color="error">Failed to resume agent: {errorMessage(err)}</Text>,
              priority: 'low',
            });
          });
        }
      } else {
        injectUserMessageToTeammate(task.id, input, undefined, setAppState);
      }
      setInputValue('');
      helpers.setCursorOffset(0);
      helpers.clearBuffer();
    },
    [setAppState, setInputValue, getToolUseContext, canUseTool, mainLoopModel, addNotification],
  );

  // 用于自动运行 /issue 或 /good-claude 的处理程序（在 onSubmit 之后定义）
  const handleAutoRunIssue = useCallback(() => {
    const command = autoRunIssueReason ? getAutoRunCommand(autoRunIssueReason) : '/issue';
    setAutoRunIssueReason(null); // 清除状态
    onSubmit(command, {
      setCursorOffset: () => {},
      clearBuffer: () => {},
      resetHistory: () => {},
    }).catch(err => {
      logForDebugging(`自动运行 ${command} 失败：${errorMessage(err)}`);
    });
  }, [onSubmit, autoRunIssueReason]);

  const handleCancelAutoRunIssue = useCallback(() => {
    setAutoRunIssueReason(null);
  }, []);

  // 当用户在调查感谢屏幕上按 1 分享详细信息时的处理程序
  const handleSurveyRequestFeedback = useCallback(() => {
    const command = process.env.USER_TYPE === 'ant' ? '/issue' : '/feedback';
    onSubmit(command, {
      setCursorOffset: () => {},
      clearBuffer: () => {},
      resetHistory: () => {},
    }).catch(err => {
      logForDebugging(`调查反馈请求失败：${err instanceof Error ? err.message : String(err)}`);
    });
  }, [onSubmit]);

  // onSubmit 不稳定（依赖项包含每次交互都会变化的 `messages`）。
  // `handleOpenRateLimitOptions` 通过属性逐层传递到每个 MessageRow，并且每个
  // MessageRow 的 fiber 在挂载时都会固定该闭包（并间接固定整个 REPL 渲染
  // 作用域，约 1.8KB）。使用 ref 可以保持此回调稳定，以便
  // 旧的 REPL 作用域可以被垃圾回收 —— 在 1000 轮会话中节省约 35MB。
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const handleOpenRateLimitOptions = useCallback(() => {
    void onSubmitRef.current('/rate-limit-options', {
      setCursorOffset: () => {},
      clearBuffer: () => {},
      resetHistory: () => {},
    });
  }, []);

  const handleExit = useCallback(async () => {
    setIsExiting(true);
    // 在后台会话中，始终执行分离而非终止 —— 即使工作树处于
    // 活动状态。没有此防护，下面的工作树分支会短路进入
    // ExitFlow（它会调用 gracefulShutdown），而 exit.tsx 尚未加载。
    if (feature('BG_SESSIONS') && isBgSession()) {
      spawnSync('tmux', ['detach-client'], { stdio: 'ignore' });
      setIsExiting(false);
      return;
    }
    const showWorktree = getCurrentWorktreeSession() !== null;
    if (showWorktree) {
      setExitFlow(
        <ExitFlow
          showWorktree
          onDone={() => {}}
          onCancel={() => {
            setExitFlow(null);
            setIsExiting(false);
          }}
        />,
      );
      return;
    }
    const exitMod = await exit.load();
    const exitFlowResult = await exitMod.call(() => {});
    setExitFlow(exitFlowResult);
    // 如果 call() 返回时没有终止进程（后台会话分离），
    // 则清除 isExiting 标志，以便在重新附加时 UI 可用。在正常
    // 路径上无操作 —— gracefulShutdown 的 process.exit() 意味着我们永远不会到达这里。
    if (exitFlowResult === null) {
      setIsExiting(false);
    }
  }, []);

  const handleShowMessageSelector = useCallback(() => {
    setIsMessageSelectorVisible(prev => !prev);
  }, []);

  // 将对话状态回退到 `message` 之前：切片 messages 数组，
  // 重置对话 ID、微压缩状态、权限模式和提示建议。
  // 不触及提示输入。索引是从 messagesRef 计算得出的（始终
  // 通过 setMessages 包装器保持最新），因此调用者无需担心
  // 过时的闭包。
  const rewindConversationTo = useCallback(
    (message: UserMessage) => {
      const prev = messagesRef.current;
      const messageIndex = prev.lastIndexOf(message);
      if (messageIndex === -1) return;

      logEvent('tengu_conversation_rewind', {
        preRewindMessageCount: prev.length,
        postRewindMessageCount: messageIndex,
        messagesRemoved: prev.length - messageIndex,
        rewindToMessageIndex: messageIndex,
      });
      setMessages(prev.slice(0, messageIndex));
      // 注意，这必须在 setMessages 之后执行
      setConversationId(randomUUID());
      // 重置缓存的微压缩状态，以免过时的固定缓存编辑
      // 不要引用被截断消息中的 tool_use_ids
      resetMicrocompactState();
      if (feature('CONTEXT_COLLAPSE')) {
        // 回滚会截断 REPL 数组。那些存档跨度
        // 超过回滚点的提交将无法再被投影
        // （projectView 会静默跳过它们），但暂存队列和 ID
        // 映射引用了过时的 UUID。最简单安全的重置方式：丢弃
        // 所有内容。ctx-agent 将在下次
        // 阈值跨越时重新暂存。
        /* eslint-disable @typescript-eslint/no-require-imports */
        (
          require('../services/contextCollapse/index.js') as typeof import('../services/contextCollapse/index.js')
        ).resetContextCollapse();
        /* eslint-enable @typescript-eslint/no-require-imports */
      }

      // 从我们要回滚到的消息中恢复状态
      const permMode = message.permissionMode as InternalPermissionMode | undefined;
      setAppState(prev => ({
        ...prev,
        // 从消息中恢复权限模式
        toolPermissionContext:
          permMode && prev.toolPermissionContext.mode !== permMode
            ? {
                ...prev.toolPermissionContext,
                mode: permMode,
              }
            : prev.toolPermissionContext,
        // 清除先前对话状态中过时的提示建议
        promptSuggestion: {
          text: null,
          promptId: null,
          shownAt: 0,
          acceptedAt: 0,
          generationRequestId: null,
        },
      }));
    },
    [setMessages, setAppState],
  );

  // 同步回滚 + 输入填充。直接用于中断时的自动恢复
  // （这样 React 会与 abort 的 setMessages 批量处理 → 单次渲染，
  // 无闪烁）。MessageSelector 通过 handleRestoreMessage 使用 setImmediate 包装此操作。
  const restoreMessageSync = useCallback(
    (message: UserMessage) => {
      rewindConversationTo(message);

      const r = textForResubmit(message);
      if (r) {
        setInputValue(r.text);
        setInputMode(r.mode);
      }

      // 恢复粘贴的图片
      if (Array.isArray(message.message.content) && message.message.content.some(block => block.type === 'image')) {
        const imageBlocks: Array<ImageBlockParam> = message.message.content.filter(block => block.type === 'image');
        if (imageBlocks.length > 0) {
          const newPastedContents: Record<number, PastedContent> = {};
          imageBlocks.forEach((block, index) => {
            if (block.source.type === 'base64') {
              const id = (message.imagePasteIds as number[] | undefined)?.[index] ?? index + 1;
              newPastedContents[id] = {
                id,
                type: 'image',
                content: block.source.data,
                mediaType: block.source.media_type,
              };
            }
          });
          setPastedContents(newPastedContents);
        }
      }
    },
    [rewindConversationTo, setInputValue],
  );
  restoreMessageSyncRef.current = restoreMessageSync;

  // MessageSelector 路径：通过 setImmediate 延迟，以便“已中断”消息
  // 在回滚前渲染为静态输出 — 否则它会残留
  // 在屏幕顶部。
  const handleRestoreMessage = useCallback(
    async (message: UserMessage) => {
      setImmediate((restore, message) => restore(message), restoreMessageSync, message);
    },
    [restoreMessageSync],
  );

  // 未记忆化 — hook 通过 ref 存储 caps，在 dispatch 时读取最新的闭包。
  // 24 字符前缀：deriveUUID 保留前 24 位，可渲染的 uuid 前缀匹配原始来源。
  const findRawIndex = (uuid: string) => {
    const prefix = uuid.slice(0, 24);
    return messages.findIndex(m => m.uuid.slice(0, 24) === prefix);
  };
  const messageActionCaps: MessageActionCaps = {
    copy: text =>
      // setClipboard 返回 OSC 52 — 调用方必须执行 stdout.write（tmux 副作用 load-buffer，但这仅限于 tmux）。
      void setClipboard(text).then(raw => {
        if (raw) process.stdout.write(raw);
        addNotification({
          // 与文本选择复制的键相同 — 重复复制会替换 toast，不会排队。
          key: 'selection-copied',
          text: 'copied',
          color: 'success',
          priority: 'immediate',
          timeoutMs: 2000,
        });
      }),
    edit: async msg => {
      // 与 /rewind 相同的跳过确认检查：无损 → 直接执行，否则显示确认对话框。
      const rawIdx = findRawIndex(msg.uuid);
      const raw = rawIdx >= 0 ? messages[rawIdx] : undefined;
      if (!raw || !selectableUserMessagesFilter(raw)) return;
      const noFileChanges = !(await fileHistoryHasAnyChanges(fileHistory, raw.uuid));
      const onlySynthetic = messagesAfterAreOnlySynthetic(messages, rawIdx);
      if (noFileChanges && onlySynthetic) {
        // rewindConversationTo 的 setMessages 与流追加存在竞态条件 — 先取消（幂等）。
        onCancel();
        // handleRestoreMessage 也会恢复粘贴的图片。
        void handleRestoreMessage(raw);
      } else {
        // 对话框路径：onPreRestore (= onCancel) 在用户确认时触发，而非取消时。
        setMessageSelectorPreselect(raw);
        setIsMessageSelectorVisible(true);
      }
    },
  };
  const { enter: enterMessageActions, handlers: messageActionHandlers } = useMessageActions(
    cursor,
    setCursor,
    cursorNavRef,
    messageActionCaps,
  );

  async function onInit() {
    // 始终在启动时验证 API 密钥，以便向用户显示错误
    // 如果 API 密钥无效，将在屏幕右下角显示。
    void reverify();

    // 启动时用 CLAUDE.md 文件填充 readFileState
    const memoryFiles = await getMemoryFiles();
    if (memoryFiles.length > 0) {
      const fileList = memoryFiles
        .map(f => `  [${f.type}] ${f.path} (${f.content.length} 个字符)${f.parent ? ` (included by ${f.parent})` : ''}`)
        .join('\n');
      logForDebugging(`已加载 ${memoryFiles.length} 个 CLAUDE.md/rules 文件：
${fileList}`);
    } else {
      logForDebugging('未找到 CLAUDE.md/rules 文件');
    }
    for (const file of memoryFiles) {
      // 当注入的内容与磁盘内容不匹配时（已去除 HTML 注释、
      // 已去除 frontmatter、MEMORY.md 截断），缓存原始磁盘字节
      // 并标记为 isPartialView，这样 Edit/Write 需要先执行真正的 Read 操作，同时
      // getChangedFiles + nested_memory 去重功能仍能正常工作。
      readFileState.current.set(file.path, {
        content: file.contentDiffersFromDisk ? (file.rawContent ?? file.content) : file.content,
        timestamp: Date.now(),
        offset: undefined,
        limit: undefined,
        isPartialView: file.contentDiffersFromDisk,
      });
    }

    // 初始消息处理通过 initialMessage 效果完成
  }

  // 注册成本摘要跟踪器
  useCostSummary(useFpsMetrics());

  // 本地记录对话记录，用于调试和对话恢复
  // 如果只有初始消息，则不记录对话；这优化了
  // 用户恢复对话后，在未进行任何其他操作前就退出的情况
  // 其他任何内容
  useLogMessages(messages, messages.length === initialMessages?.length);

  // REPL Bridge：将用户/助手消息复制到 bridge 会话
  // 以便通过 claude.ai 进行远程访问。在外部构建版本或未启用时无操作。
  const { sendBridgeResult } = useReplBridge(messages, setMessages, abortControllerRef, commands, mainLoopModel);
  sendBridgeResultRef.current = sendBridgeResult;

  useAfterFirstRender();

  // 跟踪提示队列使用情况以进行分析。仅在从空到非空状态转换时触发一次，
  // 而不是每次长度变化时都触发——否则渲染循环
  // （并发 onQuery 冲突等）会频繁调用 saveGlobalConfig，这会导致
  // 在并发会话下触发 ELOCKED 并回退到无锁写入。
  // 这种写入风暴是导致 ~/.claude.json 损坏的主要原因
  // （GH #3117）。
  const hasCountedQueueUseRef = useRef(false);
  useEffect(() => {
    if (queuedCommands.length < 1) {
      hasCountedQueueUseRef.current = false;
      return;
    }
    if (hasCountedQueueUseRef.current) return;
    hasCountedQueueUseRef.current = true;
    saveGlobalConfig(current => ({
      ...current,
      promptQueueUseCount: (current.promptQueueUseCount ?? 0) + 1,
    }));
  }, [queuedCommands.length]);

  // 当查询完成且队列中有项目时，处理排队的命令

  const executeQueuedInput = useCallback(
    async (queuedCommands: QueuedCommand[]) => {
      await handlePromptSubmit({
        helpers: {
          setCursorOffset: () => {},
          clearBuffer: () => {},
          resetHistory: () => {},
        },
        queryGuard,
        commands,
        onInputChange: () => {},
        setPastedContents: () => {},
        setToolJSX,
        getToolUseContext,
        messages,
        mainLoopModel,
        ideSelection,
        setUserInputOnProcessing,
        setAbortController,
        onQuery,
        setAppState,
        querySource: getQuerySourceForREPL(),
        onBeforeQuery,
        canUseTool,
        addNotification,
        setMessages,
        queuedCommands,
      });
    },
    [
      queryGuard,
      commands,
      setToolJSX,
      getToolUseContext,
      messages,
      mainLoopModel,
      ideSelection,
      setUserInputOnProcessing,
      canUseTool,
      setAbortController,
      onQuery,
      addNotification,
      setAppState,
      onBeforeQuery,
    ],
  );

  useQueueProcessor({
    executeQueuedInput,
    hasActiveLocalJsxUI: isShowingLocalJSXCommand,
    queryGuard,
  });

  // 我们将使用 state.ts 中的全局 lastInteractionTime

  // 当输入变化时更新最后交互时间。
  // 必须立即执行，因为 useEffect 在 Ink 渲染周期刷新后运行。
  useEffect(() => {
    activityManager.recordUserActivity();
    updateLastInteractionTime(true);
  }, [inputValue, submitCount]);

  useEffect(() => {
    if (submitCount === 1) {
      startBackgroundHousekeeping();
    }
  }, [submitCount]);

  // 当 Claude 完成响应且用户处于空闲状态时显示通知
  useEffect(() => {
    // 如果 Claude 正忙，则不设置通知
    if (isLoading) return;

    // 仅在此会话中首次新交互后启用通知
    if (submitCount === 0) return;

    // 尚无查询完成
    if (lastQueryCompletionTime === 0) return;

    // 设置超时以检查空闲状态
    const timer = setTimeout(
      (lastQueryCompletionTime, isLoading, toolJSX, focusedInputDialogRef, terminal) => {
        // 检查自响应结束后用户是否有过交互
        const lastUserInteraction = getLastInteractionTime();

        if (lastUserInteraction > lastQueryCompletionTime) {
          // 自 Claude 完成后用户有过交互——他们并非空闲，无需通知
          return;
        }

        // 自响应结束后用户无交互，检查其他条件
        const idleTimeSinceResponse = Date.now() - lastQueryCompletionTime;
        if (
          !isLoading &&
          !toolJSX &&
          // 使用 ref 获取当前对话框状态，避免闭包过时
          focusedInputDialogRef.current === undefined &&
          idleTimeSinceResponse >= getGlobalConfig().messageIdleNotifThresholdMs
        ) {
          void sendNotification(
            {
              message: 'Claude 正在等待您的输入',
              notificationType: 'idle_prompt',
            },
            terminal,
          );
        }
      },
      getGlobalConfig().messageIdleNotifThresholdMs,
      lastQueryCompletionTime,
      isLoading,
      toolJSX,
      focusedInputDialogRef,
      terminal,
    );

    return () => clearTimeout(timer);
  }, [isLoading, toolJSX, submitCount, lastQueryCompletionTime, terminal]);

  // 空闲返回提示：当超过空闲阈值时显示通知。
  // 计时器在配置的空闲期后触发；通知将持续存在，直到
  // 被关闭或用户提交。
  useEffect(() => {
    if (lastQueryCompletionTime === 0) return;
    if (isLoading) return;
    const willowMode: string = getFeatureValue_CACHED_MAY_BE_STALE('tengu_willow_mode', 'off');
    if (willowMode !== 'hint' && willowMode !== 'hint_v2') return;
    if (getGlobalConfig().idleReturnDismissed) return;

    const tokenThreshold = Number(process.env.CLAUDE_CODE_IDLE_TOKEN_THRESHOLD ?? 100_000);
    if (getTotalInputTokens() < tokenThreshold) return;

    const idleThresholdMs = Number(process.env.CLAUDE_CODE_IDLE_THRESHOLD_MINUTES ?? 75) * 60_000;
    const elapsed = Date.now() - lastQueryCompletionTime;
    const remaining = idleThresholdMs - elapsed;

    const timer = setTimeout(
      (lqct, addNotif, msgsRef, mode, hintRef) => {
        if (msgsRef.current.length === 0) return;
        const totalTokens = getTotalInputTokens();
        const formattedTokens = formatTokens(totalTokens);
        const idleMinutes = (Date.now() - lqct) / 60_000;
        addNotif({
          key: 'idle-return-hint',
          jsx:
            mode === 'hint_v2' ? (
              <>
                <Text dimColor>new task? </Text>
                <Text color="suggestion">/clear</Text>
                <Text dimColor> to save </Text>
                <Text color="suggestion">{formattedTokens} tokens</Text>
              </>
            ) : (
              <Text color="warning">new task? /clear to save {formattedTokens} tokens</Text>
            ),
          priority: 'medium',
          // 持续存在直至提交——提示在空闲 75 分钟后触发，用户可能
          // 数小时后才返回。useEffect 清理中的 removeNotification
          // 处理关闭操作。0x7FFFFFFF = setTimeout 最大值（约 24.8 天）。
          timeoutMs: 0x7fffffff,
        });
        hintRef.current = mode;
        logEvent('tengu_idle_return_action', {
          action: 'hint_shown' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          variant: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          idleMinutes: Math.round(idleMinutes),
          messageCount: msgsRef.current.length,
          totalInputTokens: totalTokens,
        });
      },
      Math.max(0, remaining),
      lastQueryCompletionTime,
      addNotification,
      messagesRef,
      willowMode,
      idleHintShownRef,
    );

    return () => {
      clearTimeout(timer);
      removeNotification('idle-return-hint');
      idleHintShownRef.current = false;
    };
  }, [lastQueryCompletionTime, isLoading, addNotification, removeNotification]);

  // 将来自队友消息或任务模式的新提示作为新轮次提交
  // 如果提交成功返回 true，如果已有查询正在运行则返回 false
  const handleIncomingPrompt = useCallback(
    (input: string | QueuedCommand, options?: { isMeta?: boolean }): boolean => {
      if (queryGuard.isActive) return false;

      // 遵从用户排队的命令——用户输入始终优先
      // 于系统消息（队友消息、任务列表项等）
      // 在调用时从模块级存储读取（而非渲染时的
      // 快照）以避免闭包过时——此回调的依赖项
      // 不包含队列。
      if (getCommandQueue().some(cmd => cmd.mode === 'prompt' || cmd.mode === 'bash')) {
        return false;
      }

      const queuedCommand =
        typeof input === 'string'
          ? ({
              value: input,
              mode: 'prompt',
              isMeta: options?.isMeta ? true : undefined,
            } satisfies QueuedCommand)
          : input;

      void (async () => {
        const claim = await claimConsumableQueuedAutonomyCommands([queuedCommand]);
        const command = claim.attachmentCommands[0];
        if (!command) return;

        const newAbortController = createAbortController();
        setAbortController(newAbortController);

        // Create a user message with the formatted content (includes XML wrapper)
        const userMessage = createUserMessage({
          content: command.value,
          isMeta: command.isMeta ? true : undefined,
          origin: command.origin,
        });

        let executed = false;
        try {
          executed = (await onQuery([userMessage], newAbortController, true, [], mainLoopModel)) !== false;
        } catch (error: unknown) {
          try {
            await finalizeAutonomyCommandsForTurn({
              commands: claim.claimedCommands,
              outcome: { type: 'failed', error },
              currentDir: getCwd(),
              priority: 'later',
            });
          } catch (finalizeError: unknown) {
            logError(toError(finalizeError));
          }
          logError(toError(error));
          return;
        }

        // Only finalize as completed when onQuery actually executed the turn
        // (it returns false from the concurrent-guard path without running).
        // Keep this finalize in its own try/catch so a failure here does not
        // trigger a second finalize as `failed` for the same commands.
        if (!executed) {
          return;
        }
        try {
          const nextCommands = await finalizeAutonomyCommandsForTurn({
            commands: claim.claimedCommands,
            outcome: { type: 'completed' },
            currentDir: getCwd(),
            priority: 'later',
          });
          for (const nextCommand of nextCommands) {
            enqueue(nextCommand);
          }
        } catch (finalizeError: unknown) {
          logError(toError(finalizeError));
        }
      })().catch((error: unknown) => {
        logError(toError(error));
      });
      return true;
    },
    [onQuery, mainLoopModel, store],
  );

  const { relayPipeMessage, pipeReturnHadErrorRef } = usePipeRelay();

  // 语音输入集成（仅限 VOICE_MODE 构建）
  const voice = feature('VOICE_MODE')
    ? useVoiceIntegration({ setInputValueRaw, inputValueRef, insertTextRef })
    : {
        stripTrailing: () => 0,
        handleKeyEvent: () => {},
        resetAnchor: () => {},
        interimRange: null,
      };

  useInboxPoller({
    enabled: isAgentSwarmsEnabled(),
    isLoading,
    focusedInputDialog,
    onSubmitMessage: handleIncomingPrompt,
  });

  useMailboxBridge({ isLoading, onSubmitMessage: handleIncomingPrompt });
  useMasterMonitor();
  useSlaveNotifications();
  const pipeIpcState = useAppState(s => getPipeIpc(s as any));

  usePipePermissionForward({ store, tools, setMessages, setToolUseConfirmQueue, getToolUseContext, mainLoopModel });
  usePipeMuteSync({ setToolUseConfirmQueue });

  // 管道 IPC 生命周期——提取至 usePipeIpc 钩子
  usePipeIpc({ store, handleIncomingPrompt });
  const { routeToSelectedPipes } = usePipeRouter({ store, setAppState, addNotification });

  // 来自 .claude/scheduled_tasks.json 的定时任务（CronCreate/Delete/List）
  if (feature('AGENT_TRIGGERS')) {
    // 助手模式绕过 isLoading 门控（否则主动 tick →
    // Sleep → tick 循环会使调度器饥饿）。
    // kairosEnabled 在 initialState (main.tsx) 中设置一次且永不改变——无需
    // 订阅。tengu_kairos_cron 运行时门控在 useScheduledTasks 的
    // 副作用中检查（而非此处），因为将钩子调用包装在动态
    // 条件中会违反钩子规则。
    const assistantMode = store.getState().kairosEnabled;
    useScheduledTasks!({ isLoading, assistantMode, setMessages });
  }

  // 注意：权限轮询现由 useInboxPoller 处理
  // - 工作者通过邮箱消息接收权限响应
  // - 领导者通过邮箱消息接收权限请求

  if (process.env.USER_TYPE === 'ant') {
    // 任务模式：监视任务并自动处理
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTaskListWatcher({
      taskListId,
      isLoading,
      onSubmitTask: handleIncomingPrompt,
    });
  }

  // 主动模式：启用时自动执行（通过 /proactive 命令）
  // 移出 USER_TYPE === 'ant' 代码块，以便外部用户可以使用。
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useProactive?.({
    // 当初始消息待处理时抑制执行 — 初始
    // 消息将异步处理，过早执行会
    // 与其产生竞态，导致扩展技能文本的并发查询入队。
    isLoading: isLoading || initialMessage !== null,
    queuedCommandsLength: queuedCommands.length,
    hasActiveLocalJsxUI: isShowingLocalJSXCommand,
    isInPlanMode: toolPermissionContext.mode === 'plan',
    onQueueTick: (command: QueuedCommand) => enqueue(command),
  });

  useEffect(() => {
    if (!proactiveActive) {
      notifyAutomationStateChanged(null);
      return;
    }

    if (isLoading) {
      return;
    }

    if (
      proactiveNextTickAt !== null &&
      queuedCommands.length === 0 &&
      !isShowingLocalJSXCommand &&
      toolPermissionContext.mode !== 'plan' &&
      initialMessage === null
    ) {
      notifyAutomationStateChanged({
        enabled: true,
        phase: 'standby',
        next_tick_at: proactiveNextTickAt,
        sleep_until: null,
      });
      return;
    }

    notifyAutomationStateChanged({
      enabled: true,
      phase: null,
      next_tick_at: null,
      sleep_until: null,
    });
  }, [
    initialMessage,
    isLoading,
    isShowingLocalJSXCommand,
    proactiveActive,
    proactiveNextTickAt,
    queuedCommands.length,
    toolPermissionContext.mode,
  ]);

  // 当 'now' 优先级消息到达时中止当前操作
  // （例如，来自通过 UDS 的聊天 UI 客户端）。
  useEffect(() => {
    if (queuedCommands.some(cmd => cmd.priority === 'now')) {
      abortControllerRef.current?.abort('interrupt');
    }
  }, [queuedCommands]);

  const onInitRef = useRef(onInit);
  onInitRef.current = onInit;
  const diagnosticTrackerRef = useRef(diagnosticTracker);
  diagnosticTrackerRef.current = diagnosticTracker;

  // Initial load
  useEffect(() => {
    void onInitRef.current();

    // 卸载时清理
    return () => {
      void diagnosticTrackerRef.current.shutdown();
    };
  }, []);

  // 监听挂起/恢复事件
  const { internal_eventEmitter } = useStdin();
  const [remountKey, setRemountKey] = useState(0);
  useEffect(() => {
    const handleSuspend = () => {
      // 打印挂起说明
      process.stdout.write(
        `
Claude Code 已被挂起。运行 \`fg\` 以恢复 Claude Code。
注意：ctrl + z 现在会挂起 Claude Code，ctrl + _ 撤销输入。
`,
      );
    };

    const handleResume = () => {
      // 强制完成组件树替换而非终端清屏
      // Ink 现在在 SIGCONT 时内部处理行数重置
      setRemountKey(prev => prev + 1);
    };

    internal_eventEmitter?.on('suspend', handleSuspend);
    internal_eventEmitter?.on('resume', handleResume);
    return () => {
      internal_eventEmitter?.off('suspend', handleSuspend);
      internal_eventEmitter?.off('resume', handleResume);
    };
  }, [internal_eventEmitter]);

  // 从消息状态派生停止钩子微调后缀
  const stopHookSpinnerSuffix = useMemo(() => {
    if (!isLoading) return null;

    // 查找停止钩子进度消息
    const progressMsgs = messages.filter((m): m is ProgressMessage<HookProgress> => {
      if (m.type !== 'progress') return false;
      const data = m.data as Record<string, unknown>;
      return data.type === 'hook_progress' && (data.hookEvent === 'Stop' || data.hookEvent === 'SubagentStop');
    });
    if (progressMsgs.length === 0) return null;

    // 获取最近的停止钩子执行
    const currentToolUseID = progressMsgs.at(-1)?.toolUseID;
    if (!currentToolUseID) return null;

    // 检查此执行是否已有摘要消息（钩子已完成）
    const hasSummaryForCurrentExecution = messages.some(
      m => m.type === 'system' && m.subtype === 'stop_hook_summary' && m.toolUseID === currentToolUseID,
    );
    if (hasSummaryForCurrentExecution) return null;

    const currentHooks = progressMsgs.filter(p => p.toolUseID === currentToolUseID);
    const total = currentHooks.length;

    // 统计已完成的钩子
    const completedCount = count(messages, m => {
      if (m.type !== 'attachment') return false;
      const attachment = m.attachment!;
      return (
        'hookEvent' in attachment &&
        (attachment.hookEvent === 'Stop' || attachment.hookEvent === 'SubagentStop') &&
        'toolUseID' in attachment &&
        attachment.toolUseID === currentToolUseID
      );
    });

    // 检查是否有钩子具有自定义状态消息
    const customMessage = currentHooks.find(p => p.data.statusMessage)?.data.statusMessage;

    if (customMessage) {
      // 如果多个钩子，则使用带进度计数器的自定义消息
      return total === 1 ? `${customMessage}…` : `${customMessage}… ${completedCount}/${total}`;
    }

    // 回退到默认行为
    const hookType = currentHooks[0]?.data.hookEvent === 'SubagentStop' ? '子代理停止' : 'stop';

    if (process.env.USER_TYPE === 'ant') {
      const cmd = currentHooks[completedCount]?.data.command;
      const label = cmd ? ` '${truncateToWidth(cmd, 40)}'` : '';
      return total === 1
        ? `正在运行 ${hookType} 个钩子${label}`
        : `正在运行 ${hookType} 个钩子${label}… ${completedCount}/${total}`;
    }

    return total === 1 ? `正在运行 ${hookType} 个钩子` : `正在运行停止钩子… ${completedCount}/${total}`;
  }, [messages, isLoading]);

  // 进入转录模式时捕获冻结状态的回调函数
  const handleEnterTranscript = useCallback(() => {
    setFrozenTranscriptState({
      messagesLength: messages.length,
      streamingToolUsesLength: streamingToolUses.length,
    });
  }, [messages.length, streamingToolUses.length]);

  // 退出转录模式时清除冻结状态的回调函数
  const handleExitTranscript = useCallback(() => {
    setFrozenTranscriptState(null);
  }, []);

  // GlobalKeybindingHandlers 组件的 Props（在 KeybindingSetup 内部渲染）
  const virtualScrollActive = isFullscreenEnvEnabled() && !disableVirtualScroll;

  // 转录搜索状态。钩子必须是无条件的，因此它们放在这里
  // （不在下面的 `if (screen === 'transcript')` 分支内）；isActive
  // 控制着 useInput。查询在搜索栏打开/关闭时持续存在，因此 n/N 在
  // 按 Enter 键关闭搜索栏后仍能正常工作（语义较少）。
  const jumpRef = useRef<JumpHandle | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCount, setSearchCount] = useState(0);
  const [searchCurrent, setSearchCurrent] = useState(0);
  const onSearchMatchesChange = useCallback((count: number, current: number) => {
    setSearchCount(count);
    setSearchCurrent(current);
  }, []);

  useInput(
    (input, key, event) => {
      if (key.ctrl || key.meta) return;
      // 此处不处理 Esc 键 — less 没有导航模式。搜索状态
      // （高亮、n/N）只是状态。Esc/q/ctrl+c → transcript:exit
      // （无门控）。通过屏幕切换效果退出时清除高亮。
      if (input === '/') {
        // 立即捕获 scrollTop — 输入是预览，0 匹配时会回退
        // 到这里。同步引用写入，在搜索栏的挂载效果调用
        // setSearchQuery 之前触发。
        jumpRef.current?.setAnchor();
        setSearchOpen(true);
        event.stopImmediatePropagation();
        return;
      }
      // 按键批处理：分词器合并为 'nnn'。与 ScrollKeybindingHandler.tsx 中的
      // modalPagerAction 采用相同的统一批处理模式。每次
      // 重复都是一步（n 不像 g 那样是幂等的）。
      const c = input[0];
      if ((c === 'n' || c === 'N') && input === c.repeat(input.length) && searchCount > 0) {
        const fn = c === 'n' ? jumpRef.current?.nextMatch : jumpRef.current?.prevMatch;
        if (fn) for (let i = 0; i < input.length; i++) fn();
        event.stopImmediatePropagation();
      }
    },
    // 搜索需要虚拟滚动（jumpRef 驱动 VirtualMessageList）。
    // [ 会终止它，所以 !dumpMode — 在 [ 之后没有内容可供跳转。
    {
      isActive: screen === 'transcript' && virtualScrollActive && !searchOpen && !dumpMode,
    },
  );
  const { setQuery: setHighlight, scanElement, setPositions } = useSearchHighlight();

  // 调整大小 → 中止搜索。位置基于（消息、查询、宽度）键控 —
  // 宽度改变后缓存的位置会失效（新布局、新
  // 换行）。清除 searchQuery 会触发 VML 的 setSearchQuery('')
  // 从而清除 positionsCache + setPositions(null)。搜索栏关闭。
  // 用户再次按 / 键 → 全部重新开始。
  const transcriptCols = useTerminalSize().columns;
  const prevColsRef = React.useRef(transcriptCols);
  React.useEffect(() => {
    if (prevColsRef.current !== transcriptCols) {
      prevColsRef.current = transcriptCols;
      if (searchQuery || searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
        setSearchCount(0);
        setSearchCurrent(0);
        jumpRef.current?.disarmSearch();
        setHighlight('');
      }
    }
  }, [transcriptCols, searchQuery, searchOpen, setHighlight]);

  // 转录应急出口。模态上下文中的裸字母（没有提示符
  // 竞争输入）— 与 ScrollKeybindingHandler 中的 g/G/j/k 属于同一类。
  useInput(
    (input, key, event) => {
      if (key.ctrl || key.meta) return;
      if (input === 'q') {
        // less：q 退出分页器。ctrl+o 切换；q 是沿袭退出键。
        handleExitTranscript();
        event.stopImmediatePropagation();
        return;
      }
      if (input === '[' && !dumpMode) {
        // 强制转储到回滚缓冲区。同时展开 + 取消限制 — 转储
        // 子集没有意义。终端/tmux 的 cmd-F 现在可以找到任何内容。此处进行防护
        // (不在 isActive 中) 因此 v 在 [ — dump-mode 页脚之后仍然有效
        // ~4898 行连接 editorStatus，确认 v 应保持活动状态。
        setDumpMode(true);
        setShowAllInTranscript(true);
        event.stopImmediatePropagation();
      } else if (input === 'v') {
        // less 风格：v 在 $VISUAL/$EDITOR 中打开文件。渲染完整
        // 记录（与 /export 使用的路径相同），写入临时文件，然后移交。
        // openFileInExternalEditor 处理终端编辑器的备用屏幕挂起/恢复；
        // GUI 编辑器则分离启动。
        event.stopImmediatePropagation();
        // 防止双击：渲染是异步的，在完成前第二次按下会
        // 运行第二次并行渲染（双倍内存，两个
        // 临时文件，两个编辑器启动）。editorGenRef 仅保护
        // 记录退出的陈旧性，而非同一会话的并发性。
        if (editorRenderingRef.current) return;
        editorRenderingRef.current = true;
        // 捕获生成 + 创建一个感知陈旧性的设置器。每次写入
        // 检查生成（记录退出会使其递增 → 来自
        // 异步渲染的延迟写入将静默失败）。
        const gen = editorGenRef.current;
        const setStatus = (s: string): void => {
          if (gen !== editorGenRef.current) return;
          clearTimeout(editorTimerRef.current);
          setEditorStatus(s);
        };
        setStatus(`正在渲染 ${deferredMessages.length} 条消息…`);
        void (async () => {
          try {
            // 宽度 = 终端减去 vim 的行号边栏（4 位数字 +
            // 空格 + 余量）。下限为 80。PassThrough 没有 .columns 属性，因此
            // 没有此项设置时 Ink 默认为 80。去除尾部空格：右
            // 对齐的时间戳仍会在行尾留下一个 flexbox 间隔符。
            // eslint-disable-next-line custom-rules/prefer-use-terminal-size -- 在按键时一次性获取，而非响应式渲染依赖
            const w = Math.max(80, (process.stdout.columns ?? 80) - 6);
            const raw = await renderMessagesToPlainText(deferredMessages, tools, w);
            const text = raw.replace(/[ \t]+$/gm, '');
            const path = join(tmpdir(), `cc-transcript-${Date.now()}.txt`);
            await writeFile(path, text);
            const opened = openFileInExternalEditor(path);
            setStatus(opened ? `正在打开 ${path}` : `已写入 ${path} · 未设置 $VISUAL/$EDITOR`);
          } catch (e) {
            setStatus(`渲染失败：${e instanceof Error ? e.message : String(e)}`);
          }
          editorRenderingRef.current = false;
          if (gen !== editorGenRef.current) return;
          editorTimerRef.current = setTimeout(s => s(''), 4000, setEditorStatus);
        })();
      }
    },
    // !searchOpen: 在搜索栏中输入 'v' 或 '[' 是搜索输入，而
    // 非命令。此处没有 !dumpMode — v 应在 [ 之后生效（[ 的处
    // 理程序在行内自行防护）。
    { isActive: screen === 'transcript' && virtualScrollActive && !searchOpen },
  );

  // 每个记录条目使用新的 `less`。防止陈旧的高亮匹配
  // 无关的普通模式文本（覆盖层是备用屏幕全局的），并避免
  // 重新进入时意外的 n/N。相同的退出会重置 [ dump 模式 — 每个 ctrl+o
  // 条目都是一个新实例。
  const inTranscript = screen === 'transcript' && virtualScrollActive;
  useEffect(() => {
    if (!inTranscript) {
      setSearchQuery('');
      setSearchCount(0);
      setSearchCurrent(0);
      setSearchOpen(false);
      editorGenRef.current++;
      clearTimeout(editorTimerRef.current);
      setDumpMode(false);
      setEditorStatus('');
    }
  }, [inTranscript]);
  useEffect(() => {
    setHighlight(inTranscript ? searchQuery : '');
    // 同时清除基于位置的 CURRENT（黄色）覆盖层。setHighlight
    // 仅清除基于扫描的反向高亮。若不这样做，黄色框
    // 会在 ctrl-c 退出记录后停留在其最后的屏幕坐标处。
    if (!inTranscript) setPositions(null);
  }, [inTranscript, searchQuery, setHighlight, setPositions]);

  const globalKeybindingProps = {
    screen,
    setScreen,
    showAllInTranscript,
    setShowAllInTranscript,
    messageCount: messages.length,
    onEnterTranscript: handleEnterTranscript,
    onExitTranscript: handleExitTranscript,
    virtualScrollActive,
    // Bar-open 是一种模式（拥有按键控制权 — j/k 类型，Esc 取消）。
    // 导航（查询集，搜索栏已关闭）时按 Esc 不会退出转录视图——Esc 会退出转录视图，
    // 与 less q 命令类似，高亮仍可见。useSearchInput
    // 不会阻止事件冒泡，因此若无此门控，transcript:exit
    // 会在取消搜索栏的同一个 Esc 键上触发（子组件先注册，
    // 先触发，然后冒泡）。
    searchBarOpen: searchOpen,
  };

  // 使用冻结的长度来切片数组，避免克隆带来的内存开销。
  const transcriptMessages = frozenTranscriptState
    ? deferredMessages.slice(0, frozenTranscriptState.messagesLength)
    : deferredMessages;
  const transcriptStreamingToolUses = frozenTranscriptState
    ? streamingToolUses.slice(0, frozenTranscriptState.streamingToolUsesLength)
    : streamingToolUses;

  // 处理 Shift+Down 以进行队友导航和后台任务管理。
  // 当本地 JSX 对话框（例如 /mcp）打开时，守卫 onOpenBackgroundTasks ——
  // 否则 Shift+Down 会将 BackgroundTasksDialog 堆叠在上方并导致输入死锁。
  // 第三种情况：当管道激活时，Shift+Down 切换管道 IPC 选择器面板。
  useBackgroundTaskNavigation({
    onOpenBackgroundTasks: isShowingLocalJSXCommand ? undefined : () => setShowBashesDialog(true),
    onTogglePipeSelector: () => {
      setAppState((prev: any) => {
        const pIpc = prev.pipeIpc ?? {};
        return { ...prev, pipeIpc: { ...pIpc, selectorOpen: !pIpc.selectorOpen } };
      });
    },
  });
  // 当队友完成或出错时自动退出查看模式
  useTeammateViewAutoExit();

  if (screen === 'transcript') {
    // 虚拟滚动取代了 30 条消息的限制：所有内容都可滚动
    // 且内存受视口限制。若无此功能，将转录视图
    // 包裹在 ScrollBox 中会挂载所有消息（长会话中约 250 MB ——
    // 正是此问题），因此紧急停止开关和非全屏路径必须
    // 回退到传统渲染：无备用屏幕，转储到终端
    // 回滚区，30 条限制 + Ctrl+E。重用 scrollRef 是安全的 —— 普通模式
    // 和转录模式互斥（此处的提前返回），所以
    // 一次只挂载一个 ScrollBox。
    const transcriptScrollRef = isFullscreenEnvEnabled() && !disableVirtualScroll && !dumpMode ? scrollRef : undefined;
    const transcriptMessagesElement = (
      <Messages
        messages={transcriptMessages}
        tools={tools}
        commands={commands}
        verbose={true}
        toolJSX={null}
        toolUseConfirmQueue={[]}
        inProgressToolUseIDs={inProgressToolUseIDs}
        isMessageSelectorVisible={false}
        conversationId={conversationId}
        screen={screen}
        agentDefinitions={agentDefinitions}
        streamingToolUses={transcriptStreamingToolUses}
        showAllInTranscript={showAllInTranscript}
        onOpenRateLimitOptions={handleOpenRateLimitOptions}
        isLoading={isLoading}
        hidePastThinking={true}
        streamingThinking={streamingThinking}
        scrollRef={transcriptScrollRef}
        jumpRef={jumpRef}
        onSearchMatchesChange={onSearchMatchesChange}
        scanElement={scanElement}
        setPositions={setPositions}
        disableRenderCap={dumpMode}
      />
    );
    const transcriptToolJSX = toolJSX && (
      <Box flexDirection="column" width="100%">
        {toolJSX.jsx}
      </Box>
    );
    const transcriptReturn = (
      <KeybindingSetup>
        <AnimatedTerminalTitle
          isAnimating={titleIsAnimating}
          title={terminalTitle}
          disabled={titleDisabled}
          noPrefix={showStatusInTerminalTab}
        />
        <GlobalKeybindingHandlers {...globalKeybindingProps} />
        {feature('VOICE_MODE') ? (
          <VoiceKeybindingHandler
            voiceHandleKeyEvent={voice.handleKeyEvent}
            stripTrailing={voice.stripTrailing}
            resetAnchor={voice.resetAnchor}
            isActive={!toolJSX?.isLocalJSXCommand}
          />
        ) : null}
        <CommandKeybindingHandlers onSubmit={onSubmit} isActive={!toolJSX?.isLocalJSXCommand} />
        {transcriptScrollRef ? (
          // ScrollKeybindingHandler 必须在 CancelRequestHandler 之前挂载，这样
          // ctrl+c（有选中内容时）会复制而不是取消活动任务。
          // 其原始 useInput 处理程序仅在存在选中内容时阻止传播 — 如果没有选中内容，
          // ctrl+c 会穿透到 CancelRequestHandler。
          <ScrollKeybindingHandler
            scrollRef={scrollRef}
            // 当模态框显示时，将 wheel/ctrl+u/d 让给 UltraplanChoiceDialog 自己的滚动处理程序
            isActive={focusedInputDialog !== 'ultraplan-choice'}
            // g/G/j/k/ctrl+u/ctrl+d 会吞噬搜索栏想要的按键。搜索时关闭。
            isModal={!searchOpen}
            // 手动滚动会退出搜索上下文 — 清除黄色的当前匹配标记。
            // 位置以（消息，行偏移）为键；j/k 会改变 scrollTop，因此行偏移过时 → 错误行被标记为黄色。
            // 下一次按 n/N 会通过 step()→jump() 重新建立。
            onScroll={() => jumpRef.current?.disarmSearch()}
          />
        ) : null}
        <CancelRequestHandler {...cancelRequestProps} />
        {transcriptScrollRef ? (
          <FullscreenLayout
            scrollRef={scrollRef}
            scrollable={
              <>
                {transcriptMessagesElement}
                {transcriptToolJSX}
                <SandboxViolationExpandedView />
              </>
            }
            bottom={
              searchOpen ? (
                <TranscriptSearchBar
                  jumpRef={jumpRef}
                  // 已尝试 Seed（c01578c8）— 破坏了 /hello
                  // 的肌肉记忆（光标落在 'foo' 之后，/hello → foohe
                  // llo）。Cancel-restore 以不同方式处理了“不丢失先前
                  // 搜索”的问题（onCancel 会重新应用 searchQuery）。
                  initialQuery=""
                  count={searchCount}
                  current={searchCurrent}
                  onClose={q => {
                    // Enter 键 —— 提交。零匹配守卫：无效查询不应
                    // 保留（徽章隐藏，n/N 键无论如何已失效）。
                    setSearchQuery(searchCount > 0 ? q : '');
                    setSearchOpen(false);
                    // onCancel 路径：搜索栏在其 useEffect([query]) 能
                    // 以空字符串触发之前卸载。若无此处理，searchCount 将保持陈旧
                    // （第 4956 行的 n 守卫通过）且 VML 的 matches[] 也如此
                    // （nextMatch 遍历旧数组）。幽灵导航，无
                    // 高亮。onExit（Enter 键，查询非空）仍会提交。
                    if (!q) {
                      setSearchCount(0);
                      setSearchCurrent(0);
                      jumpRef.current?.setSearchQuery('');
                    }
                  }}
                  onCancel={() => {
                    // Esc/ctrl+c/ctrl+g —— 撤销。搜索栏的效果最后触发时
                    // 使用的是当时键入的内容。searchQuery（REPL 状态）
                    // 自 / 命令后未改变（onClose = 提交，未运行）。
                    // 两次 VML 调用：空字符串恢复锚点（零匹配否则
                    // 分支），然后 searchQuery 从锚点的
                    // 最近位置重新扫描。两者都是同步的——在一个 React 批次内。
                    // setHighlight 显式设置：REPL 的同步效果依赖是
                    // searchQuery（未改变），不会重新触发。
                    setSearchOpen(false);
                    jumpRef.current?.setSearchQuery('');
                    jumpRef.current?.setSearchQuery(searchQuery);
                    setHighlight(searchQuery);
                  }}
                  setHighlight={setHighlight}
                />
              ) : (
                <TranscriptModeFooter
                  showAllInTranscript={showAllInTranscript}
                  virtualScroll={true}
                  status={editorStatus || undefined}
                  searchBadge={
                    searchQuery && searchCount > 0 ? { current: searchCurrent, count: searchCount } : undefined
                  }
                />
              )
            }
          />
        ) : (
          <>
            {transcriptMessagesElement}
            {transcriptToolJSX}
            <SandboxViolationExpandedView />
            <TranscriptModeFooter
              showAllInTranscript={showAllInTranscript}
              virtualScroll={false}
              suppressShowAll={dumpMode}
              status={editorStatus || undefined}
            />
          </>
        )}
      </KeybindingSetup>
    );
    // 虚拟滚动分支（上方的 FullscreenLayout）需要
    // <AlternateScreen> 的 <Box height={rows}> 约束——没有它，
    // ScrollBox 的 flexGrow 没有上限，视口高度等于内容高度，
    // scrollTop 固定在 0，并且 Ink 的屏幕缓冲区会扩展到整个
    // 占位空间（长会话中可达 200×5k+ 行）。与下方正常模式的包装使用相同的根类型和属性，
    // 以便 React 协调，并且备用缓冲区
    // 在切换时保持进入状态。30 条上限的转储分支保持
    // 未包装状态——它需要原生终端回滚。
    if (transcriptScrollRef) {
      return <AlternateScreen mouseTracking={isMouseTrackingEnabled()}>{transcriptReturn}</AlternateScreen>;
    }
    return transcriptReturn;
  }

  // 获取正在查看的智能体任务（从选择器内联以实现显式数据流）。
  // viewedAgentTask：队友或本地智能体——驱动下方的布尔检查。
  // viewedTeammateTask：仅限队友的细化版本，用于访问队友特定
  // 字段（inProgressToolUseIDs）。
  const viewedTask = viewingAgentTaskId ? tasks[viewingAgentTaskId] : undefined;
  const viewedTeammateTask = viewedTask && isInProcessTeammateTask(viewedTask) ? viewedTask : undefined;
  const viewedAgentTask = viewedTeammateTask ?? (viewedTask && isLocalAgentTask(viewedTask) ? viewedTask : undefined);

  // 当流式文本显示时，绕过 useDeferredValue，以便 Messages 在流式文本清除的同一帧中
  // 渲染最终消息。同样在未加载时也绕过——deferredMessages 仅在流式传输期间重要（保持输入
  // 响应性）；回合结束后，立即显示消息可以防止
  // 一个抖动间隙，即加载指示器已消失但答案尚未出现的情况。
  // 只有 reducedMotion 用户在加载期间保持延迟路径。
  // 当查看智能体时，绝不回退到领导者——在引导/流式填充之前保持为空。
  const usesSyncMessages = showStreamingText || !isLoading;
  // 关闭了看到领导者类型智能体的隐患。
  // 显示占位符，直到真实的用户消息出现在
  const displayedMessages = viewedAgentTask
    ? (viewedAgentTask.messages ?? [])
    : usesSyncMessages
      ? messages
      : deferredMessages;
  // displayedMessages 中。userInputOnProcessing 在整个回合期间保持设置
  // （在 resetLoadingState 中清除）；此长度检查会在
  // displayedMessages 增长超过提交时捕获的基线后隐藏它。
  // 覆盖两个间隙：在调用 setMessages 之前（processUserInput），以及
  // 当 deferredMessages 滞后于 messages 时。在查看智能体时被抑制。
  // 而 deferredMessages 滞后于 messages。在查看时被抑制
  // agent — displayedMessages 是另一个不同的数组，并且 onAgentSubmit
  // 反正没有使用占位符。
  const placeholderText =
    userInputOnProcessing && !viewedAgentTask && displayedMessages.length <= userInputBaselineRef.current
      ? userInputOnProcessing
      : undefined;

  const toolPermissionOverlay =
    focusedInputDialog === 'tool-permission' ? (
      <PermissionRequest
        key={toolUseConfirmQueue[0]?.toolUseID}
        onDone={() => setToolUseConfirmQueue(([_, ...tail]) => tail)}
        onReject={handleQueuedCommandOnCancel}
        toolUseConfirm={toolUseConfirmQueue[0]!}
        toolUseContext={getToolUseContext(
          messages,
          messages,
          abortController ?? createAbortController(),
          mainLoopModel,
        )}
        verbose={verbose}
        workerBadge={toolUseConfirmQueue[0]?.workerBadge}
        setStickyFooter={isFullscreenEnvEnabled() ? setPermissionStickyFooter : undefined}
      />
    ) : null;

  // 窄终端：companion 折叠为单行，REPL 堆叠
  // 在它自己的行上（全屏时在输入上方，回滚时在下方），而不是
  // 行并排。宽终端保持行布局，sprite 在右侧。
  const companionNarrow = transcriptCols < MIN_COLS_FOR_FULL_SPRITE;
  // 当 PromptInput 提前返回 BackgroundTasksDialog 时隐藏 sprite。
  // sprite 作为 PromptInput 的行兄弟节点，因此对话框的 Pane
  // 分隔线以 useTerminalSize() 宽度绘制，但只获得 terminalWidth -
  // spriteWidth — 分隔线提前停止，对话框文本过早换行。不要
  // 检查 footerSelection：药丸 FOCUS（向下箭头到任务药丸）必须保持
  // sprite 可见，以便向右箭头可以导航到它。
  const companionVisible = !toolJSX?.shouldHidePromptInput && !focusedInputDialog && !showBashesDialog;

  // 在全屏模式下，所有 local-jsx 斜杠命令都浮动在模态槽中 —
  // FullscreenLayout 将它们包装在一个绝对定位、底部锚定的
  // 窗格（▔ 分隔线，ModalContext）中。内部的 Pane/Dialog 检测到该上下文
  // 并跳过它们自己的顶层框架。非全屏模式保持下面的内联
  // 渲染路径。过去通过底部（立即执行：/model、/mcp、/btw 等）
  // 和可滚动（非立即执行：/config、/theme、/diff 等）路由的命令
  // 现在都放在这里。
  const toolJsxCentered = isFullscreenEnvEnabled() && toolJSX?.isLocalJSXCommand === true;
  const centeredModal: React.ReactNode = toolJsxCentered ? toolJSX!.jsx : null;
  // 根部的 <AlternateScreen>：其下的所有内容都在其
  // <Box height={rows}> 内部。处理程序/上下文高度为零，因此 ScrollBox 的
  // flexGrow 在 FullscreenLayout 中相对于此 Box 解析。上面的 transcript
  // 提前返回以相同方式包装其虚拟滚动分支；只有
  // 30 条上限的转储分支保持未包装，用于原生终端回滚。

  const mainReturn = (
    <KeybindingSetup>
      <AnimatedTerminalTitle
        isAnimating={titleIsAnimating}
        title={terminalTitle}
        disabled={titleDisabled}
        noPrefix={showStatusInTerminalTab}
      />
      <GlobalKeybindingHandlers {...globalKeybindingProps} />
      {feature('VOICE_MODE') ? (
        <VoiceKeybindingHandler
          voiceHandleKeyEvent={voice.handleKeyEvent}
          stripTrailing={voice.stripTrailing}
          resetAnchor={voice.resetAnchor}
          isActive={!toolJSX?.isLocalJSXCommand}
        />
      ) : null}
      <CommandKeybindingHandlers onSubmit={onSubmit} isActive={!toolJSX?.isLocalJSXCommand} />
      {/* ScrollKeybindingHandler 必须在 CancelRequestHandler 之前挂载，以便
          ctrl+c 加选择时复制而不是取消活动任务。
          其原始的 useInput 处理程序仅在存在选择时停止传播 —
          如果没有选择，ctrl+c 会传递给 CancelRequestHandler。
          PgUp/PgDn/滚轮始终滚动模态后面的 transcript —
          模态内部的 ScrollBox 不是键盘驱动的。onScroll
          在模态显示时保持抑制，因此滚动不会
          干扰分隔线/药丸状态。 */}
      <ScrollKeybindingHandler
        scrollRef={scrollRef}
        isActive={
          isFullscreenEnvEnabled() &&
          (centeredModal != null || !focusedInputDialog || focusedInputDialog === 'tool-permission')
        }
        onScroll={composedOnScroll}
      />
      {feature('MESSAGE_ACTIONS') && isFullscreenEnvEnabled() && !disableMessageActions ? (
        <MessageActionsKeybindings handlers={messageActionHandlers} isActive={cursor !== null} />
      ) : null}
      <CancelRequestHandler {...cancelRequestProps} />
      <MCPConnectionManager key={remountKey} dynamicMcpConfig={dynamicMcpConfig} isStrictMcpConfig={strictMcpConfig}>
        <FullscreenLayout
          scrollRef={scrollRef}
          overlay={toolPermissionOverlay}
          bottomFloat={
            feature('BUDDY') && companionVisible && !companionNarrow ? <CompanionFloatingBubble /> : undefined
          }
          modal={centeredModal}
          modalScrollRef={modalScrollRef}
          dividerYRef={dividerYRef}
          hidePill={!!viewedAgentTask}
          hideSticky={!!viewedTeammateTask}
          newMessageCount={unseenDivider?.count ?? 0}
          onPillClick={() => {
            setCursor(null);
            jumpToNew(scrollRef.current);
          }}
          scrollable={
            <>
              <TeammateViewHeader />
              <Messages
                messages={displayedMessages}
                tools={tools}
                commands={commands}
                verbose={verbose}
                toolJSX={toolJSX}
                toolUseConfirmQueue={toolUseConfirmQueue}
                inProgressToolUseIDs={
                  viewedTeammateTask ? (viewedTeammateTask.inProgressToolUseIDs ?? new Set()) : inProgressToolUseIDs
                }
                isMessageSelectorVisible={isMessageSelectorVisible}
                conversationId={conversationId}
                screen={screen}
                streamingToolUses={streamingToolUses}
                showAllInTranscript={showAllInTranscript}
                agentDefinitions={agentDefinitions}
                onOpenRateLimitOptions={handleOpenRateLimitOptions}
                isLoading={isLoading}
                streamingText={isLoading && !viewedAgentTask ? visibleStreamingText : null}
                isBriefOnly={viewedAgentTask ? false : isBriefOnly}
                unseenDivider={viewedAgentTask ? undefined : unseenDivider}
                scrollRef={isFullscreenEnvEnabled() ? scrollRef : undefined}
                trackStickyPrompt={isFullscreenEnvEnabled() ? true : undefined}
                cursor={cursor}
                setCursor={setCursor}
                cursorNavRef={cursorNavRef}
              />
              <AwsAuthStatusBox />
              {/* 在模态显示时隐藏处理占位符 —
                  它会位于最后一个可见 transcript 行，紧挨着
                  ▔ 分隔线上方，显示“❯ /config”作为冗余的杂乱信息
                  （模态本身就是 /config UI）。在模态外部它保持显示，以便
                  用户在 Claude 处理时看到他们的输入回显。 */}
              {!disabled && placeholderText && !centeredModal && (
                <UserTextMessage param={{ text: placeholderText, type: 'text' }} addMargin={true} verbose={verbose} />
              )}
              {toolJSX && !(toolJSX.isLocalJSXCommand && toolJSX.isImmediate) && !toolJsxCentered && (
                <Box flexDirection="column" width="100%">
                  {toolJSX.jsx}
                </Box>
              )}
              {process.env.USER_TYPE === 'ant' && <TungstenLiveMonitor />}
              {/* WebBrowserPanel removed — browser-lite, no panel */}
              <Box flexGrow={1} />
              {showSpinner && (
                <SpinnerWithVerb
                  mode={streamMode}
                  spinnerTip={spinnerTip}
                  responseLengthRef={responseLengthRef}
                  apiMetricsRef={apiMetricsRef}
                  overrideMessage={spinnerMessage}
                  spinnerSuffix={stopHookSpinnerSuffix}
                  verbose={verbose}
                  loadingStartTimeRef={loadingStartTimeRef}
                  totalPausedMsRef={totalPausedMsRef}
                  pauseStartTimeRef={pauseStartTimeRef}
                  overrideColor={spinnerColor}
                  overrideShimmerColor={spinnerShimmerColor}
                  hasActiveTools={inProgressToolUseIDs.size > 0}
                  leaderIsIdle={!isLoading}
                />
              )}
              {!showSpinner &&
                !isLoading &&
                !userInputOnProcessing &&
                !hasRunningTeammates &&
                isBriefOnly &&
                !viewedAgentTask && <BriefIdleStatus />}
              {isFullscreenEnvEnabled() && <PromptInputQueuedCommands />}
            </>
          }
          bottom={
            <Box
              flexDirection={feature('BUDDY') && companionNarrow ? 'column' : 'row'}
              width="100%"
              alignItems={feature('BUDDY') && companionNarrow ? undefined : 'flex-end'}
            >
              {feature('BUDDY') && companionNarrow && isFullscreenEnvEnabled() && companionVisible ? (
                <CompanionSprite />
              ) : null}
              <Box flexDirection="column" flexGrow={1}>
                {permissionStickyFooter}
                {/* 立即执行的 local-jsx 命令（/btw、/sandbox、/assistant、
                  /issue）在这里渲染，而不是在可滚动区域内。它们在主对话流
                  在它们后面进行时保持挂载，因此 ScrollBox 在每条新消息上
                  重新布局会拖动它们。底部是 flexShrink={0}，在 ScrollBox 外部 —
                  它从不移动。非立即执行的 local-jsx（/diff、/status、/theme，约 40 个其他命令）
                  保持在可滚动区域内：主循环已暂停所以不会抖动，
                  并且它们的高内容（DiffDetailView 渲染多达 400 行，
                  没有内部滚动）需要外部的 ScrollBox。 */}
                {toolJSX?.isLocalJSXCommand && toolJSX.isImmediate && !toolJsxCentered && (
                  <Box flexDirection="column" width="100%">
                    {toolJSX.jsx}
                  </Box>
                )}
                {!showSpinner && !toolJSX?.isLocalJSXCommand && showExpandedTodos && tasksV2 && tasksV2.length > 0 && (
                  <Box width="100%" flexDirection="column">
                    <TaskListV2 tasks={tasksV2} isStandalone={true} />
                  </Box>
                )}
                {focusedInputDialog === 'sandbox-permission' && (
                  <SandboxPermissionRequest
                    key={sandboxPermissionRequestQueue[0]!.hostPattern.host}
                    hostPattern={sandboxPermissionRequestQueue[0]!.hostPattern}
                    onUserResponse={(response: { allow: boolean; persistToSettings: boolean }) => {
                      const { allow, persistToSettings } = response;
                      const currentRequest = sandboxPermissionRequestQueue[0];
                      if (!currentRequest) return;

                      const approvedHost = currentRequest.hostPattern.host;

                      if (persistToSettings) {
                        const update = {
                          type: 'addRules' as const,
                          rules: [
                            {
                              toolName: WEB_FETCH_TOOL_NAME,
                              ruleContent: `domain:${approvedHost}`,
                            },
                          ],
                          behavior: (allow ? 'allow' : 'deny') as 'allow' | 'deny',
                          destination: 'localSettings' as const,
                        };

                        setAppState(prev => ({
                          ...prev,
                          toolPermissionContext: applyPermissionUpdate(prev.toolPermissionContext, update),
                        }));

                        persistPermissionUpdate(update);

                        // 立即更新沙箱内存中的配置，以防止竞态条件
                        // 在检测到设置更改之前，待处理的请求溜过去
                        SandboxManager.refreshConfig();
                      }

                      // 解析同一主机的所有待处理请求（不仅仅是第一个）
                      // 这处理了同一域收到多个并行请求的情况
                      setSandboxPermissionRequestQueue(queue => {
                        queue
                          .filter(item => item.hostPattern.host === approvedHost)
                          .forEach(item => item.resolvePromise(allow));
                        return queue.filter(item => item.hostPattern.host !== approvedHost);
                      });

                      // 清理桥接订阅并取消远程提示
                      // 因为本地用户已响应，所以针对此主机执行此操作。
                      const cleanups = sandboxBridgeCleanupRef.current.get(approvedHost);
                      if (cleanups) {
                        for (const fn of cleanups) {
                          fn();
                        }
                        sandboxBridgeCleanupRef.current.delete(approvedHost);
                      }
                    }}
                  />
                )}
                {focusedInputDialog === 'prompt' && (
                  <PromptDialog
                    key={promptQueue[0]!.request.prompt}
                    title={promptQueue[0]!.title}
                    toolInputSummary={promptQueue[0]!.toolInputSummary}
                    request={promptQueue[0]!.request}
                    onRespond={selectedKey => {
                      const item = promptQueue[0];
                      if (!item) return;
                      item.resolve({
                        prompt_response: item.request.prompt,
                        selected: selectedKey,
                      });
                      setPromptQueue(([, ...tail]) => tail);
                    }}
                    onAbort={() => {
                      const item = promptQueue[0];
                      if (!item) return;
                      item.reject(new Error('用户已取消提示'));
                      setPromptQueue(([, ...tail]) => tail);
                    }}
                  />
                )}
                {/* 在等待领导者批准时，在工作节点上显示待处理指示器 */}
                {pendingWorkerRequest && (
                  <WorkerPendingPermission
                    toolName={pendingWorkerRequest.toolName}
                    description={pendingWorkerRequest.description}
                  />
                )}
                {/* 在工作节点端显示沙箱权限的待处理指示器 */}
                {pendingSandboxRequest && (
                  <WorkerPendingPermission
                    toolName="网络访问"
                    description={`等待领导者批准对 ${pendingSandboxRequest.host} 的网络访问`}
                  />
                )}
                {/* 来自集群工作节点的沙箱权限请求 */}
                {focusedInputDialog === 'worker-sandbox-permission' && (
                  <SandboxPermissionRequest
                    key={workerSandboxPermissions.queue[0]!.requestId}
                    hostPattern={
                      {
                        host: workerSandboxPermissions.queue[0]!.host,
                        port: undefined,
                      } as NetworkHostPattern
                    }
                    onUserResponse={(response: { allow: boolean; persistToSettings: boolean }) => {
                      const { allow, persistToSettings } = response;
                      const currentRequest = workerSandboxPermissions.queue[0];
                      if (!currentRequest) return;

                      const approvedHost = currentRequest.host;

                      // 通过邮箱向工作节点发送响应
                      void sendSandboxPermissionResponseViaMailbox(
                        currentRequest.workerName,
                        currentRequest.requestId,
                        approvedHost,
                        allow,
                        teamContext?.teamName,
                      );

                      if (persistToSettings && allow) {
                        const update = {
                          type: 'addRules' as const,
                          rules: [
                            {
                              toolName: WEB_FETCH_TOOL_NAME,
                              ruleContent: `domain:${approvedHost}`,
                            },
                          ],
                          behavior: 'allow' as const,
                          destination: 'localSettings' as const,
                        };

                        setAppState(prev => ({
                          ...prev,
                          toolPermissionContext: applyPermissionUpdate(prev.toolPermissionContext, update),
                        }));

                        persistPermissionUpdate(update);
                        SandboxManager.refreshConfig();
                      }

                      // 从队列中移除
                      setAppState(prev => ({
                        ...prev,
                        workerSandboxPermissions: {
                          ...prev.workerSandboxPermissions,
                          queue: prev.workerSandboxPermissions.queue.slice(1),
                        },
                      }));
                    }}
                  />
                )}
                {focusedInputDialog === 'elicitation' && (
                  <ElicitationDialog
                    key={elicitation.queue[0]!.serverName + ':' + String(elicitation.queue[0]!.requestId)}
                    event={elicitation.queue[0]!}
                    onResponse={(action, content) => {
                      const currentRequest = elicitation.queue[0];
                      if (!currentRequest) return;
                      // 调用响应回调以解析 Promise
                      currentRequest.respond({ action, content });
                      // 对于 URL 接受，保留在队列中等待阶段 2
                      const isUrlAccept = currentRequest.params.mode === 'url' && action === 'accept';
                      if (!isUrlAccept) {
                        setAppState(prev => ({
                          ...prev,
                          elicitation: {
                            queue: prev.elicitation.queue.slice(1),
                          },
                        }));
                      }
                    }}
                    onWaitingDismiss={action => {
                      const currentRequest = elicitation.queue[0];
                      // 从队列中移除
                      setAppState(prev => ({
                        ...prev,
                        elicitation: {
                          queue: prev.elicitation.queue.slice(1),
                        },
                      }));
                      currentRequest?.onWaitingDismiss?.(action);
                    }}
                  />
                )}
                {focusedInputDialog === 'cost' && (
                  <CostThresholdDialog
                    onDone={() => {
                      setShowCostDialog(false);
                      setHaveShownCostDialog(true);
                      saveGlobalConfig(current => ({
                        ...current,
                        hasAcknowledgedCostThreshold: true,
                      }));
                      logEvent('tengu_cost_threshold_acknowledged', {});
                    }}
                  />
                )}
                {focusedInputDialog === 'idle-return' && idleReturnPending && (
                  <IdleReturnDialog
                    idleMinutes={idleReturnPending.idleMinutes}
                    totalInputTokens={getTotalInputTokens()}
                    onDone={async action => {
                      const pending = idleReturnPending;
                      setIdleReturnPending(null);
                      logEvent('tengu_idle_return_action', {
                        action: action as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                        idleMinutes: Math.round(pending.idleMinutes),
                        messageCount: messagesRef.current.length,
                        totalInputTokens: getTotalInputTokens(),
                      });
                      if (action === 'dismiss') {
                        setInputValue(pending.input);
                        return;
                      }
                      if (action === 'never') {
                        saveGlobalConfig(current => {
                          if (current.idleReturnDismissed) return current;
                          return { ...current, idleReturnDismissed: true };
                        });
                      }
                      if (action === 'clear') {
                        const { clearConversation } = await import('../commands/clear/conversation.js');
                        await clearConversation({
                          setMessages,
                          readFileState: readFileState.current,
                          discoveredSkillNames: discoveredSkillNamesRef.current,
                          loadedNestedMemoryPaths: loadedNestedMemoryPathsRef.current,
                          getAppState: () => store.getState(),
                          setAppState,
                          setConversationId,
                        });
                        haikuTitleAttemptedRef.current = false;
                        setHaikuTitle(undefined);
                        bashTools.current.clear();
                        bashToolsProcessedIdx.current = 0;
                      }
                      skipIdleCheckRef.current = true;
                      void onSubmitRef.current(pending.input, {
                        setCursorOffset: () => {},
                        clearBuffer: () => {},
                        resetHistory: () => {},
                      });
                    }}
                  />
                )}
                {focusedInputDialog === 'ide-onboarding' && (
                  <IdeOnboardingDialog
                    onDone={() => setShowIdeOnboarding(false)}
                    installationStatus={ideInstallationStatus}
                  />
                )}
                {process.env.USER_TYPE === 'ant' && focusedInputDialog === 'model-switch' && AntModelSwitchCallout && (
                  <AntModelSwitchCallout
                    onDone={(selection: string, modelAlias?: string) => {
                      setShowModelSwitchCallout(false);
                      if (selection === 'switch' && modelAlias) {
                        setAppState(prev => ({
                          ...prev,
                          mainLoopModel: modelAlias,
                          mainLoopModelForSession: null,
                        }));
                      }
                    }}
                  />
                )}
                {process.env.USER_TYPE === 'ant' &&
                  focusedInputDialog === 'undercover-callout' &&
                  UndercoverAutoCallout && <UndercoverAutoCallout onDone={() => setShowUndercoverCallout(false)} />}
                {focusedInputDialog === 'effort-callout' && (
                  <EffortCallout
                    model={mainLoopModel}
                    onDone={selection => {
                      setShowEffortCallout(false);
                      if (selection !== 'dismiss') {
                        setAppState(prev => ({
                          ...prev,
                          effortValue: selection,
                        }));
                      }
                    }}
                  />
                )}
                {focusedInputDialog === 'remote-callout' && (
                  <RemoteCallout
                    onDone={selection => {
                      setAppState(prev => {
                        if (!prev.showRemoteCallout) return prev;
                        return {
                          ...prev,
                          showRemoteCallout: false,
                          ...(selection === 'enable' && {
                            replBridgeEnabled: true,
                            replBridgeExplicit: true,
                            replBridgeOutboundOnly: false,
                          }),
                        };
                      });
                    }}
                  />
                )}

                {exitFlow}

                {focusedInputDialog === 'plugin-hint' && hintRecommendation && (
                  <PluginHintMenu
                    pluginName={hintRecommendation.pluginName}
                    pluginDescription={hintRecommendation.pluginDescription}
                    marketplaceName={hintRecommendation.marketplaceName}
                    sourceCommand={hintRecommendation.sourceCommand}
                    onResponse={handleHintResponse}
                  />
                )}

                {focusedInputDialog === 'lsp-recommendation' && lspRecommendation && (
                  <LspRecommendationMenu
                    pluginName={lspRecommendation.pluginName}
                    pluginDescription={lspRecommendation.pluginDescription}
                    fileExtension={lspRecommendation.fileExtension}
                    onResponse={handleLspResponse}
                  />
                )}

                {focusedInputDialog === 'desktop-upsell' && (
                  <DesktopUpsellStartup onDone={() => setShowDesktopUpsellStartup(false)} />
                )}

                {feature('ULTRAPLAN')
                  ? focusedInputDialog === 'ultraplan-choice' &&
                    ultraplanPendingChoice && (
                      <UltraplanChoiceDialog
                        plan={ultraplanPendingChoice.plan}
                        sessionId={ultraplanPendingChoice.sessionId}
                        taskId={ultraplanPendingChoice.taskId}
                        setMessages={setMessages}
                        readFileState={readFileState.current}
                        getAppState={() => store.getState()}
                        setConversationId={setConversationId}
                      />
                    )
                  : null}

                {feature('ULTRAPLAN')
                  ? focusedInputDialog === 'ultraplan-launch' &&
                    ultraplanLaunchPending && (
                      <UltraplanLaunchDialog
                        onChoice={(choice, opts) => {
                          const blurb = ultraplanLaunchPending.blurb;
                          setAppState(prev =>
                            prev.ultraplanLaunchPending ? { ...prev, ultraplanLaunchPending: undefined } : prev,
                          );
                          if (choice === 'cancel') return;
                          // 命令的 onDone 使用了 display:'skip'，因此在此处添加
                          // echo — 在 ~5 秒的 teleportToRemote 解析之前提供即时反馈。
                          // ~5 秒的 teleportToRemote 解析之前提供即时反馈。
                          setMessages(prev => [
                            ...prev,
                            createCommandInputMessage(formatCommandInputTags('ultraplan', blurb)),
                          ]);
                          const appendStdout = (msg: string) =>
                            setMessages(prev => [
                              ...prev,
                              createCommandInputMessage(
                                `<${LOCAL_COMMAND_STDOUT_TAG}>${escapeXml(msg)}</${LOCAL_COMMAND_STDOUT_TAG}>`,
                              ),
                            ]);
                          // 如果查询处于中途，则推迟第二条消息
                          // 使其在助手回复之后到达，而不是
                          // 在用户提示和回复之间。
                          const appendWhenIdle = (msg: string) => {
                            if (!queryGuard.isActive) {
                              appendStdout(msg);
                              return;
                            }
                            const unsub = queryGuard.subscribe(() => {
                              if (queryGuard.isActive) return;
                              unsub();
                              // 如果用户在我们等待时停止了 ultraplan，则跳过
                              // 避免为一个已结束的会话显示过时的 "正在监控
                              // <url>" 消息。
                              if (!store.getState().ultraplanSessionUrl) return;
                              appendStdout(msg);
                            });
                          };
                          void launchUltraplan({
                            blurb,
                            promptIdentifier: opts?.promptIdentifier,
                            getAppState: () => store.getState(),
                            setAppState,
                            signal: createAbortController().signal,
                            disconnectedBridge: opts?.disconnectedBridge,
                            onSessionReady: appendWhenIdle,
                          })
                            .then(appendStdout)
                            .catch(logError);
                        }}
                      />
                    )
                  : null}

                {mrRender()}

                {!toolJSX?.shouldHidePromptInput && !focusedInputDialog && !isExiting && !disabled && !cursor && (
                  <>
                    {autoRunIssueReason && (
                      <AutoRunIssueNotification
                        onRun={handleAutoRunIssue}
                        onCancel={handleCancelAutoRunIssue}
                        reason={getAutoRunIssueReasonText(autoRunIssueReason)}
                      />
                    )}
                    {postCompactSurvey.state !== 'closed' ? (
                      <FeedbackSurvey
                        state={postCompactSurvey.state}
                        lastResponse={postCompactSurvey.lastResponse}
                        handleSelect={postCompactSurvey.handleSelect}
                        inputValue={inputValue}
                        setInputValue={setInputValue}
                        onRequestFeedback={handleSurveyRequestFeedback}
                      />
                    ) : memorySurvey.state !== 'closed' ? (
                      <FeedbackSurvey
                        state={memorySurvey.state}
                        lastResponse={memorySurvey.lastResponse}
                        handleSelect={memorySurvey.handleSelect}
                        handleTranscriptSelect={memorySurvey.handleTranscriptSelect}
                        inputValue={inputValue}
                        setInputValue={setInputValue}
                        onRequestFeedback={handleSurveyRequestFeedback}
                        message="Claude 使用其记忆的效果如何？（可选）"
                      />
                    ) : (
                      <FeedbackSurvey
                        state={feedbackSurvey.state}
                        lastResponse={feedbackSurvey.lastResponse}
                        handleSelect={feedbackSurvey.handleSelect}
                        handleTranscriptSelect={feedbackSurvey.handleTranscriptSelect}
                        inputValue={inputValue}
                        setInputValue={setInputValue}
                        onRequestFeedback={didAutoRunIssueRef.current ? undefined : handleSurveyRequestFeedback}
                      />
                    )}
                    {/* 由挫败感触发的转录分享提示 */}
                    {frustrationDetection.state !== 'closed' && (
                      <FeedbackSurvey
                        state={frustrationDetection.state}
                        lastResponse={null}
                        handleSelect={() => {}}
                        handleTranscriptSelect={frustrationDetection.handleTranscriptSelect}
                        inputValue={inputValue}
                        setInputValue={setInputValue}
                      />
                    )}
                    {/* 技能改进调查 - 在检测到改进时显示（仅限蚂蚁） */}
                    {skillImprovementSurvey.suggestion && (
                      <SkillImprovementSurvey
                        isOpen={skillImprovementSurvey.isOpen}
                        skillName={skillImprovementSurvey.suggestion.skillName}
                        updates={skillImprovementSurvey.suggestion.updates}
                        handleSelect={skillImprovementSurvey.handleSelect}
                        inputValue={inputValue}
                        setInputValue={setInputValue}
                      />
                    )}
                    {showIssueFlagBanner && <IssueFlagBanner />}
                    {}
                    <PromptInput
                      debug={debug}
                      ideSelection={ideSelection}
                      hasSuppressedDialogs={!!hasSuppressedDialogs}
                      isLocalJSXCommandActive={isShowingLocalJSXCommand}
                      getToolUseContext={getToolUseContext}
                      toolPermissionContext={toolPermissionContext}
                      setToolPermissionContext={setToolPermissionContext}
                      apiKeyStatus={apiKeyStatus}
                      commands={commands}
                      agents={agentDefinitions.activeAgents}
                      isLoading={isLoading}
                      onExit={handleExit}
                      verbose={verbose}
                      messages={messages}
                      onAutoUpdaterResult={setAutoUpdaterResult}
                      autoUpdaterResult={autoUpdaterResult}
                      input={inputValue}
                      onInputChange={setInputValue}
                      mode={inputMode}
                      onModeChange={setInputMode}
                      stashedPrompt={stashedPrompt}
                      setStashedPrompt={setStashedPrompt}
                      submitCount={submitCount}
                      onShowMessageSelector={handleShowMessageSelector}
                      onMessageActionsEnter={
                        // 在 isLoading 期间有效 — 编辑会先取消；uuid 选择在追加后保留。
                        feature('MESSAGE_ACTIONS') && isFullscreenEnvEnabled() && !disableMessageActions
                          ? enterMessageActions
                          : undefined
                      }
                      mcpClients={mcpClients}
                      pastedContents={pastedContents}
                      setPastedContents={setPastedContents}
                      vimMode={vimMode}
                      setVimMode={setVimMode}
                      showBashesDialog={showBashesDialog}
                      setShowBashesDialog={setShowBashesDialog}
                      onSubmit={onSubmit}
                      onAgentSubmit={onAgentSubmit}
                      isSearchingHistory={isSearchingHistory}
                      setIsSearchingHistory={setIsSearchingHistory}
                      helpOpen={isHelpOpen}
                      setHelpOpen={setIsHelpOpen}
                      insertTextRef={feature('VOICE_MODE') ? insertTextRef : undefined}
                      voiceInterimRange={voice.interimRange}
                    />
                    <SessionBackgroundHint onBackgroundSession={handleBackgroundSession} isLoading={isLoading} />
                  </>
                )}
                {cursor && (
                  // inputValue 是 REPL 状态；输入的文本在往返过程中保留。
                  <MessageActionsBar cursor={cursor} />
                )}
                {focusedInputDialog === 'message-selector' && (
                  <MessageSelector
                    messages={messages}
                    preselectedMessage={messageSelectorPreselect}
                    onPreRestore={onCancel}
                    onRestoreCode={async (message: UserMessage) => {
                      await fileHistoryRewind((updater: (prev: FileHistoryState) => FileHistoryState) => {
                        setAppState(prev => ({
                          ...prev,
                          fileHistory: updater(prev.fileHistory),
                        }));
                      }, message.uuid);
                    }}
                    onSummarize={async (
                      message: UserMessage,
                      feedback?: string,
                      direction: PartialCompactDirection = 'from',
                    ) => {
                      // 项目已裁剪消息，以便精简模型
                      // 不会总结被故意移除的内容。
                      const compactMessages = getMessagesAfterCompactBoundary(messages);

                      const messageIndex = compactMessages.indexOf(message);
                      if (messageIndex === -1) {
                        // 选择了一个已裁剪或预精简的消息，但
                        // 选择器仍显示（REPL 保留完整历史记录以供
                        // 回滚）。说明为何未发生任何操作，而不是
                        // 静默地无操作。
                        setMessages(prev => [
                          ...prev,
                          createSystemMessage(
                            '该消息已不在活动上下文中（被截断或预压缩）。请选择一条更近期的消息。',
                            'warning',
                          ),
                        ]);
                        return;
                      }

                      const newAbortController = createAbortController();
                      const context = getToolUseContext(compactMessages, [], newAbortController, mainLoopModel);

                      const appState = context.getAppState();
                      const defaultSysPrompt = await getSystemPrompt(
                        context.options.tools,
                        context.options.mainLoopModel,
                        Array.from(appState.toolPermissionContext.additionalWorkingDirectories.keys()),
                        context.options.mcpClients,
                      );
                      const systemPrompt = buildEffectiveSystemPrompt({
                        mainThreadAgentDefinition: undefined,
                        toolUseContext: context,
                        customSystemPrompt: context.options.customSystemPrompt,
                        defaultSystemPrompt: defaultSysPrompt,
                        appendSystemPrompt: context.options.appendSystemPrompt,
                      });
                      const [userContext, systemContext] = await Promise.all([getUserContext(), getSystemContext()]);

                      const result = await partialCompactConversation(
                        compactMessages,
                        messageIndex,
                        context,
                        {
                          systemPrompt,
                          userContext,
                          systemContext,
                          toolUseContext: context,
                          forkContextMessages: compactMessages,
                        },
                        feedback,
                        direction,
                      );

                      const kept = result.messagesToKeep ?? [];
                      const ordered =
                        direction === 'up_to'
                          ? [...result.summaryMessages, ...kept]
                          : [...kept, ...result.summaryMessages];
                      const postCompact = [
                        result.boundaryMarker,
                        ...ordered,
                        ...result.attachments,
                        ...result.hookResults,
                      ];
                      // 全屏模式 'from' 保留滚动历史；'up_to' 必须不保留
                      // (old[0] 未改变 + 数组增长表示增量
                      // 使用日志消息路径，因此边界永不持久化)。
                      // 通过 uuid 查找，因为旧数据是原始 REPL 历史记录，且截断
                      // 条目可能偏移预期的消息索引。
                      if (isFullscreenEnvEnabled() && direction === 'from') {
                        setMessages(old => {
                          const rawIdx = old.findIndex(m => m.uuid === message.uuid);
                          return [...old.slice(0, rawIdx === -1 ? 0 : rawIdx), ...postCompact];
                        });
                      } else {
                        setMessages(postCompact);
                      }
                      // 部分压缩绕过 handleMessageFromStream — 清除
                      // 上下文阻塞标志以恢复主动计时。
                      if (feature('PROACTIVE') || feature('KAIROS')) {
                        proactiveModule?.setContextBlocked(false);
                      }
                      setConversationId(randomUUID());
                      runPostCompactCleanup(context.options.querySource);

                      if (direction === 'from') {
                        const r = textForResubmit(message);
                        if (r) {
                          setInputValue(r.text);
                          setInputMode(r.mode);
                        }
                      }

                      // 显示通知，提示使用 ctrl+o
                      const historyShortcut = getShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o');
                      addNotification({
                        key: 'summarize-ctrl-o-hint',
                        text: `对话已总结 (${historyShortcut} 用于历史记录)`,
                        priority: 'medium',
                        timeoutMs: 8000,
                      });
                    }}
                    onRestoreMessage={handleRestoreMessage}
                    onClose={() => {
                      setIsMessageSelectorVisible(false);
                      setMessageSelectorPreselect(undefined);
                    }}
                  />
                )}
                {process.env.USER_TYPE === 'ant' && <DevBar />}
              </Box>
              {feature('BUDDY') && !(companionNarrow && isFullscreenEnvEnabled()) && companionVisible ? (
                <CompanionSprite />
              ) : null}
            </Box>
          }
        />
      </MCPConnectionManager>
    </KeybindingSetup>
  );
  if (isFullscreenEnvEnabled()) {
    return <AlternateScreen mouseTracking={isMouseTrackingEnabled()}>{mainReturn}</AlternateScreen>;
  }
  return mainReturn;
}

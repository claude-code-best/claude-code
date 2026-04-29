// 这些副作用必须在所有其他导入之前运行：1. profileChe
// ckpoint 在繁重模块评估开始前标记入口点 2. startMdmRawRead
// 启动 MDM 子进程（plutil/reg query），使其与下方剩余的约 135ms 导
// 入并行运行 3. startKeychainPrefetch
// 并行启动两个 macOS 钥匙串读取（OAuth + 旧版 API 密钥）——否则 isRem
// oteManagedSettingsEligible() 会通过 applySafeCon
// figEnvironmentVariables() 内的同步 spawn 顺序读取它们（
// 每次 macOS 启动约 65ms）
import { profileCheckpoint, profileReport } from "./utils/startupProfiler.js";

// eslint-disable-next-line custom-rules/no-top-level-side-effects
profileCheckpoint("main_tsx_entry");

import { startMdmRawRead } from "./utils/settings/mdm/rawRead.js";

// eslint-disable-next-line custom-rules/no-top-level-side-effects
startMdmRawRead();

import {
	ensureKeychainPrefetchCompleted,
	startKeychainPrefetch,
} from "./utils/secureStorage/keychainPrefetch.js";

// eslint-disable-next-line custom-rules/no-top-level-side-effects
startKeychainPrefetch();

import { feature } from "bun:bundle";
import {
  Command as CommanderCommand,
  InvalidArgumentError,
  Option,
} from '@commander-js/extra-typings'
import chalk from 'chalk'
import { readFileSync } from 'fs'
import mapValues from 'lodash-es/mapValues.js'
import pickBy from 'lodash-es/pickBy.js'
import uniqBy from 'lodash-es/uniqBy.js'
import React from 'react'
import { getOauthConfig } from './constants/oauth.js'
import { getRemoteSessionUrl } from './constants/product.js'
import { getSystemContext, getUserContext } from './context.js'
import { init, initializeTelemetryAfterTrust } from './entrypoints/init.js'
import { addToHistory } from './history.js'
import type { Root } from '@anthropic/ink'
import { launchRepl } from './replLauncher.js'
import {
	hasGrowthBookEnvOverride,
	initializeGrowthBook,
	refreshGrowthBookAfterAuthChange,
} from "./services/analytics/growthbook.js";
import { fetchBootstrapData } from "./services/api/bootstrap.js";
import {
	type DownloadResult,
	downloadSessionFiles,
	type FilesApiConfig,
	parseFileSpecs,
} from "./services/api/filesApi.js";
import { prefetchPassesEligibility } from "./services/api/referral.js";
import type {
	McpSdkServerConfig,
	McpServerConfig,
	ScopedMcpServerConfig,
} from "./services/mcp/types.js";
import {
	isPolicyAllowed,
	loadPolicyLimits,
	refreshPolicyLimits,
	waitForPolicyLimitsToLoad,
} from "./services/policyLimits/index.js";
import {
	loadRemoteManagedSettings,
	refreshRemoteManagedSettings,
} from "./services/remoteManagedSettings/index.js";
import type { ToolInputJSONSchema } from "./Tool.js";
import {
	createSyntheticOutputTool,
	isSyntheticOutputToolEnabled,
} from "@claude-code-best/builtin-tools/tools/SyntheticOutputTool/SyntheticOutputTool.js";
import { getTools } from "./tools.js";
import {
	canUserConfigureAdvisor,
	getInitialAdvisorSetting,
	isAdvisorEnabled,
	isValidAdvisorModel,
	modelSupportsAdvisor,
} from "./utils/advisor.js";
import { isAgentSwarmsEnabled } from "./utils/agentSwarmsEnabled.js";
import { count, uniq } from "./utils/array.js";
import { installAsciicastRecorder } from "./utils/asciicast.js";
import {
	getSubscriptionType,
	isClaudeAISubscriber,
	prefetchAwsCredentialsAndBedRockInfoIfSafe,
	prefetchGcpCredentialsIfSafe,
	validateForceLoginOrg,
} from "./utils/auth.js";
import {
	checkHasTrustDialogAccepted,
	getGlobalConfig,
	getRemoteControlAtStartup,
	isAutoUpdaterDisabled,
	saveGlobalConfig,
} from "./utils/config.js";
import { seedEarlyInput, stopCapturingEarlyInput } from "./utils/earlyInput.js";
import { getInitialEffortSetting, parseEffortValue } from "./utils/effort.js";
import {
	getInitialFastModeSetting,
	isFastModeEnabled,
	prefetchFastModeStatus,
	resolveFastModeStatusFromCache,
} from "./utils/fastMode.js";
import { applyConfigEnvironmentVariables } from "./utils/managedEnv.js";
import { createSystemMessage, createUserMessage } from "./utils/messages.js";
import { getPlatform } from "./utils/platform.js";
import { getBaseRenderOptions } from "./utils/renderOptions.js";
import { getSessionIngressAuthToken } from "./utils/sessionIngressAuth.js";
import { settingsChangeDetector } from "./utils/settings/changeDetector.js";
import { skillChangeDetector } from "./utils/skills/skillChangeDetector.js";
import { jsonParse, writeFileSync_DEPRECATED } from "./utils/slowOperations.js";
import { computeInitialTeamContext } from "./utils/swarm/reconnection.js";
import { initializeWarningHandler } from "./utils/warningHandler.js";
import { isWorktreeModeEnabled } from "./utils/worktreeModeEnabled.js";

// 延迟 require 以避免循环依赖：teammate.ts -> AppState.tsx -> ... -> main.tsx
/* eslint-disable @typescript-eslint/no-require-imports */
const getTeammateUtils = () =>
	require("./utils/teammate.js") as typeof import("./utils/teammate.js");
const getTeammatePromptAddendum = () =>
	require("./utils/swarm/teammatePromptAddendum.js") as typeof import("./utils/swarm/teammatePromptAddendum.js");
const getTeammateModeSnapshot = () =>
	require("./utils/swarm/backends/teammateModeSnapshot.js") as typeof import("./utils/swarm/backends/teammateModeSnapshot.js");
/* eslint-enable @typescript-eslint/no-require-imports */
// 死代码消除：COORDINATOR_MODE 的条件导入
/* eslint-disable @typescript-eslint/no-require-imports */
const coordinatorModeModule = feature("COORDINATOR_MODE")
	? (require("./coordinator/coordinatorMode.js") as typeof import("./coordinator/coordinatorMode.js"))
	: null;
/* eslint-enable @typescript-eslint/no-require-imports */
// 死代码消除：KAIROS（助手模式）的条件导入
/* eslint-disable @typescript-eslint/no-require-imports */
const assistantModule = feature("KAIROS")
	? (require("./assistant/index.js") as typeof import("./assistant/index.js"))
	: null;
const kairosGate = feature("KAIROS")
	? (require("./assistant/gate.js") as typeof import("./assistant/gate.js"))
	: null;

import { relative, resolve } from "path";
import { isAnalyticsDisabled } from "src/services/analytics/config.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "src/services/analytics/growthbook.js";
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { initializeAnalyticsGates } from 'src/services/analytics/sink.js'
import {
	getOriginalCwd,
	setAdditionalDirectoriesForClaudeMd,
	setIsRemoteMode,
	setMainLoopModelOverride,
	setMainThreadAgentType,
	setTeleportedSessionInfo,
} from "./bootstrap/state.js";
import { filterCommandsForRemoteMode, getCommands } from "./commands.js";
import type { StatsStore } from "./context/stats.js";
import {
  launchAssistantInstallWizard,
  launchAssistantSessionChooser,
  launchInvalidSettingsDialog,
  launchResumeChooser,
  launchSnapshotUpdateDialog,
  launchTeleportRepoMismatchDialog,
  launchTeleportResumeWrapper,
} from './dialogLaunchers.js'
import { SHOW_CURSOR } from '@anthropic/ink'
import {
	exitWithError,
	exitWithMessage,
	getRenderContext,
	renderAndRun,
	showSetupScreens,
} from "./interactiveHelpers.js";
import { initBuiltinPlugins } from "./plugins/bundled/index.js";
/* eslint-enable @typescript-eslint/no-require-imports */
import { checkQuotaStatus } from "./services/claudeAiLimits.js";
import {
	getMcpToolsCommandsAndResources,
	prefetchAllMcpResources,
} from "./services/mcp/client.js";
import {
	VALID_INSTALLABLE_SCOPES,
	VALID_UPDATE_SCOPES,
} from "./services/plugins/pluginCliCommands.js";
import { initBundledSkills } from "./skills/bundled/index.js";
import type { AgentColorName } from "@claude-code-best/builtin-tools/tools/AgentTool/agentColorManager.js";
import {
	getActiveAgentsFromList,
	getAgentDefinitionsWithOverrides,
	isBuiltInAgent,
	isCustomAgent,
	parseAgentsFromJson,
} from "@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js";
import type { LogOption } from "./types/logs.js";
import type { Message as MessageType } from "./types/message.js";
import {
	CLAUDE_IN_CHROME_SKILL_HINT,
	CLAUDE_IN_CHROME_SKILL_HINT_WITH_WEBBROWSER,
} from "./utils/claudeInChrome/prompt.js";
import {
	setupClaudeInChrome,
	shouldAutoEnableClaudeInChrome,
	shouldEnableClaudeInChrome,
} from "./utils/claudeInChrome/setup.js";
import { getContextWindowForModel } from "./utils/context.js";
import { loadConversationForResume } from "./utils/conversationRecovery.js";
import { buildDeepLinkBanner } from "./utils/deepLink/banner.js";
import {
	hasNodeOption,
	isBareMode,
	isEnvTruthy,
	isInProtectedNamespace,
} from "./utils/envUtils.js";
import { refreshExampleCommands } from "./utils/exampleCommands.js";
import type { FpsMetrics } from "./utils/fpsTracker.js";
import { getWorktreePaths } from "./utils/getWorktreePaths.js";
import {
	findGitRoot,
	getBranch,
	getIsGit,
	getWorktreeCount,
} from "./utils/git.js";
import { getGhAuthStatus } from "./utils/github/ghAuthStatus.js";
import { safeParseJSON } from "./utils/json.js";
import { logError } from "./utils/log.js";
import { getModelDeprecationWarning } from "./utils/model/deprecation.js";
import {
	getDefaultMainLoopModel,
	getUserSpecifiedModelSetting,
	normalizeModelStringForAPI,
	parseUserSpecifiedModel,
} from "./utils/model/model.js";
import { ensureModelStringsInitialized } from "./utils/model/modelStrings.js";
import { PERMISSION_MODES } from "./utils/permissions/PermissionMode.js";
import {
	getAutoModeEnabledStateIfCached,
	initializeToolPermissionContext,
	initialPermissionModeFromCLI,
	isDefaultPermissionModeAuto,
	parseToolListFromCLI,
	removeDangerousPermissions,
	stripDangerousPermissionsForAutoMode,
	verifyAutoModeGateAccess,
} from "./utils/permissions/permissionSetup.js";
import { cleanupOrphanedPluginVersionsInBackground } from "./utils/plugins/cacheUtils.js";
import { initializeVersionedPlugins } from "./utils/plugins/installedPluginsManager.js";
import { getManagedPluginNames } from "./utils/plugins/managedPlugins.js";
import { getGlobExclusionsForPluginCache } from "./utils/plugins/orphanedPluginFilter.js";
import { getPluginSeedDirs } from "./utils/plugins/pluginDirectories.js";
import { countFilesRoundedRg } from "./utils/ripgrep.js";
import {
	processSessionStartHooks,
	processSetupHooks,
} from "./utils/sessionStart.js";
import {
	cacheSessionTitle,
	getSessionIdFromLog,
	loadTranscriptFromFile,
	saveAgentSetting,
	saveMode,
	searchSessionsByCustomTitle,
	sessionIdExists,
} from "./utils/sessionStorage.js";
import { ensureMdmSettingsLoaded } from "./utils/settings/mdm/settings.js";
import {
	getInitialSettings,
	getManagedSettingsKeysForLogging,
	getSettingsForSource,
	getSettingsWithErrors,
} from "./utils/settings/settings.js";
import { resetSettingsCache } from "./utils/settings/settingsCache.js";
import type { ValidationError } from "./utils/settings/validation.js";
import {
	DEFAULT_TASKS_MODE_TASK_LIST_ID,
	TASK_STATUSES,
} from "./utils/tasks.js";
import {
	logPluginLoadErrors,
	logPluginsEnabledForSession,
} from "./utils/telemetry/pluginTelemetry.js";
import { logSkillsLoaded } from "./utils/telemetry/skillLoadedEvent.js";
import { generateTempFilePath } from "./utils/tempfile.js";
import { validateUuid } from "./utils/uuid.js";
// 插件启动检查现在已在 REPL.tsx 中以非阻塞方式处理

import { registerMcpAddCommand } from "src/commands/mcp/addCommand.js";
import { registerMcpXaaIdpCommand } from "src/commands/mcp/xaaIdpCommand.js";
import { logPermissionContextForAnts } from "src/services/internalLogging.js";
import { fetchClaudeAIMcpConfigsIfEligible } from "src/services/mcp/claudeai.js";
import { clearServerCache } from "src/services/mcp/client.js";
import {
	areMcpConfigsAllowedWithEnterpriseMcpConfig,
	dedupClaudeAiMcpServers,
	doesEnterpriseMcpConfigExist,
	filterMcpServersByPolicy,
	getClaudeCodeMcpConfigs,
	getMcpServerSignature,
	parseMcpConfig,
	parseMcpConfigFromFilePath,
} from "src/services/mcp/config.js";
import {
	excludeCommandsByServer,
	excludeResourcesByServer,
} from "src/services/mcp/utils.js";
import { isXaaEnabled } from "src/services/mcp/xaaIdpLogin.js";
import { getRelevantTips } from "src/services/tips/tipRegistry.js";
import { logContextMetrics } from "src/utils/api.js";
import {
	CLAUDE_IN_CHROME_MCP_SERVER_NAME,
	isClaudeInChromeMCPServer,
} from "src/utils/claudeInChrome/common.js";
import { registerCleanup } from "src/utils/cleanupRegistry.js";
import { eagerParseCliFlag } from "src/utils/cliArgs.js";
import { createEmptyAttributionState } from "src/utils/commitAttribution.js";
import {
	countConcurrentSessions,
	registerSession,
	updateSessionName,
} from "src/utils/concurrentSessions.js";
import { getCwd } from "src/utils/cwd.js";
import { logForDebugging, setHasFormattedOutput } from "src/utils/debug.js";
import {
	errorMessage,
	getErrnoCode,
	isENOENT,
	TeleportOperationError,
	toError,
} from "src/utils/errors.js";
import {
	getFsImplementation,
	safeResolvePath,
} from "src/utils/fsOperations.js";
import {
	gracefulShutdown,
	gracefulShutdownSync,
} from "src/utils/gracefulShutdown.js";
import { setAllHookEventsEnabled } from "src/utils/hooks/hookEvents.js";
import { refreshModelCapabilities } from "src/utils/model/modelCapabilities.js";
import { peekForStdinData, writeToStderr } from "src/utils/process.js";
import { setCwd } from "src/utils/Shell.js";
import {
	type ProcessedResume,
	processResumedConversation,
} from "src/utils/sessionRestore.js";
import { parseSettingSourcesFlag } from "src/utils/settings/constants.js";
import { plural } from "src/utils/stringUtils.js";
import {
	type ChannelEntry,
	getInitialMainLoopModel,
	getIsNonInteractiveSession,
	getSdkBetas,
	getSessionId,
	getUserMsgOptIn,
	setAllowedChannels,
	setAllowedSettingSources,
	setChromeFlagOverride,
	setClientType,
	setCwdState,
	setDirectConnectServerUrl,
	setFlagSettingsPath,
	setInitialMainLoopModel,
	setInlinePlugins,
	setIsInteractive,
	setKairosActive,
	setOriginalCwd,
	setQuestionPreviewFormat,
	setSdkBetas,
	setSessionBypassPermissionsMode,
	setSessionPersistenceDisabled,
	setSessionSource,
	setUserMsgOptIn,
	switchSession,
} from "./bootstrap/state.js";

/* eslint-disable @typescript-eslint/no-require-imports */
const autoModeStateModule = feature("TRANSCRIPT_CLASSIFIER")
	? (require("./utils/permissions/autoModeState.js") as typeof import("./utils/permissions/autoModeState.js"))
	: null;

// TeleportRepoMismatchDialog、TeleportResumeWrapper 在调用点动态导入
import { migrateBypassPermissionsAcceptedToSettings } from "./migrations/migrateBypassPermissionsAcceptedToSettings.js";
import { migrateEnableAllProjectMcpServersToSettings } from "./migrations/migrateEnableAllProjectMcpServersToSettings.js";
import { migrateFennecToOpus } from "./migrations/migrateFennecToOpus.js";
import { migrateLegacyOpusToCurrent } from "./migrations/migrateLegacyOpusToCurrent.js";
import { migrateOpusToOpus1m } from "./migrations/migrateOpusToOpus1m.js";
import { migrateReplBridgeEnabledToRemoteControlAtStartup } from "./migrations/migrateReplBridgeEnabledToRemoteControlAtStartup.js";
import { migrateSonnet1mToSonnet45 } from "./migrations/migrateSonnet1mToSonnet45.js";
import { migrateSonnet45ToSonnet46 } from "./migrations/migrateSonnet45ToSonnet46.js";
import { resetAutoModeOptInForDefaultOffer } from "./migrations/resetAutoModeOptInForDefaultOffer.js";
import { resetProToOpusDefault } from "./migrations/resetProToOpusDefault.js";
import { createRemoteSessionConfig } from "./remote/RemoteSessionManager.js";
/* eslint-enable @typescript-eslint/no-require-imports */
// teleportWithProgress 在调用点动态导入
import {
	createDirectConnectSession,
	DirectConnectError,
} from "./server/createDirectConnectSession.js";
import { initializeLspServerManager } from "./services/lsp/manager.js";
import { shouldEnablePromptSuggestion } from "./services/PromptSuggestion/promptSuggestion.js";
import {
	type AppState,
	getDefaultAppState,
	IDLE_SPECULATION_STATE,
} from "./state/AppStateStore.js";
import { onChangeAppState } from "./state/onChangeAppState.js";
import { createStore } from "./state/store.js";
import { asSessionId } from "./types/ids.js";
import { filterAllowedSdkBetas } from "./utils/betas.js";
import { isInBundledMode, isRunningWithBun } from "./utils/bundledMode.js";
import { logForDiagnosticsNoPII } from "./utils/diagLogs.js";
import {
	filterExistingPaths,
	getKnownPathsForRepo,
} from "./utils/githubRepoPathMapping.js";
import {
	clearPluginCache,
	loadAllPluginsCacheOnly,
} from "./utils/plugins/pluginLoader.js";
import { migrateChangelogFromConfig } from "./utils/releaseNotes.js";
import { SandboxManager } from "./utils/sandbox/sandbox-adapter.js";
import { fetchSession, prepareApiRequest } from "./utils/teleport/api.js";
import {
	checkOutTeleportedSessionBranch,
	processMessagesForTeleportResume,
	teleportToRemoteWithErrorHandling,
	validateGitState,
	validateSessionRepository,
} from "./utils/teleport.js";
import {
  shouldEnableThinkingByDefault,
  type ThinkingConfig,
} from './utils/thinking.js'
import { initUser, resetUserCache } from './utils/user.js'
import {
	getTmuxInstallInstructions,
	isTmuxAvailable,
	parsePRReference,
} from "./utils/worktree.js";

// eslint-disable-next-line custom-rules/no-top-level-side-effects
profileCheckpoint("main_tsx_imports_loaded");

/** 将托管设置键记录到 Statsig 进行分析。
此操作在 init() 完成后调用，以确保在模型解析前加载设置并应用环境变量。 */
function logManagedSettings(): void {
	try {
		const policySettings = getSettingsForSource("policySettings");
		if (policySettings) {
			const allKeys = getManagedSettingsKeysForLogging(policySettings);
			logEvent("tengu_managed_settings_loaded", {
				keyCount: allKeys.length,
				keys: allKeys.join(
					",",
				) as unknown as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
			});
		}
	} catch {
		// 静默忽略错误 - 这仅用于分析
	}
}

// 检查是否在调试/检查模式下运行
function isBeingDebugged() {
	const isBun = isRunningWithBun();

	// 检查进程参数中的检查标志（包括所有变体）
	const hasInspectArg = process.execArgv.some((arg) => {
		if (isBun) {
			// 注意：Bun 在单文件可执行文件上存在一个问题，即来自 process.argv 的应用程序参数会
			// 泄漏到 process.execArgv 中（类似于 https://github.com/oven-sh/bun/issu
			// es/11673）。如果我们省略此分支，这将破坏 --debug
			// 模式的使用。我们可以跳过该检查，因为 Bun 不支持 Node.js 旧版 --debug 或 --debug-brk 标志。
			return /--inspect(-brk)?/.test(arg);
		} else {
			// 在 Node.js 中，检查 --inspect 和旧版 --debug 标志
			return /--inspect(-brk)?|--debug(-brk)?/.test(arg);
		}
	});

	// 检查 NODE_OPTIONS 是否包含检查标志
	const hasInspectEnv =
		process.env.NODE_OPTIONS &&
		/--inspect(-brk)?|--debug(-brk)?/.test(process.env.NODE_OPTIONS);

	// 检查检查器是否可用且处于活动状态（表示正在调试）
	try {
		// 动态导入会更好但是异步的 - 改用全局对象 eslint-disable-next-li
		// ne @typescript-eslint/no-explicit-any
		const inspector = (global as any).require("inspector");
		const hasInspectorUrl = !!inspector.url();
		return hasInspectorUrl || hasInspectArg || hasInspectEnv;
	} catch {
		// 忽略错误并回退到参数检测
		return hasInspectArg || hasInspectEnv;
	}
}



/** 每次会话的技能/插件遥测。从交互式路径和无头 -p 路径（在 runHeadless 之前）调用——两者都经过 main.tsx，但在交互式启动路径之前分支，因此这里需要两个调用点，而不是这里一个 + QueryEngine 中一个。 */
function logSessionTelemetry(): void {
	const model = parseUserSpecifiedModel(
		getInitialMainLoopModel() ?? getDefaultMainLoopModel(),
	);
	void logSkillsLoaded(
		getCwd(),
		getContextWindowForModel(model, getSdkBetas()),
	);
	void loadAllPluginsCacheOnly()
		.then(({ enabled, errors }) => {
			const managedNames = getManagedPluginNames();
			logPluginsEnabledForSession(
				enabled,
				managedNames,
				getPluginSeedDirs(),
			);
			logPluginLoadErrors(errors, managedNames);
		})
		.catch((err) => logError(err));
}

function getCertEnvVarTelemetry(): Record<string, boolean> {
	const result: Record<string, boolean> = {};
	if (process.env.NODE_EXTRA_CA_CERTS) {
		result.has_node_extra_ca_certs = true;
	}
	if (process.env.CLAUDE_CODE_CLIENT_CERT) {
		result.has_client_cert = true;
	}
	if (hasNodeOption("--use-system-ca")) {
		result.has_use_system_ca = true;
	}
	if (hasNodeOption("--use-openssl-ca")) {
		result.has_use_openssl_ca = true;
	}
	return result;
}

async function logStartupTelemetry(): Promise<void> {
	if (isAnalyticsDisabled()) return;
	const [isGit, worktreeCount, ghAuthStatus] = await Promise.all([
		getIsGit(),
		getWorktreeCount(),
		getGhAuthStatus(),
	]);

	logEvent("tengu_startup_telemetry", {
		is_git: isGit,
		worktree_count: worktreeCount,
		gh_auth_status:
			ghAuthStatus as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
		sandbox_enabled: SandboxManager.isSandboxingEnabled(),
		are_unsandboxed_commands_allowed:
			SandboxManager.areUnsandboxedCommandsAllowed(),
		is_auto_bash_allowed_if_sandbox_enabled:
			SandboxManager.isAutoAllowBashIfSandboxedEnabled(),
		auto_updater_disabled: isAutoUpdaterDisabled(),
		prefers_reduced_motion:
			getInitialSettings().prefersReducedMotion ?? false,
		...getCertEnvVarTelemetry(),
	});
}

// @[模型启动]：请考虑你可能需要对模型字符串进行的任何迁移。示例请参考 migrateSonnet1mToSonne
// t45.ts。添加新的同步迁移时请更新此版本号，以便现有用户重新运行设置。
const CURRENT_MIGRATION_VERSION = 11;
function runMigrations(): void {
	if (getGlobalConfig().migrationVersion !== CURRENT_MIGRATION_VERSION) {
		migrateBypassPermissionsAcceptedToSettings();
		migrateEnableAllProjectMcpServersToSettings();
		resetProToOpusDefault();
		migrateSonnet1mToSonnet45();
		migrateLegacyOpusToCurrent();
		migrateSonnet45ToSonnet46();
		migrateOpusToOpus1m();
		migrateReplBridgeEnabledToRemoteControlAtStartup();
		if (feature("TRANSCRIPT_CLASSIFIER")) {
			resetAutoModeOptInForDefaultOffer();
		}
		if (process.env.USER_TYPE === "ant") {
			migrateFennecToOpus();
		}
		saveGlobalConfig((prev) =>
			prev.migrationVersion === CURRENT_MIGRATION_VERSION
				? prev
				: { ...prev, migrationVersion: CURRENT_MIGRATION_VERSION },
		);
	}
	// 异步迁移 - 触发后无需等待，因为它不会阻塞
	migrateChangelogFromConfig().catch(() => {
		// 静默忽略迁移错误 - 将在下次启动时重试
	});
}

/** 仅在安全的情况下预取系统上下文（包括 git 状态）。
Git 命令可能通过钩子和配置（例如 core.fsmonitor、diff.external）执行任意代码，因此我们必须在建立信任后，或在信任是隐式的非交互模式下才能运行它们。 */
function prefetchSystemContextIfSafe(): void {
	const isNonInteractiveSession = getIsNonInteractiveSession();

	// 在非交互模式（--print）下，跳过信任对
	// 话框，执行被视为受信任（如帮助文本中所述）
	if (isNonInteractiveSession) {
		logForDiagnosticsNoPII(
			"info",
			"prefetch_system_context_non_interactive",
		);
		void getSystemContext();
		return;
	}

	// 在交互模式下，仅当信任已建立时才进行预取
	const hasTrust = checkHasTrustDialogAccepted();
	if (hasTrust) {
		logForDiagnosticsNoPII("info", "prefetch_system_context_has_trust");
		void getSystemContext();
	} else {
		logForDiagnosticsNoPII(
			"info",
			"prefetch_system_context_skipped_no_trust",
		);
	}
	// 否则，不进行预取 - 等待先建立信任
}

/** 启动在首次渲染前不需要的后台预取和清理任务。
这些任务从 setup() 延迟执行，以减少关键启动路径上的事件循环争用和子进程生成。
在 REPL 渲染后调用此函数。 */
export function startDeferredPrefetches(): void {
	// 此函数在首次渲染后运行，因此不会阻塞初始绘制。但是，
	// 生成的进程和异步工作仍然会争夺 CPU 和事件循环时
	// 间，这会扭曲启动基准测试（CPU 性能分析、首次渲染
	// 时间测量）。当我们仅测量启动性能时，跳过所有这些操作。
	if (
		isEnvTruthy(process.env.CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER) ||
		// --bare：跳过所有预取。这些预取是为了缓存预热，以提高 REPL 首次响
		// 应的响应速度（initUser、getUserContext、tips、coun
		// tFiles、modelCapabilities、change detecto
		// rs）。脚本化的 -p 调用没有“用户正在输入”的窗口来隐藏这些工作——它在关
		// 键路径上是纯粹的开销。
		isBareMode()
	) {
		return;
	}

	// 生成进程的预取（在首次 API 调用时消耗，用户仍在输入）
	void initUser();
	void getUserContext();
	prefetchSystemContextIfSafe();
	void getRelevantTips();
	if (
		isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) &&
		!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH)
	) {
		void prefetchAwsCredentialsAndBedRockInfoIfSafe();
	}
	if (
		isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) &&
		!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)
	) {
		void prefetchGcpCredentialsIfSafe();
	}
	void countFilesRoundedRg(getCwd(), AbortSignal.timeout(3000), []);

	// 分析和功能标志初始化
	void initializeAnalyticsGates();

	void refreshModelCapabilities();

	// 文件变更检测器从 init() 延迟执行，以解除对首次渲染的阻塞
	void settingsChangeDetector.initialize();
	if (!isBareMode()) {
		void skillChangeDetector.initialize();
	}

	// 事件循环停滞检测器 — 当主线程阻塞超过 500 毫秒时记录日志
	if (process.env.USER_TYPE === "ant") {
		void import("./utils/eventLoopStallDetector.js").then((m) =>
			m.startEventLoopStallDetector(),
		);
	}
}

function loadSettingsFromFlag(settingsFile: string): void {
	try {
		const trimmedSettings = settingsFile.trim();
		const looksLikeJson =
			trimmedSettings.startsWith("{") && trimmedSettings.endsWith("}");

		let settingsPath: string;

		if (looksLikeJson) {
			// 它是一个 JSON 字符串 - 验证并创建临时文件
			const parsedJson = safeParseJSON(trimmedSettings);
			if (!parsedJson) {
				process.stderr.write(
					chalk.red("错误：提供给 --settings 的 JSON 无效\n"),
				);
				process.exit(1);
			}

			// 创建一个临时文件并将 JSON 写入其中。
			// 使用基于内容哈希的路径而不是随机 UUID，以避免破坏
			// Anthropic API 提示缓存。设置路径最终会进入
			// Bash 工具的沙箱 denyWithinAllow 列
			// 表，该列表是发送给 API 的工具描述的一部分。每个子进程
			// 使用随机 UUID 会在每次 query() 调用时更改
			// 工具描述，使缓存前缀失效，并导致 12 倍的输入令牌
			// 成本惩罚。内容哈希确保相同的设置在不同进程边界（每个 SD
			// K query() 都会生成一个新进程）产生相同的路径。
			settingsPath = generateTempFilePath("claude-settings", ".json", {
				contentHash: trimmedSettings,
			});
			writeFileSync_DEPRECATED(settingsPath, trimmedSettings, "utf8");
		} else {
			// 它是一个文件路径 - 通过尝试读取来解析和验证
			const { resolvedPath: resolvedSettingsPath } = safeResolvePath(
				getFsImplementation(),
				settingsFile,
			);
			try {
				readFileSync(resolvedSettingsPath, "utf8");
			} catch (e) {
				if (isENOENT(e)) {
					process.stderr.write(
						chalk.red(
							`错误：未找到设置文件：${resolvedSettingsPath}
`,
						),
					);
					process.exit(1);
				}
				throw e;
			}
			settingsPath = resolvedSettingsPath;
		}

		setFlagSettingsPath(settingsPath);
		resetSettingsCache();
	} catch (error) {
		if (error instanceof Error) {
			logError(error);
		}
		process.stderr.write(
			chalk.red(`处理设置时出错：${errorMessage(error)}
`),
		);
		process.exit(1);
	}
}

function loadSettingSourcesFromFlag(settingSourcesArg: string): void {
	try {
		const sources = parseSettingSourcesFlag(settingSourcesArg);
		setAllowedSettingSources(sources);
		resetSettingsCache();
	} catch (error) {
		if (error instanceof Error) {
			logError(error);
		}
		process.stderr.write(
			chalk.red(
				`处理 --setting-sources 时出错：${errorMessage(error)}
`,
			),
		);
		process.exit(1);
	}
}

/** 在 init() 之前尽早解析和加载设置标志
这确保设置从初始化开始就被过滤 */
function eagerLoadSettings(): void {
	profileCheckpoint("eagerLoadSettings_start");
	// 尽早解析 --settings 标志，以确保在 init() 之前加载设置
	const settingsFile = eagerParseCliFlag("--settings");
	if (settingsFile) {
		loadSettingsFromFlag(settingsFile);
	}

	// 尽早解析 --setting-sources 标志，以控制加载哪些源
	const settingSourcesArg = eagerParseCliFlag("--setting-sources");
	if (settingSourcesArg !== undefined) {
		loadSettingSourcesFromFlag(settingSourcesArg);
	}
	profileCheckpoint("eagerLoadSettings_end");
}

function initializeEntrypoint(isNonInteractive: boolean): void {
	// 如果已设置则跳过（例如，由 SDK 或其他入口点设置）
	if (process.env.CLAUDE_CODE_ENTRYPOINT) {
		return;
	}

	const cliArgs = process.argv.slice(2);

	// 检查 MCP serve 命令（在 mcp serve 之前处理标志，例如 --debug mcp serve）
	const mcpIndex = cliArgs.indexOf("mcp");
	if (mcpIndex !== -1 && cliArgs[mcpIndex + 1] === "serve") {
		process.env.CLAUDE_CODE_ENTRYPOINT = "mcp";
		return;
	}

	if (isEnvTruthy(process.env.CLAUDE_CODE_ACTION)) {
		process.env.CLAUDE_CODE_ENTRYPOINT = "claude-code-github-action";
		return;
	}

	// 注意：'local-agent' 入口点由本地代理模式启动器通过 CLAUD
	// E_CODE_ENTRYPOINT 环境变量设置（由上面的提前返回处理）

	// 根据交互状态设置
	process.env.CLAUDE_CODE_ENTRYPOINT = isNonInteractive ? "sdk-cli" : "cli";
}

// 当检测到 `claude open <url>` 时由早期的 argv 处理设置（仅限交互模式）
type PendingConnect = {
	url: string | undefined;
	authToken: string | undefined;
	dangerouslySkipPermissions: boolean;
};
const _pendingConnect: PendingConnect | undefined = feature("DIRECT_CONNECT")
	? {
			url: undefined,
			authToken: undefined,
			dangerouslySkipPermissions: false,
		}
	: undefined;

// 当检测到 `claude assistant [sessionId]` 时由早期的 argv 处理设置
type PendingAssistantChat = { sessionId?: string; discover: boolean };
const _pendingAssistantChat: PendingAssistantChat | undefined = feature(
	"KAIROS",
)
	? { sessionId: undefined, discover: false }
	: undefined;

// `claude ssh <host> [dir]` — 从 argv 中提前
// 解析（与上述 DIRECT_CONNECT 模式相同），以便主命令路径能够识别它
// ，并为 REPL 提供一个基于 SSH 的会话，而非本地会话。
type PendingSSH = {
	host: string | undefined;
	cwd: string | undefined;
	permissionMode: string | undefined;
	dangerouslySkipPermissions: boolean;
	/** --local: 直接启动子 CLI，跳过 ssh/探测/部署。端到端测试模式。 */
	local: boolean;
	/** 在初始启动时转发给远程 CLI 的额外 CLI 参数（--resume, -c）。 */
	extraCliArgs: string[];
	remoteBin: string | undefined;
};
const _pendingSSH: PendingSSH | undefined = feature("SSH_REMOTE")
	? {
			host: undefined,
			cwd: undefined,
			permissionMode: undefined,
			dangerouslySkipPermissions: false,
			local: false,
			extraCliArgs: [],
			remoteBin: undefined,
		}
	: undefined;

export async function main() {
	profileCheckpoint("main_function_start");

	// 安全：防止 Windows 从当前目录执行命令。必须在任何命令执行之前设置此选项，以防
	// 止 PATH 劫持攻击。参见：https://docs.microsoft.com/en-us
	// /windows/win32/api/processenv/nf-processenv-searchpathw
	process.env.NoDefaultCurrentDirectoryInExePath = "1";

	// 尽早初始化警告处理器以捕获警告
	initializeWarningHandler();

	process.on("exit", () => {
		resetCursor();
	});
	process.on("SIGINT", () => {
		// 在打印模式下，print.ts 会注册自己的 SIGINT 处理器，该处理器
		// 会中止正在进行的查询并调用 gracefulShutdown；此处跳过以避
		// 免通过同步的 process.exit() 抢占它。
		if (process.argv.includes("-p") || process.argv.includes("--print")) {
			return;
		}
		process.exit(0);
	});
	profileCheckpoint("main_warning_handler_initialized");

	// 检查 argv 中是否有 cc:// 或 cc+unix:// UR
	// L — 重写以便主命令处理它，提供完整的交互式 TUI，而非精简的子命令。对于无
	// 头模式 (-p)，我们将其重写为内部的 `open` 子命令。
	if (feature("DIRECT_CONNECT")) {
		const rawCliArgs = process.argv.slice(2);
		const ccIdx = rawCliArgs.findIndex(
			(a) => a.startsWith("cc:// ") || a.startsWith("cc+unix://"),
		);
		if (ccIdx !== -1 && _pendingConnect) {
			const ccUrl = rawCliArgs[ccIdx]!;
			const { parseConnectUrl } =
				await import("./server/parseConnectUrl.js");
			const parsed = parseConnectUrl(ccUrl);
			_pendingConnect.dangerouslySkipPermissions = rawCliArgs.includes(
				"--dangerously-skip-permissions",
			);

			if (rawCliArgs.includes("-p") || rawCliArgs.includes("--print")) {
				// 无头模式：重写为内部的 `open` 子命令
				const stripped = rawCliArgs.filter((_, i) => i !== ccIdx);
				const dspIdx = stripped.indexOf(
					"--dangerously-skip-permissions",
				);
				if (dspIdx !== -1) {
					stripped.splice(dspIdx, 1);
				}
				process.argv = [
					process.argv[0]!,
					process.argv[1]!,
					"open",
					ccUrl,
					...stripped,
				];
			} else {
				// 交互模式：移除 cc:// URL 和标志，运行主命令
				_pendingConnect.url = parsed.serverUrl;
				_pendingConnect.authToken = parsed.authToken;
				const stripped = rawCliArgs.filter((_, i) => i !== ccIdx);
				const dspIdx = stripped.indexOf(
					"--dangerously-skip-permissions",
				);
				if (dspIdx !== -1) {
					stripped.splice(dspIdx, 1);
				}
				process.argv = [
					process.argv[0]!,
					process.argv[1]!,
					...stripped,
				];
			}
		}
	}

	// 尽早处理深度链接 URI — 这是由操作系统协议处理器
	// 调用的，应在完全初始化之前退出，因为它只需要解析 UR
	// I 并打开终端。
	if (feature("LODESTONE")) {
		const handleUriIdx = process.argv.indexOf("--handle-uri");
		if (handleUriIdx !== -1 && process.argv[handleUriIdx + 1]) {
			const { enableConfigs } = await import("./utils/config.js");
			enableConfigs();
			const uri = process.argv[handleUriIdx + 1]!;
			const { handleDeepLinkUri } =
				await import("./utils/deepLink/protocolHandler.js");
			const exitCode = await handleDeepLinkUri(uri);
			process.exit(exitCode);
		}

		// macOS URL 处理器：当 LaunchServices 启动我们的 .a
		// pp 包时，URL 通过 Apple Event（而非 argv）到达。L
		// aunchServices 会将 __CFBundleIdentifier 覆盖
		// 为启动包的 ID，这是一个精确的积极信号 — 比导入并使用启发式方法猜测更廉价。
		if (
			process.platform === "darwin" &&
			process.env.__CFBundleIdentifier ===
				"com.anthropic.claude-code-url-handler"
		) {
			const { enableConfigs } = await import("./utils/config.js");
			enableConfigs();
			const { handleUrlSchemeLaunch } =
				await import("./utils/deepLink/protocolHandler.js");
			const urlSchemeResult = await handleUrlSchemeLaunch();
			process.exit(urlSchemeResult ?? 1);
		}
	}

	// `claude assistant [sessionId]` —
	// 暂存并移除，以便主命令处理它，提供完整的交互式 TUI。仅限位置 0（匹配
	// 下面的 ssh 模式）— 使用 indexOf 会在 `claude -
	// p "explain assistant"` 上产生误报。根标志在
	// 子命令之前（例如 `--debug assistant`）会落入
	// 存根，打印用法。
	if (feature("KAIROS") && _pendingAssistantChat) {
		const rawArgs = process.argv.slice(2);
		if (rawArgs[0] === "assistant") {
			const nextArg = rawArgs[1];
			if (nextArg && !nextArg.startsWith("-")) {
				_pendingAssistantChat.sessionId = nextArg;
				rawArgs.splice(0, 2); // 移除 'assistant' 和 sessionId
				process.argv = [process.argv[0]!, process.argv[1]!, ...rawArgs];
			} else if (!nextArg) {
				_pendingAssistantChat.discover = true;
				rawArgs.splice(0, 1); // 移除 'assistant'
				process.argv = [process.argv[0]!, process.argv[1]!, ...rawArgs];
			}
			// 否则：`claude assistant --help` → 落入存根
		}
	}

	// `claude ssh <host> [dir]` — 从 argv 中
	// 移除，以便主命令处理器运行（完整的交互式 TUI），暂存主机/目录供第
	// ~3720 行的 REPL 分支获取。v1 版本不支持无头模式
	// (-p)：SSH 会话需要本地 REPL 来驱动它们（中断、权限）。
	if (feature("SSH_REMOTE") && _pendingSSH) {
		const rawCliArgs = process.argv.slice(2);
		// SSH 特定标志可以出现在主机位置参数之前（例如 `ssh --permis
		// sion-mode auto host /tmp` — 标准的 POSIX 标志在位置
		// 参数之前）。在检查是否提供了主机之前，将它们全部提取出来，这样 `claude s
		// sh --permission-mode auto host` 和 `claude ss
		// h host --permission-mode auto` 是等效的。下面的主机检查只
		// 需要防范 `-h`/`--help`（这应该由 commander 处理）。
		if (rawCliArgs[0] === "ssh") {
			const localIdx = rawCliArgs.indexOf("--local");
			if (localIdx !== -1) {
				_pendingSSH.local = true;
				rawCliArgs.splice(localIdx, 1);
			}
			const dspIdx = rawCliArgs.indexOf("--dangerously-skip-permissions");
			if (dspIdx !== -1) {
				_pendingSSH.dangerouslySkipPermissions = true;
				rawCliArgs.splice(dspIdx, 1);
			}
			const pmIdx = rawCliArgs.indexOf("--permission-mode");
			if (
				pmIdx !== -1 &&
				rawCliArgs[pmIdx + 1] &&
				!rawCliArgs[pmIdx + 1]!.startsWith("-")
			) {
				_pendingSSH.permissionMode = rawCliArgs[pmIdx + 1];
				rawCliArgs.splice(pmIdx, 2);
			}
			const pmEqIdx = rawCliArgs.findIndex((a) =>
				a.startsWith("--permission-mode="),
			);
			if (pmEqIdx !== -1) {
				_pendingSSH.permissionMode = rawCliArgs[pmEqIdx]!.split("=")[1];
				rawCliArgs.splice(pmEqIdx, 1);
			}
			// 将会话恢复 + 模型标志转发到远程 CLI 的初始启动。--contin
			// ue/-c 和 --resume <uuid> 操作于远程会话历史（该历
			// 史持久化在远程的 ~/.claude/projects/<cwd
			// >/ 下）。--model 控制远程使用的模型。
			const extractFlag = (
				flag: string,
				opts: { hasValue?: boolean; as?: string } = {},
			) => {
				const i = rawCliArgs.indexOf(flag);
				if (i !== -1) {
					_pendingSSH.extraCliArgs.push(opts.as ?? flag);
					const val = rawCliArgs[i + 1];
					if (opts.hasValue && val && !val.startsWith("-")) {
						_pendingSSH.extraCliArgs.push(val);
						rawCliArgs.splice(i, 2);
					} else {
						rawCliArgs.splice(i, 1);
					}
				}
				const eqI = rawCliArgs.findIndex((a) =>
					a.startsWith(`${flag}=`),
				);
				if (eqI !== -1) {
					_pendingSSH.extraCliArgs.push(
						opts.as ?? flag,
						rawCliArgs[eqI]!.slice(flag.length + 1),
					);
					rawCliArgs.splice(eqI, 1);
				}
			};
			const rbIdx = rawCliArgs.indexOf('--remote-bin');
			if (rbIdx !== -1 && rawCliArgs[rbIdx + 1] && !rawCliArgs[rbIdx + 1]!.startsWith('-')) {
				_pendingSSH.remoteBin = rawCliArgs[rbIdx + 1];
				rawCliArgs.splice(rbIdx, 2);
			}
			const rbEqIdx = rawCliArgs.findIndex(a => a.startsWith('--remote-bin='));
			if (rbEqIdx !== -1) {
				_pendingSSH.remoteBin = rawCliArgs[rbEqIdx]!.split('=').slice(1).join('=');
				rawCliArgs.splice(rbEqIdx, 1);
			}

			extractFlag("-c", { as: "--continue" });
			extractFlag("--continue");
			extractFlag("--resume", { hasValue: true });
			extractFlag("--model", { hasValue: true });
		}
		// 预提取后，[1] 处剩余的任何破折号参数要么是 -h/--help（由
		// commander 处理），要么是 ssh 未知的标志（落入 com
		// mander 以便它显示正确的错误）。只有非破折号参数才是主机。
		if (
			rawCliArgs[0] === "ssh" &&
			rawCliArgs[1] &&
			!rawCliArgs[1].startsWith("-")
		) {
			_pendingSSH.host = rawCliArgs[1];
			// 可选的位置参数 cwd。
			let consumed = 2;
			if (rawCliArgs[2] && !rawCliArgs[2].startsWith("-")) {
				_pendingSSH.cwd = rawCliArgs[2];
				consumed = 3;
			}
			const rest = rawCliArgs.slice(consumed);

			// v1 版本中 SSH 不支持无头模式 (-p) —
			// 尽早拒绝，以免该标志静默导致本地执行。
			if (rest.includes("-p") || rest.includes("--print")) {
				process.stderr.write(
					"错误：claude ssh 不支持无头模式 (-p/--print)\n",
				);
				gracefulShutdownSync(1);
				return;
			}

			// 重写 argv，使主命令看到剩余的标志，但看不到 `ssh`。
			process.argv = [process.argv[0]!, process.argv[1]!, ...rest];
		}
	}

		// 尽早检查 -p/--print 和 --init-only 标志，以便在 init() 之前设置
		// isInteractiveSession。这是必需的，因为遥测初始化会调用需要此标志的认证函数。
		const cliArgs = process.argv.slice(2);
		const hasPrintFlag = cliArgs.includes("-p") || cliArgs.includes("--print");
		const hasInitOnlyFlag = cliArgs.includes("--init-only");
		const hasSdkUrl = cliArgs.some((arg) => arg.startsWith("--sdk-url"));
		const forceInteractive = isEnvTruthy(process.env.CLAUDE_CODE_FORCE_INTERACTIVE);
		//非交互模式：有打印标志、初始化仅标志、SDK URL 标志、非强制交互标志、且不是 TTY。
		const isNonInteractive =
			hasPrintFlag || hasInitOnlyFlag || hasSdkUrl || (!forceInteractive && !process.stdout.isTTY);

	// 为非交互模式停止捕获早期输入
	if (isNonInteractive) {
		stopCapturingEarlyInput();
	}

	// 设置简化的跟踪字段
	const isInteractive = !isNonInteractive;
	setIsInteractive(isInteractive);

	// 根据模式初始化入口点 — 需要在记录任何事件之前设置
	initializeEntrypoint(isNonInteractive);

	// 确定客户端类型
	const clientType = (() => {
		if (isEnvTruthy(process.env.GITHUB_ACTIONS)) return "github-action";
		if (process.env.CLAUDE_CODE_ENTRYPOINT === "sdk-ts")
			return "sdk-typescript";
		if (process.env.CLAUDE_CODE_ENTRYPOINT === "sdk-py")
			return "sdk-python";
		if (process.env.CLAUDE_CODE_ENTRYPOINT === "sdk-cli") return "sdk-cli";
		if (process.env.CLAUDE_CODE_ENTRYPOINT === "claude-vscode")
			return "claude-vscode";
		if (process.env.CLAUDE_CODE_ENTRYPOINT === "local-agent")
			return "local-agent";
		if (process.env.CLAUDE_CODE_ENTRYPOINT === "claude-desktop")
			return "claude-desktop";

		// 检查是否提供了会话入口令牌（表示远程会话）
		const hasSessionIngressToken =
			process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN ||
			process.env.CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR;
		if (
			process.env.CLAUDE_CODE_ENTRYPOINT === "remote" ||
			hasSessionIngressToken
		) {
			return "remote";
		}

		return "cli";
	})();
	setClientType(clientType);

	const previewFormat = process.env.CLAUDE_CODE_QUESTION_PREVIEW_FORMAT;
	if (previewFormat === "markdown" || previewFormat === "html") {
		setQuestionPreviewFormat(previewFormat);
	} else if (
		!clientType.startsWith("sdk-") &&
		// 桌面版和 CCR 通过 toolConfig 传递 previewFormat；当功能
		// 被关闭时，它们传递 undefined —— 不要用 markdown 覆盖它。
		clientType !== "claude-desktop" &&
		clientType !== "local-agent" &&
		clientType !== "remote"
	) {
		setQuestionPreviewFormat("markdown");
	}

	// 为通过 `claude remote-control` 创建的会话打上标签，以便后端能够识别它们
	if (process.env.CLAUDE_CODE_ENVIRONMENT_KIND === "bridge") {
		setSessionSource("remote-control");
	}

	profileCheckpoint("main_client_type_determined");

	// 在 init() 之前，尽早解析并加载设置标志
	eagerLoadSettings();

	profileCheckpoint("main_before_run");

	await run();
	profileCheckpoint("main_after_run");
}

async function getInputPrompt(
	prompt: string,
	inputFormat: "text" | "stream-json",
): Promise<string | AsyncIterable<string>> {
	if (
		!process.stdin.isTTY &&
		// 输入劫持会破坏 MCP。
		!process.argv.includes("mcp")
	) {
		if (inputFormat === "stream-json") {
			return process.stdin;
		}
		process.stdin.setEncoding("utf8");
		let data = "";
		const onData = (chunk: string) => {
			data += chunk;
		};
		process.stdin.on("data", onData);
		// 如果 3 秒内没有数据到达，则停止等待并发出警告。标准输入很可
		// 能是一个来自父进程的继承管道，而父进程没有写入（子进程在没有显
		// 式处理 stdin 的情况下生成）。3 秒时间涵盖了像 curl
		// 、处理大文件的 jq、有导入开销的 python 等慢速生产
		// 者。该警告使得对于极少数更慢的生产者，静默的数据丢失变得可见。
		const timedOut = await peekForStdinData(process.stdin, 3000);
		process.stdin.off("data", onData);
		if (timedOut) {
			process.stderr.write(
				"警告：3 秒内未收到 stdin 数据，将在没有它的情况下继续执行。" +
					"如果从慢速命令管道输入，请显式重定向 stdin：< /dev/null 以跳过，或等待更长时间。\n",
			);
		}
		return [prompt, data].filter(Boolean).join("\n");
	}
	return prompt;
}

async function run(): Promise<CommanderCommand> {
	profileCheckpoint("run_function_start");

	// 创建一个按长选项名对选项进行排序的帮助配置。Commander 在
	// 运行时支持 compareOptions，但 @commander-js/extra-t
	// ypings 没有在类型定义中包含它，因此我们使用 Object.assign 来添加它。
	function createSortedHelpConfig(): {
		sortSubcommands: true;
		sortOptions: true;
	} {
		const getOptionSortKey = (opt: Option): string =>
			opt.long?.replace(/^--/, "") ?? opt.short?.replace(/^-/, "") ?? "";
		return Object.assign(
			{ sortSubcommands: true, sortOptions: true } as const,
			{
				compareOptions: (a: Option, b: Option) =>
					getOptionSortKey(a).localeCompare(getOptionSortKey(b)),
			},
		);
	}
	const program = new CommanderCommand()
		.configureHelp(createSortedHelpConfig())
		.enablePositionalOptions();
	profileCheckpoint("run_commander_initialized");

	// 使用 preAction 钩子仅在执行命令时运行初始
	// 化，而不是在显示帮助时。这避免了使用环境变量信号的需要。
	program.hook("preAction", async (thisCommand) => {
		profileCheckpoint("preAction_start");
		// 等待在模块评估时启动的异步子进程加载（第 12-20 行）。几乎零成本 —— 子进程在上方约
		// 135 毫秒的导入期间完成。必须在 init() 之前解析，因为 init() 会触发首
		// 次设置读取（applySafeConfigEnvironmentVariables
		// → getSettingsForSource('policySettings') → isRemo
		// teManagedSettingsEligible → 同步密钥链读取，否则约 65 毫秒）。
		await Promise.all([
			ensureMdmSettingsLoaded(),
			ensureKeychainPrefetchCompleted(),
		]);
		profileCheckpoint("preAction_after_mdm");
		await init();
		profileCheckpoint("preAction_after_init");

		// 在 Windows 上，process.title 直接设置控制台标题；在 POSI
		// X 上，终端 shell 集成可能会将进程名称镜像到标签页。在 init() 之后
		// ，以便 settings.json 环境变量也可以控制此行为（gh-4765）。
		if (!isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE)) {
			process.title = "claude";
		}

		// 附加日志接收器，以便子命令处理程序可以使用 logEvent/logErr
		// or。在 PR #11106 之前，logEvent 直接分发；之后，事件会排
		// 队直到接收器附加。setup() 为默认命令附加接收器，但子命令（doc
		// tor、mcp、plugin、auth）从不调用 setup()，并且会
		// 在 process.exit() 时静默丢弃事件。两个初始化都是幂等的。
		const { initSinks } = await import("./utils/sinks.js");
		initSinks();
		profileCheckpoint("preAction_after_sinks");

		// gh-33508：--plugin-dir 是一个顶级程序选项。默认操作
		// 从其自身的选项解构中读取它，但子命令（plugin list、plugi
		// n install、mcp *）有自己的操作，并且永远看不到它。在这里
		// 将其连接起来，以便 getInlinePlugins() 在任何地方都能工作。
		// thisCommand.opts() 在这里被类型化为 {}，因为此钩子
		// 是在链中的 .option('--plugin-dir', ...) 之
		// 前附加的 —— extra-typings 在添加选项时构建类型。使用运行
		// 时守卫进行细化；收集累加器 + [] 默认值在实践中保证 string[]。
		const pluginDir = thisCommand.getOptionValue("pluginDir");
		if (
			Array.isArray(pluginDir) &&
			pluginDir.length > 0 &&
			pluginDir.every((p) => typeof p === "string")
		) {
			setInlinePlugins(pluginDir);
			clearPluginCache("preAction：--plugin-dir 内联插件");
		}

		runMigrations();
		profileCheckpoint("preAction_after_migrations");

		// 为企业客户加载远程托管设置（非阻塞） 失败开放
		// - 如果获取失败，则在没有远程设置的情况下继
		// 续 设置到达时通过热重载应用 必须在
		// init() 之后发生，以确保允许读取配置
		void loadRemoteManagedSettings();
		void loadPolicyLimits();

		profileCheckpoint("preAction_after_remote_settings");

		// 同步加载设置（非阻塞，失败开放） CL
		// I：将本地设置上传到远程（CCR 下载由 print.ts 处理）
		if (feature("UPLOAD_USER_SETTINGS")) {
			void import("./services/settingsSync/index.js").then((m) =>
				m.uploadUserSettingsInBackground(),
			);
		}

		profileCheckpoint("preAction_after_settings_sync");
	});

	program
		.name("claude")
		.description(
			`Claude Code - 默认启动交互式会话，使用 -p/--print 进行非交互式输出`,
		)
		.argument("[prompt]", "您的提示", String)
		// 子命令通过 commander 的 copyInheritedSettings 继承 hel
		// pOption —— 在这里设置一次即可覆盖 mcp、plugin、auth 和所有其他子命令。
		.helpOption("-h, --help", "显示命令的帮助信息")
		.option(
			"-d, --debug [filter]",
			'启用调试模式，并可选择类别过滤（例如，"api,hooks" 或 "!1p,!file"）',
			(_value: string | true) => {
				// 如果提供了值，它将是过滤字符串 如果未提供
				// 但标志存在，值将为 true 实际的过滤在 d
				// ebug.ts 中通过解析 process.argv 处理
				return true;
			},
		)
		.addOption(
			new Option("--debug-to-stderr", "启用调试模式（输出到 stderr）")
				.argParser(Boolean)
				.hideHelp(),
		)
		.option(
			"--debug-file <路径>",
			"将调试日志写入特定文件路径（隐式启用调试模式）",
			() => true,
		)
		.option(
			"--verbose",
			"覆盖配置中的详细模式设置",
			() => true,
		)
		.option(
			"-p, --print",
			"打印响应并退出（适用于管道）。注意：当 Claude 以 -p 模式运行时，工作区信任对话框会被跳过。仅在你信任的目录中使用此标志。",
			() => true,
		)
		.option(
			"--bare",
			"极简模式：跳过钩子、LSP、插件同步、归因、自动内存管理、后台预取、钥匙串读取以及 CLAUDE.md 自动发现。设置 CLAUDE_CODE_SIMPLE=1。Anthropic 身份验证严格使用 ANTHROPIC_API_KEY 或通过 --settings 使用 apiKeyHelper（永不读取 OAuth 和钥匙串）。第三方提供商（Bedrock/Vertex/Foundry）使用其自身的凭据。技能仍通过 /skill-name 解析。请通过以下方式显式提供上下文：--system-prompt[-file]、--append-system-prompt[-file]、--add-dir（CLAUDE.md 目录）、--mcp-config、--settings、--agents、--plugin-dir。",
			() => true,
		)
		.addOption(
			new Option(
				"--init",
				"运行带有 init 触发器的 Setup 钩子，然后继续",
			).hideHelp(),
		)
		.addOption(
			new Option(
				"--init-only",
				"运行 Setup 和 SessionStart:startup 钩子，然后退出",
			).hideHelp(),
		)
		.addOption(
			new Option(
				"--maintenance",
				"运行带有 maintenance 触发器的 Setup 钩子，然后继续",
			).hideHelp(),
		)
		.addOption(
			new Option(
				"--output-format <格式>",
				'输出格式（仅与 --print 配合使用）："text"（默认）、"json"（单个结果）或 "stream-json"（实时流式传输）',
			).choices(["text", "json", "stream-json"]),
		)
		.addOption(
			new Option(
				"--json-schema <模式>",
				"用于结构化输出验证的 JSON Schema。" +
					'示例：{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}',
			).argParser(String),
		)
		.option(
			"--include-hook-events",
			"在输出流中包含所有钩子生命周期事件（仅与 --output-format=stream-json 配合使用）",
			() => true,
		)
		.option(
			"--include-partial-messages",
			"包含到达的部分消息块（仅与 --print 和 --output-format=stream-json 配合使用）",
			() => true,
		)
		.addOption(
			new Option(
				"--input-format <格式>",
				'输入格式（仅与 --print 配合使用）："text"（默认）或 "stream-json"（实时流式输入）',
			).choices(["text", "stream-json"]),
		)
		.option(
			"--mcp-debug",
			"[已弃用。请改用 --debug] 启用 MCP 调试模式（显示 MCP 服务器错误）",
			() => true,
		)
		.option(
			"--dangerously-skip-permissions",
			"绕过所有权限检查。仅建议用于无网络访问的沙箱环境。",
			() => true,
		)
		.option(
			"--allow-dangerously-skip-permissions",
			"启用绕过所有权限检查的选项，但默认不启用。仅建议用于无网络访问的沙箱环境。",
			() => true,
		)
		.addOption(
			new Option(
				"--thinking <模式>",
				"思考模式：enabled（等同于 adaptive）、disabled",
			)
				.choices(["enabled", "adaptive", "disabled"])
				.hideHelp(),
		)
		.addOption(
			new Option(
				"--max-thinking-tokens <令牌数>",
				"[已弃用。对于较新模型，请改用 --thinking] 最大思考令牌数（仅与 --print 配合使用）",
			)
				.argParser(Number)
				.hideHelp(),
		)
		.addOption(
			new Option(
				"--max-turns <轮次>",
				"在非交互模式下，代理式对话的最大轮次。这将在达到指定轮次后提前结束对话。（仅与 --print 配合使用）",
			)
				.argParser(Number)
				.hideHelp(),
		)
		.addOption(
			new Option(
				"--max-budget-usd <金额>",
				"API 调用的最大美元支出（仅与 --print 配合使用）",
			).argParser((value) => {
				const amount = Number(value);
				if (isNaN(amount) || amount <= 0) {
					throw new Error(
						"--max-budget-usd 必须是一个大于 0 的正数",
					);
				}
				return amount;
			}),
		)
		.addOption(
			new Option(
				"--task-budget <令牌数>",
				"API 端的任务预算（以令牌计）（output_config.task_budget）",
			)
				.argParser((value) => {
					const tokens = Number(value);
					if (
						isNaN(tokens) ||
						tokens <= 0 ||
						!Number.isInteger(tokens)
					) {
						throw new Error(
							"--task-budget 必须是一个正整数",
						);
					}
					return tokens;
				})
				.hideHelp(),
		)
		.option(
			"--replay-user-messages",
			"将来自 stdin 的用户消息重新发送到 stdout 以进行确认（仅与 --input-format=stream-json 和 --output-format=stream-json 配合使用）",
			() => true,
		)
		.addOption(
			new Option(
				"--enable-auth-status",
				"在 SDK 模式下启用身份验证状态消息",
			)
				.default(false)
				.hideHelp(),
		)
		.option(
			"--allowedTools, --allowed-tools <tools...>",
			'允许使用的工具名称列表，以逗号或空格分隔（例如 "Bash(git:*) Edit"）',
		)
		.option(
			"--tools <tools...>",
			'从内置工具集中指定可用工具列表。使用 "" 禁用所有工具，"default" 使用所有工具，或指定工具名称（例如 "Bash,Edit,Read"）。',
		)
		.option(
			"--disallowedTools, --disallowed-tools <tools...>",
			'拒绝使用的工具名称列表，以逗号或空格分隔（例如 "Bash(git:*) Edit"）',
		)
		.option(
			"--mcp-config <configs...>",
			"从 JSON 文件或字符串加载 MCP 服务器（以空格分隔）",
		)
		.addOption(
			new Option(
				"--permission-prompt-tool <tool>",
				"用于权限提示的 MCP 工具（仅与 --print 参数配合使用）",
			)
				.argParser(String)
				.hideHelp(),
		)
		.addOption(
			new Option(
				"--system-prompt <prompt>",
				"会话使用的系统提示词",
			).argParser(String),
		)
		.addOption(
			new Option(
				"--system-prompt-file <file>",
				"从文件读取系统提示词",
			)
				.argParser(String)
				.hideHelp(),
		)
		.addOption(
			new Option(
				"--append-system-prompt <prompt>",
				"将系统提示词追加到默认系统提示词之后",
			).argParser(String),
		)
		.addOption(
			new Option(
				"--append-system-prompt-file <file>",
				"从文件读取系统提示词并追加到默认系统提示词之后",
			)
				.argParser(String)
				.hideHelp(),
		)
		.addOption(
			new Option(
				"--permission-mode <mode>",
				"会话使用的权限模式",
			)
				.argParser(String)
				.choices(PERMISSION_MODES),
		)
		.option(
			"-c, --continue",
			"继续当前目录下最近的对话",
			() => true,
		)
		.option(
			"-r, --resume [value]",
			"通过会话 ID 恢复对话，或使用可选搜索词打开交互式选择器",
			(value) => value || true,
		)
		.option(
			"--fork-session",
			"恢复时，创建新的会话 ID 而非复用原 ID（与 --resume 或 --continue 参数配合使用）",
			() => true,
		)
		.addOption(
			new Option(
				"--prefill <text>",
				"在提示输入框中预填充文本但不提交",
			).hideHelp(),
		)
		.addOption(
			new Option(
				"--deep-link-origin",
				"表示此会话是通过深度链接启动的",
			).hideHelp(),
		)
		.addOption(
			new Option(
				"--deep-link-repo <slug>",
				"深度链接 ?repo= 参数解析到当前工作目录的仓库标识",
			).hideHelp(),
		)
		.addOption(
			new Option(
				"--deep-link-last-fetch <毫秒>",
				"FETCH_HEAD 的修改时间，以纪元毫秒表示，由深度链接跳转程序预先计算",
			)
				.argParser((v) => {
					const n = Number(v);
					return Number.isFinite(n) ? n : undefined;
				})
				.hideHelp(),
		)
		.option(
			"--from-pr [值]",
			"通过 PR 编号/URL 恢复与某个 PR 关联的会话，或打开带可选搜索词的交互式选择器",
			(value) => value || true,
		)
		.option(
			"--no-session-persistence",
			"禁用会话持久化 - 会话将不会保存到磁盘且无法恢复（仅与 --print 参数配合使用）",
		)
		.addOption(
			new Option(
				"--resume-session-at <消息ID>",
				"恢复会话时，仅包含直至并包括指定 <message.id> 的助手消息（在 --resume 的打印模式下使用）",
			)
				.argParser(String)
				.hideHelp(),
		)
		.addOption(
			new Option(
				"--rewind-files <用户消息ID>",
				"将文件恢复到指定用户消息时的状态并退出（需要 --resume 参数）",
			).hideHelp(),
		)
		// @[模型启动]: 更新 --model 帮助文本中的示例模型ID。
		.option(
			"--model <模型>",
			`当前会话使用的模型。可提供最新模型的别名（例如 'sonnet' 或 'opus'）或模型的完整名称（例如 'claude-sonnet-4-6'）。`,
		)
		.addOption(
			new Option(
				"--effort <级别>",
				`当前会话的投入级别（低、中、高、最大）`,
			).argParser((rawValue: string) => {
				const value = rawValue.toLowerCase();
				const allowed = ["low", "medium", "high", "max"];
				if (!allowed.includes(value)) {
					throw new InvalidArgumentError(
						`必须是以下选项之一：${allowed.join(", ")}`,
					);
				}
				return value;
			}),
		)
		.option(
			"--agent <代理>",
			`当前会话使用的代理。覆盖 'agent' 设置。`,
		)
		.option(
			"--betas <测试功能...>",
			"在 API 请求中包含的 Beta 头信息（仅限 API 密钥用户）",
		)
		.option(
			"--fallback-model <模型>",
			"当默认模型过载时，自动回退到指定模型（仅与 --print 参数配合使用）",
		)
		.addOption(
			new Option(
				"--workload <标签>",
				"用于账单头归属的工作负载标签 (cc_workload)。进程作用域；由为定时任务生成子进程的 SDK 守护进程调用者设置。（仅与 --print 参数配合使用）",
			).hideHelp(),
		)
		.option(
			"--settings <文件或JSON>",
			"指向设置 JSON 文件的路径或 JSON 字符串，用于加载额外设置",
		)
		.option(
			"--add-dir <目录...>",
			"允许工具访问的额外目录",
		)
		.option(
			"--ide",
			"启动时，如果恰好有一个可用的有效 IDE，则自动连接",
			() => true,
		)
		.option(
			"--strict-mcp-config",
			"仅使用来自 --mcp-config 的 MCP 服务器，忽略所有其他 MCP 配置",
			() => true,
		)
		.option(
			"--session-id <UUID>",
			"为对话使用特定的会话 ID（必须是有效的 UUID）",
		)
		.option(
			"-n, --name <name>",
			"为此会话设置一个显示名称（在 /resume 和终端标题中显示）",
		)
		.option(
			"--agents <json>",
			'定义自定义代理的 JSON 对象（例如 \'{"reviewer": {"description": "代码审查员", "prompt": "你是一名代码审查员"}}\'）',
		)
		.option(
			"--setting-sources <sources>",
			"要加载的设置源列表，以逗号分隔（user, project, local）。",
		)
		// gh-33508: <paths...>（可变参数）会消耗掉直到下一个 --flag
		// 之前的所有内容。`claude --plugin-dir /path mcp add
		// --transport http` 将 `mcp` 和 `add` 作为路径吞掉了，
		// 然后因 --transport 作为未知的顶级选项而报错。单值 + 收集累加器意
		// 味着每个 --plugin-dir 只接受一个参数；要指定多个目录，请重复使用该标志。
		.option(
			"--plugin-dir <path>",
			"仅为此会话从目录加载插件（可重复：--plugin-dir A --plugin-dir B）",
			(val: string, prev: string[]) => [...prev, val],
			[] as string[],
		)
		.option("--disable-slash-commands", "禁用所有技能", () => true)
		.option("--chrome", "启用 Chrome 中的 Claude 集成")
		.option("--no-chrome", "禁用 Chrome 中的 Claude 集成")
		.option(
			"--file <specs...>",
			"启动时要下载的文件资源。格式：file_id:relative_path（例如，--file file_abc:doc.txt file_def:img.png）",
		)
		.action(async (prompt, options) => {
			profileCheckpoint("action_handler_start");

			// --bare = 单开关最小模式。设置 SIMPLE 以便所有现有门控
			// 生效（CLAUDE.md、技能、executeHooks 内的钩子、
			// 代理目录遍历）。必须在 setup() / 任何门控工作运行之前设置。
			if ((options as { bare?: boolean }).bare) {
				process.env.CLAUDE_CODE_SIMPLE = "1";
			}

			// 忽略 "code" 作为提示 - 将其视为无提示
			if (prompt === "code") {
				logEvent("tengu_code_prompt_ignored", {});
				// biome-ignore lint/suspicious/noConsole:: 故意的控制台输出
				console.warn(
					chalk.yellow(
						"提示：你可以直接使用 `claude` 启动 Claude Code",
					),
				);
				prompt = undefined;
			}

			// 记录任何单字提示的事件
			if (
				prompt &&
				typeof prompt === "string" &&
				!/\s/.test(prompt) &&
				prompt.length > 0
			) {
				logEvent("tengu_single_word_prompt", { length: prompt.length });
			}

			// 助手模式：当 .claude/settings.json 中 assistant 为 t
			// rue 且 tengu_kairos GrowthBook 门控开启时，强制启用 bri
			// ef。权限模式留给用户决定 — settings defaultMode 或 --perm
			// ission-mode 正常应用。REPL 输入的消息默认已经是 'next' 优
			// 先级（messageQueueManager.enqueue），因此它们会在工具调用之间的回
			// 合中被处理。SendUserMessage (BriefTool) 通过 brief 环境
			// 变量启用。SleepTool 保持禁用（其 isEnabled() 门控在 proacti
			// ve 上）。kairosEnabled 在此处计算一次，并在稍后的 g
			// etAssistantSystemPromptAddendum() 调用点重用。
			//
			// 信任门控：.claude/settings.json 在不受信任的
			// 克隆中可由攻击者控制。我们在 showSetupScreens()
			// 显示信任对话框之前运行了约 1000 行代码，到那时
			// 我们已经将 .claude/agents/assistant.md 附
			// 加到系统提示中。在目录被明确信任之前，拒绝激活。
			let kairosEnabled = false;
			let assistantTeamContext:
				| Awaited<
						ReturnType<
							NonNullable<
								typeof assistantModule
							>["initializeAssistantTeam"]
						>
				  >
				| undefined;
			if (
				feature("KAIROS") &&
				(options as { assistant?: boolean }).assistant &&
				assistantModule
			) {
				// --assistant（代理 SDK 守护进程模式）：在下面的 i
				// sAssistantMode() 运行之前强制锁定。守护进程已经检
				// 查了授权 — 不要让子进程重新检查 tengu_kairos。
				assistantModule.markAssistantForced();
			}
			if (
				feature("KAIROS") &&
				assistantModule &&
				(assistantModule.isAssistantForced() ||
					(options as Record<string, unknown>).assistant === true) &&
				// 衍生的队友共享领导者的 cwd + settings.json，因此该标志
				// 对他们也为 true。--agent-id 被设置意味着我们是
				// 一个衍生的队友（extractTeammateOptions 大约在 17
				// 0 行后运行，所以检查原始的 commander 选项）— 不要重新初始
				// 化团队或覆盖 teammateMode/proactive/brief。
				!(options as { agentId?: unknown }).agentId &&
				kairosGate
			) {
				if (!checkHasTrustDialogAccepted()) {
					// biome-ignore lint/suspicious/noConsole:: 故意的控制台输出
					console.warn(
						chalk.yellow(
							"助手模式已禁用：目录不受信任。请接受信任对话框并重新启动。",
						),
					);
				} else {
					// 阻塞式门控检查 — 立即返回缓存的 `true`；如果磁盘缓存为 f
					// alse/缺失，则惰性初始化 GrowthBook 并获取最新数据（最
					// 多约 5 秒）。--assistant 完全跳过此门控（守护进
					// 程已预先授权）。
					kairosEnabled =
						assistantModule.isAssistantForced() ||
						(await kairosGate.isKairosEnabled());
					if (kairosEnabled) {
						const opts = options as { brief?: boolean };
						opts.brief = true;
						setKairosActive(true);
						// 预置一个进程内团队，以便 Agent(name: "foo") 无需 Tea
						// mCreate 即可衍生队友。必须在 setup() 捕获 teammateMode
						// 快照之前运行（initializeAssistantTeam 在内部调用
						// setCliTeammateModeOverride）。
						assistantTeamContext =
							await assistantModule.initializeAssistantTeam();
					}
				}
			}

			const {
				debug = false,
				debugToStderr = false,
				dangerouslySkipPermissions,
				allowDangerouslySkipPermissions = false,
				tools: baseTools = [],
				allowedTools = [],
				disallowedTools = [],
				mcpConfig = [],
				permissionMode: permissionModeCli,
				addDir = [],
				fallbackModel,
				betas = [],
				ide = false,
				sessionId,
				includeHookEvents,
				includePartialMessages,
			} = options;

			if (options.prefill) {
				seedEarlyInput(options.prefill);
			}

			// 文件下载的 Promise - 提前启动，在 REPL 渲染之前等待
			let fileDownloadPromise: Promise<DownloadResult[]> | undefined;

			const agentsJson = options.agents;
			const agentCli = options.agent;
			if (feature("BG_SESSIONS") && agentCli) {
				process.env.CLAUDE_CODE_AGENT = agentCli;
			}

			// 注意：LSP 管理器初始化被有意推迟到信任对话
			// 框被接受之后。这可以防止插件 LSP 服务器
			// 在用户同意之前在不受信任的目录中执行代码。

			// 单独提取这些内容，以便在需要时进行修改
			let outputFormat = options.outputFormat;
			let inputFormat = options.inputFormat;
			let verbose = options.verbose ?? getGlobalConfig().verbose;
			let print = options.print;
			const init = options.init ?? false;
			const initOnly = options.initOnly ?? false;
			const maintenance = options.maintenance ?? false;

			// 提取禁用斜杠命令标志
			const disableSlashCommands = options.disableSlashCommands || false;

			// 提取任务模式选项（仅限 ant）
			const tasksOption =
				process.env.USER_TYPE === "ant" &&
				(options as { tasks?: boolean | string }).tasks;
			const taskListId = tasksOption
				? typeof tasksOption === "string"
					? tasksOption
					: DEFAULT_TASKS_MODE_TASK_LIST_ID
				: undefined;
			if (process.env.USER_TYPE === "ant" && taskListId) {
				process.env.CLAUDE_CODE_TASK_LIST_ID = taskListId;
			}

			// 提取工作树选项：wor
			// ktree 可以是 true（无值标志）或字符串（自定义名称或 PR 引用）
			const worktreeOption = isWorktreeModeEnabled()
				? (options as { worktree?: boolean | string }).worktree
				: undefined;
			let worktreeName =
				typeof worktreeOption === "string" ? worktreeOption : undefined;
			const worktreeEnabled = worktreeOption !== undefined;

			// 检查工作树名称是否为 PR 引用（#N 或 GitHub PR URL）
			let worktreePRNumber: number | undefined;
			if (worktreeName) {
				const prNum = parsePRReference(worktreeName);
				if (prNum !== null) {
					worktreePRNumber = prNum;
					worktreeName = undefined; // slug 将在 setup() 中生成
				}
			}

			// 提取 tmux 选项（需要 --worktree）
			const tmuxEnabled =
				isWorktreeModeEnabled() &&
				(options as { tmux?: boolean }).tmux === true;

			// 验证 tmux 选项
			if (tmuxEnabled) {
				if (!worktreeEnabled) {
					process.stderr.write(
						chalk.red("错误：--tmux 需要 --worktree\n"),
					);
					process.exit(1);
				}
				if (getPlatform() === "windows") {
					process.stderr.write(
						chalk.red(
							"错误：Windows 不支持 --tmux\n",
						),
					);
					process.exit(1);
				}
				if (!(await isTmuxAvailable())) {
					process.stderr.write(
						chalk.red(
							`错误：未安装 tmux。\n${getTmuxInstallInstructions()}\n`,
						),
					);
					process.exit(1);
				}
			}

			// 提取队友选项（用于 tmux 启动的
			// 代理）在 if 块外部声明，以便后续在系统提示附加内容中访问
			let storedTeammateOpts: TeammateOptions | undefined;
			if (isAgentSwarmsEnabled()) {
				// 提取代理身份选项（用于 tmux 启动的代理）这些
				// 选项替换 CLAUDE_CODE_* 环境变量
				const teammateOpts = extractTeammateOptions(options);
				storedTeammateOpts = teammateOpts;

				// 如果提供了任何队友身份选项，则必须同时提供所有三个必需选项
				const hasAnyTeammateOpt =
					teammateOpts.agentId ||
					teammateOpts.agentName ||
					teammateOpts.teamName;
				const hasAllRequiredTeammateOpts =
					teammateOpts.agentId &&
					teammateOpts.agentName &&
					teammateOpts.teamName;

				if (hasAnyTeammateOpt && !hasAllRequiredTeammateOpts) {
					process.stderr.write(
						chalk.red(
							"错误：必须同时提供 --agent-id、--agent-name 和 --team-name\n",
						),
					);
					process.exit(1);
				}

				// 如果通过 CLI 提供了队友身份，则设置 dynamicTeamContext
				if (
					teammateOpts.agentId &&
					teammateOpts.agentName &&
					teammateOpts.teamName
				) {
					getTeammateUtils().setDynamicTeamContext?.({
						agentId: teammateOpts.agentId,
						agentName: teammateOpts.agentName,
						teamName: teammateOpts.teamName,
						color: teammateOpts.agentColor,
						planModeRequired:
							teammateOpts.planModeRequired ?? false,
						parentSessionId: teammateOpts.parentSessionId,
					});
				}

				// 如果提供了队友模式 CLI 覆盖，则设
				// 置它。这必须在 setup() 捕获快照之前完成
				if (teammateOpts.teammateMode) {
					getTeammateModeSnapshot().setCliTeammateModeOverride?.(
						teammateOpts.teammateMode,
					);
				}
			}

			// 提取远程 SDK 选项
			const sdkUrl = (options as { sdkUrl?: string }).sdkUrl ?? undefined;

			// 允许环境变量启用部分消息（由沙箱网关用于 baku）
			const effectiveIncludePartialMessages =
				includePartialMessages ||
				isEnvTruthy(process.env.CLAUDE_CODE_INCLUDE_PARTIAL_MESSAGES);

			// 当通过 SDK 选项显式请求或在 CLAUDE_CODE_REMOT
			// E 模式（CCR 需要它们）下运行时，启用所有钩子事件类型。
			// 否则，仅发出 SessionStart 和 Setup 事件。
			if (
				includeHookEvents ||
				isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)
			) {
				setAllHookEventsEnabled(true);
			}

			// 当提供 SDK URL 时，自动设置输入/输出格式、详细模式和打印模式
			if (sdkUrl) {
				// 如果提供了 SDK URL，除非显式设置，否则自动使用 stream-json 格式
				if (!inputFormat) {
					inputFormat = "stream-json";
				}
				if (!outputFormat) {
					outputFormat = "stream-json";
				}
				// 除非显式禁用或已设置，否则自动启用详细模式
				if (options.verbose === undefined) {
					verbose = true;
				}
				// 除非显式禁用，否则自动启用打印模式
				if (!options.print) {
					print = true;
				}
			}

			// 提取 teleport 选项
			const teleport =
				(options as { teleport?: string | true }).teleport ?? null;

			// 提取 remote 选项（如果未提供描述，可以是 true，或是一个字符串）
			const remoteOption = (options as { remote?: string | true }).remote;
			const remote = remoteOption === true ? "" : (remoteOption ?? null);

			// 提取 --remote-control / --rc 标志（在交互式会话中启用桥接）
			const remoteControlOption =
				(options as { remoteControl?: string | true }).remoteControl ??
				(options as { rc?: string | true }).rc;
			// 实际的桥接检查推迟到 showSetupScreens() 之后
			// ，以便建立信任且 GrowthBook 拥有认证头。
			let remoteControl = false;
			const remoteControlName =
				typeof remoteControlOption === "string" &&
				remoteControlOption.length > 0
					? remoteControlOption
					: undefined;

			// 如果提供了会话 ID，则验证它
			if (sessionId) {
				// 检查冲突的标志：当同时提供 -
				// -fork-session 时，--session-id 可以与 --continue 或 --r
				// esume 一起使用（为分叉的会话指定自定义 ID）
				if (
					(options.continue || options.resume) &&
					!options.forkSession
				) {
					process.stderr.write(
						chalk.red(
							"错误：仅当同时指定了 --fork-session 时，--session-id 才能与 --continue 或 --resume 一起使用。\n",
						),
					);
					process.exit(1);
				}

				// 当提供了 --sdk-url（桥接/远程模式）时，会话 ID 是服务器
				// 分配的带标签 ID（例如 "session_local_01..."）
				// ，而非 UUID。在这种情况下，跳过 UUID 验证和本地存在性检查。
				if (!sdkUrl) {
					const validatedSessionId = validateUuid(sessionId);
					if (!validatedSessionId) {
						process.stderr.write(
							chalk.red(
								"错误：无效的会话 ID。必须是一个有效的 UUID。\n",
							),
						);
						process.exit(1);
					}

					// 检查会话 ID 是否已存在
					if (sessionIdExists(validatedSessionId)) {
						process.stderr.write(
							chalk.red(
								`错误：会话 ID ${validatedSessionId} 已被使用。\n`,
							),
						);
						process.exit(1);
					}
				}
			}

			// 如果通过 --file 标志指定，则下载文件资源
			const fileSpecs = (options as { file?: string[] }).file;
			if (fileSpecs && fileSpecs.length > 0) {
				// 获取会话入口令牌（由 EnvManager 通过 CLAUDE_CODE_SESSION_ACCESS_TOKEN 提供）
				const sessionToken = getSessionIngressAuthToken();
				if (!sessionToken) {
					process.stderr.write(
						chalk.red(
							"错误：文件下载需要会话令牌。必须设置 CLAUDE_CODE_SESSION_ACCESS_TOKEN。\n",
						),
					);
					process.exit(1);
				}

				// 解析会话 ID：优先使用远程会话 ID，回退到内部会话 ID
				const fileSessionId =
					process.env.CLAUDE_CODE_REMOTE_SESSION_ID || getSessionId();

				const files = parseFileSpecs(fileSpecs);
				if (files.length > 0) {
					// 如果设置了 ANTHROPIC_BASE_URL（由 EnvManager 设置），则使
					// 用它，否则使用 OAuth 配置。这确保在所有环境中与会话入口 API 保持一致。
					const config: FilesApiConfig = {
						baseUrl:
							process.env.ANTHROPIC_BASE_URL ||
							getOauthConfig().BASE_API_URL,
						oauthToken: sessionToken,
						sessionId: fileSessionId,
					};

					// 启动下载但不阻塞启动 - 在 REPL 渲染之前等待
					fileDownloadPromise = downloadSessionFiles(files, config);
				}
			}

			// 从状态中获取 isNonInteractiveSession（在 init() 之前设置）
			const isNonInteractiveSession = getIsNonInteractiveSession();

			// 验证备用模型是否与主模型不同
			if (
				fallbackModel &&
				options.model &&
				fallbackModel === options.model
			) {
				process.stderr.write(
					chalk.red(
						"错误：备用模型不能与主模型相同。请为 --fallback-model 指定一个不同的模型。\n",
					),
				);
				process.exit(1);
			}

			// 处理系统提示选项
			let systemPrompt = options.systemPrompt;
			if (options.systemPromptFile) {
				if (options.systemPrompt) {
					process.stderr.write(
						chalk.red(
							"错误：不能同时使用 --system-prompt 和 --system-prompt-file。请仅使用其中一个。\n",
						),
					);
					process.exit(1);
				}

				try {
					const filePath = resolve(options.systemPromptFile);
					systemPrompt = readFileSync(filePath, "utf8");
				} catch (error) {
					const code = getErrnoCode(error);
					if (code === "ENOENT") {
						process.stderr.write(
							chalk.red(
								`错误：未找到系统提示文件：${resolve(options.systemPromptFile)}\n`,
							),
						);
						process.exit(1);
					}
					process.stderr.write(
						chalk.red(
							`读取系统提示文件时出错：${errorMessage(error)}\n`,
						),
					);
					process.exit(1);
				}
			}

			// 处理追加系统提示选项
			let appendSystemPrompt = options.appendSystemPrompt;
			if (options.appendSystemPromptFile) {
				if (options.appendSystemPrompt) {
					process.stderr.write(
						chalk.red(
							"错误：不能同时使用 --append-system-prompt 和 --append-system-prompt-file。请仅使用其中一个。\n",
						),
					);
					process.exit(1);
				}

				try {
					const filePath = resolve(options.appendSystemPromptFile);
					appendSystemPrompt = readFileSync(filePath, "utf8");
				} catch (error) {
					const code = getErrnoCode(error);
					if (code === "ENOENT") {
						process.stderr.write(
							chalk.red(
								`错误：未找到追加系统提示文件：${resolve(options.appendSystemPromptFile)}\n`,
							),
						);
						process.exit(1);
					}
					process.stderr.write(
						chalk.red(
							`读取追加系统提示文件时出错：${errorMessage(error)}\n`,
						),
					);
					process.exit(1);
				}
			}

			// 为 tmux 队友添加特定于队友的系统提示附录
			if (
				isAgentSwarmsEnabled() &&
				storedTeammateOpts?.agentId &&
				storedTeammateOpts?.agentName &&
				storedTeammateOpts?.teamName
			) {
				const addendum =
					getTeammatePromptAddendum().TEAMMATE_SYSTEM_PROMPT_ADDENDUM;
				appendSystemPrompt = appendSystemPrompt
					? `${appendSystemPrompt}\n\n${addendum}`
					: addendum;
			}

			const {
				mode: permissionMode,
				notification: permissionModeNotification,
			} = initialPermissionModeFromCLI({
				permissionModeCli,
				dangerouslySkipPermissions,
			});

			// 存储会话绕过权限模式，用于信任对话框检查
			setSessionBypassPermissionsMode(
				permissionMode === "bypassPermissions",
			);
			if (feature("TRANSCRIPT_CLASSIFIER")) {
				// autoModeFlagCli 是“用户是否打算本次会话自动”的信号。在以下情况设置：-
				// -enable-auto-mode、--permission-mode auto、解
				// 析的模式是 auto，或者设置 defaultMode 是 auto 但门控拒
				// 绝了它（permissionMode 解析为默认值且没有显式的 CLI 覆盖）。由
				// verifyAutoModeGateAccess 用于决定是否在自动模式不可用
				// 时通知，以及由 tengu_auto_mode_config 选择加入轮播使用。
				if (
					(options as { enableAutoMode?: boolean }).enableAutoMode ||
					permissionModeCli === "auto" ||
					permissionMode === "auto" ||
					(!permissionModeCli && isDefaultPermissionModeAuto())
				) {
					autoModeStateModule?.setAutoModeFlagCli(true);
				}
			}

			// 如果提供了 MCP 配置文件/字符串，则解析它们
			let dynamicMcpConfig: Record<string, ScopedMcpServerConfig> = {
				// 内置 MCP 服务器（默认禁用，用户通过 /mcp 启用）
				"mcp-chrome": {
					type: "http",
					url: "http:// 127.0.0.1:12306/mcp",
					scope: "dynamic",
					"headers": {
						"Authorization": "Bearer my-static-token",
					}
				},
			};

			if (mcpConfig && mcpConfig.length > 0) {
				// 处理 mcpConfig 数组
				const processedConfigs = mcpConfig
					.map((config) => config.trim())
					.filter((config) => config.length > 0);

				let allConfigs: Record<string, McpServerConfig> = {};
				const allErrors: ValidationError[] = [];

				for (const configItem of processedConfigs) {
					let configs: Record<string, McpServerConfig> | null = null;
					let errors: ValidationError[] = [];

					// 首先尝试解析为 JSON 字符串
					const parsedJson = safeParseJSON(configItem);
					if (parsedJson) {
						const result = parseMcpConfig({
							configObject: parsedJson,
							filePath: "命令行",
							expandVars: true,
							scope: "dynamic",
						});
						if (result.config) {
							configs = result.config.mcpServers;
						} else {
							errors = result.errors;
						}
					} else {
						// 尝试作为文件路径
						const configPath = resolve(configItem);
						const result = parseMcpConfigFromFilePath({
							filePath: configPath,
							expandVars: true,
							scope: "dynamic",
						});
						if (result.config) {
							configs = result.config.mcpServers;
						} else {
							errors = result.errors;
						}
					}

					if (errors.length > 0) {
						allErrors.push(...errors);
					} else if (configs) {
						// 合并配置，后出现的配置会覆盖先前的
						allConfigs = { ...allConfigs, ...configs };
					}
				}

				if (allErrors.length > 0) {
					const formattedErrors = allErrors
						.map(
							(err) =>
								`${err.path ? err.path + ": " : ""}${err.message}`,
						)
						.join("\n");
					logForDebugging(
						`--mcp-config 验证失败（${allErrors.length} 个错误）：${formattedErrors}`,
						{
							level: "error",
						},
					);
					process.stderr.write(
						`错误：无效的 MCP 配置：
${formattedErrors}
`,
					);
					process.exit(1);
				}

				if (Object.keys(allConfigs).length > 0) {
					// SDK 主机（Nest/Desktop）拥有自己的服务器命名权，并可
					// 能重用内置名称——对于 type:'sdk' 跳过保留名称检查。
					const nonSdkConfigNames = Object.entries(allConfigs)
						.filter(([, config]) => config.type !== "sdk")
						.map(([name]) => name);

					let reservedNameError: string | null = null;
					if (nonSdkConfigNames.some(isClaudeInChromeMCPServer)) {
						reservedNameError = `无效的 MCP 配置："${CLAUDE_IN_CHROME_MCP_SERVER_NAME}" 是保留的 MCP 名称。`;
					} else if (feature("CHICAGO_MCP")) {
						const {
							isComputerUseMCPServer,
							COMPUTER_USE_MCP_SERVER_NAME,
						} = await import("src/utils/computerUse/common.js");
						if (nonSdkConfigNames.some(isComputerUseMCPServer)) {
							reservedNameError = `无效的 MCP 配置："${COMPUTER_USE_MCP_SERVER_NAME}" 是保留的 MCP 名称。`;
						}
					}
					if (reservedNameError) {
						// stderr+exit(1) —— 此处抛出错误在 stream-json 模
						// 式下会变成静默的未处理拒绝（cli.tsx 中的 void main()）。
						process.stderr.write(`Error: ${reservedNameError}\n`);
						process.exit(1);
					}

					// 为所有配置添加动态作用域。type:'sdk' 的条目原样通过—
					// —它们会在下游被提取到 sdkMcpConfigs 并传递给
					// print.ts。Python SDK 依赖此路径（它不会在初始
					// 化消息中发送 sdkMcpServers）。在此处丢弃它们会导致
					// Coworker 故障（inc-5122）。下面的策略过滤器已
					// 经豁免了 type:'sdk'，并且这些条目在没有 stdin
					// 上的 SDK 传输时是无效的，因此让它们通过没有绕过风险。
					const scopedConfigs = mapValues(allConfigs, (config) => ({
						...config,
						scope: "dynamic" as const,
					}));

					// 对 --mcp-config 服务器强制执行托管策略（allowedM
					// cpServers / deniedMcpServers）。没有这
					// 个，CLI 标志会绕过企业允许列表，而用户/项目/本地配置在 getCl
					// audeCodeMcpConfigs 中会经过该列表——调用者将 dy
					// namicMcpConfig 展开到过滤结果之上。在此源头进行
					// 过滤，以便所有下游消费者看到的是经过策略过滤的集合。
					const { allowed, blocked } =
						filterMcpServersByPolicy(scopedConfigs);
					if (blocked.length > 0) {
						process.stderr.write(
							`警告：MCP ${plural(blocked.length, "server")} 被企业策略阻止：${blocked.join(", ")}
`,
						);
					}
					dynamicMcpConfig = { ...dynamicMcpConfig, ...(allowed as Record<string, ScopedMcpServerConfig>) };
				}
			}

			// 提取 Claude in Chrome 选项并强制执行 claude.ai 订阅者检查（除非用户是 ant）
			const chromeOpts = options as { chrome?: boolean };
			// 存储显式的 CLI 标志，以便队友可以继承它
			setChromeFlagOverride(chromeOpts.chrome);
			const enableClaudeInChrome =
				shouldEnableClaudeInChrome(chromeOpts.chrome) &&
				(process.env.USER_TYPE === "ant" || isClaudeAISubscriber());
			const autoEnableClaudeInChrome =
				!enableClaudeInChrome && shouldAutoEnableClaudeInChrome();

			if (enableClaudeInChrome) {
				const platform = getPlatform();
				try {
					logEvent("tengu_claude_in_chrome_setup", {
						platform:
							platform as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
					});

					const {
						mcpConfig: chromeMcpConfig,
						allowedTools: chromeMcpTools,
						systemPrompt: chromeSystemPrompt,
					} = setupClaudeInChrome();
					dynamicMcpConfig = {
						...dynamicMcpConfig,
						...chromeMcpConfig,
					};
					allowedTools.push(...chromeMcpTools);
					if (chromeSystemPrompt) {
						appendSystemPrompt = appendSystemPrompt
							? `${chromeSystemPrompt}\n\n${appendSystemPrompt}`
							: chromeSystemPrompt;
					}
				} catch (error) {
					logEvent("tengu_claude_in_chrome_setup_failed", {
						platform:
							platform as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
					});
					logForDebugging(`[Claude in Chrome] 错误：${error}`);
					logError(error);
					// biome-ignore lint/suspicious/noConsole:: 故意的控制台输出
					console.error(
						`错误：无法使用 Claude in Chrome 运行。`,
					);
					process.exit(1);
				}
			} else if (autoEnableClaudeInChrome) {
				try {
					const { mcpConfig: chromeMcpConfig } =
						setupClaudeInChrome();
					dynamicMcpConfig = {
						...dynamicMcpConfig,
						...chromeMcpConfig,
					};

					const hint =
						feature("WEB_BROWSER_TOOL") &&
						typeof Bun !== "undefined" &&
						"WebView" in Bun
							? CLAUDE_IN_CHROME_SKILL_HINT_WITH_WEBBROWSER
							: CLAUDE_IN_CHROME_SKILL_HINT;
					appendSystemPrompt = appendSystemPrompt
						? `${appendSystemPrompt}\n\n${hint}`
						: hint;
				} catch (error) {
					// 静默跳过自动启用的任何错误
					logForDebugging(
						`[Claude in Chrome] 错误（自动启用）：${error}`,
					);
				}
			}

			// 提取严格的 MCP 配置标志
			const strictMcpConfig = options.strictMcpConfig || false;

			// 检查是否存在企业 MCP 配置。如果存在，则只允许包含特殊服务
			// 器类型（sdk）的动态 MCP 配置
			if (doesEnterpriseMcpConfigExist()) {
				if (strictMcpConfig) {
					process.stderr.write(
						chalk.red(
							"当存在企业 MCP 配置时，您不能使用 --strict-mcp-config",
						),
					);
					process.exit(1);
				}

				// 对于 --mcp-config，如果所有服务器都是内部类型（sdk）则允许
				if (
					dynamicMcpConfig &&
					!areMcpConfigsAllowedWithEnterpriseMcpConfig(
						dynamicMcpConfig,
					)
				) {
					process.stderr.write(
						chalk.red(
							"当存在企业 MCP 配置时，您不能动态配置 MCP 服务器",
						),
					);
					process.exit(1);
				}
			}

			// chicago MCP：受保护的计算机使用（应用允许列表 + 最前端门控 +
			// SCContentFilter 截图）。仅限 ant，由 GrowthBo
			// ok 门控——失败是静默的（这是内部试用）。平台 + 交互检查内联，以便非 m
			// acOS / 打印模式的 ant 完全跳过繁重的 @ant/computer
			// -use-mcp 导入。gates.js 是轻量的（仅类型导入包）。
			//
			// 放置在企业 MCP 配置检查之后：该检查会拒绝任何 `type !== 's
			// dk'` 的 dynamicMcpConfig 条目，而我们的配置是
			// `type: 'stdio'`。否则，一个启用了 GB 门控且拥有企业配置
			// 的 ant 会 process.exit(1)。Chrome 存在相同的潜
			// 在问题，但已发布且未发生事故；chicago 正确地放置了自己。
			if (
				feature("CHICAGO_MCP") &&
				getPlatform() !== "unknown" &&
				!getIsNonInteractiveSession()
			) {
				try {
					const { getChicagoEnabled } =
						await import("src/utils/computerUse/gates.js");
					if (getChicagoEnabled()) {
						const { setupComputerUseMCP } =
							await import("src/utils/computerUse/setup.js");
						const { mcpConfig, allowedTools: cuTools } =
							setupComputerUseMCP();
						dynamicMcpConfig = {
							...dynamicMcpConfig,
							...mcpConfig,
						};
						allowedTools.push(...cuTools);
					}
				} catch (error) {
					logForDebugging(
						`[计算机使用 MCP] 设置失败：${errorMessage(error)}`,
					);
				}
			}

			// 存储用于加载 CLAUDE.md 的额外目录（由环境变量控制）
			setAdditionalDirectoriesForClaudeMd(addDir);

			// 来自 --channels 标志的频道服务器允许列表——其入站
			// 推送通知应注册到此会话的服务器。该选项添加在 feature() 块
			// 内，因此 TS 在选项类型上不知道它——与 main.tsx:
			// 1824 处的 --assistant 模式相同。devChanne
			// ls 是延迟的：showSetupScreens 显示确认对话框，仅在
			// 接受时才追加到 allowedChannels。
			let devChannels: ChannelEntry[] | undefined;
			// 将插件:名称@市场 / 服务器:Y 标签解析为类型
			// 化条目。标签决定下游信任模型：插件类命中市场验证
			// + GrowthBook 允许列表，服务器类
			// 除非设置了开发标志，否则始终无法通过允许列表
			// （模式仅适用于插件）。未标记或无市场的插件条目
			// 是硬错误——在网关中静默不匹配会看起来像是频道“
			// 已开启”但从未触发。
			const parseChannelEntries = (
				raw: string[],
				flag: string,
			): ChannelEntry[] => {
				const entries: ChannelEntry[] = [];
				const bad: string[] = [];
				for (const c of raw) {
					if (c.startsWith("plugin:")) {
						const rest = c.slice(7);
						const at = rest.indexOf("@");
						if (at <= 0 || at === rest.length - 1) {
							bad.push(c);
						} else {
							entries.push({
								kind: "plugin",
								name: rest.slice(0, at),
								marketplace: rest.slice(at + 1),
							});
						}
					} else if (c.startsWith("server:") && c.length > 7) {
						entries.push({ kind: "server", name: c.slice(7) });
					} else {
						bad.push(c);
					}
				}
				if (bad.length > 0) {
					process.stderr.write(
						chalk.red(
							`${flag} 条目必须被标记：${bad.join(", ")}
` +
								`  plugin:<名称>@<市场>  — 插件提供的频道（强制执行允许列表）
` +
								`  server:<名称>                — 手动配置的 MCP 服务器
`,
						),
					);
					process.exit(1);
				}
				return entries;
			};

			const channelOpts = options as {
				channels?: string[];
				dangerouslyLoadDevelopmentChannels?: string[];
			};
			const rawChannels = channelOpts.channels;
			const rawDev = channelOpts.dangerouslyLoadDevelopmentChannels;
			// 始终解析 + 设置。ChannelsNotice 读取 getAll
			// owedChannels() 并在启动屏幕中渲染适当的分支（已禁用
			// /无认证/策略阻止/监听中）。gateChannelServer(
			// ) 强制执行。--channels 在交互式和打印/SDK 模式下均有效；
			// dev-channels 保持仅限交互式（需要确认对话框）。
			let channelEntries: ChannelEntry[] = [];
			if (rawChannels && rawChannels.length > 0) {
				channelEntries = parseChannelEntries(
					rawChannels,
					"--channels",
				);
				setAllowedChannels(channelEntries);
			}
			if (!isNonInteractiveSession) {
				if (rawDev && rawDev.length > 0) {
					devChannels = parseChannelEntries(
						rawDev,
						"--dangerously-load-development-channels",
					);
				}
			}
			// 标志使用遥测。插件标识符会被记录（与 tengu_plugin
			// _installed 同级别——公共注册表风格名称）；服务器类名
			// 称不会被记录（MCP 服务器名称级别，在其他地方为选择加入
			// ）。每个服务器的网关结果在服务器连接后记录到 tengu_
			// mcp_channel_gate。开发条目在此之后会经过确认对话
			// 框——dev_plugins 捕获输入的内容，而非接受的内容。
			if (
				channelEntries.length > 0 ||
				(devChannels?.length ?? 0) > 0
			) {
				const joinPluginIds = (entries: ChannelEntry[]) => {
					const ids = entries.flatMap((e) =>
						e.kind === "plugin"
							? [`${e.name}@${e.marketplace}`]
							: [],
					);
					return ids.length > 0
						? (ids
								.sort()
								.join(
									",",
								) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
						: undefined;
				};
				logEvent("tengu_mcp_channel_flags", {
					channels_count: channelEntries.length,
					dev_count: devChannels?.length ?? 0,
					plugins: joinPluginIds(channelEntries),
					dev_plugins: joinPluginIds(devChannels ?? []),
				});
			}

			// 通过 --tools 为 SendUserMessage 提供 SDK 选
			// 择加入。所有会话都需要明确选择加入；在 --tools 中列出它表示意图。在
			// initializeToolPermissionContext 之前运行，
			// 以便 getToolsForDefaultPreset() 在计算基础工具禁
			// 止过滤器时将该工具视为已启用。条件性 require 避免将工具名字符
			// 串泄漏到外部构建中。
			if (
				(feature("KAIROS") || feature("KAIROS_BRIEF")) &&
				baseTools.length > 0
			) {
				/* eslint-disable @typescript-eslint/no-require-imports */
				const { BRIEF_TOOL_NAME, LEGACY_BRIEF_TOOL_NAME } =
					require("@claude-code-best/builtin-tools/tools/BriefTool/prompt.js") as typeof import("@claude-code-best/builtin-tools/tools/BriefTool/prompt.js");
				const { isBriefEntitled } =
					require("@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js") as typeof import("@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js");
				/* eslint-enable @typescript-eslint/no-require-imports */
				const parsed = parseToolListFromCLI(baseTools);
				if (
					(parsed.includes(BRIEF_TOOL_NAME) ||
						parsed.includes(LEGACY_BRIEF_TOOL_NAME)) &&
					isBriefEntitled()
				) {
					setUserMsgOptIn(true);
				}
			}

			// 此 await 替换了启动路径中已有的阻塞性 existsSync
			// /statSync 调用。挂钟时间不变；我们只是在 fs I/O
			// 期间让出事件循环，而不是阻塞它。参见 #19661。
			const initResult = await initializeToolPermissionContext({
				allowedToolsCli: allowedTools,
				disallowedToolsCli: disallowedTools,
				baseToolsCli: baseTools,
				permissionMode,
				allowDangerouslySkipPermissions,
				addDirs: addDir,
			});
			let toolPermissionContext = initResult.toolPermissionContext;
			const {
				warnings,
				dangerousPermissions,
				overlyBroadBashPermissions,
			} = initResult;

			// 处理针对 ant 用户的过于宽泛的 shell 允许规则（Bash(*), PowerShell(*)）
			if (
				process.env.USER_TYPE === "ant" &&
				overlyBroadBashPermissions.length > 0
			) {
				for (const permission of overlyBroadBashPermissions) {
					logForDebugging(
						`忽略来自 ${permission.sourceDisplay} 的过于宽泛的 shell 权限 ${permission.ruleDisplay}`,
					);
				}
				toolPermissionContext = removeDangerousPermissions(
					toolPermissionContext,
					overlyBroadBashPermissions,
				);
			}

			if (
				feature("TRANSCRIPT_CLASSIFIER") &&
				dangerousPermissions.length > 0
			) {
				toolPermissionContext = stripDangerousPermissionsForAutoMode(
					toolPermissionContext,
				);
			}

			// 打印初始化过程中的任何警告
			warnings.forEach((warning) => {
				// biome-ignore lint/suspicious/noConsole:: 故意的控制台输出
				console.error(warning);
			});


			// claude.ai 配置获取：仅限 -p 模式（交互式使用 useManageM
			// CPConnections 两阶段加载）。在此处启动以与 setup(
			// ) 重叠；在 runHeadless 之前等待，以便单次 -p 能看
			// 到连接器。在企业/严格 MCP 下跳过以保持策略边界。
			const claudeaiConfigPromise: Promise<
				Record<string, ScopedMcpServerConfig>
			> =
				isNonInteractiveSession &&
				!strictMcpConfig &&
				!doesEnterpriseMcpConfigExist() &&
				// --bare / SIMPLE：跳过 claude.ai 代理服务器（datadog, G
				// mail, Slack, BigQuery, PubMed — 每个连接需要 6-14 秒）。
				// 需要 MCP 的脚本化调用需显式传递 --mcp-config。
				!isBareMode()
					? fetchClaudeAIMcpConfigsIfEligible().then((configs) => {
							const { allowed, blocked } =
								filterMcpServersByPolicy(configs);
							if (blocked.length > 0) {
								process.stderr.write(
									`警告：claude.ai MCP ${plural(blocked.length, "server")} 被企业策略阻止：${blocked.join(", ")}
`,
								);
							}
							return allowed;
						})
					: Promise.resolve({});

			// 尽早启动 MCP 配置加载（安全——仅读取文件，不执行）。交互式和 -p 都使
			// 用 getClaudeCodeMcpConfigs（仅限本地文件读取）。稍后等待
			// 本地 promise（在 prefetchAllMcpResources
			// 之前），以便配置 I/O 与 setup()、命令加载和信任对话框重叠。
			logForDebugging("[启动] 正在加载 MCP 配置...");
			const mcpConfigStart = Date.now();
			let mcpConfigResolvedMs: number | undefined;
			// --bare 跳过自动发现的 MCP（.mcp.json、用户设置、插件）——只有显式
			// 的 --mcp-config 有效。dynamicMcpConfig 被传播到下
			// 游的 allMcpConfigs，因此它能在此次跳过中保留。
			const mcpConfigPromise = (
				strictMcpConfig || isBareMode()
					? Promise.resolve({
							servers: {} as Record<
								string,
								ScopedMcpServerConfig
							>,
						})
					: getClaudeCodeMcpConfigs(dynamicMcpConfig)
			).then((result) => {
				mcpConfigResolvedMs = Date.now() - mcpConfigStart;
				return result;
			});

			// 注意：我们在此处不调用 prefetchAllMcpResources——那被推迟到信任对话框之后

			if (
				inputFormat &&
				inputFormat !== "text" &&
				inputFormat !== "stream-json"
			) {
				// biome-ignore lint/suspicious/noConsole:: 故意的控制台输出
				console.error(`错误：无效的输入格式 "${inputFormat}"。`);
				process.exit(1);
			}
			if (
				inputFormat === "stream-json" &&
				outputFormat !== "stream-json"
			) {
				// biome-ignore lint/suspicious/noConsole:: 故意的控制台输出
				console.error(
					`错误：--input-format=stream-json 需要 output-format=stream-json。`,
				);
				process.exit(1);
			}

			// 验证 sdkUrl 仅与适当的格式一起使用（格式已在上面自动设置）
			if (sdkUrl) {
				if (
					inputFormat !== "stream-json" ||
					outputFormat !== "stream-json"
				) {
					// biome-ignore lint/suspicious/noConsole:: 故意的控制台输出
					console.error(
						`错误：--sdk-url 需要同时设置 --input-format=stream-json 和 --output-format=stream-json。`,
					);
					process.exit(1);
				}
			}

			// 验证 replayUserMessages 仅与 stream-json 格式一起使用
			if (options.replayUserMessages) {
				if (
					inputFormat !== "stream-json" ||
					outputFormat !== "stream-json"
				) {
					// biome-ignore lint/suspicious/noConsole:: 故意的控制台输出
					console.error(
						`错误：--replay-user-messages 要求同时使用 --input-format=stream-json 和 --output-format=stream-json。`,
					);
					process.exit(1);
				}
			}

			// 验证 includePartialMessages 仅与 print 模式和 stream-json 输出一起使用
			if (effectiveIncludePartialMessages) {
				if (
					!isNonInteractiveSession ||
					outputFormat !== "stream-json"
				) {
					writeToStderr(
						`错误：--include-partial-messages 要求使用 --print 和 --output-format=stream-json。`,
					);
					process.exit(1);
				}
			}

			// 验证 --no-session-persistence 仅与 print 模式一起使用
			if (
				options.sessionPersistence === false &&
				!isNonInteractiveSession
			) {
				writeToStderr(
					`错误：--no-session-persistence 只能与 --print 模式一起使用。`,
				);
				process.exit(1);
			}

			const effectivePrompt = prompt || "";
			let inputPrompt = await getInputPrompt(
				effectivePrompt,
				(inputFormat ?? "text") as "text" | "stream-json",
			);
			profileCheckpoint("action_after_input_prompt");

			// 在 getTools() 之前激活主动模式，以便 SleepTool.isEnabled
			// ()（其返回 isProactiveActive()）通过，从而包含 Sleep 工具。
			// 后续 REPL 路径的 maybeActivateProactive() 调用是幂等的。
			maybeActivateProactive(options);

			let tools = getTools(toolPermissionContext);

			// 为无头路径应用协调器模式工具过滤（镜像了 REPL/交
			// 互式路径中 useMergedTools.ts 的过滤逻辑）
			if (
				feature("COORDINATOR_MODE") &&
				isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
			) {
				const { applyCoordinatorToolFilter } =
					await import("./utils/toolPool.js");
				tools = applyCoordinatorToolFilter(tools);
			}

			profileCheckpoint("action_tools_loaded");

			let jsonSchema: ToolInputJSONSchema | undefined;
			if (
				isSyntheticOutputToolEnabled({ isNonInteractiveSession }) &&
				options.jsonSchema
			) {
				jsonSchema = jsonParse(
					options.jsonSchema,
				) as ToolInputJSONSchema;
			}

			if (jsonSchema) {
				const syntheticOutputResult =
					createSyntheticOutputTool(jsonSchema);
				if ("tool" in syntheticOutputResult) {
					// 在 getTools() 过滤之后，将 SyntheticOutp
					// utTool 添加到工具数组中。此工具被排除在常规过滤之外（参见
					// tools.ts），因为它是结构化输出的实现细节，而非用户控制的工具。
					tools = [...tools, syntheticOutputResult.tool];

					logEvent("tengu_structured_output_enabled", {
						schema_property_count: Object.keys(
							(jsonSchema.properties as Record<
								string,
								unknown
							>) || {},
						)
							.length as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
						has_required_fields: Boolean(
							jsonSchema.required,
						) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
					});
				} else {
					logEvent("tengu_structured_output_failure", {
						error: "无效的 JSON 模式" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
					});
				}
			}

			// 重要提示：必须在任何依赖 cwd 或工作树设置的其他代码之前调用 setup()
			profileCheckpoint("action_before_setup");
			logForDebugging("[启动] 正在运行 setup()...");
			const setupStart = Date.now();
			const { setup } = await import("./setup.js");
			const messagingSocketPath = feature("UDS_INBOX")
				? (options as { messagingSocketPath?: string })
						.messagingSocketPath
				: undefined;
			// 将 setup() 与命令+代理加载并行化。setup() 的约 28ms 耗时主要是 star
			// tUdsMessaging（套接字绑定，约 20ms）——不受磁盘限制，因此不会与 getComm
			// ands 的文件读取竞争。以 !worktreeEnabled 为门控条件，因为 --worktre
			// e 会使 setup() 执行 process.chdir(worktreePath)（set
			// up.ts:203），而命令/代理需要切换后的 cwd。
			const preSetupCwd = getCwd();
			// 在启动 getCommands() 之前注册捆绑的技能/插件——它们是纯内存
			// 数组推送（<1ms，零 I/O），getBundledSkills() 会
			// 同步读取。之前是在 setup() 内部约 20ms 的 await
			// 点之后运行，因此并行的 getCommands() 缓存了一个空列表。
			if (process.env.CLAUDE_CODE_ENTRYPOINT !== "local-agent") {
				initBuiltinPlugins();
				initBundledSkills();
			}
			const setupPromise = setup(
				preSetupCwd,
				permissionMode,
				allowDangerouslySkipPermissions,
				worktreeEnabled,
				worktreeName,
				tmuxEnabled,
				sessionId ? validateUuid(sessionId) : undefined,
				worktreePRNumber,
				messagingSocketPath,
			);
			const commandsPromise = worktreeEnabled
				? null
				: getCommands(preSetupCwd);
			const agentDefsPromise = worktreeEnabled
				? null
				: getAgentDefinitionsWithOverrides(preSetupCwd);
			// 如果这些 Promise 在约 28ms 的 setupPromise await 期间（在下面的 P
			// romise.all 合并它们之前）被拒绝，则抑制瞬时的 unhandledRejection。
			commandsPromise?.catch(() => {});
			agentDefsPromise?.catch(() => {});
			await setupPromise;
			logForDebugging(
				`[启动] setup() 在 ${Date.now() - setupStart}ms 内完成`,
			);
			profileCheckpoint("action_after_setup");

			// 仅当显式请求套接字时，才将用户消息重放到 stream
			// -json 中。自动生成的套接字是被动的——它允许工具在
			// 需要时注入，但默认开启不应为从不接触它的 SDK 消费者
			// 重塑 stream-json。注入并希望这些注入在流中可见
			// 的调用者需显式传递 --messaging-socket
			// -path（或 --replay-user-messages）。
			let effectiveReplayUserMessages = !!options.replayUserMessages;
			if (feature("UDS_INBOX")) {
				if (
					!effectiveReplayUserMessages &&
					outputFormat === "stream-json"
				) {
					effectiveReplayUserMessages = !!(
						options as { messagingSocketPath?: string }
					).messagingSocketPath;
				}
			}

			if (getIsNonInteractiveSession()) {
				// 现在应用完整的合并设置环境（包括项目作用域的 .claude/settin
				// gs.json PATH/GIT_DIR/GIT_WORK_TREE），以便 g
				// itExe() 和下面的 git spawn 能看到它。在 -p 模式下信
				// 任是隐式的；managedEnv.ts:96-97 处的文档字符串说明这会应用
				// 来自所有源的“潜在危险的环境变量，如 LD_PRELOAD、PATH”。下面 i
				// sNonInteractiveSession 块中的后续调用是幂等的（Objec
				// t.assign，configureGlobalAgents 会弹出先前的拦截
				// 器），并会在插件初始化后获取任何插件贡献的环境。项目设置已在此处加载：init(
				// ) 中的 applySafeConfigEnvironme
				// ntVariables 调用了 managedEnv.ts:86
				// 的 getSettings_DEPRECATED，它合并了所有启用的源，包括 p
				// rojectSettings/localSettings。
				applyConfigEnvironmentVariables();

				// 现在 spawn git status/log/branch，以便子进程执行与下面的 getComman
				// ds await 和 startDeferredPrefetches 重叠。在 setup() 之后，
				// 以便 cwd 是最终的（setup.ts:254 可能为 --worktree 执行 process.ch
				// dir(worktreePath)），并在上述 applyConfigEnvironmentVaria
				// bles 之后，以便应用来自所有源（受信任的 + 项目的）的 PATH/GIT_DIR/GIT_WO
				// RK_TREE。getSystemContext 已被缓存；start
				// DeferredPrefetches 中的 prefetchSystemContextIfSafe 调
				// 用将变为缓存命中。来自 await getIsGit() 的微任务将在下面的 getComma
				// nds Promise.all await 处耗尽。在 -p 模式下信任是隐式的（与 prefet
				// chSystemContextIfSafe 使用相同的门控条件）。
				void getSystemContext();
				// 现在也启动 getUserContext——它的第一个 await（getMemory
				// Files 中的 fs.readFile）会自然产生，因此 CLAUDE.md 目录遍历将在
				// 约 280ms 的重叠窗口期间运行，然后在 print.ts 中的 conte
				// xt Promise.all 合并之前。startDeferredPrefetch
				// es 中的 void getUserContext() 将变为缓存命中。
				void getUserContext();
				// 现在启动 ensureModelStringsInitialized——对于 Bedrock
				// ，这会触发一个 100-200ms 的配置文件获取，该操作之前在 prin
				// t.ts:739 处被串行等待。updateBedrockModelStrings 被 se
				// quential() 包装，因此 await 会加入正在进行的获取。非 Bedr
				// ock 是同步提前返回（零成本）。
				void ensureModelStringsInitialized();
			}

			// 应用 --name: cache-only，以便在会话 ID 被 --continue/
			// --resume 最终确定之前不会创建孤立文件。materializeSessionFile 在
			// 第一条用户消息时持久化它；REPL 的 useTerminalTitle 通过 getCurren
			// tSessionTitle 读取它。
			const sessionNameArg = options.name?.trim();
			if (sessionNameArg) {
				cacheSessionTitle(sessionNameArg);
			}

			// Ant 模型别名（capybara-fast 等）通过 ten
			// gu_ant_model_override GrowthBook 标志解析。_
			// CACHED_MAY_BE_STALE 同步读取磁盘；磁盘由一次即发即弃的写入填
			// 充。在冷缓存上，parseUserSpecifiedModel 返回未解析的别
			// 名，API 返回 404，并且 -p 在异步写入完成之前退出——导致新 po
			// d 崩溃循环。在此处等待 init 会填充内存中的有效负载映射，_CACHED_
			// MAY_BE_STALE 现在会首先检查该映射。进行门控以使热路径保持非阻塞
			// ：- 通过 -
			// -model 或 ANTHROPIC_MODEL 指定的显式模型（两者都提供别名解析）
			// - 无环境覆盖（这会在磁盘之前短路 _CACHED_MAY_BE_STALE）- 磁
			// 盘上不存在标志（== null 也会捕获 pre-#22279 中毒的 null）
			const explicitModel = options.model || process.env.ANTHROPIC_MODEL;
			if (
				process.env.USER_TYPE === "ant" &&
				explicitModel &&
				explicitModel !== "default" &&
				!hasGrowthBookEnvOverride("tengu_ant_model_override") &&
				getGlobalConfig().cachedGrowthBookFeatures?.[
					"tengu_ant_model_override"
				] == null
			) {
				await initializeGrowthBook();
			}

			// 使用 null 关键字特殊处理默认模型注意：
			// 模型解析在 setup() 之后进行，以确保在 AWS 身份验证之前建立信任
			const userSpecifiedModel =
				options.model === "default"
					? getDefaultMainLoopModel()
					: options.model;
			const userSpecifiedFallbackModel =
				fallbackModel === "default"
					? getDefaultMainLoopModel()
					: fallbackModel;

			// 重用 preSetupCwd，除非 setup() 执行了 chdir（worktreeEnabled
			// ）。在常见路径中节省一次 getCwd() 系统调用。
			const currentCwd = worktreeEnabled ? getCwd() : preSetupCwd;
			logForDebugging("[启动] 正在加载命令和代理...");
			const commandsStart = Date.now();
			// 合并 setup() 之前启动的 Promise（或者如果 worktr
			// eeEnabled 门控了早期启动，则重新开始）。两者都按 cwd 缓存。
			const [commands, agentDefinitionsResult] = await Promise.all([
				commandsPromise ?? getCommands(currentCwd),
				agentDefsPromise ??
					getAgentDefinitionsWithOverrides(currentCwd),
			]);
			logForDebugging(
				`[启动] 命令和代理在 ${Date.now() - commandsStart}ms 内加载完成`,
			);
			profileCheckpoint("action_commands_loaded");

			// 如果通过 --agents 标志提供，则解析 CLI 代理
			let cliAgents: typeof agentDefinitionsResult.activeAgents = [];
			if (agentsJson) {
				try {
					const parsedAgents = safeParseJSON(agentsJson);
					if (parsedAgents) {
						cliAgents = parseAgentsFromJson(
							parsedAgents,
							"flagSettings",
						);
					}
				} catch (error) {
					logError(error);
				}
			}

			// 将 CLI 代理与现有代理合并
			const allAgents = [
				...agentDefinitionsResult.allAgents,
				...cliAgents,
			];
			const agentDefinitions = {
				...agentDefinitionsResult,
				allAgents,
				activeAgents: getActiveAgentsFromList(allAgents),
			};

			// 从 CLI 标志或设置中查找主线程代理
			const agentSetting = agentCli ?? getInitialSettings().agent;
			let mainThreadAgentDefinition:
				| (typeof agentDefinitions.activeAgents)[number]
				| undefined;
			if (agentSetting) {
				mainThreadAgentDefinition = agentDefinitions.activeAgents.find(
					(agent) => agent.agentType === agentSetting,
				);
				if (!mainThreadAgentDefinition) {
					logForDebugging(
						`警告：未找到代理 "${agentSetting}"。 ` +
							`可用代理：${agentDefinitions.activeAgents.map((a) => a.agentType).join(", ")}。 ` +
							`使用默认行为。`,
					);
				}
			}

			// 将主线程代理类型存储在引导状态中，以便钩子可以访问它
			setMainThreadAgentType(mainThreadAgentDefinition?.agentType);

			// 记录代理标志使用情况 — 仅记录内置代理的名称，以避免泄露自定义代理名称
			if (mainThreadAgentDefinition) {
				logEvent("tengu_agent_flag", {
					agentType: isBuiltInAgent(mainThreadAgentDefinition)
						? (mainThreadAgentDefinition.agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
						: ("custom" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS),
					...(agentCli && {
						source: "cli" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
					}),
				});
			}

			// 将代理设置持久化到会话记录中，以便恢复视图显示和还原
			if (mainThreadAgentDefinition?.agentType) {
				saveAgentSetting(mainThreadAgentDefinition.agentType);
			}

			// 为非交互式会话应用代理的系统提示（交互模式使用 bui
			// ldEffectiveSystemPrompt 代替）
			if (
				isNonInteractiveSession &&
				mainThreadAgentDefinition &&
				!systemPrompt &&
				!isBuiltInAgent(mainThreadAgentDefinition)
			) {
				const agentSystemPrompt =
					mainThreadAgentDefinition.getSystemPrompt();
				if (agentSystemPrompt) {
					systemPrompt = agentSystemPrompt;
				}
			}

			// initialPrompt 优先处理，以便其斜杠命令（如果有）被处理；用户提供的文
			// 本成为尾部上下文。仅当 inputPrompt 是字
			// 符串时才进行拼接。当它是 AsyncIterable（SDK 流式 J
			// SON 模式）时，模板插值会调用 .toString() 产生 "[object
			// Object]"。AsyncIterable 情况在 print.ts 中通过
			// structuredIO.prependUserMessage() 处理。
			if (mainThreadAgentDefinition?.initialPrompt) {
				if (typeof inputPrompt === "string") {
					inputPrompt = inputPrompt
						? `${mainThreadAgentDefinition.initialPrompt}\n\n${inputPrompt}`
						: mainThreadAgentDefinition.initialPrompt;
				} else if (!inputPrompt) {
					inputPrompt = mainThreadAgentDefinition.initialPrompt;
				}
			}

			// 尽早计算有效模型，以便钩子可以与 MCP 并行运
			// 行。如果用户未指定模型但代理有模型，则使用代理的模型
			let effectiveModel = userSpecifiedModel;
			if (
				!effectiveModel &&
				mainThreadAgentDefinition?.model &&
				mainThreadAgentDefinition.model !== "inherit"
			) {
				effectiveModel = parseUserSpecifiedModel(
					mainThreadAgentDefinition.model,
				);
			}

			setMainLoopModelOverride(effectiveModel);

			// 为钩子计算已解析的模型（使用启动时用户指定的模型）
			setInitialMainLoopModel(getUserSpecifiedModelSetting() || null);
			const initialMainLoopModel = getInitialMainLoopModel();
			const resolvedInitialModel = parseUserSpecifiedModel(
				initialMainLoopModel ?? getDefaultMainLoopModel(),
			);

			let advisorModel: string | undefined;
			if (isAdvisorEnabled()) {
				const advisorOption = canUserConfigureAdvisor()
					? (options as { advisor?: string }).advisor
					: undefined;
				if (advisorOption) {
					logForDebugging(`[AdvisorTool] --advisor ${advisorOption}`);
					if (!modelSupportsAdvisor(resolvedInitialModel)) {
						process.stderr.write(
							chalk.red(
								`错误：模型 "${resolvedInitialModel}" 不支持顾问工具。
`,
							),
						);
						process.exit(1);
					}
					const normalizedAdvisorModel = normalizeModelStringForAPI(
						parseUserSpecifiedModel(advisorOption),
					);
					if (!isValidAdvisorModel(normalizedAdvisorModel)) {
						process.stderr.write(
							chalk.red(
								`错误：模型 "${advisorOption}" 不能用作顾问。
`,
							),
						);
						process.exit(1);
					}
				}
				advisorModel = canUserConfigureAdvisor()
					? (advisorOption ?? getInitialAdvisorSetting())
					: advisorOption;
				if (advisorModel) {
					logForDebugging(
						`[AdvisorTool] 顾问模型：${advisorModel}`,
					);
				}
			}

			// 对于带有 --agent-type 的 tmux 队友，追加自定义代理的提示
			if (
				isAgentSwarmsEnabled() &&
				storedTeammateOpts?.agentId &&
				storedTeammateOpts?.agentName &&
				storedTeammateOpts?.teamName &&
				storedTeammateOpts?.agentType
			) {
				// 查找自定义代理定义
				const customAgent = agentDefinitions.activeAgents.find(
					(a) => a.agentType === storedTeammateOpts.agentType,
				);
				if (customAgent) {
					// 获取提示 — 需要同时处理内置代理和自定义代理
					let customPrompt: string | undefined;
					if (customAgent.source === "built-in") {
						// 内置代理具有接受 toolUseContext 的 getSystemProm
						// pt。我们在此无法访问完整的 toolUseContext，因此暂时跳过
						logForDebugging(
							`[teammate] 内置代理 ${storedTeammateOpts.agentType} - 跳过自定义提示（不支持）`,
						);
					} else {
						// 自定义代理具有不接受参数的 getSystemPrompt
						customPrompt = customAgent.getSystemPrompt();
					}

					// 为 tmux 队友记录代理内存加载事件
					if (customAgent.memory) {
						logEvent("tengu_agent_memory_loaded", {
							...(process.env.USER_TYPE === "ant" && {
								agent_type:
									customAgent.agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
							}),
							scope: customAgent.memory as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
							source: "teammate" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
						});
					}

					if (customPrompt) {
						const customInstructions = `\n# 自定义代理指令\n${customPrompt}`;
						appendSystemPrompt = appendSystemPrompt
							? `${appendSystemPrompt}\n\n${customInstructions}`
							: customInstructions;
					}
				} else {
					logForDebugging(
						`[teammate] 在可用代理中未找到自定义代理 ${storedTeammateOpts.agentType}`,
					);
				}
			}

			maybeActivateBrief(options);
			// defaultView: 'chat' 是一个持久化的选择加入 — 检查授权
			// 并设置 userMsgOptIn，以便工具 + 提示部分激活。仅限交互模式：
			// defaultView 是一个显示偏好；SDK 会话没有显示，并且助手安装程序
			// 将 defaultView:'chat' 写入 settings.local.j
			// son，否则会泄露到同一目录下的 --print 会话中。在 maybeAct
			// ivateBrief() 之后立即运行，以便所有启动选择加入路径在下面任何 i
			// sBriefEnabled() 读取之前触发（主动提示的 bri
			// efVisibility）。在 GB 紧急停止开关之后，持久化的 'ch
			// at' 会失效（授权失败）。
			if (
				(feature("KAIROS") || feature("KAIROS_BRIEF")) &&
				!getIsNonInteractiveSession() &&
				!getUserMsgOptIn() &&
				getInitialSettings().defaultView === "chat"
			) {
				/* eslint-disable @typescript-eslint/no-require-imports */
				const { isBriefEntitled } =
					require("@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js") as typeof import("@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js");
				/* eslint-enable @typescript-eslint/no-require-imports */
				if (isBriefEntitled()) {
					setUserMsgOptIn(true);
				}
			}
			// 协调器模式有自己的系统提示并过滤掉 Slee
			// p，因此通用的主动提示会告诉它调用一个它无
			// 法访问的工具，并与委派指令冲突。
			if (
				(feature("PROACTIVE") || feature("KAIROS")) &&
				((options as { proactive?: boolean }).proactive ||
					isEnvTruthy(process.env.CLAUDE_CODE_PROACTIVE)) &&
				!coordinatorModeModule?.isCoordinatorMode()
			) {
				/* eslint-disable @typescript-eslint/no-require-imports */
				const briefVisibility =
					feature("KAIROS") || feature("KAIROS_BRIEF")
						? (
								require("@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js") as typeof import("@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js")
							).isBriefEnabled()
							? "在检查点调用 SendUserMessage 以标记当前状态。"
							: "用户将看到你输出的任何文本。"
						: "用户将看到你输出的任何文本。";
				/* eslint-enable @typescript-eslint/no-require-imports */
				const proactivePrompt = `\n# 主动模式\n\n你正处于主动模式。请主动采取行动——探索、执行并取得进展，无需等待指令。\n\n首先简要问候用户。\n\n你将定期收到 <tick> 提示。这些是进度检查点。执行你认为最有用的操作，如果无事可做，则调用 Sleep。${briefVisibility}`;
				appendSystemPrompt = appendSystemPrompt
					? `${appendSystemPrompt}\n\n${proactivePrompt}`
					: proactivePrompt;
			}

			if (feature("KAIROS") && kairosEnabled && assistantModule) {
				const assistantAddendum =
					assistantModule.getAssistantSystemPromptAddendum();
				appendSystemPrompt = appendSystemPrompt
					? `${appendSystemPrompt}\n\n${assistantAddendum}`
					: assistantAddendum;
			}

			// Ink 根节点仅交互式会话需要——Ink 构造函数中的 pa
			// tchConsole 会在无头模式下吞掉控制台输出。
			let root!: Root;
			let getFpsMetrics!: () => FpsMetrics | undefined;
			let stats!: StatsStore;

			// 命令加载后显示设置界面
			if (!isNonInteractiveSession) {
				const ctx = getRenderContext(false);
				getFpsMetrics = ctx.getFpsMetrics;
				stats = ctx.stats;
				// 在 Ink 挂载前安装 asciicast 录制器（仅限 ant，通过 CLAUDE_CODE_TERMINAL_RECORDING=1 选择启用）
				if (process.env.USER_TYPE === "ant") {
					installAsciicastRecorder();
				}

				const { createRoot } = await import('@anthropic/ink')
				root = await createRoot(ctx.renderOptions)

				// 现在记录启动时间，在任何阻塞性对话框渲染之前。从 REP
				// L 首次渲染（旧位置）记录的时间包含了用户停留在信任/O
				// Auth/引导/恢复选择器上的时长——p99 约 70 秒
				// 主要由对话框等待时间主导，而非代码路径启动时间。
				logEvent("tengu_timer", {
					event: "startup" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
					durationMs: Math.round(process.uptime() * 1000),
				});

				logForDebugging("[启动] 正在运行 showSetupScreens()...");
				const setupScreensStart = Date.now();
				const onboardingShown = await showSetupScreens(
					root,
					permissionMode,
					allowDangerouslySkipPermissions,
					commands,
					enableClaudeInChrome,
					devChannels,
				);
				logForDebugging(
					`[启动] showSetupScreens() 在 ${Date.now() - setupScreensStart}ms 内完成`,
				);

				// 现在信任已建立且 GrowthBook 拥有认证头，解析 --
				// remote-control / --rc 权限门控。
				if (
					feature("BRIDGE_MODE") &&
					remoteControlOption !== undefined
				) {
					const { getBridgeDisabledReason } =
						await import("./bridge/bridgeEnabled.js");
					const disabledReason = await getBridgeDisabledReason();
					remoteControl = disabledReason === null;
					if (disabledReason) {
						process.stderr.write(
							chalk.yellow(
								`${disabledReason}\n--rc 标志被忽略。\n`,
							),
						);
					}
				}

				// 检查待处理的智能体内存快照更新（仅适用于 --agent 模式，仅限 ant）
				if (
					feature("AGENT_MEMORY_SNAPSHOT") &&
					mainThreadAgentDefinition &&
					isCustomAgent(mainThreadAgentDefinition) &&
					mainThreadAgentDefinition.memory &&
					mainThreadAgentDefinition.pendingSnapshotUpdate
				) {
					const agentDef = mainThreadAgentDefinition;
					const choice = await launchSnapshotUpdateDialog(root, {
						agentType: agentDef.agentType,
						scope: agentDef.memory!,
						snapshotTimestamp:
							agentDef.pendingSnapshotUpdate!.snapshotTimestamp,
					});
					if (choice === "merge") {
						const { buildMergePrompt } =
							await import("./components/agents/SnapshotUpdateDialog.js");
						const mergePrompt = buildMergePrompt(
							agentDef.agentType,
							agentDef.memory!,
						);
						inputPrompt = inputPrompt
							? `${mergePrompt}\n\n${inputPrompt}`
							: mergePrompt;
					}
					agentDef.pendingSnapshotUpdate = undefined;
				}

				// 如果我们刚刚完成其引导流程，则跳过执行 /login
				if (
					onboardingShown &&
					prompt?.trim().toLowerCase() === "/login"
				) {
					prompt = "";
				}

				if (onboardingShown) {
					// 刷新依赖认证的服务，因为用户已在引导过程中登录。与 src/comm
					// ands/login.tsx 中的登录后逻辑保持同步
					void refreshRemoteManagedSettings();
					void refreshPolicyLimits();
					// 在刷新 GrowthBook 之前清除用户数据缓存，以便其获取新的凭据
					resetUserCache();
					// 登录后刷新 GrowthBook 以获取更新的功能标志（例如，用于 claude.ai MCPs）
					refreshGrowthBookAfterAuthChange();
					// 清除任何过期的受信任设备令牌，然后注册远程控制。两者内部都基于 tengu_sessio
					// ns_elevated_auth_enforcement 进行自门控——enrollTr
					// ustedDevice() 通过 checkGate_CACHED_OR_BLOC
					// KING（等待上述 GrowthBook 重新初始化），clearTrusted
					// DeviceToken() 通过同步缓存检查（可接受，因为清除是幂等的）。
					void import("./bridge/trustedDevice.js").then((m) => {
						m.clearTrustedDeviceToken();
						return m.enrollTrustedDevice();
					});
				}

				// 验证活动令牌的组织是否与 forceLoginOrgUUI
				// D 匹配（如果在托管设置中设置）。在引导后运行，以便托管
				// 设置和登录状态完全加载。
				const orgValidation = await validateForceLoginOrg();
				if (!orgValidation.valid) {
					await exitWithError(root, (orgValidation as { valid: false; message: string }).message);
				}
			}

			// 如果已启动优雅关闭（例如，用户拒绝了信任对话框），pro
			// cess.exitCode 将被设置。跳过所有可能在进程退
			// 出前触发代码执行的后续操作（例如，如果信任未建立，我们不希望 ap
			// iKeyHelper 运行）。
			if (process.exitCode !== undefined) {
				logForDebugging(
					"已启动优雅关闭，跳过进一步的初始化",
				);
				return;
			}

			// 在信任建立后（或在信任隐式成立的非交互模式下）初始化 LSP
			// 管理器。这可以防止插件 LSP 服务器在用户同意前在不受信
			// 任的目录中执行代码。必须在内联插件设置之
			// 后（如果有的话），以便包含 --plugin-dir LSP 服务器。
			initializeLspServerManager();

			// 信任建立后显示设置验证错误 MCP
			// 配置错误不会阻止设置加载，因此排除它们
			if (!isNonInteractiveSession) {
				const { errors } = getSettingsWithErrors();
				const nonMcpErrors = errors.filter((e) => !e.mcpErrorMetadata);
				if (nonMcpErrors.length > 0) {
					await launchInvalidSettingsDialog(root, {
						settingsErrors: nonMcpErrors,
						onExit: () => gracefulShutdownSync(1),
					});
				}
			}

			// 信任建立后检查配额状态、快速模式、通行证资格和引导数据。这些操作会
			// 调用 API，可能触发 apiKeyHelper 执行。--bar
			// e / SIMPLE：
			// 跳过——这些是为 REPL 首轮响应性进行的缓存预热（配额
			// 、通行证、快速模式、引导数据）。快速模式无论如何不适用于 Agent
			// SDK（参见 getFastModeUnavailableReason）。
			const bgRefreshThrottleMs = getFeatureValue_CACHED_MAY_BE_STALE(
				"tengu_cicada_nap_ms",
				0,
			);
			const lastPrefetched = getGlobalConfig().startupPrefetchedAt ?? 0;
			const skipStartupPrefetches =
				isBareMode() ||
				(bgRefreshThrottleMs > 0 &&
					Date.now() - lastPrefetched < bgRefreshThrottleMs);

			if (!skipStartupPrefetches) {
				const lastPrefetchedInfo =
					lastPrefetched > 0
						? ` 上次运行于 ${Math.round((Date.now() - lastPrefetched) / 1000)} 秒前`
						: "";
				logForDebugging(
					`启动后台启动预取${lastPrefetchedInfo}`,
				);

				checkQuotaStatus().catch((error) => logError(error));

				// 从服务器获取引导数据并更新所有缓存值。
				void fetchBootstrapData();

				// TODO：将其他预取整合到单个引导请求中。
				void prefetchPassesEligibility();
				if (
					!getFeatureValue_CACHED_MAY_BE_STALE(
						"tengu_miraculo_the_bard",
						false,
					)
				) {
					void prefetchFastModeStatus();
				} else {
					// 熔断机制跳过网络调用，而非组织策略强制执行。从缓存解析，以便 org
					// Status 不会保持 'pending'（getFastMode
					// UnavailableReason 将其视为允许状态）。
					resolveFastModeStatusFromCache();
				}
				if (bgRefreshThrottleMs > 0) {
					saveGlobalConfig((current) => ({
						...current,
						startupPrefetchedAt: Date.now(),
					}));
				}
			} else {
				logForDebugging(
					`跳过启动预取，上次运行于 ${Math.round((Date.now() - lastPrefetched) / 1000)} 秒前`,
				);
				// 从缓存解析快速模式组织状态（无需网络）
				resolveFastModeStatusFromCache();
			}

			if (!isNonInteractiveSession) {
				void refreshExampleCommands(); // 预取示例命令（运行 git log，不调用 API）
			}

			// 解析 MCP 配置（提前启动，与设置/信任对话框工作重叠）
			const { servers: existingMcpConfigs } = await mcpConfigPromise;
			logForDebugging(
				`[启动] MCP 配置已在 ${mcpConfigResolvedMs}ms 内解析完成（在 +${Date.now() - mcpConfigStart}ms 处等待）`,
			);
			// CLI 标志（--mcp-config）应覆盖基于文件的配置，以匹配设置优先级
			const allMcpConfigs = {
				...existingMcpConfigs,
				...dynamicMcpConfig,
			};

			// 将 SDK 配置与常规 MCP 配置分开
			const sdkMcpConfigs: Record<string, McpSdkServerConfig> = {};
			const regularMcpConfigs: Record<string, ScopedMcpServerConfig> = {};

			for (const [name, config] of Object.entries(allMcpConfigs)) {
				const typedConfig = config as
					| ScopedMcpServerConfig
					| McpSdkServerConfig;
				if (typedConfig.type === "sdk") {
					sdkMcpConfigs[name] = typedConfig as McpSdkServerConfig;
				} else {
					regularMcpConfigs[name] =
						typedConfig as ScopedMcpServerConfig;
				}
			}

			profileCheckpoint("action_mcp_configs_loaded");

			// 在信任对话框后预取 MCP 资源（此处执行）。仅交互模式：打印模
			// 式会延迟连接，直到 headlessStore 存在并按服务器推
			// 送（见下文），这样 ToolSearch 的待处理客户端处理才能
			// 生效，且一个慢速服务器不会阻塞批量操作。
			const localMcpPromise = isNonInteractiveSession
				? Promise.resolve({ clients: [], tools: [], commands: [] })
				: prefetchAllMcpResources(regularMcpConfigs);
			const claudeaiMcpPromise = isNonInteractiveSession
				? Promise.resolve({ clients: [], tools: [], commands: [] })
				: claudeaiConfigPromise.then((configs) =>
						Object.keys(configs).length > 0
							? prefetchAllMcpResources(configs)
							: { clients: [], tools: [], commands: [] },
					);
			// 按名称去重合并：每个 prefetchAllMcpResources 调用都会通过本地
			// 去重标志独立添加辅助工具（ListMcpResourcesTool, Rea
			// dMcpResourceTool），因此合并两次调用可能产生重复项。print.t
			// s 已对最终工具池进行 uniqBy 去重，但在此处去重可保持 appState 整洁。
			const mcpPromise = Promise.all([
				localMcpPromise,
				claudeaiMcpPromise,
			]).then(([local, claudeai]) => ({
				clients: [...local.clients, ...claudeai.clients],
				tools: uniqBy([...local.tools, ...claudeai.tools], "name"),
				commands: uniqBy(
					[...local.commands, ...claudeai.commands],
					"name",
				),
			}));

			// 提前启动钩子，使其与 MCP 连接并行运行。对 initOnly/ini
			// t/maintenance（单独处理）、非交互模式（通过 setupTrigger
			// 处理）以及 resume/continue（conversationRecove
			// ry.ts 触发 'resume' 替代——若无此防护，钩子会在 /resume
			// 时触发两次，第二条系统消息会覆盖第一条。gh-30825）跳过。
			const hooksPromise =
				initOnly ||
				init ||
				maintenance ||
				isNonInteractiveSession ||
				options.continue ||
				options.resume
					? null
					: processSessionStartHooks("startup", {
							agentType: mainThreadAgentDefinition?.agentType,
							model: resolvedInitialModel,
						});

			// MCP 从不阻塞 REPL 渲染或第 1 轮 TTFT。useManageM
			// CPConnections 在服务器连接时异步填充 appState.mcp
			// （connectToServer 已记忆化——上述预取调用和钩子会汇聚到相同的
			// 连接）。getToolUseContext 通过 computeTool
			// s() 从 store.getState() 读取最新状态，因此第 1 轮
			// 会看到查询时已连接的内容。慢速服务器会在第 2+ 轮填充。与交互无提示行
			// 为一致。打印模式：按服务器推送到 headlessStore（见下文）。
			const hookMessages: Awaited<NonNullable<typeof hooksPromise>> = [];
			// 抑制瞬时的 unhandledRejection——预取会预热已记
			// 忆化的 connectToServer 缓存，但在交互模式下无人等待它。
			mcpPromise.catch(() => {});

			const mcpClients: Awaited<typeof mcpPromise>["clients"] = [];
			const mcpTools: Awaited<typeof mcpPromise>["tools"] = [];
			const mcpCommands: Awaited<typeof mcpPromise>["commands"] = [];

			let thinkingEnabled = shouldEnableThinkingByDefault();
			let thinkingConfig: ThinkingConfig =
				thinkingEnabled !== false
					? { type: "adaptive" }
					: { type: "disabled" };

			if (
				options.thinking === "adaptive" ||
				options.thinking === "enabled"
			) {
				thinkingEnabled = true;
				thinkingConfig = { type: "adaptive" };
			} else if (options.thinking === "disabled") {
				thinkingEnabled = false;
				thinkingConfig = { type: "disabled" };
			} else {
				const maxThinkingTokens = process.env.MAX_THINKING_TOKENS
					? parseInt(process.env.MAX_THINKING_TOKENS, 10)
					: options.maxThinkingTokens;
				if (maxThinkingTokens !== undefined) {
					if (maxThinkingTokens > 0) {
						thinkingEnabled = true;
						thinkingConfig = {
							type: "enabled",
							budgetTokens: maxThinkingTokens,
						};
					} else if (maxThinkingTokens === 0) {
						thinkingEnabled = false;
						thinkingConfig = { type: "disabled" };
					}
				}
			}

			logForDiagnosticsNoPII("info", "started", {
				version: MACRO.VERSION,
				is_native_binary: isInBundledMode(),
			});

			registerCleanup(async () => {
				logForDiagnosticsNoPII("info", "exited");
			});

			void logTenguInit({
				hasInitialPrompt: Boolean(prompt),
				hasStdin: Boolean(inputPrompt),
				verbose,
				debug,
				debugToStderr,
				print: print ?? false,
				outputFormat: outputFormat ?? "text",
				inputFormat: inputFormat ?? "text",
				numAllowedTools: allowedTools.length,
				numDisallowedTools: disallowedTools.length,
				mcpClientCount: Object.keys(allMcpConfigs).length,
				worktreeEnabled,
				skipWebFetchPreflight:
					getInitialSettings().skipWebFetchPreflight,
				githubActionInputs: process.env.GITHUB_ACTION_INPUTS,
				dangerouslySkipPermissionsPassed:
					dangerouslySkipPermissions ?? false,
				permissionMode,
				modeIsBypass: permissionMode === "bypassPermissions",
				allowDangerouslySkipPermissionsPassed:
					allowDangerouslySkipPermissions,
				systemPromptFlag: systemPrompt
					? options.systemPromptFile
						? "file"
						: "flag"
					: undefined,
				appendSystemPromptFlag: appendSystemPrompt
					? options.appendSystemPromptFile
						? "file"
						: "flag"
					: undefined,
				thinkingConfig,
				assistantActivationPath:
					feature("KAIROS") && kairosEnabled
						? assistantModule?.getAssistantActivationPath()
						: undefined,
			});

			// 在初始化时记录一次上下文指标
			void logContextMetrics(regularMcpConfigs, toolPermissionContext);

			void logPermissionContextForAnts(null, "initialization");

			logManagedSettings();

			// 为并发会话检测注册 PID 文件（~/.claude/session
			// s/）并触发多实例遥测。放在此处（而非 init.ts）以便仅 RE
			// PL 路径注册——而非像 `claude doctor` 这样的
			// 子命令。链式：计数必须在注册写入完成后运行，否则会漏掉我们自己的文件。
			void registerSession().then((registered) => {
				if (!registered) return;
				if (sessionNameArg) {
					void updateSessionName(sessionNameArg);
				}
				void countConcurrentSessions().then((count) => {
					if (count >= 2) {
						logEvent("tengu_concurrent_sessions", {
							num_sessions: count,
						});
					}
				});
			});

			// 初始化版本化插件系统（必要时触发 V1→V2 迁移）
			// 。然后运行孤儿清理，接着预热 Grep/Glob 排除缓
			// 存。顺序很重要：预热会扫描磁盘查找 .orphaned
			// _at 标记，因此它必须看到 GC 的步骤 1（从重
			// 新安装的版本中移除标记）和步骤 2（标记未标记的孤儿）
			// 已应用。预热还需在自动更新（在 REPL 中首次提交时
			// 触发）可能在我们之下将此会话的活动版本变为孤
			// 儿之前完成。--bare / SIMPLE：跳过插件版
			// 本同步和孤儿清理。这些是安装/升级的簿记工作，脚本调
			// 用不需要——下一个交互会话会进行协调。此处的 awa
			// it 曾因市场往返而阻塞 -p。
			if (isBareMode()) {
				// 跳过——无操作
			} else if (isNonInteractiveSession) {
				// 在无头模式下，等待以确保插件同步在 CLI 退出前完成
				await initializeVersionedPlugins();
				profileCheckpoint("action_after_plugins_init");
				void cleanupOrphanedPluginVersionsInBackground().then(() =>
					getGlobExclusionsForPluginCache(),
				);
			} else {
				// 在交互模式下，触发后不管——这纯粹是簿
				// 记工作，不影响当前会话的运行时行为
				void initializeVersionedPlugins().then(async () => {
					profileCheckpoint("action_after_plugins_init");
					await cleanupOrphanedPluginVersionsInBackground();
					void getGlobExclusionsForPluginCache();
				});
			}

			const setupTrigger =
				initOnly || init ? "init" : maintenance ? "maintenance" : null;
			if (initOnly) {
				applyConfigEnvironmentVariables();
				await processSetupHooks("init", { forceSyncExecution: true });
				await processSessionStartHooks("startup", {
					forceSyncExecution: true,
				});
				gracefulShutdownSync(0);
				return;
			}

			// --打印模式
			if (isNonInteractiveSession) {
				if (outputFormat === "stream-json" || outputFormat === "json") {
					setHasFormattedOutput(true);
				}

				// 在打印模式下应用完整的环境变量，因为信任对话框
				// 被绕过。这包括来自不可信源的潜在危险环境变量，但
				// 打印模式被视为可信的（如帮助文本所述）。
				applyConfigEnvironmentVariables();

				// 在环境变量应用后初始化遥测，以便 OTEL 端点环境变量和 ot
				// elHeadersHelper（需要信任才能执行）可用。
				initializeTelemetryAfterTrust();

				// 现在启动 SessionStart 钩子，以便子进程生成与 MCP 连
				// 接、插件初始化及下方的 print.ts 导入重叠。loadInitialM
				// essages 在 print.ts:4397 处加入。防护与 loa
				// dInitialMessages 相同——continue/resume/
				// teleport 路径不触发启动钩子（或在 resume 分支内有
				// 条件触发，其中此 promise 未定义，?? 回退运行）。当 setu
				// pTrigger 设置时也跳过——这些路径先运行设置钩子（print.t
				// s:544），而会话启动钩子必须等待设置完成。
				const sessionStartHooksPromise =
					options.continue ||
					options.resume ||
					teleport ||
					setupTrigger
						? undefined
						: processSessionStartHooks("startup");
				// 如果此操作在 loadInitialMessages 等待之
				// 前拒绝，则抑制瞬时的 unhandledRejection。下游的
				// await 仍会观察到拒绝——这只是防止虚假的全局处理程序触发。
				sessionStartHooksPromise?.catch(() => {});

				profileCheckpoint("before_validateForceLoginOrg");
				// 验证非交互会话的组织限制
				const orgValidation = await validateForceLoginOrg();
				if (!orgValidation.valid) {
					process.stderr.write((orgValidation as { valid: false; message: string }).message + "\n");
					process.exit(1);
				}

				// 无头模式支持所有提示命令和一些本地命令。如果 disableSla
				// shCommands 为 true，则返回空数组。
				const commandsHeadless = disableSlashCommands
					? []
					: commands.filter(
							(command) =>
								(command.type === "prompt" &&
									!command.disableNonInteractive) ||
								(command.type === "local" &&
									command.supportsNonInteractive),
						);

				const defaultState = getDefaultAppState();
				const headlessInitialState: AppState = {
					...defaultState,
					mcp: {
						...defaultState.mcp,
						clients: mcpClients,
						commands: mcpCommands,
						tools: mcpTools,
					},
					toolPermissionContext,
					effortValue:
						parseEffortValue(options.effort) ??
						getInitialEffortSetting(),
					...(isFastModeEnabled() && {
						fastMode: getInitialFastModeSetting(
							effectiveModel ?? null,
						),
					}),
					...(isAdvisorEnabled() && advisorModel && { advisorModel }),
					// kairosEnabled 控制 executeForkedSl
					// ashCommand（processSlashCommand.tsx:
					// 132）和 AgentTool 的 shouldRunAsync 中的异步
					// 触发后不管路径。REPL initialState 在约 3459 行设置
					// 此值；无头模式默认 false，因此守护进程子进程的预定任务和 Age
					// nt 工具调用同步运行——生成时 N 个逾期 cron 任务 = N 个串
					// 行子代理轮次阻塞用户输入。在 :1620 行计算，远早于此分支。
					...(feature("KAIROS") ? { kairosEnabled } : {}),
				};

				// 初始化应用状态
				const headlessStore = createStore(
					headlessInitialState,
					onChangeAppState,
				);

				// Async check of auto mode gate — corrects state and disables auto if needed.
				if (feature("TRANSCRIPT_CLASSIFIER")) {
					void verifyAutoModeGateAccess(
						toolPermissionContext,
						headlessStore.getState().fastMode,
					).then(({ updateContext }) => {
						headlessStore.setState((prev) => {
							const nextCtx = updateContext(
								prev.toolPermissionContext,
							);
							if (nextCtx === prev.toolPermissionContext)
								return prev;
							return { ...prev, toolPermissionContext: nextCtx };
						});
					});
				}

				// 为会话持久化设置全局状态
				if (options.sessionPersistence === false) {
					setSessionPersistenceDisabled(true);
				}

				// 在全局状态中存储 SDK 测试版以进行上下文窗口计
				// 算。仅存储允许的测试版（通过允许列表和订阅者状态过滤）
				setSdkBetas(filterAllowedSdkBetas(betas));

				// 打印模式 MCP：按服务器增量推送到 headlessStore。镜像 us
				// eManageMCPConnections——先推送待处理项（以便 ToolSea
				// rch 在 ToolSearchTool.ts:334 的待处理检查能看到它们），
				// 然后随着每个服务器就绪，替换为已连接/失败状态。
				const connectMcpBatch = (
					configs: Record<string, ScopedMcpServerConfig>,
					label: string,
				): Promise<void> => {
					if (Object.keys(configs).length === 0)
						return Promise.resolve();
					headlessStore.setState((prev) => ({
						...prev,
						mcp: {
							...prev.mcp,
							clients: [
								...prev.mcp.clients,
								...Object.entries(configs).map(
									([name, config]) => ({
										name,
										type: "pending" as const,
										config,
									}),
								),
							],
						},
					}));
					return getMcpToolsCommandsAndResources(
						({ client, tools, commands }) => {
							headlessStore.setState((prev) => ({
								...prev,
								mcp: {
									...prev.mcp,
									clients: prev.mcp.clients.some(
										(c) => c.name === client.name,
									)
										? prev.mcp.clients.map((c) =>
												c.name === client.name
													? client
													: c,
											)
										: [...prev.mcp.clients, client],
									tools: uniqBy(
										[...prev.mcp.tools, ...tools],
										"name",
									),
									commands: uniqBy(
										[...prev.mcp.commands, ...commands],
										"name",
									),
								},
							}));
						},
						configs,
					).catch((err) =>
						logForDebugging(`[MCP] ${label} 连接错误：${err}`),
					);
				};
				// 等待所有 MCP 配置 — 打印模式通常是单轮对话，因此“下一轮可
				// 见的延迟连接服务器”并无帮助。SDK 初始化消息和第一轮的工具列表都需要
				// 已配置的 MCP 工具就位。零服务器的情况通过 connectMcpBat
				// ch 中的提前返回来处理。连接器在 getMcpToolsCommand
				// sAndResources 内部并行化（使用 Promise.all
				// 进行 processBatched）。claude.ai 也会被等待
				// — 其获取操作已提前启动（约第 2558 行），因此这里只阻塞剩余时间。-
				// -bare 模式会完全跳过 claude.ai，适用于对性能敏感的脚本。
				profileCheckpoint("before_connectMcp");
				await connectMcpBatch(regularMcpConfigs, "regular");
				profileCheckpoint("after_connectMcp");
				// 去重：抑制与 claude.ai 连接器重复的插件 MCP 服务器
				// （连接器优先），然后连接 claude.ai 服务器。有限等待
				// — #23725 将此设为阻塞操作，以便单轮 -p 模式能看到连接器
				// ，但随着 40+ 个慢速连接器，tengu_startup_perf
				// 的 p99 时间攀升至 76 秒。如果获取+连接未及时完成，则继续执
				// 行；Promise 会在后台继续运行并更新 headlessS
				// tore，因此第 2 轮及之后仍能看到连接器。
				const CLAUDE_AI_MCP_TIMEOUT_MS = 5_000;
				const claudeaiConnect = claudeaiConfigPromise.then(
					(claudeaiConfigs) => {
						if (Object.keys(claudeaiConfigs).length > 0) {
							const claudeaiSigs = new Set<string>();
							for (const config of Object.values(
								claudeaiConfigs,
							)) {
								const sig = getMcpServerSignature(config);
								if (sig) claudeaiSigs.add(sig);
							}
							const suppressed = new Set<string>();
							for (const [name, config] of Object.entries(
								regularMcpConfigs,
							)) {
								if (!name.startsWith("plugin:")) continue;
								const sig = getMcpServerSignature(config);
								if (sig && claudeaiSigs.has(sig))
									suppressed.add(name);
							}
							if (suppressed.size > 0) {
								logForDebugging(
									`[MCP] 延迟去重：正在抑制 ${suppressed.size} 个与 claude.ai 连接器重复的插件服务器：${[...suppressed].join(", ")}`,
								);
								// 在从状态中过滤之前断开连接。只有已连接的服务器需要清理 — 对
								// 从未连接过的服务器调用 clearServerCache 会触发一次
								// 真正的连接，仅仅是为了终止它（记忆化缓存未命中路径，参见 us
								// eManageMCPConnections.ts:870）。
								for (const c of headlessStore.getState().mcp
									.clients) {
									if (
										!suppressed.has(c.name) ||
										c.type !== "connected"
									)
										continue;
									c.client.onclose = undefined;
									void clearServerCache(
										c.name,
										c.config,
									).catch(() => {});
								}
								headlessStore.setState((prev) => {
									let {
										clients,
										tools,
										commands,
										resources,
									} = prev.mcp;
									clients = clients.filter(
										(c) => !suppressed.has(c.name),
									);
									tools = tools.filter(
										(t) =>
											!t.mcpInfo ||
											!suppressed.has(
												t.mcpInfo.serverName,
											),
									);
									for (const name of suppressed) {
										commands = excludeCommandsByServer(
											commands,
											name,
										);
										resources = excludeResourcesByServer(
											resources,
											name,
										);
									}
									return {
										...prev,
										mcp: {
											...prev.mcp,
											clients,
											tools,
											commands,
											resources,
										},
									};
								});
							}
						}
						// 抑制与已启用手动服务器重复的 claude.ai 连接
						// 器（URL 签名匹配）。上述插件去重仅处理 `plugin:
						// *` 键；此步骤捕获手动的 `.mcp.json` 条目。plu
						// gin:* 必须在此处排除 — 步骤 1 已经抑制了那些（
						// claude.ai 获胜）；将它们留在这里也会抑制连接
						// 器，导致两者都无法保留（gh-39974）。
						const nonPluginConfigs = pickBy(
							regularMcpConfigs,
							(_, n) => !n.startsWith("plugin:"),
						);
						const { servers: dedupedClaudeAi } =
							dedupClaudeAiMcpServers(
								claudeaiConfigs,
								nonPluginConfigs,
							);
						return connectMcpBatch(dedupedClaudeAi, "claudeai");
					},
				);
				let claudeaiTimer: ReturnType<typeof setTimeout> | undefined;
				const claudeaiTimedOut = await Promise.race([
					claudeaiConnect.then(() => false),
					new Promise<boolean>((resolve) => {
						claudeaiTimer = setTimeout(
							(r) => r(true),
							CLAUDE_AI_MCP_TIMEOUT_MS,
							resolve,
						);
					}),
				]);
				if (claudeaiTimer) clearTimeout(claudeaiTimer);
				if (claudeaiTimedOut) {
					logForDebugging(
						`[MCP] claude.ai 连接器在 ${CLAUDE_AI_MCP_TIMEOUT_MS} 毫秒后仍未就绪 — 继续执行；后台连接继续进行`,
					);
				}
				profileCheckpoint("after_connectMcp_claudeai");

				// 在 headless 模式下，立即启动延迟预取（无用户输入延迟）--bare / SIMPLE：s
				// tartDeferredPrefetches 在内部提前返回。background
				// Housekeeping（initExtractMemories、pruneShe
				// llSnapshots、cleanupOldMessageFiles）和 sdkH
				// eapDumpMonitor 都是脚本调用不需要的簿记工作 — 下一次交互式会话会进行协调。
				if (!isBareMode()) {
					startDeferredPrefetches();
					void import("./utils/backgroundHousekeeping.js").then((m) =>
						m.startBackgroundHousekeeping(),//初始化自动记忆AutoMemory和记忆整合AutoDream功能
					);
					if (process.env.USER_TYPE === "ant") {
						void import("./utils/sdkHeapDumpMonitor.js").then((m) =>
							m.startSdkMemoryMonitor(),
						);
					}
				}

				logSessionTelemetry();
				profileCheckpoint("before_print_import");
				const { runHeadless } = await import("src/cli/print.js");
				profileCheckpoint("after_print_import");
				void runHeadless(
					inputPrompt,
					() => headlessStore.getState(),
					headlessStore.setState,
					commandsHeadless,
					tools,
					sdkMcpConfigs,
					agentDefinitions.activeAgents,
					{
						continue: options.continue,
						resume: options.resume,
						verbose: verbose,
						outputFormat: outputFormat,
						jsonSchema,
						permissionPromptToolName: options.permissionPromptTool,
						allowedTools,
						thinkingConfig,
						maxTurns: options.maxTurns,
						maxBudgetUsd: options.maxBudgetUsd,
						taskBudget: options.taskBudget
							? { total: options.taskBudget }
							: undefined,
						systemPrompt,
						appendSystemPrompt,
						userSpecifiedModel: effectiveModel,
						fallbackModel: userSpecifiedFallbackModel,
						teleport,
						sdkUrl,
						replayUserMessages: effectiveReplayUserMessages,
						includePartialMessages: effectiveIncludePartialMessages,
						forkSession: options.forkSession || false,
						resumeSessionAt: options.resumeSessionAt || undefined,
						rewindFiles: options.rewindFiles,
						enableAuthStatus: options.enableAuthStatus,
						agent: agentCli,
						workload: options.workload,
						setupTrigger: setupTrigger ?? undefined,
						sessionStartHooksPromise,
					},
				);
				return;
			}

			// 启动时记录模型配置
			logEvent("tengu_startup_manual_model_config", {
				cli_flag:
					options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
				env_var: process.env
					.ANTHROPIC_MODEL as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
				settings_file: (getInitialSettings() || {})
					.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
				subscriptionType:
					getSubscriptionType() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
				agent: agentSetting as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
			});

			// 获取初始模型的弃用警告（resolvedInitialModel 之前已为钩子并行化计算）
			const deprecationWarning =
				getModelDeprecationWarning(resolvedInitialModel);

			// 构建初始通知队列
			const initialNotifications: Array<{
				key: string;
				text: string;
				color?: "warning";
				priority: "high";
			}> = [];
			if (permissionModeNotification) {
				initialNotifications.push({
					key: "permission-mode-notification",
					text: permissionModeNotification,
					priority: "high",
				});
			}
			if (deprecationWarning) {
				initialNotifications.push({
					key: "model-deprecation-warning",
					text: deprecationWarning,
					color: "warning",
					priority: "high",
				});
			}
			if (overlyBroadBashPermissions.length > 0) {
				const displayList = uniq(
					overlyBroadBashPermissions.map((p) => p.ruleDisplay),
				);
				const displays = displayList.join(", ");
				const sources = uniq(
					overlyBroadBashPermissions.map((p) => p.sourceDisplay),
				).join(", ");
				const n = displayList.length;
				initialNotifications.push({
					key: "overly-broad-bash-notification",
					text: `${displays} 允许来自 ${sources} ${plural(n, "was", "were")} 的 ${plural(n, "rule")} 被忽略 — 不适用于 Ants，请改用自动模式`,
					color: "warning",
					priority: "high",
				});
			}

			const teammateUtils = getTeammateUtils();
			const effectiveToolPermissionContext = {
				...toolPermissionContext,
				mode:
					isAgentSwarmsEnabled() &&
					teammateUtils?.isPlanModeRequired?.()
						? ("plan" as const)
						: toolPermissionContext.mode,
			};
			// 所有启动时的选择加入路径（--tools、--brief、defaultView）均
			// 已在上方触发；initialIsBriefOnly 只是读取结果状态。
			const initialIsBriefOnly =
				feature("KAIROS") || feature("KAIROS_BRIEF")
					? getUserMsgOptIn()
					: false;
			const fullRemoteControl =
				remoteControl || getRemoteControlAtStartup() || kairosEnabled;
			let ccrMirrorEnabled = false;
			if (feature("CCR_MIRROR") && !fullRemoteControl) {
				/* eslint-disable @typescript-eslint/no-require-imports */
				const { isCcrMirrorEnabled } =
					require("./bridge/bridgeEnabled.js") as typeof import("./bridge/bridgeEnabled.js");
				/* eslint-enable @typescript-eslint/no-require-imports */
				ccrMirrorEnabled = isCcrMirrorEnabled();
			}

			const initialState: AppState = {
				settings: getInitialSettings(),
				tasks: {},
				agentNameRegistry: new Map(),
				verbose: verbose ?? getGlobalConfig().verbose ?? false,
				mainLoopModel: initialMainLoopModel,
				mainLoopModelForSession: null,
				isBriefOnly: initialIsBriefOnly,
				expandedView: getGlobalConfig().showSpinnerTree
					? "teammates"
					: getGlobalConfig().showExpandedTodos
						? "tasks"
						: "none",
				showTeammateMessagePreview: isAgentSwarmsEnabled()
					? false
					: undefined,
				selectedIPAgentIndex: -1,
				coordinatorTaskIndex: -1,
				viewSelectionMode: "none",
				footerSelection: null,
				toolPermissionContext: effectiveToolPermissionContext,
				agent: mainThreadAgentDefinition?.agentType,
				agentDefinitions,
				mcp: {
					clients: [],
					tools: [],
					commands: [],
					resources: {},
					pluginReconnectKey: 0,
				},
				plugins: {
					enabled: [],
					disabled: [],
					commands: [],
					errors: [],
					installationStatus: {
						marketplaces: [],
						plugins: [],
					},
					needsRefresh: false,
				},
				statusLineText: undefined,
				kairosEnabled,
				remoteSessionUrl: undefined,
				remoteConnectionStatus: "connecting",
				remoteBackgroundTaskCount: 0,
				replBridgeEnabled: fullRemoteControl || ccrMirrorEnabled,
				replBridgeExplicit: remoteControl,
				replBridgeOutboundOnly: ccrMirrorEnabled,
				replBridgeConnected: false,
				replBridgeSessionActive: false,
				replBridgeReconnecting: false,
				replBridgeConnectUrl: undefined,
				replBridgeSessionUrl: undefined,
				replBridgeEnvironmentId: undefined,
				replBridgeSessionId: undefined,
				replBridgeError: undefined,
				replBridgeInitialName: remoteControlName,
				showRemoteCallout: false,
				notifications: {
					current: null,
					queue: initialNotifications,
				},
				elicitation: {
					queue: [],
				},
				todos: {},
				remoteAgentTaskSuggestions: [],
				fileHistory: {
					snapshots: [],
					trackedFiles: new Set(),
					snapshotSequence: 0,
				},
				attribution: createEmptyAttributionState(),
				thinkingEnabled,
				promptSuggestionEnabled: shouldEnablePromptSuggestion(),
				sessionHooks: new Map(),
				inbox: {
					messages: [],
				},
				promptSuggestion: {
					text: null,
					promptId: null,
					shownAt: 0,
					acceptedAt: 0,
					generationRequestId: null,
				},
				speculation: IDLE_SPECULATION_STATE,
				speculationSessionTimeSavedMs: 0,
				skillImprovement: {
					suggestion: null,
				},
				workerSandboxPermissions: {
					queue: [],
					selectedIndex: 0,
				},
				pendingWorkerRequest: null,
				pendingSandboxRequest: null,
				authVersion: 0,
				initialMessage: inputPrompt
					? {
							message: createUserMessage({
								content: String(inputPrompt),
							}),
						}
					: null,
				effortValue:
					parseEffortValue(options.effort) ??
					getInitialEffortSetting(),
				activeOverlays: new Set<string>(),
				fastMode: getInitialFastModeSetting(resolvedInitialModel),
				...(isAdvisorEnabled() && advisorModel && { advisorModel }),
				// 同步计算 teamContext 以避免在渲染期间使用 useEffect setState
				// 。KAIROS：assistantTeamContext 优先 — 在 KAIR
				// OS 块中更早设置，以便 Agent(name: "foo") 可以在没有 T
				// eamCreate 的情况下生成进程内队友。computeInitialTeam
				// Context() 用于 tmux 生成的队友读取其自身身份，而非助理模式领导者。
				teamContext: (feature("KAIROS")
					? (assistantTeamContext ?? computeInitialTeamContext())
					: computeInitialTeamContext()) as AppState["teamContext"],
			};

			// 将 CLI 初始提示添加到历史记录
			if (inputPrompt) {
				addToHistory(String(inputPrompt));
			}

			const initialTools = mcpTools;

			// 同步递增 numStartups — 首次渲染的读取器（如 should
			// ShowEffortCallout，通过 useState 初始化器）需要在
			// setImmediate 触发之前获取更新后的值。仅推迟遥测。
			saveGlobalConfig((current) => ({
				...current,
				numStartups: (current.numStartups ?? 0) + 1,
			}));
			setImmediate(() => {
				void logStartupTelemetry();
				logSessionTelemetry();
			});

			// 设置每轮会话环境数据上传器（仅限 ant 构建）。当在 Anthro
			// pic 拥有的仓库中工作时，默认对所有 ant 用户启用。在每轮捕获
			// git/文件系统状态（非转录文本），以便可以在任何用户消息索引处重新
			// 创建环境。门控机制：- 构建时：此导入在外部构建中被存根化。-
			// 运行时：上传器检查 github.com/anthrop
			// ics/* 远程仓库 + gcloud 认证。- 安全性：CLAUDE_
			// CODE_DISABLE_SESSION_DATA_UPLOAD=1 可绕过（
			// 测试设置此变量）。导入是动态 + 异步的，以避免增加启动延迟。
			const sessionUploaderPromise =
				process.env.USER_TYPE === "ant"
					? import("./utils/sessionDataUploader.js")
					: null;

			// 将会话上传器解析推迟到 onTurnComplete 回调，以避免
			// 在 main.tsx 中添加新的顶级 await（性能关键路径
			// ）。sessionDataUploader.ts 中的每轮认证逻辑
			// 会优雅地处理未认证状态（每轮重新检查，因此会话中途恢复认证有效）。
			const uploaderReady = sessionUploaderPromise
				? sessionUploaderPromise
						.then((mod) => mod.createSessionTurnUploader())
						.catch(() => null)
				: null;

			const sessionConfig = {
				debug: debug || debugToStderr,
				commands: [...commands, ...mcpCommands],
				initialTools,
				mcpClients,
				autoConnectIdeFlag: ide,
				mainThreadAgentDefinition,
				disableSlashCommands,
				dynamicMcpConfig,
				strictMcpConfig,
				systemPrompt,
				appendSystemPrompt,
				taskListId,
				thinkingConfig,
				...(uploaderReady && {
					onTurnComplete: (messages: MessageType[]) => {
						void uploaderReady.then((uploader) =>
							(uploader as ((msgs: MessageType[]) => void) | null)?.(messages),
						);
					},
				}),
			};

			// processResumedConversation 调用的共享上下文
			const resumeContext = {
				modeApi: coordinatorModeModule,
				mainThreadAgentDefinition,
				agentDefinitions,
				currentCwd,
				cliAgents,
				initialState,
			};

			if (options.continue) {
				// 直接继续最近的对话
				let resumeSucceeded = false;
				try {
					const resumeStart = performance.now();

					// 在恢复之前清除过时缓存，以确保发现新的文件/技能
					const { clearSessionCaches } =
						await import("./commands/clear/caches.js");
					clearSessionCaches();

					const result = await loadConversationForResume(
						undefined /* sessionId */,
						undefined /* sourceFile */,
					);
					if (!result) {
						logEvent("tengu_continue", {
							success: false,
						});
						return await exitWithError(
							root,
							"未找到可继续的对话",
						);
					}

					const loaded = await processResumedConversation(
						result,
						{
							forkSession: !!options.forkSession,
							includeAttribution: true,
							transcriptPath: result.fullPath,
						},
						resumeContext,
					);

					if (loaded.restoredAgentDef) {
						mainThreadAgentDefinition = loaded.restoredAgentDef;
					}

					maybeActivateProactive(options);
					maybeActivateBrief(options);

					logEvent("tengu_continue", {
						success: true,
						resume_duration_ms: Math.round(
							performance.now() - resumeStart,
						),
					});
					resumeSucceeded = true;

					await launchRepl(
						root,
						{
							getFpsMetrics,
							stats,
							initialState: loaded.initialState,
						},
						{
							...sessionConfig,
							mainThreadAgentDefinition:
								loaded.restoredAgentDef ??
								mainThreadAgentDefinition,
							initialMessages: loaded.messages,
							initialFileHistorySnapshots:
								loaded.fileHistorySnapshots,
							initialContentReplacements:
								loaded.contentReplacements,
							initialAgentName: loaded.agentName,
							initialAgentColor: loaded.agentColor,
						},
						renderAndRun,
					);
				} catch (error) {
					if (!resumeSucceeded) {
						logEvent("tengu_continue", {
							success: false,
						});
					}
					logError(error);
					process.exit(1);
				}
			} else if (feature("DIRECT_CONNECT") && _pendingConnect?.url) {
				// `claude connect <url>` — 连接到远程服务器的完整交互式 TUI
				let directConnectConfig;
				try {
					const session = await createDirectConnectSession({
						serverUrl: _pendingConnect.url,
						authToken: _pendingConnect.authToken,
						cwd: getOriginalCwd(),
						dangerouslySkipPermissions:
							_pendingConnect.dangerouslySkipPermissions,
					});
					if (session.workDir) {
						setOriginalCwd(session.workDir);
						setCwdState(session.workDir);
					}
					setDirectConnectServerUrl(_pendingConnect.url);
					directConnectConfig = session.config;
				} catch (err) {
					return await exitWithError(
						root,
						err instanceof DirectConnectError
							? err.message
							: String(err),
						() => gracefulShutdown(1),
					);
				}

				const connectInfoMessage = createSystemMessage(
					`已连接到服务器 ${_pendingConnect.url}\n会话：${directConnectConfig.sessionId}`,
					"info",
				);

				await launchRepl(
					root,
					{ getFpsMetrics, stats, initialState },
					{
						debug: debug || debugToStderr,
						commands,
						initialTools: [],
						initialMessages: [connectInfoMessage],
						mcpClients: [],
						autoConnectIdeFlag: ide,
						mainThreadAgentDefinition,
						disableSlashCommands,
						directConnectConfig,
						thinkingConfig,
					},
					renderAndRun,
				);
				return;
			} else if (feature("SSH_REMOTE") && _pendingSSH?.host) {
				// `claude ssh <host> [dir]` — 探测远程主机，如果
				// 需要则部署二进制文件，通过 unix-socket -R 转发到本地认证
				// 代理生成 ssh，将 REPL 交给 SSHSession。工具在远程
				// 运行，UI 在本地渲染。`--local` 跳过探测/部署/ssh，
				// 并使用相同环境直接生成当前二进制文件 — 用于代理/认证管道端到端测试。
				const {
					createSSHSession,
					createLocalSSHSession,
					SSHSessionError,
				} = await import("./ssh/createSSHSession.js");
				let sshSession: import('./ssh/createSSHSession.js').SSHSession | undefined;
				try {
					if (_pendingSSH.local) {
						process.stderr.write(
							"正在启动本地 ssh-proxy 测试会话...\n",
						);
						sshSession = await createLocalSSHSession({
							cwd: _pendingSSH.cwd,
							permissionMode: _pendingSSH.permissionMode,
							dangerouslySkipPermissions:
								_pendingSSH.dangerouslySkipPermissions,
						});
					} else {
						process.stderr.write(
							`正在连接到 ${_pendingSSH.host}…
`,
						);
						// 原地进度显示：使用 \r + EL0（擦除至行尾）。成功时输出最
						// 终 \n 以使下一条消息显示在新行。当 stderr 不是 T
						// TY（管道/重定向）时不执行任何操作 —— \r 只会产生干扰。
						const isTTY = process.stderr.isTTY;
						let hadProgress = false;
						sshSession = await createSSHSession(
							{
								host: _pendingSSH.host,
								cwd: _pendingSSH.cwd,
								localVersion: MACRO.VERSION,
								permissionMode: _pendingSSH.permissionMode,
								dangerouslySkipPermissions:
									_pendingSSH.dangerouslySkipPermissions,
								extraCliArgs: _pendingSSH.extraCliArgs,
								remoteBin: _pendingSSH.remoteBin,
							},
							isTTY
								? {
										onProgress: (msg: string) => {
											hadProgress = true;
											process.stderr.write(
												`\r  ${msg}\x1b[K`,
											);
										},
									}
								: {},
						);
						if (hadProgress) process.stderr.write("\n");
					}
					setOriginalCwd(sshSession.remoteCwd);
					setCwdState(sshSession.remoteCwd);
					setDirectConnectServerUrl(
						_pendingSSH.local ? "local" : _pendingSSH.host,
					);
				} catch (err) {
					return await exitWithError(
						root,
						err instanceof SSHSessionError
							? err.message
							: String(err),
						() => gracefulShutdown(1),
					);
				}

				const sshInfoMessage = createSystemMessage(
					_pendingSSH.local
						? `本地 ssh-proxy 测试会话\n当前工作目录：${sshSession.remoteCwd}\n认证方式：Unix 套接字 → 本地代理`
						: `SSH 会话连接至 ${_pendingSSH.host}\n远程工作目录：${sshSession.remoteCwd}\n认证方式：Unix 套接字 -R → 本地代理`,
					"info",
				);

				await launchRepl(
					root,
					{ getFpsMetrics, stats, initialState },
					{
						debug: debug || debugToStderr,
						commands,
						initialTools: [],
						initialMessages: [sshInfoMessage],
						mcpClients: [],
						autoConnectIdeFlag: ide,
						mainThreadAgentDefinition,
						disableSlashCommands,
						sshSession,
						thinkingConfig,
					},
					renderAndRun,
				);
				return;
			} else if (
				feature("KAIROS") &&
				_pendingAssistantChat &&
				(_pendingAssistantChat.sessionId ||
					_pendingAssistantChat.discover)
			) {
				// `claude assistant [sessionId]` —
				// 作为远程助手会话的纯查看器客户端运行的 REPL。智能体循环在远程运
				// 行；此进程流式传输实时事件并 POST 消息。历史记录通过 useA
				// ssistantHistory 在向上滚动时懒加载（此处无阻塞式获取）。
				const { discoverAssistantSessions } =
					await import("./assistant/sessionDiscovery.js");

				let targetSessionId = _pendingAssistantChat.sessionId;

				// 发现流程 — 列出桥接环境，筛选会话
				if (!targetSessionId) {
					let sessions;
					try {
						sessions = await discoverAssistantSessions();
					} catch (e) {
						return await exitWithError(
							root,
							`发现会话失败：${e instanceof Error ? e.message : e}`,
							() => gracefulShutdown(1),
						);
					}
					if (sessions.length === 0) {
						let installedDir: string | null;
						try {
							installedDir =
								await launchAssistantInstallWizard(root);
						} catch (e) {
							return await exitWithError(
								root,
								`助手安装失败：${e instanceof Error ? e.message : e}`,
								() => gracefulShutdown(1),
							);
						}
						if (installedDir === null) {
							await gracefulShutdown(0);
							process.exit(0);
						}
						// 守护进程需要几秒钟来启动其工作进程并
						// 建立桥接会话，之后发现流程才能找到它。
						return await exitWithMessage(
							root,
							`助手已安装于 ${installedDir}。守护进程正在启动 — 请几秒钟后再次运行 \`claude assistant\` 以进行连接。`,
							{
								exitCode: 0,
								beforeExit: () => gracefulShutdown(0),
							},
						);
					}
					if (sessions.length === 1) {
						targetSessionId = sessions[0]!.id;
					} else {
						const picked = await launchAssistantSessionChooser(
							root,
							{
								sessions,
							},
						);
						if (!picked) {
							await gracefulShutdown(0);
							process.exit(0);
						}
						targetSessionId = picked;
					}
				}

				// 认证 — 为 orgUUID 调用一次 prepareApiRequest
				// ()，但对令牌使用 getAccessToken 闭包，以便重新连接时能获取新令牌。
				const {
					checkAndRefreshOAuthTokenIfNeeded,
					getClaudeAIOAuthTokens,
				} = await import("./utils/auth.js");
				await checkAndRefreshOAuthTokenIfNeeded();
				let apiCreds;
				try {
					apiCreds = await prepareApiRequest();
				} catch (e) {
					return await exitWithError(
						root,
						`Error: ${e instanceof Error ? e.message : "认证失败"}`,
						() => gracefulShutdown(1),
					);
				}
				const getAccessToken = (): string =>
					getClaudeAIOAuthTokens()?.accessToken ??
					apiCreds.accessToken;

				// Brief 模式激活：setKairosActive(true) 同时满足 isBriefEn
				// abled() 的加入许可和授权要求 (BriefTool.ts:124-132)。
				setKairosActive(true);
				setUserMsgOptIn(true);
				setIsRemoteMode(true);

				const remoteSessionConfig = createRemoteSessionConfig(
					targetSessionId,
					getAccessToken,
					apiCreds.orgUUID,
					/* hasInitialPrompt */ false,
					/* viewerOnly */ true,
				);

				const infoMessage = createSystemMessage(
					`已附加到助手会话 ${targetSessionId.slice(0, 8)}…`,
					"info",
				);

				const assistantInitialState: AppState = {
					...initialState,
					isBriefOnly: true,
					kairosEnabled: false,
					replBridgeEnabled: false,
				};

				const remoteCommands = filterCommandsForRemoteMode(commands);
				await launchRepl(
					root,
					{
						getFpsMetrics,
						stats,
						initialState: assistantInitialState,
					},
					{
						debug: debug || debugToStderr,
						commands: remoteCommands,
						initialTools: [],
						initialMessages: [infoMessage],
						mcpClients: [],
						autoConnectIdeFlag: ide,
						mainThreadAgentDefinition,
						disableSlashCommands,
						remoteSessionConfig,
						thinkingConfig,
					},
					renderAndRun,
				);
				return;
			} else if (
				options.resume ||
				options.fromPr ||
				teleport ||
				remote !== null
			) {
				// 处理恢复流程 - 从文件（仅限 ant）、会话 ID 或交互式选择器

				// 在恢复前清除过时缓存，以确保获取到最新的文件/技能发现
				const { clearSessionCaches } =
					await import("./commands/clear/caches.js");
				clearSessionCaches();

				let messages: MessageType[] | null = null;
				let processedResume: ProcessedResume | undefined;

				let maybeSessionId = validateUuid(options.resume);
				let searchTerm: string | undefined;
				// 通过自定义标题找到时，存储完整的 LogOption（用于跨工作树恢复）
				let matchedLog: LogOption | null = null;
				// 用于 --from-pr 标志的 PR 过滤器
				let filterByPr: boolean | number | string | undefined;

				// 处理 --from-pr 标志
				if (options.fromPr) {
					if (options.fromPr === true) {
						// 显示所有关联了 PR 的会话
						filterByPr = true;
					} else if (typeof options.fromPr === "string") {
						// 可能是 PR 编号或 URL
						filterByPr = options.fromPr;
					}
				}

				// 如果恢复值不是 UUID，首先尝试通过自定义标题进行精确匹配
				if (
					options.resume &&
					typeof options.resume === "string" &&
					!maybeSessionId
				) {
					const trimmedValue = options.resume.trim();
					if (trimmedValue) {
						const matches = await searchSessionsByCustomTitle(
							trimmedValue,
							{
								exact: true,
							},
						);

						if (matches.length === 1) {
							// 找到精确匹配 - 存储完整的 LogOption 用于跨工作树恢复
							matchedLog = matches[0]!;
							maybeSessionId =
								getSessionIdFromLog(matchedLog) ?? null;
						} else {
							// 无匹配或多个匹配 - 将其用作选择器的搜索词
							searchTerm = trimmedValue;
						}
					}
				}

				// --remote 和 --teleport 都用于创建/恢复 Claude Code Web (CC
				// R) 会话。远程控制 (--rc) 是在 initReplBridge.ts 中单独控制的功能。
				if (remote !== null || teleport) {
					await waitForPolicyLimitsToLoad();
					if (!isPolicyAllowed("allow_remote_sessions")) {
						return await exitWithError(
							root,
							"错误：远程会话已被您的组织策略禁用。",
							() => gracefulShutdown(1),
						);
					}
				}

				if (remote !== null) {
					// 创建远程会话（可选择附带初始提示）
					const hasInitialPrompt = remote.length > 0;

					// 检查 TUI 模式是否启用 - 描述仅在 TUI 模式下为可选
					const isRemoteTuiEnabled =
						getFeatureValue_CACHED_MAY_BE_STALE(
							"tengu_remote_backend",
							false,
						);
					if (!isRemoteTuiEnabled && !hasInitialPrompt) {
						return await exitWithError(
							root,
							'错误：--remote 参数需要提供任务描述。\n用法：claude --remote "你的任务描述"',
							() => gracefulShutdown(1),
						);
					}

					logEvent("tengu_remote_create_session", {
						has_initial_prompt: String(
							hasInitialPrompt,
						) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
					});

					// 传递当前分支，以便 CCR 在正确的修订版本克隆仓库
					const currentBranch = await getBranch();
					const createdSession =
						await teleportToRemoteWithErrorHandling(
							root,
							hasInitialPrompt ? remote : null,
							new AbortController().signal,
							currentBranch || undefined,
						);
					if (!createdSession) {
						logEvent("tengu_remote_create_session_error", {
							error: "unable_to_create_session" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
						});
						return await exitWithError(
							root,
							"错误：无法创建远程会话",
							() => gracefulShutdown(1),
						);
					}
					logEvent("tengu_remote_create_session_success", {
						session_id:
							createdSession.id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
					});

					// 检查是否通过特性开关启用了新的远程 TUI 模式
					if (!isRemoteTuiEnabled) {
						// 原始行为：打印会话信息并退出
						process.stdout.write(
							`已创建远程会话：${createdSession.title}\n`,
						);
						process.stdout.write(
							`查看：${getRemoteSessionUrl(createdSession.id)}?m=0\n`,
						);
						process.stdout.write(
							`恢复会话：claude --teleport ${createdSession.id}\n`,
						);
						await gracefulShutdown(0);
						process.exit(0);
					}

					// 新行为：启动本地 TUI 并使用 CC
					// R 引擎。标记我们处于远程模式以显示命令可见性
					setIsRemoteMode(true);
					switchSession(asSessionId(createdSession.id));

					// 获取远程会话的 OAuth 凭据
					let apiCreds: { accessToken: string; orgUUID: string };
					try {
						apiCreds = await prepareApiRequest();
					} catch (error) {
						logError(toError(error));
						return await exitWithError(
							root,
							`Error: ${errorMessage(error) || "身份验证失败"}`,
							() => gracefulShutdown(1),
						);
					}

					// 为 REPL 创建远程会话配置
					const { getClaudeAIOAuthTokens: getTokensForRemote } =
						await import("./utils/auth.js");
					const getAccessTokenForRemote = (): string =>
						getTokensForRemote()?.accessToken ??
						apiCreds.accessToken;
					const remoteSessionConfig = createRemoteSessionConfig(
						createdSession.id,
						getAccessTokenForRemote,
						apiCreds.orgUUID,
						hasInitialPrompt,
					);

					// 将远程会话信息作为初始系统消息添加
					const remoteSessionUrl = `${getRemoteSessionUrl(createdSession.id)}?m=0`;
					const remoteInfoMessage = createSystemMessage(
						`/remote-control 已激活。请在 CLI 中或访问 ${remoteSessionUrl} 编写代码`,
						"info",
					);

					// 如果提供了提示，则从中创建初始用户消息（CCR 会回显它，但我们忽略此回显）
					const initialUserMessage = hasInitialPrompt
						? createUserMessage({ content: remote })
						: null;

					// 在应用状态中设置远程会话 URL，用于页脚指示器
					const remoteInitialState = {
						...initialState,
						remoteSessionUrl,
					};

					// 预过滤命令，仅包含远程安全的命令。CCR 的初始化响应
					// 可能会进一步优化此列表（通过 REPL 中的 handleRemoteInit）。
					const remoteCommands =
						filterCommandsForRemoteMode(commands);
					await launchRepl(
						root,
						{
							getFpsMetrics,
							stats,
							initialState: remoteInitialState,
						},
						{
							debug: debug || debugToStderr,
							commands: remoteCommands,
							initialTools: [],
							initialMessages: initialUserMessage
								? [remoteInfoMessage, initialUserMessage]
								: [remoteInfoMessage],
							mcpClients: [],
							autoConnectIdeFlag: ide,
							mainThreadAgentDefinition,
							disableSlashCommands,
							remoteSessionConfig,
							thinkingConfig,
						},
						renderAndRun,
					);
					return;
				} else if (teleport) {
					if (teleport === true || teleport === "") {
						// 交互模式：显示任务选择器并处理恢复
						logEvent("tengu_teleport_interactive_mode", {});
						logForDebugging(
							"selectAndResumeTeleportTask：正在启动传送流程...",
						);
						const teleportResult =
							await launchTeleportResumeWrapper(root);
						if (!teleportResult) {
							// 用户取消或发生错误
							await gracefulShutdown(0);
							process.exit(0);
						}
						const { branchError } =
							await checkOutTeleportedSessionBranch(
								teleportResult.branch,
							);
						messages = processMessagesForTeleportResume(
							teleportResult.log,
							branchError,
						);
					} else if (typeof teleport === "string") {
						logEvent("tengu_teleport_resume_session", {
							mode: "direct" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
						});
						try {
							// 首先，在检查 git 状态之前，获取会话并验证仓库
							const sessionData = await fetchSession(teleport);
							const repoValidation =
								await validateSessionRepository(sessionData);

							// 处理仓库不匹配或不在仓库中的情况
							if (
								repoValidation.status === "mismatch" ||
								repoValidation.status === "not_in_repo"
							) {
								const sessionRepo = repoValidation.sessionRepo;
								if (sessionRepo) {
									// 检查已知路径
									const knownPaths =
										getKnownPathsForRepo(sessionRepo);
									const existingPaths =
										await filterExistingPaths(knownPaths);

									if (existingPaths.length > 0) {
										// 显示目录切换对话框
										const selectedPath =
											await launchTeleportRepoMismatchDialog(
												root,
												{
													targetRepo: sessionRepo,
													initialPaths: existingPaths,
												},
											);

										if (selectedPath) {
											// 切换到所选目录
											process.chdir(selectedPath);
											setCwd(selectedPath);
											setOriginalCwd(selectedPath);
										} else {
											// 用户已取消
											await gracefulShutdown(0);
										}
									} else {
										// 没有已知路径 - 显示原始错误
										throw new TeleportOperationError(
											`你必须从 ${sessionRepo} 的检出副本中运行 claude --teleport ${teleport}。`,
											chalk.red(
												`你必须从 ${chalk.bold(sessionRepo)} 的检出副本中运行 claude --teleport ${teleport}。
`,
											),
										);
									}
								}
							} else if (repoValidation.status === "error") {
								throw new TeleportOperationError(
									repoValidation.errorMessage ||
										"会话验证失败",
									chalk.red(
										`Error: ${repoValidation.errorMessage || "会话验证失败"}\n`,
									),
								);
							}

							await validateGitState();

							// 为传送使用进度 UI
							const { teleportWithProgress } =
								await import("./components/TeleportProgress.js");
							const result = await teleportWithProgress(
								root,
								teleport,
							);
							// 跟踪已传送的会话以进行可靠性日志记录
							setTeleportedSessionInfo({ sessionId: teleport });
							messages = result.messages;
						} catch (error) {
							if (error instanceof TeleportOperationError) {
								process.stderr.write(
									error.formattedMessage + "\n",
								);
							} else {
								logError(error);
								process.stderr.write(
									chalk.red(
										`Error: ${errorMessage(error)}\n`,
									),
								);
							}
							await gracefulShutdown(1);
						}
					}
				}
				if (process.env.USER_TYPE === "ant") {
					if (
						options.resume &&
						typeof options.resume === "string" &&
						!maybeSessionId
					) {
						// 检查 ccshare URL（例如 https://go/ccshare/boris-20260311-211036）
						const { parseCcshareId, loadCcshare } =
							await import("./utils/ccshareResume.js");
						const ccshareId = parseCcshareId(options.resume);
						if (ccshareId) {
							try {
								const resumeStart = performance.now();
								const logOption = await loadCcshare(ccshareId);
								const result = await loadConversationForResume(
									logOption,
									undefined,
								);
								if (result) {
									processedResume =
										await processResumedConversation(
											result,
											{
												forkSession: true,
												transcriptPath: result.fullPath,
											},
											resumeContext,
										);
									if (processedResume.restoredAgentDef) {
										mainThreadAgentDefinition =
											processedResume.restoredAgentDef;
									}
									logEvent("tengu_session_resumed", {
										entrypoint:
											"ccshare" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
										success: true,
										resume_duration_ms: Math.round(
											performance.now() - resumeStart,
										),
									});
								} else {
									logEvent("tengu_session_resumed", {
										entrypoint:
											"ccshare" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
										success: false,
									});
								}
							} catch (error) {
								logEvent("tengu_session_resumed", {
									entrypoint:
										"ccshare" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
									success: false,
								});
								logError(error);
								await exitWithError(
									root,
									`无法从 ccshare 恢复：${errorMessage(error)}`,
									() => gracefulShutdown(1),
								);
							}
						} else {
							const resolvedPath = resolve(options.resume);
							try {
								const resumeStart = performance.now();
								let logOption;
								try {
									// 尝试作为转录文件加载；ENOENT 错误则回退到会话 ID 处理
									logOption =
										await loadTranscriptFromFile(
											resolvedPath,
										);
								} catch (error) {
									if (!isENOENT(error)) throw error;
									// ENOENT：不是文件路径 — 回退到会话 ID 处理
								}
								if (logOption) {
									const result =
										await loadConversationForResume(
											logOption,
											undefined /* sourceFile */,
										);
									if (result) {
										processedResume =
											await processResumedConversation(
												result,
												{
													forkSession:
														!!options.forkSession,
													transcriptPath:
														result.fullPath,
												},
												resumeContext,
											);
										if (processedResume.restoredAgentDef) {
											mainThreadAgentDefinition =
												processedResume.restoredAgentDef;
										}
										logEvent("tengu_session_resumed", {
											entrypoint:
												"file" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
											success: true,
											resume_duration_ms: Math.round(
												performance.now() - resumeStart,
											),
										});
									} else {
										logEvent("tengu_session_resumed", {
											entrypoint:
												"file" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
											success: false,
										});
									}
								}
							} catch (error) {
								logEvent("tengu_session_resumed", {
									entrypoint:
										"file" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
									success: false,
								});
								logError(error);
								await exitWithError(
									root,
									`无法从文件加载转录：${options.resume}`,
									() => gracefulShutdown(1),
								);
							}
						}
					}
				}

				// 如果未作为文件加载，则尝试作为会话 ID
				if (maybeSessionId) {
					// 按 ID 恢复特定会话
					const sessionId = maybeSessionId;
					try {
						const resumeStart = performance.now();
						// 如果可用则使用 matchedLog（用于通过自定义标题跨工作树恢复），
						// 否则回退到 sessionId 字符串（用于直接 UUID 恢复）
						const result = await loadConversationForResume(
							matchedLog ?? sessionId,
							undefined,
						);

						if (!result) {
							logEvent("tengu_session_resumed", {
								entrypoint:
									"cli_flag" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
								success: false,
							});
							return await exitWithError(
								root,
								`未找到会话 ID 为 ${sessionId} 的对话`,
							);
						}

						const fullPath =
							matchedLog?.fullPath ?? result.fullPath;
						processedResume = await processResumedConversation(
							result,
							{
								forkSession: !!options.forkSession,
								sessionIdOverride: sessionId,
								transcriptPath: fullPath,
							},
							resumeContext,
						);

						if (processedResume.restoredAgentDef) {
							mainThreadAgentDefinition =
								processedResume.restoredAgentDef;
						}
						logEvent("tengu_session_resumed", {
							entrypoint:
								"cli_flag" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
							success: true,
							resume_duration_ms: Math.round(
								performance.now() - resumeStart,
							),
						});
					} catch (error) {
						logEvent("tengu_session_resumed", {
							entrypoint:
								"cli_flag" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
							success: false,
						});
						logError(error);
						await exitWithError(
							root,
							`恢复会话 ${sessionId} 失败`,
						);
					}
				}

				// 在渲染 REPL 前等待文件下载（文件必须可用）
				if (fileDownloadPromise) {
					try {
						const results = await fileDownloadPromise;
						const failedCount = count(results, (r) => !r.success);
						if (failedCount > 0) {
							process.stderr.write(
								chalk.yellow(
									`警告：${failedCount}/${results.length} 个文件下载失败。
`,
								),
							);
						}
					} catch (error) {
						return await exitWithError(
							root,
							`下载文件时出错：${errorMessage(error)}`,
						);
					}
				}

				// 如果我们有已处理的恢复或传送消息，则渲染 REPL
				const resumeData =
					processedResume ??
					(Array.isArray(messages)
						? {
								messages,
								fileHistorySnapshots: undefined,
								agentName: undefined,
								agentColor: undefined as
									| AgentColorName
									| undefined,
								restoredAgentDef: mainThreadAgentDefinition,
								initialState,
								contentReplacements: undefined,
							}
						: undefined);
				if (resumeData) {
					maybeActivateProactive(options);
					maybeActivateBrief(options);

					await launchRepl(
						root,
						{
							getFpsMetrics,
							stats,
							initialState: resumeData.initialState,
						},
						{
							...sessionConfig,
							mainThreadAgentDefinition:
								resumeData.restoredAgentDef ??
								mainThreadAgentDefinition,
							initialMessages: resumeData.messages,
							initialFileHistorySnapshots:
								resumeData.fileHistorySnapshots,
							initialContentReplacements:
								resumeData.contentReplacements,
							initialAgentName: resumeData.agentName,
							initialAgentColor: resumeData.agentColor,
						},
						renderAndRun,
					);
				} else {
					// 显示交互式选择器（包含同仓库的工作树）注意：Res
					// umeConversation 内部加载日志以确保选择后正确进行垃圾回收
					await launchResumeChooser(
						root,
						{ getFpsMetrics, stats, initialState },
						getWorktreePaths(getOriginalCwd()),
						{
							...sessionConfig,
							initialSearchQuery: searchTerm,
							forkSession: options.forkSession,
							filterByPr,
						},
					);
				}
			} else {
				// 将未解决的钩子 Promise 传递给 REPL，以便它可以
				// 立即渲染，而不是阻塞约 500 毫秒等待 SessionSta
				// rt 钩子完成。REPL 将在钩子解析时注入钩子消息，并在第一次
				// API 调用前等待它们，这样模型总能看见钩子上下文。
				const pendingHookMessages =
					hooksPromise && hookMessages.length === 0
						? hooksPromise
						: undefined;

				profileCheckpoint("action_after_hooks");
				maybeActivateProactive(options);
				maybeActivateBrief(options);
				// 为新会话持久化当前模式，以便未来恢复时知道使用了什么模式
				if (feature("COORDINATOR_MODE")) {
					saveMode(
						coordinatorModeModule?.isCoordinatorMode()
							? "coordinator"
							: "normal",
					);
				}

				// 如果通过深度链接启动，则显示来源横幅，以便用户知道
				// 会话源自外部。Linux xdg-open 和
				// 设置了“始终允许”的浏览器会在没有操作系统级确认的情
				// 况下分发链接，因此这是用户获得的唯一信号，表明提
				// 示 — 以及它隐含的工作目录 / CLAUDE.m
				// d — 来自外部来源，而不是他们自己输入的。
				let deepLinkBanner: ReturnType<
					typeof createSystemMessage
				> | null = null;
				if (feature("LODESTONE")) {
					if (options.deepLinkOrigin) {
						logEvent("tengu_deep_link_opened", {
							has_prefill: Boolean(options.prefill),
							has_repo: Boolean(options.deepLinkRepo),
						});
						deepLinkBanner = createSystemMessage(
							buildDeepLinkBanner({
								cwd: getCwd(),
								prefillLength: options.prefill?.length,
								repo: options.deepLinkRepo,
								lastFetch:
									options.deepLinkLastFetch !== undefined
										? new Date(options.deepLinkLastFetch)
										: undefined,
							}),
							"warning",
						);
					} else if (options.prefill) {
						deepLinkBanner = createSystemMessage(
							"启动时带有预填充的提示 — 在按下 Enter 前请审阅。",
							"warning",
						);
					}
				}
				const initialMessages = deepLinkBanner
					? [deepLinkBanner, ...hookMessages]
					: hookMessages.length > 0
						? hookMessages
						: undefined;

				await launchRepl(
					root,
					{ getFpsMetrics, stats, initialState },
					{
						...sessionConfig,
						initialMessages,
						pendingHookMessages,
					},
					renderAndRun,
				);
			}
		})
		.version(
			`${MACRO.VERSION} (Claude Code)`,
			"-v, --version",
			"输出版本号",
		);

	// 工作树标志
	program.option(
		"-w, --worktree [名称]",
		"为此会话创建一个新的 git 工作树（可选指定名称）",
	);
	program.option(
		"--tmux",
		"为工作树创建一个 tmux 会话（需要 --worktree）。可用时使用 iTerm2 原生窗格；使用 --tmux=classic 以使用传统 tmux。",
	);

	if (canUserConfigureAdvisor()) {
		program.addOption(
			new Option(
				"--advisor <模型>",
				"启用服务端顾问工具，并指定模型（别名或完整 ID）。",
			).hideHelp(),
		);
	}

	if (process.env.USER_TYPE === "ant") {
		program.addOption(
			new Option(
				"--delegate-permissions",
				"[仅限 ANT] --permission-mode auto 的别名。",
			).implies({
				permissionMode: "auto",
			}),
		);
		program.addOption(
			new Option(
				"--dangerously-skip-permissions-with-classifiers",
				"[仅限 ANT] --permission-mode auto 的已弃用别名。",
			)
				.hideHelp()
				.implies({ permissionMode: "auto" }),
		);
		program.addOption(
			new Option(
				"--afk",
				"[仅限 ANT] --permission-mode auto 的已弃用别名。",
			)
				.hideHelp()
				.implies({ permissionMode: "auto" }),
		);
		program.addOption(
			new Option(
				"--tasks [id]",
				'[仅限 ANT] 任务模式：监听任务并自动处理。可选 id 同时用作任务列表 ID 和代理 ID（默认为 "tasklist"）。',
			)
				.argParser(String)
				.hideHelp(),
		);
		program.option(
			"--agent-teams",
			"[仅限 ANT] 强制 Claude 使用多代理模式来解决问题",
			() => true,
		);
	}

	if (feature("TRANSCRIPT_CLASSIFIER")) {
		program.addOption(
			new Option("--enable-auto-mode", "选择启用自动模式").hideHelp(),
		);
	}

	if (feature("PROACTIVE") || feature("KAIROS")) {
		program.addOption(
			new Option("--proactive", "以主动自主模式启动"),
		);
	}

	if (feature("UDS_INBOX")) {
		program.addOption(
			new Option(
				"--messaging-socket-path <路径>",
				"UDS 消息服务器的 Unix 域套接字路径（默认为临时路径）",
			),
		);
	}

	if (feature("KAIROS") || feature("KAIROS_BRIEF")) {
		program.addOption(
			new Option(
				"--brief",
				"启用 SendUserMessage 工具用于代理与用户通信",
			),
		);
	}
	if (feature("KAIROS")) {
		program.addOption(
			new Option(
				"--assistant",
				"强制助手模式（供 Agent SDK 守护进程使用）",
			).hideHelp(),
		);
	}
	program.addOption(
		new Option(
			"--channels <服务器...>",
			"应将其通道通知（入站推送）注册到此会话的 MCP 服务器。以空格分隔的服务器名称。",
		).hideHelp(),
	);
	program.addOption(
		new Option(
			"--dangerously-load-development-channels <服务器...>",
			"加载不在批准白名单上的通道服务器。仅用于本地通道开发。启动时会显示确认对话框。",
		).hideHelp(),
	);

	// 队友身份选项（由领导者在生成 tmux 队友时设置）这些选项
	// 替换了 CLAUDE_CODE_* 环境变量
	program.addOption(
		new Option("--agent-id <id>", "队友代理 ID").hideHelp(),
	);
	program.addOption(
		new Option("--agent-name <名称>", "队友显示名称").hideHelp(),
	);
	program.addOption(
		new Option(
			"--team-name <名称>",
			"用于群体协调的团队名称",
		).hideHelp(),
	);
	program.addOption(
		new Option("--agent-color <颜色>", "队友 UI 颜色").hideHelp(),
	);
	program.addOption(
		new Option(
			"--plan-mode-required",
			"在实施前要求进入规划模式",
		).hideHelp(),
	);
	program.addOption(
		new Option(
			"--parent-session-id <id>",
			"用于分析关联的父会话 ID",
		).hideHelp(),
	);
	program.addOption(
		new Option(
			"--teammate-mode <模式>",
			'如何生成队友："tmux"、"in-process" 或 "auto"',
		)
			.choices(["auto", "tmux", "in-process"])
			.hideHelp(),
	);
	program.addOption(
		new Option(
			"--agent-type <类型>",
			"为此队友自定义代理类型",
		).hideHelp(),
	);

	// 为所有构建启用 SDK URL 但在帮助中隐藏
	program.addOption(
		new Option(
			"--sdk-url <url>",
			"使用远程 WebSocket 端点进行 SDK I/O 流式传输（仅与 -p 和 stream-json 格式配合使用）",
		).hideHelp(),
	);

	// 为所有构建启用 teleport/remote 标志，但在正式发布前保持无文档状态
	program.addOption(
		new Option(
			"--teleport [会话]",
			"恢复一个 teleport 会话，可选指定会话 ID",
		).hideHelp(),
	);
	program.addOption(
		new Option(
			"--remote [描述]",
			"使用给定的描述创建一个远程会话",
		).hideHelp(),
	);
	if (feature("BRIDGE_MODE")) {
		program.addOption(
			new Option(
				"--remote-control [名称]",
				"启动一个启用了远程控制的交互式会话（可选命名）",
			)
				.argParser((value) => value || true)
				.hideHelp(),
		);
		program.addOption(
			new Option("--rc [名称]", "--remote-control 的别名")
				.argParser((value) => value || true)
				.hideHelp(),
		);
	}

	if (feature("HARD_FAIL")) {
		program.addOption(
			new Option(
				"--hard-fail",
				"在 logError 调用时崩溃，而不是静默记录",
			).hideHelp(),
		);
	}

	profileCheckpoint("run_main_options_built");

	// -p/--print 模式：跳过子命令注册。在打印模式下，52 个子命令（mc
	// p、auth、plugin、skill、task、config、doctor、
	// update 等）永远不会被分发 —— commander 将提示路由到默认操作
	// 。子命令注册路径在基准测试中测得约 65ms —— 主要是 isBridgeEnab
	// led() 调用（25ms 设置 Zod 解析 + 40ms 同步密钥链子进程），两者
	// 都被 try/catch 隐藏，该 try/catch 在 enableConf
	// igs() 之前总是返回 false。cc:// URL 在此运行之前，在 main(
	// ) 函数约第 851 行被重写为 `open`，因此此处的 argv 检查是安全的。
	const isPrintMode =
		process.argv.includes("-p") || process.argv.includes("--print");
	const isCcUrl = process.argv.some(
		(a) => a.startsWith("cc:// ") || a.startsWith("cc+unix://"),
	);
	if (isPrintMode && !isCcUrl) {
		profileCheckpoint("run_before_parse");
		await program.parseAsync(process.argv);
		profileCheckpoint("run_after_parse");
		return program;
	}

	// claude mcp

	const mcp = program
		.command("mcp")
		.description("配置和管理 MCP 服务器")
		.configureHelp(createSortedHelpConfig())
		.enablePositionalOptions();

	mcp.command("serve")
		.description(`启动 Claude Code MCP 服务器`)
		.option("-d, --debug", "启用调试模式", () => true)
		.option(
			"--verbose",
			"覆盖配置中的详细模式设置",
			() => true,
		)
		.action(
			async ({
				debug,
				verbose,
			}: {
				debug?: boolean;
				verbose?: boolean;
			}) => {
				const { mcpServeHandler } =
					await import("./cli/handlers/mcp.js");
				await mcpServeHandler({ debug, verbose });
			},
		);

	// 注册 mcp add 子命令（为可测试性而提取）
	registerMcpAddCommand(mcp);

	if (isXaaEnabled()) {
		registerMcpXaaIdpCommand(mcp);
	}

	mcp.command("remove <名称>")
		.description("移除一个 MCP 服务器")
		.option(
			"-s, --scope <范围>",
			"配置范围（local、user 或 project）- 如果未指定，则从其存在的任何范围中移除",
		)
		.action(async (name: string, options: { scope?: string }) => {
			const { mcpRemoveHandler } = await import("./cli/handlers/mcp.js");
			await mcpRemoveHandler(name, options);
		});

	mcp.command("list")
		.description(
			"列出已配置的 MCP 服务器。注意：此命令会跳过工作区信任对话框，并启动 .mcp.json 中的 stdio 服务器进行健康检查。请仅在您信任的目录中使用此命令。",
		)
		.action(async () => {
			const { mcpListHandler } = await import("./cli/handlers/mcp.js");
			await mcpListHandler();
		});

	mcp.command("get <名称>")
		.description(
			"获取 MCP 服务器的详细信息。注意：此命令会跳过工作区信任对话框，并启动 .mcp.json 中的 stdio 服务器进行健康检查。请仅在您信任的目录中使用此命令。",
		)
		.action(async (name: string) => {
			const { mcpGetHandler } = await import("./cli/handlers/mcp.js");
			await mcpGetHandler(name);
		});

	mcp.command("add-json <名称> <json>")
		.description("使用 JSON 字符串添加一个 MCP 服务器（stdio 或 SSE）")
		.option(
			"-s, --scope <范围>",
			"配置范围（local、user 或 project）",
			"local",
		)
		.option(
			"--client-secret",
			"提示输入 OAuth 客户端密钥（或设置 MCP_CLIENT_SECRET 环境变量）",
		)
		.action(
			async (
				name: string,
				json: string,
				options: { scope?: string; clientSecret?: true },
			) => {
				const { mcpAddJsonHandler } =
					await import("./cli/handlers/mcp.js");
				await mcpAddJsonHandler(name, json, options);
			},
		);

	mcp.command("add-from-claude-desktop")
		.description(
			"从 Claude Desktop 导入 MCP 服务器（仅限 Mac 和 WSL）",
		)
		.option(
			"-s, --scope <范围>",
			"配置范围（local、user 或 project）",
			"local",
		)
		.action(async (options: { scope?: string }) => {
			const { mcpAddFromDesktopHandler } =
				await import("./cli/handlers/mcp.js");
			await mcpAddFromDesktopHandler(options);
		});

	mcp.command("reset-project-choices")
		.description(
			"重置此项目内所有已批准和已拒绝的项目范围（.mcp.json）服务器",
		)
		.action(async () => {
			const { mcpResetChoicesHandler } =
				await import("./cli/handlers/mcp.js");
			await mcpResetChoicesHandler();
		});

	// claude server
	if (feature("DIRECT_CONNECT")) {
		program
			.command("server")
			.description("启动一个 Claude Code 会话服务器")
			.option("--port <端口号>", "HTTP 端口", "0")
			.option("--host <字符串>", "绑定地址", "0.0.0.0")
			.option("--auth-token <令牌>", "用于身份验证的 Bearer 令牌")
			.option("--unix <路径>", "在 Unix 域套接字上监听")
			.option(
				"--workspace <目录>",
				"未指定 cwd 的会话的默认工作目录",
			)
			.option(
				"--idle-timeout <毫秒>",
				"分离会话的空闲超时时间（毫秒）（0 = 永不过期）",
				"600000",
			)
			.option(
				"--max-sessions <数量>",
				"最大并发会话数（0 = 无限制）",
				"32",
			)
			.action(
				async (opts: {
					port: string;
					host: string;
					authToken?: string;
					unix?: string;
					workspace?: string;
					idleTimeout: string;
					maxSessions: string;
				}) => {
					const { randomBytes } = await import("crypto");
					const { startServer } = await import("./server/server.js");
					const { SessionManager } =
						await import("./server/sessionManager.js");
					const { DangerousBackend } =
						await import("./server/backends/dangerousBackend.js");
					const { printBanner } =
						await import("./server/serverBanner.js");
					const { createServerLogger } =
						await import("./server/serverLog.js");
					const {
						writeServerLock,
						removeServerLock,
						probeRunningServer,
					} = await import("./server/lockfile.js");

					const existing = await probeRunningServer();
					if (existing) {
						process.stderr.write(
							`一个 claude 服务器已在 ${existing.httpUrl} 运行（进程 ID ${existing.pid}）
`,
						);
						process.exit(1);
					}

					const authToken =
						opts.authToken ??
						`sk-ant-cc-${randomBytes(16).toString("base64url")}`;

					const config = {
						port: parseInt(opts.port, 10),
						host: opts.host,
						authToken,
						unix: opts.unix,
						workspace: opts.workspace,
						idleTimeoutMs: parseInt(opts.idleTimeout, 10),
						maxSessions: parseInt(opts.maxSessions, 10),
					};

					const backend = new DangerousBackend();
					const sessionManager = new SessionManager(backend, {
						idleTimeoutMs: config.idleTimeoutMs,
						maxSessions: config.maxSessions,
					});
					const logger = createServerLogger();

					const server = startServer(config, sessionManager, logger);
					const actualPort = server.port ?? config.port;
					printBanner(config, authToken, actualPort);

					await writeServerLock({
						pid: process.pid,
						port: actualPort,
						host: config.host,
						httpUrl: config.unix
							? `unix:${config.unix}`
							: `http:// ${config.host}:${actualPort}`,
						startedAt: Date.now(),
					});

					let shuttingDown = false;
					const shutdown = async () => {
						if (shuttingDown) return;
						shuttingDown = true;
						// 在关闭会话前停止接受新连接。
						server.stop(true);
						await sessionManager.destroyAll();
						await removeServerLock();
						process.exit(0);
					};
					process.once("SIGINT", () => void shutdown());
					process.once("SIGTERM", () => void shutdown());
				},
			);
	}

	// `claude ssh <host> [dir]` — 仅在此注册以便 --h
	// elp 能显示它。实际的交互流程由 main() 中的早期 argv 重写处理（类
	// 似于上面的 DIRECT_CONNECT/cc:// 模式）。如果 command
	// er 执行到此动作，意味着 argv 重写未触发（例如用户运行 `clau
	// de ssh` 时未指定主机）—— 直接打印用法说明。
	if (feature("SSH_REMOTE")) {
		program
			.command("ssh <host> [dir]")
			.description(
				"通过 SSH 在远程主机上运行 Claude Code。部署二进制文件并" +
					"通过本地机器隧道回传 API 认证——无需远程设置。",
			)
			.option(
				"--permission-mode <mode>",
				"远程会话的权限模式",
			)
			.option(
				"--dangerously-skip-permissions",
				"跳过远程的所有权限提示（危险）",
			)
			.option(
				"--remote-bin <command>",
				"Custom remote binary command (skips probe/deploy). " +
					"Example: --remote-bin 'bun /path/to/project/dist/cli.js'",
			)
			.option(
				"--local",
				"端到端测试模式——在本地生成子 CLI（跳过 ssh/部署）。" +
					"在没有远程主机的情况下测试认证代理和 Unix 套接字管道。",
			)
			.action(async () => {
				// main() 中的 argv 重写应在 commander
				// 运行前消耗掉 `ssh <host>`。执行到此意味着
				// 主机参数缺失或重写谓词不匹配。
				process.stderr.write(
					"用法：claude ssh <user@host | ssh-config-alias> [dir]\n\n" +
						"在远程 Linux 主机上运行 Claude Code。您无需在远程安装" +
						"任何东西或运行 `claude auth login`——二进制文件通过" +
						"SSH 部署，API 认证通过您的本地机器隧道回传。",
				);
				process.exit(1);
			});
	}

	// claude connect — 子命令仅处理 -p（无
	// 头）模式。交互模式（不带 -p）由 main() 中的早期 argv
	// 重写处理，该重写会重定向到支持完整 TUI 的主命令。
	if (feature("DIRECT_CONNECT")) {
		program
			.command("open <cc-url>")
			.description(
				"连接到 Claude Code 服务器（内部使用——使用 cc:// URL）",
			)
			.option("-p, --print [prompt]", "打印模式（无头）")
			.option(
				"--output-format <format>",
				"输出格式：text, json, stream-json",
				"text",
			)
			.action(
				async (
					ccUrl: string,
					opts: {
						print?: string | true;
						outputFormat?: string;
					},
				) => {
					const { parseConnectUrl } =
						await import("./server/parseConnectUrl.js");
					const { serverUrl, authToken } = parseConnectUrl(ccUrl);

					let connectConfig;
					try {
						const session = await createDirectConnectSession({
							serverUrl,
							authToken,
							cwd: getOriginalCwd(),
							dangerouslySkipPermissions:
								_pendingConnect?.dangerouslySkipPermissions,
						});
						if (session.workDir) {
							setOriginalCwd(session.workDir);
							setCwdState(session.workDir);
						}
						setDirectConnectServerUrl(serverUrl);
						connectConfig = session.config;
					} catch (err) {
						// biome-ignore lint/suspicious/noConsole: 故意的错误输出
						console.error(
							err instanceof DirectConnectError
								? err.message
								: String(err),
						);
						process.exit(1);
					}

					const { runConnectHeadless } =
						await import("./server/connectHeadless.js");

					const prompt =
						typeof opts.print === "string" ? opts.print : "";
					const interactive = opts.print === true;
					await runConnectHeadless(
						connectConfig,
						prompt,
						opts.outputFormat,
						interactive,
					);
				},
			);
	}

	// claude auth

	const auth = program
		.command("auth")
		.description("管理认证")
		.configureHelp(createSortedHelpConfig());

	auth.command("login")
		.description("登录您的 Anthropic 账户")
		.option(
			"--email <email>",
			"在登录页面上预填充电子邮件地址",
		)
		.option("--sso", "强制 SSO 登录流程")
		.option(
			"--console",
			"使用 Anthropic Console（API 用量计费）而非 Claude 订阅",
		)
		.option("--claudeai", "使用 Claude 订阅（默认）")
		.action(
			async ({
				email,
				sso,
				console: useConsole,
				claudeai,
			}: {
				email?: string;
				sso?: boolean;
				console?: boolean;
				claudeai?: boolean;
			}) => {
				const { authLogin } = await import("./cli/handlers/auth.js");
				await authLogin({ email, sso, console: useConsole, claudeai });
			},
		);

	auth.command("status")
		.description("显示认证状态")
		.option("--json", "输出为 JSON（默认）")
		.option("--text", "输出为人类可读文本")
		.action(async (opts: { json?: boolean; text?: boolean }) => {
			const { authStatus } = await import("./cli/handlers/auth.js");
			await authStatus(opts);
		});

	auth.command("logout")
		.description("从您的 Anthropic 账户登出")
		.action(async () => {
			const { authLogout } = await import("./cli/handlers/auth.js");
			await authLogout();
		});

	/** 用于一致处理 marketplace 命令错误的辅助函数。
记录错误并以状态码 1 退出进程。
@param error 发生的错误
@param action 失败操作的描述 */
	// 所有 plugin/marketplace 子命令上的隐藏标志，用于定位 cowork_plugins。
	const coworkOption = () =>
		new Option("--cowork", "使用 cowork_plugins 目录").hideHelp();

	// 插件验证命令
	const pluginCmd = program
		.command("plugin")
		.alias("plugins")
		.description("管理 Claude Code 插件")
		.configureHelp(createSortedHelpConfig());

	pluginCmd
		.command("validate <路径>")
		.description("验证插件或 marketplace 清单")
		.addOption(coworkOption())
		.action(async (manifestPath: string, options: { cowork?: boolean }) => {
			const { pluginValidateHandler } =
				await import("./cli/handlers/plugins.js");
			await pluginValidateHandler(manifestPath, options);
		});

	// 插件列表命令
	pluginCmd
		.command("list")
		.description("列出已安装的插件")
		.option("--json", "输出为 JSON")
		.option(
			"--available",
			"包含来自市场（marketplaces）的可用插件（需要 --json）",
		)
		.addOption(coworkOption())
		.action(
			async (options: {
				json?: boolean;
				available?: boolean;
				cowork?: boolean;
			}) => {
				const { pluginListHandler } =
					await import("./cli/handlers/plugins.js");
				await pluginListHandler(options);
			},
		);

	// Marketplace 子命令
	const marketplaceCmd = pluginCmd
		.command("marketplace")
		.description("管理 Claude Code 市场（marketplaces）")
		.configureHelp(createSortedHelpConfig());

	marketplaceCmd
		.command("add <来源>")
		.description("从 URL、路径或 GitHub 仓库添加一个市场（marketplace）")
		.addOption(coworkOption())
		.option(
			"--sparse <路径...>",
			"通过 git sparse-checkout 将检出限制到特定目录（适用于单体仓库）。示例：--sparse .claude-plugin plugins",
		)
		.option(
			"--scope <作用域>",
			"在哪里声明市场（marketplace）：user（默认）、project 或 local",
		)
		.action(
			async (
				source: string,
				options: {
					cowork?: boolean;
					sparse?: string[];
					scope?: string;
				},
			) => {
				const { marketplaceAddHandler } =
					await import("./cli/handlers/plugins.js");
				await marketplaceAddHandler(source, options);
			},
		);

	marketplaceCmd
		.command("list")
		.description("列出所有已配置的市场（marketplaces）")
		.option("--json", "输出为 JSON")
		.addOption(coworkOption())
		.action(async (options: { json?: boolean; cowork?: boolean }) => {
			const { marketplaceListHandler } =
				await import("./cli/handlers/plugins.js");
			await marketplaceListHandler(options);
		});

	marketplaceCmd
		.command("remove <名称>")
		.alias("rm")
		.description("移除一个已配置的市场（marketplace）")
		.addOption(coworkOption())
		.action(async (name: string, options: { cowork?: boolean }) => {
			const { marketplaceRemoveHandler } =
				await import("./cli/handlers/plugins.js");
			await marketplaceRemoveHandler(name, options);
		});

	marketplaceCmd
		.command("update [名称]")
		.description(
			"从其来源更新市场（marketplace）——如果未指定名称，则更新所有",
		)
		.addOption(coworkOption())
		.action(
			async (name: string | undefined, options: { cowork?: boolean }) => {
				const { marketplaceUpdateHandler } =
					await import("./cli/handlers/plugins.js");
				await marketplaceUpdateHandler(name, options);
			},
		);

	// 插件安装命令
	pluginCmd
		.command("install <plugin>")
		.alias("i")
		.description(
			"从可用市场安装插件（使用 plugin@marketplace 指定特定市场）",
		)
		.option(
			"-s, --scope <scope>",
			"安装范围：用户、项目或本地",
			"user",
		)
		.addOption(coworkOption())
		.action(
			async (
				plugin: string,
				options: { scope?: string; cowork?: boolean },
			) => {
				const { pluginInstallHandler } =
					await import("./cli/handlers/plugins.js");
				await pluginInstallHandler(plugin, options);
			},
		);

	// 插件卸载命令
	pluginCmd
		.command("uninstall <plugin>")
		.alias("remove")
		.alias("rm")
		.description("卸载已安装的插件")
		.option(
			"-s, --scope <scope>",
			"从范围卸载：用户、项目或本地",
			"user",
		)
		.option(
			"--keep-data",
			"保留插件的持久化数据目录 (~/.claude/plugins/data/{id}/)",
		)
		.addOption(coworkOption())
		.action(
			async (
				plugin: string,
				options: {
					scope?: string;
					cowork?: boolean;
					keepData?: boolean;
				},
			) => {
				const { pluginUninstallHandler } =
					await import("./cli/handlers/plugins.js");
				await pluginUninstallHandler(plugin, options);
			},
		);

	// 插件启用命令
	pluginCmd
		.command("enable <plugin>")
		.description("启用已禁用的插件")
		.option(
			"-s, --scope <scope>",
			`安装范围：${VALID_INSTALLABLE_SCOPES.join(", ")}（默认：自动检测）`,
		)
		.addOption(coworkOption())
		.action(
			async (
				plugin: string,
				options: { scope?: string; cowork?: boolean },
			) => {
				const { pluginEnableHandler } =
					await import("./cli/handlers/plugins.js");
				await pluginEnableHandler(plugin, options);
			},
		);

	// 插件禁用命令
	pluginCmd
		.command("disable [plugin]")
		.description("禁用已启用的插件")
		.option("-a, --all", "禁用所有已启用的插件")
		.option(
			"-s, --scope <scope>",
			`安装范围：${VALID_INSTALLABLE_SCOPES.join(", ")}（默认：自动检测）`,
		)
		.addOption(coworkOption())
		.action(
			async (
				plugin: string | undefined,
				options: { scope?: string; cowork?: boolean; all?: boolean },
			) => {
				const { pluginDisableHandler } =
					await import("./cli/handlers/plugins.js");
				await pluginDisableHandler(plugin, options);
			},
		);

	// 插件更新命令
	pluginCmd
		.command("update <plugin>")
		.description(
			"将插件更新至最新版本（需要重启才能生效）",
		)
		.option(
			"-s, --scope <scope>",
			`安装范围：${VALID_UPDATE_SCOPES.join(", ")}（默认：用户）`,
		)
		.addOption(coworkOption())
		.action(
			async (
				plugin: string,
				options: { scope?: string; cowork?: boolean },
			) => {
				const { pluginUpdateHandler } =
					await import("./cli/handlers/plugins.js");
				await pluginUpdateHandler(plugin, options);
			},
		);
	// END ANT-ONLY

  // 设置令牌命令
  program
    .command('setup-token')
    .description(
      '设置长期有效的身份验证令牌（需要 Claude 订阅）',
    )
    .action(async () => {
      const [{ setupTokenHandler }, { createRoot }] = await Promise.all([
        import('./cli/handlers/util.js'),
        import('@anthropic/ink'),
      ])
      const root = await createRoot(getBaseRenderOptions(false))
      await setupTokenHandler(root)
    })

	// Agents 命令 - 列出已配置的代理
	program
		.command("agents")
		.description("列出已配置的代理")
		.option(
			"--setting-sources <sources>",
			"要加载的设置源（user, project, local）的逗号分隔列表。",
		)
		.action(async () => {
			const { agentsHandler } = await import("./cli/handlers/agents.js");
			await agentsHandler();
			process.exit(0);
		});

	if (feature("TRANSCRIPT_CLASSIFIER")) {
		// 当 tengu_auto_mode_config.enabled === 'disabl
		// ed' 时跳过（断路器）。从磁盘缓存读取 —— GrowthBook 在注册时未初始化。
		if (getAutoModeEnabledStateIfCached() !== "disabled") {
			const autoModeCmd = program
				.command("auto-mode")
				.description("检查自动模式分类器配置");

			autoModeCmd
				.command("defaults")
				.description(
					"以 JSON 格式打印默认的自动模式环境、允许和拒绝规则",
				)
				.action(async () => {
					const { autoModeDefaultsHandler } =
						await import("./cli/handlers/autoMode.js");
					autoModeDefaultsHandler();
					process.exit(0);
				});

			autoModeCmd
				.command("config")
				.description(
					"以 JSON 格式打印生效的自动模式配置：已设置的用你的设置，否则用默认值",
				)
				.action(async () => {
					const { autoModeConfigHandler } =
						await import("./cli/handlers/autoMode.js");
					autoModeConfigHandler();
					process.exit(0);
				});

			autoModeCmd
				.command("critique")
				.description("获取关于你的自定义自动模式规则的 AI 反馈")
				.option("--model <model>", "覆盖所使用的模型")
				.action(async (options) => {
					const { autoModeCritiqueHandler } =
						await import("./cli/handlers/autoMode.js");
					await autoModeCritiqueHandler(options);
					process.exit();
				});
		}
	}

	// claude autonomy — CLI subcommands mirroring /autonomy slash command
	{
		const autonomyCmd = program
			.command("autonomy")
			.description("Inspect and manage automatic autonomy runs and flows");

		autonomyCmd
			.command("status")
			.description("Print autonomy run, flow, team, pipe, and remote-control status")
			.option("--deep", "Include teams, pipes, daemon, and remote-control sections")
			.action(async (options: { deep?: boolean }) => {
				const { autonomyStatusHandler } = await import("./cli/handlers/autonomy.js");
				await autonomyStatusHandler(options);
				process.exit(0);
			});

		autonomyCmd
			.command("runs [limit]")
			.description("List recent autonomy runs")
			.action(async (limit?: string) => {
				const { autonomyRunsHandler } = await import("./cli/handlers/autonomy.js");
				await autonomyRunsHandler(limit);
				process.exit(0);
			});

		autonomyCmd
			.command("flows [limit]")
			.description("List recent autonomy flows")
			.action(async (limit?: string) => {
				const { autonomyFlowsHandler } = await import("./cli/handlers/autonomy.js");
				await autonomyFlowsHandler(limit);
				process.exit(0);
			});

		const flowCmd = autonomyCmd
			.command("flow <flowId>")
			.description("Inspect a single autonomy flow")
			.action(async (flowId: string) => {
				const { autonomyFlowHandler } = await import("./cli/handlers/autonomy.js");
				await autonomyFlowHandler(flowId);
				process.exit(0);
			});

		flowCmd
			.command("cancel <flowId>")
			.description("Cancel a queued, waiting, or running autonomy flow")
			.action(async (flowId: string) => {
				const { autonomyFlowCancelHandler } = await import("./cli/handlers/autonomy.js");
				await autonomyFlowCancelHandler(flowId);
				process.exit(0);
			});

		flowCmd
			.command("resume <flowId>")
			.description("Resume a waiting autonomy flow")
			.action(async (flowId: string) => {
				const { autonomyFlowResumeHandler } = await import("./cli/handlers/autonomy.js");
				await autonomyFlowResumeHandler(flowId);
				process.exit(0);
			});
	}

		// Remote Control 命令 —— 将本地环境连接到 claude.ai
	// /code。实际命令在 Commander.js 运行前被 cli.tsx
	// 中的快速路径拦截，因此此注册仅用于帮助输出。始终隐藏：此时（在 enable
	// Configs 之前）调用 isBridgeEnabled() 会在 isCl
	// audeAISubscriber → getGlobalConfig 中抛出
	// 异常，并通过 try/catch 返回 false —— 但在此之前已产生约
	// 65ms 的副作用开销（25ms 设置 Zod 解析 + 40ms 同步 `s
	// ecurity` 密钥链子进程）。动态可见性从未生效；该命令始终是隐藏的。
	if (feature("BRIDGE_MODE")) {
		program
			.command("remote-control", { hidden: true })
			.alias("rc")
			.description(
				"通过 claude.ai/code 连接你的本地环境以进行远程控制会话",
			)
			.action(async () => {
				// 不可达 —— cli.tsx 快速路径在 main.tsx 加载前处理此命令。如果
				// 意外到达此处，则委托给 bridgeMain。
				const { bridgeMain } = await import("./bridge/bridgeMain.js");
				await bridgeMain(process.argv.slice(3));
			});
	}

	if (feature("KAIROS")) {
		program
			.command("assistant [sessionId]")
			.description(
				"将 REPL 作为客户端附加到正在运行的桥接会话。如果未提供 sessionId，则通过 API 发现会话。",
			)
			.action(() => {
				// 上方的 Argv 重写应在 commander 运行前消耗
				// 掉 `assistant [id]`。到达此处意味着根标志在前（
				// 例如 `--debug assistant`）且位置
				// 0 的谓词不匹配。像 ssh 存根那样打印用法。
				process.stderr.write(
					"用法: claude assistant [sessionId]\n\n" +
						"将 REPL 作为查看器客户端附加到正在运行的桥接会话。\n" +
						"省略 sessionId 以发现并从可用会话中选择。\n",
				);
				process.exit(1);
			});
	}

  // Doctor 命令 - 检查安装健康状况
  program
    .command('doctor')
    .description(
      '检查你的 Claude Code 自动更新器的健康状况。注意：跳过工作区信任对话框，并为健康检查启动来自 .mcp.json 的 stdio 服务器。仅在你信任的目录中使用此命令。',
    )
    .action(async () => {
      const [{ doctorHandler }, { createRoot }] = await Promise.all([
        import('./cli/handlers/util.js'),
        import('@anthropic/ink'),
      ])
      const root = await createRoot(getBaseRenderOptions(false))
      await doctorHandler(root)
    })


	// claude up —— 运行项目的 CLAUDE.md 中的 "# claude up" 设置说明。
	if (process.env.USER_TYPE === "ant") {
		program
			.command("up")
			.description(
				'[仅限 ANT] 使用最近的 CLAUDE.md 的 "# claude up" 部分初始化或升级本地开发环境',
			)
			.action(async () => {
				const { up } = await import("src/cli/up.js");
				await up();
			});
	}

	// claude rollback
	// (仅限 ant) 回滚到之前的版本
	if (process.env.USER_TYPE === "ant") {
		program
			.command("rollback [target]")
			.description(
				"[仅限 ANT] 回滚到之前的版本\n\n示例:\n" +
						"  claude rollback                                    从当前版本回退 1 个版本\n" +
						"  claude rollback 3                                  从当前版本回退 3 个版本\n" +
						"  claude rollback 2.0.73-dev.20251217.t190658        回滚到特定版本",
			)
			.option("-l, --list", "列出最近发布的版本及其发布时间")
			.option(
				"--dry-run",
				"显示将要安装的内容而不实际安装",
			)
			.option(
				"--safe",
				"回滚到服务器固定的安全版本（由值班人员在事件期间设置）",
			)
			.action(
				async (
					target?: string,
					options?: {
						list?: boolean;
						dryRun?: boolean;
						safe?: boolean;
					},
				) => {
					const { rollback } = await import("src/cli/rollback.js");
					await rollback(target, options);
				},
			);
	}

	// claude install
	program
		.command("install [target]")
		.description(
			"安装 Claude Code 原生构建。使用 [target] 指定版本（stable、latest 或特定版本）",
		)
		.option("--force", "即使已安装也强制安装")
		.action(
			async (
				target: string | undefined,
				options: { force?: boolean },
			) => {
				const { installHandler } =
					await import("./cli/handlers/util.js");
				await installHandler(target, options);
			},
		);

	// claude update — update ccb to the latest version via npm or bun
	program
		.command("update")
		.description("Update claude-code-best (ccb) to the latest version")
		.action(async () => {
			const { updateCCB } = await import("./cli/updateCCB.js");
			await updateCCB();
		});

	// ant-only commands
	if (process.env.USER_TYPE === "ant") {
		const validateLogId = (value: string) => {
			const maybeSessionId = validateUuid(value);
			if (maybeSessionId) return maybeSessionId;
			return Number(value);
		};
		// claude log
		program
			.command("log")
			.description("[ANT-ONLY] 管理对话日志。")
			.argument(
				"[number|sessionId]",
				"一个数字（0、1、2 等）用于显示特定日志，或日志的会话 ID（uuid）",
				validateLogId,
			)
			.action(async (logId: string | number | undefined) => {
				const { logHandler } = await import("./cli/handlers/ant.js");
				await logHandler(logId);
			});

		// claude error
		program
			.command("error")
			.description(
				"[ANT-ONLY] 查看错误日志。可选提供一个数字（0、-1、-2 等）来显示特定日志。",
			)
			.argument(
				"[number]",
				"一个数字（0、1、2 等）用于显示特定日志",
				parseInt,
			)
			.action(async (number: number | undefined) => {
				const { errorHandler } = await import("./cli/handlers/ant.js");
				await errorHandler(number);
			});

		// claude export
		program
			.command("export")
			.description("[ANT-ONLY] 将会话导出为文本文件。")
			.usage("<source> <outputFile>")
			.argument(
				"<source>",
				"会话 ID、日志索引（0、1、2...）或 .json/.jsonl 日志文件的路径",
			)
			.argument("<outputFile>", "导出文本的输出文件路径")
			.addHelpText(
				"after",
				`
示例：
  $ claude export 0 conversation.txt                导出日志索引 0 处的对话
  $ claude export <uuid> conversation.txt           按会话 ID 导出对话
  $ claude export input.json output.txt             将 JSON 日志文件渲染为文本
  $ claude export <uuid>.jsonl output.txt           将 JSONL 会话文件渲染为文本`,
			)
			.action(async (source: string, outputFile: string) => {
				const { exportHandler } = await import("./cli/handlers/ant.js");
				await exportHandler(source, outputFile);
			});

		if (process.env.USER_TYPE === "ant") {
			const taskCmd = program
				.command("task")
				.description("[ANT-ONLY] 管理任务列表任务");

			taskCmd
				.command("create <subject>")
				.description("创建新任务")
				.option("-d, --description <text>", "任务描述")
				.option(
					"-l, --list <id>",
					'任务列表 ID（默认为 "tasklist"）',
				)
				.action(
					async (
						subject: string,
						opts: { description?: string; list?: string },
					) => {
						const { taskCreateHandler } =
							await import("./cli/handlers/ant.js");
						await taskCreateHandler(subject, opts);
					},
				);

			taskCmd
				.command("list")
				.description("列出所有任务")
				.option(
					"-l, --list <id>",
					'任务列表 ID（默认为 "tasklist"）',
				)
				.option("--pending", "仅显示待处理任务")
				.option("--json", "输出为 JSON")
				.action(
					async (opts: {
						list?: string;
						pending?: boolean;
						json?: boolean;
					}) => {
						const { taskListHandler } =
							await import("./cli/handlers/ant.js");
						await taskListHandler(opts);
					},
				);

			taskCmd
				.command("get <id>")
				.description("获取任务的详细信息")
				.option(
					"-l, --list <id>",
					'任务列表 ID（默认为 "tasklist"）',
				)
				.action(async (id: string, opts: { list?: string }) => {
					const { taskGetHandler } =
						await import("./cli/handlers/ant.js");
					await taskGetHandler(id, opts);
				});

			taskCmd
				.command("update <id>")
				.description("更新任务")
				.option(
					"-l, --list <id>",
					'任务列表 ID（默认为 "tasklist"）',
				)
				.option(
					"-s, --status <status>",
					`设置状态（${TASK_STATUSES.join(", ")}）`,
				)
				.option("--subject <text>", "更新主题")
				.option("-d, --description <text>", "更新描述")
				.option("--owner <agentId>", "设置负责人")
				.option("--clear-owner", "清除负责人")
				.action(
					async (
						id: string,
						opts: {
							list?: string;
							status?: string;
							subject?: string;
							description?: string;
							owner?: string;
							clearOwner?: boolean;
						},
					) => {
						const { taskUpdateHandler } =
							await import("./cli/handlers/ant.js");
						await taskUpdateHandler(id, opts);
					},
				);

			taskCmd
				.command("dir")
				.description("显示任务目录路径")
				.option(
					"-l, --list <id>",
					'任务列表 ID（默认为 "tasklist"）',
				)
				.action(async (opts: { list?: string }) => {
					const { taskDirHandler } =
						await import("./cli/handlers/ant.js");
					await taskDirHandler(opts);
				});
		}

		// claude completion <shell>
		program
			.command("completion <shell>", { hidden: true })
			.description(
				"生成 shell 自动补全脚本（bash、zsh 或 fish）",
			)
			.option(
				"--output <file>",
				"将自动补全脚本直接写入文件，而非输出到 stdout",
			)
			.action(async (shell: string, opts: { output?: string }) => {
				const { completionHandler } =
					await import("./cli/handlers/ant.js");
				await completionHandler(shell, opts, program);
			});
	}

	profileCheckpoint("run_before_parse");
	await program.parseAsync(process.argv);
	profileCheckpoint("run_after_parse");

	// 记录最终检查点以计算总时间
	profileCheckpoint("main_after_run");

	// 将启动性能日志记录到 Statsig（采样），如果启用则输出详细报告
	profileReport();

	return program;
}

async function logTenguInit({
	hasInitialPrompt,
	hasStdin,
	verbose,
	debug,
	debugToStderr,
	print,
	outputFormat,
	inputFormat,
	numAllowedTools,
	numDisallowedTools,
	mcpClientCount,
	worktreeEnabled,
	skipWebFetchPreflight,
	githubActionInputs,
	dangerouslySkipPermissionsPassed,
	permissionMode,
	modeIsBypass,
	allowDangerouslySkipPermissionsPassed,
	systemPromptFlag,
	appendSystemPromptFlag,
	thinkingConfig,
	assistantActivationPath,
}: {
	hasInitialPrompt: boolean;
	hasStdin: boolean;
	verbose: boolean;
	debug: boolean;
	debugToStderr: boolean;
	print: boolean;
	outputFormat: string;
	inputFormat: string;
	numAllowedTools: number;
	numDisallowedTools: number;
	mcpClientCount: number;
	worktreeEnabled: boolean;
	skipWebFetchPreflight: boolean | undefined;
	githubActionInputs: string | undefined;
	dangerouslySkipPermissionsPassed: boolean;
	permissionMode: string;
	modeIsBypass: boolean;
	allowDangerouslySkipPermissionsPassed: boolean;
	systemPromptFlag: "file" | "flag" | undefined;
	appendSystemPromptFlag: "file" | "flag" | undefined;
	thinkingConfig: ThinkingConfig;
	assistantActivationPath: string | undefined;
}): Promise<void> {
	try {
		logEvent("tengu_init", {
			entrypoint:
				"claude" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
			hasInitialPrompt,
			hasStdin,
			verbose,
			debug,
			debugToStderr,
			print,
			outputFormat:
				outputFormat as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
			inputFormat:
				inputFormat as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
			numAllowedTools,
			numDisallowedTools,
			mcpClientCount,
			worktree: worktreeEnabled,
			skipWebFetchPreflight,
			...(githubActionInputs && {
				githubActionInputs:
					githubActionInputs as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
			}),
			dangerouslySkipPermissionsPassed,
			permissionMode:
				permissionMode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
			modeIsBypass,
			inProtectedNamespace: isInProtectedNamespace(),
			allowDangerouslySkipPermissionsPassed,
			thinkingType:
				thinkingConfig.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
			...(systemPromptFlag && {
				systemPromptFlag:
					systemPromptFlag as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
			}),
			...(appendSystemPromptFlag && {
				appendSystemPromptFlag:
					appendSystemPromptFlag as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
			}),
			is_simple: isBareMode() || undefined,
			is_coordinator:
				feature("COORDINATOR_MODE") &&
				coordinatorModeModule?.isCoordinatorMode()
					? true
					: undefined,
			...(assistantActivationPath && {
				assistantActivationPath:
					assistantActivationPath as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
			}),
			autoUpdatesChannel: (getInitialSettings().autoUpdatesChannel ??
				"latest") as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
			...(process.env.USER_TYPE === "ant"
				? (() => {
						const cwd = getCwd();
						const gitRoot = findGitRoot(cwd);
						const rp = gitRoot
							? relative(gitRoot, cwd) || "."
							: undefined;
						return rp
							? {
									relativeProjectPath:
										rp as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
								}
							: {};
					})()
				: {}),
		});
	} catch (error) {
		logError(error);
	}
}

function maybeActivateProactive(options: unknown): void {
	if (
		(feature("PROACTIVE") || feature("KAIROS")) &&
		((options as { proactive?: boolean }).proactive ||
			isEnvTruthy(process.env.CLAUDE_CODE_PROACTIVE))
	) {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const proactiveModule = require("./proactive/index.js");
		if (!proactiveModule.isProactiveActive()) {
			proactiveModule.activateProactive("command");
		}
	}
}

function maybeActivateBrief(options: unknown): void {
	if (!(feature("KAIROS") || feature("KAIROS_BRIEF"))) return;
	const briefFlag = (options as { brief?: boolean }).brief;
	const briefEnv = isEnvTruthy(process.env.CLAUDE_CODE_BRIEF);
	if (!briefFlag && !briefEnv) return;
	// --brief / CLAUDE_CODE_BRIEF 是显式选择加入：检查授
	// 权，然后设置 userMsgOptIn 以激活工具和提示部分。环境变量也授予授
	// 权（isBriefEntitled() 会读取它），因此仅设置 CLAUDE_
	// CODE_BRIEF=1 即可强制为开发/测试启用——无需 GB 门控。ini
	// tialIsBriefOnly 直接读取 getUserMsgOpt
	// In()。条件性 require：静态导入会通过 BriefTool.ts
	// → prompt.ts 将工具名称字符串泄漏到外部构建中。
	/* eslint-disable @typescript-eslint/no-require-imports */
	const { isBriefEntitled } =
		require("@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js") as typeof import("@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js");
	/* eslint-enable @typescript-eslint/no-require-imports */
	const entitled = isBriefEntitled();
	if (entitled) {
		setUserMsgOptIn(true);
	}
	// 一旦检测到意图就无条件触发：enabled=false 用于捕获
	// Datadog 中“用户尝试但被阻止”的失败模式。
	logEvent("tengu_brief_mode_enabled", {
		enabled: entitled,
		gated: !entitled,
		source: (briefEnv
			? "env"
			: "flag") as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
	});
}

function resetCursor() {
	const terminal = process.stderr.isTTY
		? process.stderr
		: process.stdout.isTTY
			? process.stdout
			: undefined;
	terminal?.write(SHOW_CURSOR);
}

type TeammateOptions = {
	agentId?: string;
	agentName?: string;
	teamName?: string;
	agentColor?: string;
	planModeRequired?: boolean;
	parentSessionId?: string;
	teammateMode?: "auto" | "tmux" | "in-process";
	agentType?: string;
};

function extractTeammateOptions(options: unknown): TeammateOptions {
	if (typeof options !== "object" || options === null) {
		return {};
	}
	const opts = options as Record<string, unknown>;
	const teammateMode = opts.teammateMode;
	return {
		agentId: typeof opts.agentId === "string" ? opts.agentId : undefined,
		agentName:
			typeof opts.agentName === "string" ? opts.agentName : undefined,
		teamName: typeof opts.teamName === "string" ? opts.teamName : undefined,
		agentColor:
			typeof opts.agentColor === "string" ? opts.agentColor : undefined,
		planModeRequired:
			typeof opts.planModeRequired === "boolean"
				? opts.planModeRequired
				: undefined,
		parentSessionId:
			typeof opts.parentSessionId === "string"
				? opts.parentSessionId
				: undefined,
		teammateMode:
			teammateMode === "auto" ||
			teammateMode === "tmux" ||
			teammateMode === "in-process"
				? teammateMode
				: undefined,
		agentType:
			typeof opts.agentType === "string" ? opts.agentType : undefined,
	};
}

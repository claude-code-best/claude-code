import axios from 'axios';
import chalk from 'chalk';
import { randomUUID } from 'crypto';
import React from 'react';
import { getOriginalCwd, getSessionId } from 'src/bootstrap/state.js';
import { checkGate_CACHED_OR_BLOCKING } from 'src/services/analytics/growthbook.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import { isPolicyAllowed } from 'src/services/policyLimits/index.js';
import { z } from 'zod/v4';
import { getTeleportErrors, TeleportError, type TeleportLocalErrorType } from '../components/TeleportError.js';
import { getOauthConfig } from '../constants/oauth.js';
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js';
import type { Root } from '@anthropic/ink';
import { KeybindingSetup } from '../keybindings/KeybindingProviderSetup.js';
import { queryHaiku } from '../services/api/claude.js';
import { getSessionLogsViaOAuth, getTeleportEvents } from '../services/api/sessionIngress.js';
import { getOrganizationUUID } from '../services/oauth/client.js';
import { AppStateProvider } from '../state/AppState.js';
import type { Message, SystemMessage } from '../types/message.js';
import type { PermissionMode } from '../types/permissions.js';
import { checkAndRefreshOAuthTokenIfNeeded, getClaudeAIOAuthTokens } from './auth.js';
import { checkGithubAppInstalled } from './background/remote/preconditions.js';
import { deserializeMessages, type TeleportRemoteResponse } from './conversationRecovery.js';
import { getCwd } from './cwd.js';
import { logForDebugging } from './debug.js';
import { detectCurrentRepositoryWithHost, parseGitHubRepository, parseGitRemote } from './detectRepository.js';
import { isEnvTruthy } from './envUtils.js';
import { TeleportOperationError, toError } from './errors.js';
import { execFileNoThrow } from './execFileNoThrow.js';
import { truncateToWidth } from './format.js';
import { findGitRoot, getDefaultBranch, getIsClean, gitExe } from './git.js';
import { safeParseJSON } from './json.js';
import { logError } from './log.js';
import { createSystemMessage, createUserMessage } from './messages.js';
import { getMainLoopModel } from './model/model.js';
import { isTranscriptMessage } from './sessionStorage.js';
import { getSettings_DEPRECATED } from './settings/settings.js';
import { jsonStringify } from './slowOperations.js';
import { asSystemPrompt } from './systemPromptType.js';
import {
  fetchSession,
  type GitRepositoryOutcome,
  type GitSource,
  getBranchFromSession,
  getOAuthHeaders,
  type SessionResource,
} from './teleport/api.js';
import { fetchEnvironments } from './teleport/environments.js';
import { createAndUploadGitBundle } from './teleport/gitBundle.js';

export type TeleportResult = {
  messages: Message[];
  branchName: string;
};

export type TeleportProgressStep = 'validating' | 'fetching_logs' | 'fetching_branch' | 'checking_out' | 'done';

export type TeleportProgressCallback = (step: TeleportProgressStep) => void;

/**
 * Creates a system message to inform about teleport session resume
 * @returns SystemMessage indicating session was resumed from another machine
 */
function createTeleportResumeSystemMessage(branchError: Error | null): SystemMessage {
  if (branchError === null) {
    return createSystemMessage('Session resumed', 'suggestion');
  }
  const formattedError =
    branchError instanceof TeleportOperationError ? branchError.formattedMessage : branchError.message;
  return createSystemMessage(`Session resumed without branch: ${formattedError}`, 'warning');
}

/** 创建用户消息，通知模型远程会话恢复
@returns 返回表示会话从另一台机器恢复的用户消息 */
function createTeleportResumeUserMessage() {
  return createUserMessage({
    content: `此会话正从另一台机器继续。应用程序状态可能已更改。更新后的工作目录是 ${getOriginalCwd()}`,
    isMeta: true,
  });
}

type TeleportToRemoteResponse = {
  id: string;
  title: string;
};

const SESSION_TITLE_AND_BRANCH_PROMPT = `请根据提供的描述，为编码会话构思一个简洁的标题和 git 分支名称。标题应清晰、简洁，准确反映编码任务的内容。
标题应简短明了，最好不超过 6 个词。除非绝对必要，避免使用行话或过于技术性的术语。标题应易于任何阅读者理解。
标题使用句子大小写（仅首单词和专有名词大写），而非标题大小写。

分支名称应清晰、简洁，准确反映编码任务的内容。
分支应简短，最好不超过 4 个词。分支名称始终以 "claude/" 开头，全部小写，单词间用短横线分隔。

返回一个包含 "title" 和 "branch" 字段的 JSON 对象。

示例 1：{"title": "修复移动端登录按钮不工作", "branch": "claude/fix-mobile-login-button"}
示例 2：{"title": "更新 README 添加安装说明", "branch": "claude/update-readme"}
示例 3：{"title": "改进数据处理脚本性能", "branch": "claude/improve-data-processing"}

以下是会话描述：
<description>{description}</description>
Please generate a title and branch name for this session.`;

type TitleAndBranch = {
  title: string;
  branchName: string;
};

/**
 * Generates a title and branch name for a coding session using Claude Haiku
 * @param description The description/prompt for the session
 * @returns Promise<TitleAndBranch> The generated title and branch name
 */
async function generateTitleAndBranch(description: string, signal: AbortSignal): Promise<TitleAndBranch> {
  const fallbackTitle = truncateToWidth(description, 75);
  const fallbackBranch = 'claude/task';

  try {
    const userPrompt = SESSION_TITLE_AND_BRANCH_PROMPT.replace('{description}', description);

    const response = await queryHaiku({
      systemPrompt: asSystemPrompt([]),
      userPrompt,
      outputFormat: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            branch: { type: 'string' },
          },
          required: ['title', 'branch'],
          additionalProperties: false,
        },
      },
      signal,
      options: {
        querySource: 'teleport_generate_title',
        agents: [],
        isNonInteractiveSession: false,
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    });

    // Extract text from the response
    const firstBlock = response.message!.content?.[0] as { type?: string; text?: string } | undefined;
    if (firstBlock?.type !== 'text') {
      return { title: fallbackTitle, branchName: fallbackBranch };
    }

    const parsed = safeParseJSON(firstBlock.text!.trim());
    const parseResult = z.object({ title: z.string(), branch: z.string() }).safeParse(parsed);
    if (parseResult.success) {
      return {
        title: parseResult.data.title || fallbackTitle,
        branchName: parseResult.data.branch || fallbackBranch,
      };
    }

    return { title: fallbackTitle, branchName: fallbackBranch };
  } catch (error) {
    logError(new Error(`Error generating title and branch: ${error}`));
    return { title: fallbackTitle, branchName: fallbackBranch };
  }
}

/** 验证 git 工作目录是否干净（忽略未跟踪文件）
忽略未跟踪文件是因为它们在分支切换时不会丢失 */
export async function validateGitState(): Promise<void> {
  const isClean = await getIsClean({ ignoreUntracked: true });
  if (!isClean) {
    logEvent('tengu_teleport_error_git_not_clean', {});
    const error = new TeleportOperationError(
      'Git 工作目录不干净。使用 --teleport 前请提交或暂存您的更改。',
      chalk.red('错误：Git 工作目录不干净。使用 --teleport 前请提交或暂存您的更改。\n'),
    );
    throw error;
  }
}

/** 从远程 origin 获取特定分支
@param branch 要获取的分支。如果未指定，则获取所有分支。 */
async function fetchFromOrigin(branch?: string): Promise<void> {
  const fetchArgs = branch ? ['fetch', 'origin', `${branch}:${branch}`] : ['fetch', 'origin'];

  const { code: fetchCode, stderr: fetchStderr } = await execFileNoThrow(gitExe(), fetchArgs);
  if (fetchCode !== 0) {
    // 如果获取特定分支失败，可能该分支在本地尚不存
    // 在。尝试仅获取引用而不映射到本地分支
    if (branch && fetchStderr.includes('refspec')) {
      logForDebugging(`Specific branch fetch failed, trying to fetch ref: ${branch}`);
      const { code: refFetchCode, stderr: refFetchStderr } = await execFileNoThrow(gitExe(), [
        'fetch',
        'origin',
        branch,
      ]);
      if (refFetchCode !== 0) {
        logError(new Error(`Failed to fetch from remote origin: ${refFetchStderr}`));
      }
    } else {
      logError(new Error(`Failed to fetch from remote origin: ${fetchStderr}`));
    }
  }
}

/** 确保当前分支已设置上游
如果未设置，且远程分支 origin/<branchName> 存在，则将其设置为上游 */
async function ensureUpstreamIsSet(branchName: string): Promise<void> {
  // 检查上游是否已设置
  const { code: upstreamCheckCode } = await execFileNoThrow(gitExe(), [
    'rev-parse',
    '--abbrev-ref',
    `${branchName}@{upstream}`,
  ]);

  if (upstreamCheckCode === 0) {
    // Upstream is already set
    logForDebugging(`Branch '${branchName}' already has upstream set`);
    return;
  }

  // Check if origin/<branchName> exists
  const { code: remoteCheckCode } = await execFileNoThrow(gitExe(), ['rev-parse', '--verify', `origin/${branchName}`]);

  if (remoteCheckCode === 0) {
    // Remote branch exists, set upstream
    logForDebugging(`Setting upstream for '${branchName}' to 'origin/${branchName}'`);
    const { code: setUpstreamCode, stderr: setUpstreamStderr } = await execFileNoThrow(gitExe(), [
      'branch',
      '--set-upstream-to',
      `origin/${branchName}`,
      branchName,
    ]);

    if (setUpstreamCode !== 0) {
      logForDebugging(`Failed to set upstream for '${branchName}': ${setUpstreamStderr}`);
      // Don't throw, just log - this is not critical
    } else {
      logForDebugging(`Successfully set upstream for '${branchName}'`);
    }
  } else {
    logForDebugging(`Remote branch 'origin/${branchName}' does not exist, skipping upstream setup`);
  }
}

/** 检出特定分支 */
async function checkoutBranch(branchName: string): Promise<void> {
  // First try to checkout the branch as-is (might be local)
  let { code: checkoutCode, stderr: checkoutStderr } = await execFileNoThrow(gitExe(), ['checkout', branchName]);

  // 如果失败，尝试从 origin 检出
  if (checkoutCode !== 0) {
    logForDebugging(`Local checkout failed, trying to checkout from origin: ${checkoutStderr}`);

    // Try to checkout the remote branch and create a local tracking branch
    const result = await execFileNoThrow(gitExe(), ['checkout', '-b', branchName, '--track', `origin/${branchName}`]);

    checkoutCode = result.code;
    checkoutStderr = result.stderr;

    // 如果这也失败，尝试不使用 -b 参数（以防分支存在但未检出）
    if (checkoutCode !== 0) {
      logForDebugging(`Remote checkout with -b failed, trying without -b: ${checkoutStderr}`);
      const finalResult = await execFileNoThrow(gitExe(), ['checkout', '--track', `origin/${branchName}`]);
      checkoutCode = finalResult.code;
      checkoutStderr = finalResult.stderr;
    }
  }

  if (checkoutCode !== 0) {
    logEvent('tengu_teleport_error_branch_checkout_failed', {});
    throw new TeleportOperationError(
      `Failed to checkout branch '${branchName}': ${checkoutStderr}`,
      chalk.red(`Failed to checkout branch '${branchName}'\n`),
    );
  }

  // After successful checkout, ensure upstream is set
  await ensureUpstreamIsSet(branchName);
}

/** 获取当前分支名称 */
async function getCurrentBranch(): Promise<string> {
  const { stdout: currentBranch } = await execFileNoThrow(gitExe(), ['branch', '--show-current']);
  return currentBranch.trim();
}

/**
 * Processes messages for teleport resume, removing incomplete tool_use blocks
 * and adding teleport notice messages
 * @param messages The conversation messages
 * @param error Optional error from branch checkout
 * @returns Processed messages ready for resume
 */
export function processMessagesForTeleportResume(messages: Message[], error: Error | null): Message[] {
  // Shared logic with resume for handling interruped session transcripts
  const deserializedMessages = deserializeMessages(messages);

  // 添加关于远程恢复的用户消息（对模型可见）
  const messagesWithTeleportNotice = [
    ...deserializedMessages,
    createTeleportResumeUserMessage(),
    createTeleportResumeSystemMessage(error),
  ];

  return messagesWithTeleportNotice;
}

/** 为远程会话检出指定分支
@param branch 要检出的可选分支
@returns 当前分支名称和发生的任何错误 */
export async function checkOutTeleportedSessionBranch(
  branch?: string,
): Promise<{ branchName: string; branchError: Error | null }> {
  try {
    const currentBranch = await getCurrentBranch();
    logForDebugging(`Current branch before teleport: '${currentBranch}'`);

    if (branch) {
      logForDebugging(`Switching to branch '${branch}'...`);
      await fetchFromOrigin(branch);
      await checkoutBranch(branch);
      const newBranch = await getCurrentBranch();
      logForDebugging(`Branch after checkout: '${newBranch}'`);
    } else {
      logForDebugging('No branch specified, staying on current branch');
    }

    const branchName = await getCurrentBranch();
    return { branchName, branchError: null };
  } catch (error) {
    const branchName = await getCurrentBranch();
    const branchError = toError(error);
    return { branchName, branchError };
  }
}

/** 远程操作的仓库验证结果 */
export type RepoValidationResult = {
  status: 'match' | 'mismatch' | 'not_in_repo' | 'no_repo_required' | 'error';
  sessionRepo?: string;
  currentRepo?: string | null;
  /** Host of the session repo (e.g. "github.com" or "ghe.corp.com") — for display only */
  sessionHost?: string;
  /** Host of the current repo (e.g. "github.com" or "ghe.corp.com") — for display only */
  currentHost?: string;
  errorMessage?: string;
};

/**
 * Validates that the current repository matches the session's repository.
 * Returns a result object instead of throwing, allowing the caller to handle mismatches.
 *
 * @param sessionData The session resource to validate against
 * @returns Validation result with status and repo information
 */
export async function validateSessionRepository(sessionData: SessionResource): Promise<RepoValidationResult> {
  const currentParsed = await detectCurrentRepositoryWithHost();
  const currentRepo = currentParsed ? `${currentParsed.owner}/${currentParsed.name}` : null;

  const gitSource = sessionData.session_context.sources.find(
    (source): source is GitSource => source.type === 'git_repository',
  );

  if (!gitSource?.url) {
    // 会话无仓库要求
    logForDebugging(
      currentRepo
        ? 'Session has no associated repository, proceeding without validation'
        : 'Session has no repo requirement and not in git directory, proceeding',
    );
    return { status: 'no_repo_required' };
  }

  const sessionParsed = parseGitRemote(gitSource.url);
  const sessionRepo = sessionParsed
    ? `${sessionParsed.owner}/${sessionParsed.name}`
    : parseGitHubRepository(gitSource.url);
  if (!sessionRepo) {
    return { status: 'no_repo_required' };
  }

  logForDebugging(`Session is for repository: ${sessionRepo}, current repo: ${currentRepo ?? 'none'}`);

  if (!currentRepo) {
    // 不在 git 仓库中，但会话需要仓库
    return {
      status: 'not_in_repo',
      sessionRepo,
      sessionHost: sessionParsed?.host,
      currentRepo: null,
    };
  }

  // Compare both owner/repo and host to avoid cross-instance mismatches.
  // Strip ports before comparing hosts — SSH remotes omit the port while
  // HTTPS remotes may include a non-standard port (e.g. ghe.corp.com:8443),
  // which would cause a false mismatch.
  const stripPort = (host: string): string => host.replace(/:\d+$/, '');
  const repoMatch = currentRepo.toLowerCase() === sessionRepo.toLowerCase();
  const hostMatch =
    !currentParsed ||
    !sessionParsed ||
    stripPort(currentParsed.host.toLowerCase()) === stripPort(sessionParsed.host.toLowerCase());

  if (repoMatch && hostMatch) {
    return {
      status: 'match',
      sessionRepo,
      currentRepo,
    };
  }

  // 仓库不匹配 — 保持 sessionRepo/currentRepo 为纯
  // "owner/repo" 格式，以便下游使用者（例如 getKnownPathsF
  // orRepo）可将其用作查找键。将主机信息包含在单独的字段中用于显示。
  return {
    status: 'mismatch',
    sessionRepo,
    currentRepo,
    sessionHost: sessionParsed?.host,
    currentHost: currentParsed?.host,
  };
}

/** 处理从代码会话 ID 远程传输。
获取会话日志并验证仓库。
@param sessionId 要恢复的会话 ID
@param onProgress 进度更新的可选回调
@returns 原始会话日志和分支名称 */
export async function teleportResumeCodeSession(
  sessionId: string,
  onProgress?: TeleportProgressCallback,
): Promise<TeleportRemoteResponse> {
  if (!isPolicyAllowed('allow_remote_sessions')) {
    throw new Error("Remote sessions are disabled by your organization's policy.");
  }

  logForDebugging(`Resuming code session ID: ${sessionId}`);

  try {
    const accessToken = getClaudeAIOAuthTokens()?.accessToken;
    if (!accessToken) {
      logEvent('tengu_teleport_resume_error', {
        error_type: 'no_access_token' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      throw new Error(
        'Claude Code web sessions require authentication with a Claude.ai account. API key authentication is not sufficient. Please run /login to authenticate, or check your authentication status with /status.',
      );
    }

    // Get organization UUID
    const orgUUID = await getOrganizationUUID();
    if (!orgUUID) {
      logEvent('tengu_teleport_resume_error', {
        error_type: 'no_org_uuid' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      throw new Error('Unable to get organization UUID for constructing session URL');
    }

    // Fetch and validate repository matches before resuming
    onProgress?.('validating');
    const sessionData = await fetchSession(sessionId);
    const repoValidation = await validateSessionRepository(sessionData);

    switch (repoValidation.status) {
      case 'match':
      case 'no_repo_required':
        // Proceed with teleport
        break;
      case 'not_in_repo': {
        logEvent('tengu_teleport_error_repo_not_in_git_dir_sessions_api', {
          sessionId: sessionId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        });
        // Include host for GHE users so they know which instance the repo is on
        const notInRepoDisplay =
          repoValidation.sessionHost && repoValidation.sessionHost.toLowerCase() !== 'github.com'
            ? `${repoValidation.sessionHost}/${repoValidation.sessionRepo}`
            : repoValidation.sessionRepo;
        throw new TeleportOperationError(
          `您必须在 ${notInRepoDisplay} 的检出中运行 claude --teleport ${sessionId}。`,
          chalk.red(
            `您必须在 ${chalk.bold(notInRepoDisplay)} 的检出中运行 claude --teleport ${sessionId}。
`,
          ),
        );
      }
      case 'mismatch': {
        logEvent('tengu_teleport_error_repo_mismatch_sessions_api', {
          sessionId: sessionId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        });
        // Only include host prefix when hosts actually differ to disambiguate
        // cross-instance mismatches; for same-host mismatches the host is noise.
        const hostsDiffer =
          repoValidation.sessionHost &&
          repoValidation.currentHost &&
          repoValidation.sessionHost.replace(/:\d+$/, '').toLowerCase() !==
            repoValidation.currentHost.replace(/:\d+$/, '').toLowerCase();
        const sessionDisplay = hostsDiffer
          ? `${repoValidation.sessionHost}/${repoValidation.sessionRepo}`
          : repoValidation.sessionRepo;
        const currentDisplay = hostsDiffer
          ? `${repoValidation.currentHost}/${repoValidation.currentRepo}`
          : repoValidation.currentRepo;
        throw new TeleportOperationError(
          `您必须在 ${sessionDisplay} 的检出中运行 claude --teleport ${sessionId}。
当前仓库是 ${currentDisplay}。`,
          chalk.red(
            `您必须在 ${chalk.bold(sessionDisplay)} 的检出中运行 claude --teleport ${sessionId}。
当前仓库是 ${chalk.bold(currentDisplay)}。
`,
          ),
        );
      }
      case 'error':
        throw new TeleportOperationError(
          repoValidation.errorMessage || 'Failed to validate session repository',
          chalk.red(`Error: ${repoValidation.errorMessage || 'Failed to validate session repository'}\n`),
        );
      default: {
        const _exhaustive: never = repoValidation.status;
        throw new Error(`Unhandled repo validation status: ${_exhaustive}`);
      }
    }

    return await teleportFromSessionsAPI(sessionId, orgUUID, accessToken, onProgress, sessionData);
  } catch (error) {
    if (error instanceof TeleportOperationError) {
      throw error;
    }

    const err = toError(error);
    logError(err);
    logEvent('tengu_teleport_resume_error', {
      error_type: 'resume_session_id_catch' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });

    throw new TeleportOperationError(err.message, chalk.red(`Error: ${err.message}\n`));
  }
}

/**
 * Helper function to handle teleport prerequisites (authentication and git state)
 * Shows TeleportError dialog rendered into the existing root if needed
 */
async function handleTeleportPrerequisites(root: Root, errorsToIgnore?: Set<TeleportLocalErrorType>): Promise<void> {
  const errors = await getTeleportErrors();
  if (errors.size > 0) {
    // 记录检测到的远程传输错误
    logEvent('tengu_teleport_errors_detected', {
      error_types: Array.from(errors).join(',') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      errors_ignored: Array.from(errorsToIgnore || []).join(
        ',',
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });

    // 显示 TeleportError 对话框供用户交互
    await new Promise<void>(resolve => {
      root.render(
        <AppStateProvider>
          <KeybindingSetup>
            <TeleportError
              errorsToIgnore={errorsToIgnore}
              onComplete={() => {
                // 记录错误解决时
                logEvent('tengu_teleport_errors_resolved', {
                  error_types: Array.from(errors).join(
                    ',',
                  ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                });
                void resolve();
              }}
            />
          </KeybindingSetup>
        </AppStateProvider>,
      );
    });
  }
}

/** 创建远程 Claude.ai 会话，包含错误处理和 UI 反馈。
如果需要，在现有根中显示先决条件错误对话框。
@param root 用于渲染对话框的现有 Ink 根
@param description 新会话的描述/提示（null 表示无初始提示）
@param signal 用于取消的 AbortSignal
@param branchName 远程会话使用的可选分支名称
@returns Promise<TeleportToRemoteResponse | null> 创建的会话，如果创建失败则返回 null */
export async function teleportToRemoteWithErrorHandling(
  root: Root,
  description: string | null,
  signal: AbortSignal,
  branchName?: string,
): Promise<TeleportToRemoteResponse | null> {
  const errorsToIgnore = new Set<TeleportLocalErrorType>(['needsGitStash']);
  await handleTeleportPrerequisites(root, errorsToIgnore);
  return teleportToRemote({
    initialMessage: description,
    signal,
    branchName,
    onBundleFail: msg => process.stderr.write(`\n${msg}\n`),
  });
}

/** 从会话入口 API (/v1/session_ingress/) 获取会话数据
使用会话日志而非 SDK 事件来获取正确的消息结构
@param sessionId 要获取的会话 ID
@param orgUUID 组织 UUID
@param accessToken OAuth 访问令牌
@param onProgress 进度更新的可选回调
@param sessionData 可选会话数据（用于提取分支信息）
@returns 返回 TeleportRemoteResponse，其中会话日志以 Message[] 形式存储 */
export async function teleportFromSessionsAPI(
  sessionId: string,
  orgUUID: string,
  accessToken: string,
  onProgress?: TeleportProgressCallback,
  sessionData?: SessionResource,
): Promise<TeleportRemoteResponse> {
  const startTime = Date.now();

  try {
    // Fetch session logs via session ingress
    logForDebugging(`[teleport] Starting fetch for session: ${sessionId}`);
    onProgress?.('fetching_logs');

    const logsStartTime = Date.now();
    // Try CCR v2 first (GetTeleportEvents — server dispatches Spanner/
    // threadstore). Fall back to session-ingress if it returns null
    // (endpoint not yet deployed, or transient error). Once session-ingress
    // is gone, the fallback becomes a no-op — getSessionLogsViaOAuth will
    // return null too and we fail with "Failed to fetch session logs".
    let logs = await getTeleportEvents(sessionId, accessToken, orgUUID);
    if (logs === null) {
      logForDebugging('[teleport] v2 endpoint returned null, trying session-ingress');
      logs = await getSessionLogsViaOAuth(sessionId, accessToken, orgUUID);
    }
    logForDebugging(`[teleport] Session logs fetched in ${Date.now() - logsStartTime}ms`);

    if (logs === null) {
      throw new Error('Failed to fetch session logs');
    }

    // Filter to get only transcript messages, excluding sidechain messages
    const filterStartTime = Date.now();
    const messages = logs.filter(entry => isTranscriptMessage(entry) && !entry.isSidechain) as Message[];
    logForDebugging(
      `[teleport] Filtered ${logs.length} entries to ${messages.length} messages in ${Date.now() - filterStartTime}ms`,
    );

    // Extract branch info from session data
    onProgress?.('fetching_branch');
    const branch = sessionData ? getBranchFromSession(sessionData) : undefined;
    if (branch) {
      logForDebugging(`[teleport] Found branch: ${branch}`);
    }

    logForDebugging(`[teleport] Total teleportFromSessionsAPI time: ${Date.now() - startTime}ms`);

    return {
      log: messages,
      branch,
    };
  } catch (error) {
    const err = toError(error);

    // 专门处理 404 错误
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      logEvent('tengu_teleport_error_session_not_found_404', {
        sessionId: sessionId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      throw new TeleportOperationError(
        `${sessionId} not found.`,
        `${sessionId} not found.\n${chalk.dim('Run /status in Claude Code to check your account.')}`,
      );
    }

    logError(err);

    throw new Error(`Failed to fetch session from Sessions API: ${err.message}`);
  }
}

/** 轮询远程会话事件的响应类型（使用 SDK 事件格式） */
export type PollRemoteSessionResponse = {
  newEvents: SDKMessage[];
  lastEventId: string | null;
  branch?: string;
  sessionStatus?: 'idle' | 'running' | 'requires_action' | 'archived';
};

/** 轮询远程会话事件。将先前响应的 `lastEventId` 作为 `afterId` 传入以仅获取增量。设置 `skipMetadata` 以避免在不需要分支/状态时进行每次调用的 GET /v1/sessions/{id}。 */
export async function pollRemoteSessionEvents(
  sessionId: string,
  afterId: string | null = null,
  opts?: { skipMetadata?: boolean },
): Promise<PollRemoteSessionResponse> {
  const accessToken = getClaudeAIOAuthTokens()?.accessToken;
  if (!accessToken) {
    throw new Error('No access token for polling');
  }

  const orgUUID = await getOrganizationUUID();
  if (!orgUUID) {
    throw new Error('No org UUID for polling');
  }

  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'x-organization-uuid': orgUUID,
  };
  const eventsUrl = `${getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}/events`;

  type EventsResponse = {
    data: unknown[];
    has_more: boolean;
    first_id: string | null;
    last_id: string | null;
  };

  // Cap is a safety valve against stuck cursors; steady-state is 0–1 pages.
  const MAX_EVENT_PAGES = 50;
  const sdkMessages: SDKMessage[] = [];
  let cursor = afterId;
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const eventsResponse = await axios.get(eventsUrl, {
      headers,
      params: cursor ? { after_id: cursor } : undefined,
      timeout: 30000,
    });

    if (eventsResponse.status !== 200) {
      throw new Error(`Failed to fetch session events: ${eventsResponse.statusText}`);
    }

    const eventsData: EventsResponse = eventsResponse.data;
    if (!eventsData?.data || !Array.isArray(eventsData.data)) {
      throw new Error('Invalid events response');
    }

    for (const event of eventsData.data) {
      if (event && typeof event === 'object' && 'type' in event) {
        if (event.type === 'env_manager_log' || event.type === 'control_response') {
          continue;
        }
        if ('session_id' in event) {
          sdkMessages.push(event as SDKMessage);
        }
      }
    }

    if (!eventsData.last_id) break;
    cursor = eventsData.last_id;
    if (!eventsData.has_more) break;
  }

  if (opts?.skipMetadata) {
    return { newEvents: sdkMessages, lastEventId: cursor };
  }

  // Fetch session metadata (branch, status)
  let branch: string | undefined;
  let sessionStatus: PollRemoteSessionResponse['sessionStatus'];
  try {
    const sessionData = await fetchSession(sessionId);
    branch = getBranchFromSession(sessionData);
    sessionStatus = sessionData.session_status as PollRemoteSessionResponse['sessionStatus'];
  } catch (e) {
    logForDebugging(`teleport: failed to fetch session ${sessionId} metadata: ${e}`, { level: 'debug' });
  }

  return { newEvents: sdkMessages, lastEventId: cursor, branch, sessionStatus };
}

/** 使用 Sessions API 创建远程 Claude.ai 会话。

两种源模式：
- GitHub（默认）：后端从仓库的原始 URL 克隆。需要 GitHub 远程 + CCR 端的 GitHub 连接。43% 的 CLI 会话具有原始远程；通过完整先决条件链的比例要低得多。
- Bundle（CCR_FORCE_BUNDLE=1）：CLI 创建 `git bundle --all`，通过 Files API 上传，并将 file_id 作为 seed_bundle_file_id 传递到会话上下文中。CCR 下载它并从 bundle 克隆。不依赖 GitHub — 适用于仅本地的仓库。覆盖范围：54% 的 CLI 会话（任何具有 .git/ 的仓库）。后端：anthropic#303856。 */
export async function teleportToRemote(options: {
  initialMessage: string | null;
  branchName?: string;
  title?: string;
  /**
   * The description of the session. This is used to generate the title and
   * session branch name (unless they are explicitly provided).
   */
  description?: string;
  model?: string;
  permissionMode?: PermissionMode;
  ultraplan?: boolean;
  signal: AbortSignal;
  useDefaultEnvironment?: boolean;
  /**
   * Explicit environment_id (e.g. the code_review synthetic env). Bypasses
   * fetchEnvironments; the usual repo-detection → git source still runs so
   * the container gets the repo checked out (orchestrator reads --repo-dir
   * from pwd, it doesn't clone).
   */
  environmentId?: string;
  /**
   * Per-session env vars merged into session_context.environment_variables.
   * Write-only at the API layer (stripped from Get/List responses). When
   * environmentId is set, CLAUDE_CODE_OAUTH_TOKEN is auto-injected from the
   * caller's accessToken so the container's hook can hit inference (the
   * server only passes through what the caller sends; bughunter.go mints
   * its own, user sessions don't get one automatically).
   */
  environmentVariables?: Record<string, string>;
  /**
   * When set with environmentId, creates and uploads a git bundle of the
   * local working tree (createAndUploadGitBundle handles the stash-create
   * for uncommitted changes) and passes it as seed_bundle_file_id. Backend
   * clones from the bundle instead of GitHub — container gets the caller's
   * exact local state. Needs .git/ only, not a GitHub remote.
   */
  useBundle?: boolean;
  /**
   * Called with a user-facing message when the bundle path is attempted but
   * fails. The wrapper stderr.writes it (pre-REPL). Remote-agent callers
   * capture it to include in their throw (in-REPL, Ink-rendered).
   */
  onBundleFail?: (message: string) => void;

  onCreateFail?: (message: string) => void;
  /**
   * When true, disables the git-bundle fallback entirely. Use for flows like
   * autofix where CCR must push to GitHub — a bundle can't do that.
   */
  skipBundle?: boolean;
  /**
   * When set, reuses this branch as the outcome branch instead of generating
   * a new claude/ branch. Sets allow_unrestricted_git_push on the source and
   * reuse_outcome_branches on the session context so the remote pushes to the
   * caller's branch directly.
   */
  reuseOutcomeBranch?: string;
  /**
   * GitHub PR to attach to the session context. Backend uses this to
   * identify the PR associated with this session.
   */
  githubPr?: { owner: string; repo: string; number: number };
}): Promise<TeleportToRemoteResponse | null> {
  const { initialMessage, signal } = options;
  try {
    // Check authentication
    await checkAndRefreshOAuthTokenIfNeeded();
    const accessToken = getClaudeAIOAuthTokens()?.accessToken;
    if (!accessToken) {
      logError(new Error('No access token found for remote session creation'));
      return null;
    }

    // Get organization UUID
    const orgUUID = await getOrganizationUUID();
    if (!orgUUID) {
      logError(new Error('Unable to get organization UUID for remote session creation'));
      return null;
    }

    // 显式的 environmentId 会绕过 Haiku 标题生成 + 环
    // 境选择。仍运行仓库检测，以便容器获得工作目录 — code_revie
    // w 编排器读取 --repo-dir $(pwd)，它不克隆（bughu
    // nter.go:520 也设置了 git 源；环境管理器在 Sessio
    // nStart 钩子触发之前执行检出）。
    if (options.environmentId) {
      const url = `${getOauthConfig().BASE_API_URL}/v1/sessions`;
      const headers = {
        ...getOAuthHeaders(accessToken),
        'anthropic-beta': 'ccr-byoc-2025-07-29',
        'x-organization-uuid': orgUUID,
      };
      const envVars = {
        CLAUDE_CODE_OAUTH_TOKEN: accessToken,
        ...(options.environmentVariables ?? {}),
      };

      // Bundle mode: upload local working tree (uncommitted changes via
      // refs/seed/stash), container clones from the bundle. No GitHub.
      // Otherwise: github.com source — caller checked eligibility.
      let gitSource: GitSource | null = null;
      let seedBundleFileId: string | null = null;
      if (options.useBundle) {
        const bundle = await createAndUploadGitBundle(
          {
            oauthToken: accessToken,
            sessionId: getSessionId(),
            baseUrl: getOauthConfig().BASE_API_URL,
          },
          { signal },
        );
        if (!bundle.success) {
          const failBundle = bundle as { success: false; error: string; failReason?: string };
          logError(new Error(`Bundle upload failed: ${failBundle.error}`));
          return null;
        }
        seedBundleFileId = bundle.fileId;
        logEvent('tengu_teleport_bundle_mode', {
          size_bytes: bundle.bundleSizeBytes,
          scope: bundle.scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          has_wip: bundle.hasWip,
          reason: 'explicit_env_bundle' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        });
      } else {
        const repoInfo = await detectCurrentRepositoryWithHost();
        if (repoInfo) {
          gitSource = {
            type: 'git_repository',
            url: `https://${repoInfo.host}/${repoInfo.owner}/${repoInfo.name}`,
            revision: options.branchName,
          };
        }
      }

      const requestBody = {
        title: options.title || options.description || '远程任务',
        events: [],
        session_context: {
          sources: gitSource ? [gitSource] : [],
          ...(seedBundleFileId && { seed_bundle_file_id: seedBundleFileId }),
          outcomes: [],
          environment_variables: envVars,
        },
        environment_id: options.environmentId,
      };
      logForDebugging(
        `[teleportToRemote] explicit env ${options.environmentId}, ${Object.keys(envVars).length} env vars, ${seedBundleFileId ? `bundle=${seedBundleFileId}` : `source=${gitSource?.url ?? 'none'}@${options.branchName ?? 'default'}`}`,
      );
      const response = await axios.post(url, requestBody, { headers, signal });
      if (response.status !== 200 && response.status !== 201) {
        logError(new Error(`CreateSession ${response.status}: ${jsonStringify(response.data)}`));
        return null;
      }
      const sessionData = response.data as SessionResource;
      if (!sessionData || typeof sessionData.id !== 'string') {
        logError(new Error(`No session id in response: ${jsonStringify(response.data)}`));
        return null;
      }
      return {
        id: sessionData.id,
        title: sessionData.title || requestBody.title,
      };
    }

    let gitSource: GitSource | null = null;
    let gitOutcome: GitRepositoryOutcome | null = null;
    let seedBundleFileId: string | null = null;

    // 源选择阶梯：GitHub 克隆（如果 CCR 确实可以拉取）→ bu
    // ndle 回退（如果存在 .git）→ 空沙箱。
    //
    // 预检与容器的 git-proxy 克隆将命中的代码路径相同（get_g
    // ithub_client_with_user_auth → no_sync
    // _user_token_found）。50% 到达“安装 GitHub
    // App”步骤的用户从未完成；没有预检，他们每个人都会得到一个在克隆时
    // 401 的容器。有了预检，他们会静默回退到 bundle。
    //
    // CCR_FORCE_BUNDLE=1 完全跳过预检 — 适用于测试或当您知
    // 道 GitHub 身份验证已损坏时。在此处读取（而非在调用者中），以便它
    // 也适用于 remote-agent，而不仅仅是 --remote。

    const repoInfo = await detectCurrentRepositoryWithHost();

    // Generate title and branch name for the session. Skip the Haiku call
    // when both title and outcome branch are explicitly provided.
    let sessionTitle: string;
    let sessionBranch: string;
    if (options.title && options.reuseOutcomeBranch) {
      sessionTitle = options.title;
      sessionBranch = options.reuseOutcomeBranch;
    } else {
      const generated = await generateTitleAndBranch(options.description || initialMessage || '后台任务', signal);
      sessionTitle = options.title || generated.title;
      sessionBranch = options.reuseOutcomeBranch || generated.branchName;
    }

    // Preflight: does CCR have a token that can clone this repo?
    // Only checked for github.com — GHES needs ghe_configuration_id which
    // we don't have, and GHES users are power users who probably finished
    // setup. For them (and for non-GitHub hosts that parseGitRemote
    // somehow accepted), fall through optimistically; if the backend
    // rejects the host, bundle next time.
    let ghViable = false;
    let sourceReason:
      | 'github_preflight_ok'
      | 'ghes_optimistic'
      | 'github_preflight_failed'
      | 'no_github_remote'
      | 'forced_bundle'
      | 'no_git_at_all' = 'no_git_at_all';

    // gitRoot gates both bundle creation and the gate check itself — no
    // point awaiting GrowthBook when there's nothing to bundle.
    const gitRoot = findGitRoot(getCwd());
    const forceBundle = !options.skipBundle && isEnvTruthy(process.env.CCR_FORCE_BUNDLE);
    const bundleSeedGateOn =
      !options.skipBundle &&
      gitRoot !== null &&
      (isEnvTruthy(process.env.CCR_ENABLE_BUNDLE) ||
        (await checkGate_CACHED_OR_BLOCKING('tengu_ccr_bundle_seed_enabled')));

    if (repoInfo && !forceBundle) {
      if (repoInfo.host === 'github.com') {
        ghViable = await checkGithubAppInstalled(repoInfo.owner, repoInfo.name, signal);
        sourceReason = ghViable ? 'github_preflight_ok' : 'github_preflight_failed';
      } else {
        ghViable = true;
        sourceReason = 'ghes_optimistic';
      }
    } else if (forceBundle) {
      sourceReason = 'forced_bundle';
    } else if (gitRoot) {
      sourceReason = 'no_github_remote';
    }

    // 预检失败但 bundle 已关闭 — 像预预检行为
    // 一样乐观地继续。后端报告真实的身份验证错误。
    if (!ghViable && !bundleSeedGateOn && repoInfo) {
      ghViable = true;
    }

    if (ghViable && repoInfo) {
      const { host, owner, name } = repoInfo;
      // Resolve the base branch: prefer explicit branchName, fall back to default branch
      const revision = options.branchName ?? (await getDefaultBranch()) ?? undefined;
      logForDebugging(`[teleportToRemote] Git source: ${host}/${owner}/${name}, revision: ${revision ?? 'none'}`);
      gitSource = {
        type: 'git_repository',
        url: `https://${host}/${owner}/${name}`,
        // 修订版本指定要作为基础分支检出的引用
        revision,
        ...(options.reuseOutcomeBranch && {
          allow_unrestricted_git_push: true,
        }),
      };
      // type: 'github' is used for all GitHub-compatible hosts (github.com and GHE).
      // The CLI can't distinguish GHE from non-GitHub hosts (GitLab, Bitbucket)
      // client-side — the backend validates the URL against configured GHE instances
      // and ignores git_info for unrecognized hosts.
      gitOutcome = {
        type: 'git_repository',
        git_info: {
          type: 'github',
          repo: `${owner}/${name}`,
          branches: [sessionBranch],
        },
      };
    }

    // Bundle 回退。仅当 GitHub 不可行、门控开启且存在 .git/ 可
    // 打包时才尝试 bundle。在此处到达且 ghViable=fal
    // se 且 repoInfo 非 null 意味着预检失败 — .git 肯
    // 定存在（detectCurrentRepositoryWithHost
    // 从中读取了远程）。
    if (!gitSource && bundleSeedGateOn) {
      logForDebugging(`[teleportToRemote] Bundling (reason: ${sourceReason})`);
      const bundle = await createAndUploadGitBundle(
        {
          oauthToken: accessToken,
          sessionId: getSessionId(),
          baseUrl: getOauthConfig().BASE_API_URL,
        },
        { signal },
      );
      if (!bundle.success) {
        const failBundle = bundle as { success: false; error: string; failReason?: string };
        logError(new Error(`Bundle upload failed: ${failBundle.error}`));
        // Only steer users to GitHub setup when there's a remote to clone from.
        const setup = repoInfo ? '. Please setup GitHub on https://claude.ai/code' : '';
        let msg: string;
        switch (failBundle.failReason) {
          case 'empty_repo':
            msg = 'Repository has no commits — run `git add . && git commit -m "initial"` then retry';
            break;
          case 'too_large':
            msg = `Repo is too large to teleport${setup}`;
            break;
          case 'git_error':
            msg = `Failed to create git bundle (${failBundle.error})${setup}`;
            break;
          case undefined:
            msg = `Bundle upload failed: ${failBundle.error}${setup}`;
            break;
          default: {
            msg = `Bundle upload failed: ${failBundle.error}`;
          }
        }
        options.onBundleFail?.(msg);
        return null;
      }
      seedBundleFileId = bundle.fileId;
      logEvent('tengu_teleport_bundle_mode', {
        size_bytes: bundle.bundleSizeBytes,
        scope: bundle.scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        has_wip: bundle.hasWip,
        reason: sourceReason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
    }

    logEvent('tengu_teleport_source_decision', {
      reason: sourceReason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      path: (gitSource
        ? 'github'
        : seedBundleFileId
          ? 'bundle'
          : 'empty') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });

    if (!gitSource && !seedBundleFileId) {
      logForDebugging('[teleportToRemote] No repository detected — session will have an empty sandbox');
    }

    // Fetch available environments
    let environments = await fetchEnvironments();
    if (!environments || environments.length === 0) {
      logError(new Error('No environments available for session creation'));
      return null;
    }

    logForDebugging(
      `Available environments: ${environments.map(e => `${e.environment_id} (${e.name}, ${e.kind})`).join(', ')}`,
    );

    // Select environment based on settings, then anthropic_cloud preference, then first available.
    // Prefer anthropic_cloud environments over byoc: anthropic_cloud environments (e.g. "Default")
    // are the standard compute environments with full repo access, whereas byoc environments
    // (e.g. "monorepo") are user-owned compute that may not support the current repository.
    const settings = getSettings_DEPRECATED();
    const defaultEnvironmentId = options.useDefaultEnvironment ? undefined : settings?.remote?.defaultEnvironmentId;
    let cloudEnv = environments.find(env => env.kind === 'anthropic_cloud');
    // When the caller opts out of their configured default, do not fall
    // through to a BYOC env that may not support the current repo or the
    // requested permission mode. Retry once for eventual consistency,
    // then fail loudly.
    if (options.useDefaultEnvironment && !cloudEnv) {
      logForDebugging(`No anthropic_cloud in env list (${environments.length} envs); retrying fetchEnvironments`);
      const retried = await fetchEnvironments();
      cloudEnv = retried?.find(env => env.kind === 'anthropic_cloud');
      if (!cloudEnv) {
        logError(
          new Error(
            `重试后仍无 anthropic_cloud 环境可用（得到：${(retried ?? environments).map(e => `${e.name} (${e.kind})`).join(', ')}）。静默回退到 byoc 会启动到死环境 — 改为快速失败。`,
          ),
        );
        return null;
      }
      if (retried) environments = retried;
    }
    const selectedEnvironment =
      (defaultEnvironmentId && environments.find(env => env.environment_id === defaultEnvironmentId)) ||
      cloudEnv ||
      environments.find(env => env.kind !== 'bridge') ||
      environments[0];

    if (!selectedEnvironment) {
      logError(new Error('No environments available for session creation'));
      return null;
    }

    if (defaultEnvironmentId) {
      const matchedDefault = selectedEnvironment.environment_id === defaultEnvironmentId;
      logForDebugging(
        matchedDefault
          ? `Using configured default environment: ${defaultEnvironmentId}`
          : `Configured default environment ${defaultEnvironmentId} not found, using first available`,
      );
    }

    const environmentId = selectedEnvironment.environment_id;
    logForDebugging(
      `Selected environment: ${environmentId} (${selectedEnvironment.name}, ${selectedEnvironment.kind})`,
    );

    // Prepare API request for Sessions API
    const url = `${getOauthConfig().BASE_API_URL}/v1/sessions`;

    const headers = {
      ...getOAuthHeaders(accessToken),
      'anthropic-beta': 'ccr-byoc-2025-07-29',
      'x-organization-uuid': orgUUID,
    };

    const sessionContext = {
      sources: gitSource ? [gitSource] : [],
      ...(seedBundleFileId && { seed_bundle_file_id: seedBundleFileId }),
      outcomes: gitOutcome ? [gitOutcome] : [],
      model: options.model ?? getMainLoopModel(),
      ...(options.reuseOutcomeBranch && { reuse_outcome_branches: true }),
      ...(options.githubPr && { github_pr: options.githubPr }),
    };

    // CreateCCRSessionPayload has no permission_mode field — a top-level
    // body entry is silently dropped by the proto parser server-side.
    // Instead prepend a set_permission_mode control_request event. Initial
    // events are written to threadstore before the container connects, so
    // the CLI applies the mode before the first user turn — no readiness race.
    const events: Array<{ type: 'event'; data: Record<string, unknown> }> = [];
    if (options.permissionMode) {
      events.push({
        type: 'event',
        data: {
          type: 'control_request',
          request_id: `set-mode-${randomUUID()}`,
          request: {
            subtype: 'set_permission_mode',
            mode: options.permissionMode,
            ultraplan: options.ultraplan,
          },
        },
      });
    }
    if (initialMessage) {
      events.push({
        type: 'event',
        data: {
          uuid: randomUUID(),
          session_id: '',
          type: 'user',
          parent_tool_use_id: null,
          message: {
            role: 'user',
            content: initialMessage,
          },
        },
      });
    }

    const requestBody = {
      title: options.ultraplan ? `ultraplan: ${sessionTitle}` : sessionTitle,
      events,
      session_context: sessionContext,
      environment_id: environmentId,
    };

    logForDebugging(`Creating session with payload: ${jsonStringify(requestBody, null, 2)}`);

    // Make API call
    const response = await axios.post(url, requestBody, { headers, signal, validateStatus: status => status < 500 });
    const isSuccess = response.status === 200 || response.status === 201;

    if (!isSuccess) {
      logError(
        new Error(
          `API 请求失败，状态码 ${response.status}：${response.statusText}

响应数据：${jsonStringify(response.data, null, 2)}`,
        ),
      );

      options.onCreateFail?.(`${response.status} ${response.statusText}: ${jsonStringify(response.data)}`);
      return null;
    }

    // Parse response as SessionResource
    const sessionData = response.data as SessionResource;
    if (!sessionData || typeof sessionData.id !== 'string') {
      logError(new Error(`Cannot determine session ID from API response: ${jsonStringify(response.data)}`));
      return null;
    }

    logForDebugging(`Successfully created remote session: ${sessionData.id}`);
    return {
      id: sessionData.id,
      title: sessionData.title || requestBody.title,
    };
  } catch (error) {
    const err = toError(error);
    logError(err);
    return null;
  }
}

/** 尽力而为的会话归档。POST /v1/sessions/{id}/archive 没有运行状态检查（不像 DELETE 在 RUNNING 状态时会返回 409），因此它可以在实现过程中执行。已归档的会话会拒绝新事件（send_events.go），因此远程端会在下一次写入时停止。409（已归档）被视为成功。采用“发射后不管”策略；失败会导致会话保持可见，直到回收器将其清理。 */
export async function archiveRemoteSession(sessionId: string, timeout = 10_000): Promise<void> {
  const accessToken = getClaudeAIOAuthTokens()?.accessToken;
  if (!accessToken) return;
  const orgUUID = await getOrganizationUUID();
  if (!orgUUID) return;
  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'x-organization-uuid': orgUUID,
  };
  const url = `${getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}/archive`;
  try {
    const resp = await axios.post(url, {}, { headers, timeout, validateStatus: s => s < 500 });
    if (resp.status === 200 || resp.status === 409) {
      logForDebugging(`[archiveRemoteSession] archived ${sessionId}`);
    } else {
      logForDebugging(`[archiveRemoteSession] ${sessionId} failed ${resp.status}: ${jsonStringify(resp.data)}`);
    }
  } catch (err) {
    logError(err);
  }
}

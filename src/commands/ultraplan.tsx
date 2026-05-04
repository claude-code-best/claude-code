import { readFileSync } from 'fs';
import { REMOTE_CONTROL_DISCONNECTED_MSG } from '../bridge/types.js';
import type { Command } from '../commands.js';
import { DIAMOND_OPEN } from '../constants/figures.js';
import { getRemoteSessionUrl } from '../constants/product.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js';
import type { AppState } from '../state/AppStateStore.js';
import {
  checkRemoteAgentEligibility,
  formatPreconditionError,
  RemoteAgentTask,
  type RemoteAgentTaskState,
  registerRemoteAgentTask,
} from '../tasks/RemoteAgentTask/RemoteAgentTask.js';
import type { LocalJSXCommandCall } from '../types/command.js';
import { logForDebugging } from '../utils/debug.js';
import { errorMessage } from '../utils/errors.js';
import { logError } from '../utils/log.js';
import { enqueuePendingNotification } from '../utils/messageQueueManager.js';
import { ALL_MODEL_CONFIGS } from '../utils/model/configs.js';
import { updateTaskState } from '../utils/task/framework.js';
import { archiveRemoteSession, teleportToRemote } from '../utils/teleport.js';
import { pollForApprovedExitPlanMode, UltraplanPollError } from '../utils/ultraplan/ccrSession.js';
import {
  getPromptText,
  getDialogConfig,
  getPromptIdentifier,
  type PromptIdentifier,
} from '../utils/ultraplan/prompt.js';
import { registerCleanup } from '../utils/cleanupRegistry.js';

// TODO(prod-hardening): OAuth token may go stale over the 30min poll;
// consider refresh.

/**
 * Multi-agent exploration is slow; 30min timeout.
 *
 * @deprecated use getUltraplanTimeoutMs()
 */
const ULTRAPLAN_TIMEOUT_MS = 30 * 60 * 1000;

export const CCR_TERMS_URL = 'https://code.claude.com/docs/en/claude-code-on-the-web';

export function getUltraplanTimeoutMs(): number {
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_ultraplan_timeout_seconds', 1800) * 1000;
}

/**
 * 是否启用 ultraplan, 默认启用
 *
 * @returns
 */
export function isUltraplanEnabled(): boolean {
  return (
    getFeatureValue_CACHED_MAY_BE_STALE<{ enabled: boolean } | null>('tengu_ultraplan_config', { enabled: true })
      ?.enabled === true
  );
}

// CCR 针对第一方 API 运行——请使用规范 ID，而非 getMo
// delStrings() 返回的特定于提供商的字符串（在本地 CLI 上可
// 能是 Bedrock ARN 或 Vertex ID）。在调用时读取，而非模
// 块加载时：GrowthBook 缓存在导入时为空，且 `/config` 开
// 关可在调用之间切换它。
function getUltraplanModel(): string {
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_ultraplan_model', ALL_MODEL_CONFIGS.opus47.firstParty);
}

// prompt.txt 被包裹在 <system-reminder>
// 中，因此 CCR 浏览器会隐藏脚手架（由 stripSystemN
// otifications 丢弃的 CL
// I_BLOCK_TAGS），而模型仍能看到完整文本。措
// 辞刻意避免使用功能名称，因为远程 CCR CLI 在任何标签剥
// 离之前会对原始输入进行关键词检测，提示中若出现单独的 "ultraplan"
// 会自触发为 /ultraplan，这在无头模式下会被过滤为“未知技能”。
//
// Bundler 将 .txt 文件内联为字符串；测试运行器将其包装为 {default}。
/* eslint-disable @typescript-eslint/no-require-imports */
const _rawPrompt = require('../utils/ultraplan/prompt.txt');
/* eslint-enable @typescript-eslint/no-require-imports */
const DEFAULT_INSTRUCTIONS: string = (typeof _rawPrompt === 'string' ? _rawPrompt : _rawPrompt.default).trimEnd();

// 仅开发环境的提示覆盖在模块加载时急切解析。受限于 ant 构建（US
// ER_TYPE 是构建时定义，因此覆盖路径在外部构建中被 DCE
// 移除）。仅限 shell 设置的环境变量，因此顶层的 pro
// cess.env 读取是安全的——settings.env 从不注入
// 此项。@deprecated 请使用 b
// uildUltraplanPrompt()
/* eslint-disable custom-rules/no-process-env-top-level, custom-rules/no-sync-fs -- 仅限 ant 的开发覆盖；顶层的急切读取正是目的所在（在启动时崩溃，而非静默发生在斜杠命令的 try/catch 内部） */
const ULTRAPLAN_INSTRUCTIONS: string =
  process.env.USER_TYPE === 'ant' && process.env.ULTRAPLAN_PROMPT_FILE
    ? readFileSync(process.env.ULTRAPLAN_PROMPT_FILE, 'utf8').trimEnd()
    : DEFAULT_INSTRUCTIONS;
/* eslint-enable custom-rules/no-process-env-top-level, custom-rules/no-sync-fs */

/** 组装初始的 CCR 用户消息。seedPlan 和 blurb 保持在 system-reminder 外部，以便浏览器渲染它们；脚手架被隐藏。 */
export function buildUltraplanPrompt(blurb: string, seedPlan?: string, promptId?: PromptIdentifier): string {
  const parts: string[] = [];
  if (seedPlan) {
    parts.push('以下是待完善的草案计划：', '', seedPlan, '');
  }
  // parts.push(ULTRAPLAN_INSTRUCTIONS)
  parts.push(getPromptText(promptId!));

  if (blurb) {
    parts.push('', blurb);
  }
  return parts.join('\n');
}

function startDetachedPoll(
  taskId: string,
  sessionId: string,
  url: string,
  getAppState: () => AppState,
  setAppState: (f: (prev: AppState) => AppState) => void,
): void {
  const started = Date.now();
  let failed = false;
  void (async () => {
    try {
      const { plan, rejectCount, executionTarget } = await pollForApprovedExitPlanMode(
        sessionId,
        getUltraplanTimeoutMs(),
        phase => {
          if (phase === 'needs_input') logEvent('tengu_ultraplan_awaiting_input', {});
          updateTaskState<RemoteAgentTaskState>(taskId, setAppState, t => {
            if (t.status !== 'running') return t;
            const next = phase === 'running' ? undefined : phase;
            return t.ultraplanPhase === next ? t : { ...t, ultraplanPhase: next };
          });
        },
        () => getAppState().tasks?.[taskId]?.status !== 'running',
      );
      logEvent('tengu_ultraplan_approved', {
        duration_ms: Date.now() - started,
        plan_length: plan.length,
        reject_count: rejectCount,
        execution_target: executionTarget as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      if (executionTarget === 'remote') {
        // 用户在浏览器 PlanModal 中选择了“在 CCR 中执
        // 行”——远程会话现在正在编码。跳过存档（ARCHIVE 没有
        // 运行检查，会在执行中途终止）并跳过选择对话框（已选择）。根据任务
        // 状态进行防护，以便在 stopUltraplan 之后解析
        // 的轮询不会为已终止的会话发送通知。
        const task = getAppState().tasks?.[taskId];
        if (task?.status !== 'running') return;
        updateTaskState<RemoteAgentTaskState>(taskId, setAppState, t =>
          t.status !== 'running' ? t : { ...t, status: 'completed', endTime: Date.now() },
        );
        setAppState(prev => (prev.ultraplanSessionUrl === url ? { ...prev, ultraplanSessionUrl: undefined } : prev));
        enqueuePendingNotification({
          value: [
            `Ultraplan 已批准——正在 Web 上的 Claude Code 中执行。请在此处跟进：${url}`,
            '',
            '远程会话完成后，结果将以拉取请求的形式呈现。此处无需任何操作。',
          ].join('\n'),
          mode: 'task-notification',
        });
      } else {
        // 传送：设置 pendingChoice 以便 REPL 挂载 Ultrapl
        // anChoiceDialog。对话框负责在用户选择后执行存档和 URL 清除。
        // 根据任务状态进行防护，以便在 stopUltraplan 之后解析的轮询不会
        // 为已终止的会话重新激活对话框。
        setAppState(prev => {
          const task = prev.tasks?.[taskId];
          if (!task || task.status !== 'running') return prev;
          return {
            ...prev,
            ultraplanPendingChoice: { plan, sessionId, taskId },
          };
        });
      }
    } catch (e) {
      // 如果任务已停止（stopUltraplan 将状态设置为 kille
      // d），轮询出错是预期情况——跳过失败通知和清理（kill() 已
      // 执行存档；stopUltraplan 已清除 URL）。
      const task = getAppState().tasks?.[taskId];
      if (task?.status !== 'running') return;
      failed = true;
      logEvent('tengu_ultraplan_failed', {
        duration_ms: Date.now() - started,
        reason: (e instanceof UltraplanPollError
          ? e.reason
          : 'network_or_unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        reject_count: e instanceof UltraplanPollError ? e.rejectCount : undefined,
      });
      enqueuePendingNotification({
        value: `Ultraplan 失败：${errorMessage(e)}

会话：${url}`,
        mode: 'task-notification',
      });
      // 错误路径负责清理；传送路径委托给对话框；远程路径
      // 已在上述处理其自身的清理。
      void archiveRemoteSession(sessionId).catch(e => logForDebugging(`ultraplan 存档失败：${String(e)}`));
      setAppState(prev =>
        // 与此轮询的 URL 进行比较，以便较新的重新启动会话的
        // URL 不会因过时的轮询出错而被清除。
        prev.ultraplanSessionUrl === url ? { ...prev, ultraplanSessionUrl: undefined } : prev,
      );
    } finally {
      // 远程路径已在上述将状态设置为 completed；传送路径保持
      // status=running，以便药丸显示 ultraplanP
      // hase 状态，直到用户在 UltraplanChoiceDia
      // log 中做出选择后完成任务。在此处设置为 complete
      // d 会在药丸渲染阶段状态之前将任务从 isBackground
      // Task 中过滤掉。失败路径没有对话框，因此它在此处负责状态转换。
      if (failed) {
        updateTaskState<RemoteAgentTaskState>(taskId, setAppState, t =>
          t.status !== 'running' ? t : { ...t, status: 'failed', endTime: Date.now() },
        );
      }
    }
  })();
}

// 立即渲染，以便在数秒的 teleportToRemote
// 往返期间，终端不会显示为挂起状态。
function buildLaunchMessage(disconnectedBridge?: boolean): string {
  const prefix = disconnectedBridge ? `${REMOTE_CONTROL_DISCONNECTED_MSG} ` : '';
  return `${DIAMOND_OPEN} ultraplan
${prefix}正在 Web 上启动 Claude Code…`;
}

function buildSessionReadyMessage(url: string): string {
  return `${DIAMOND_OPEN} ultraplan · 在 Web 上的 Claude Code 中监控进度 ${url}
您可以继续工作——当 ${DIAMOND_OPEN} 填满时，按 ↓ 查看结果`;
}

function buildAlreadyActiveMessage(url: string | undefined): string {
  return url
    ? `ultraplan：已在轮询中。打开 ${url} 检查状态，或等待计划在此处呈现。`
    : 'ultraplan：已在启动中。请等待会话开始。';
}

/** 停止正在运行的 ultraplan：存档远程会话（停止它但保持 URL 可查看），终止本地任务条目（清除药丸），并清除 ultraplanSessionUrl（重新激活关键词触发器）。startDetachedPoll 的 shouldStop 回调在其下一次 tick 时看到 killed 状态并抛出异常；当 status !== 'running' 时，catch 块会提前返回。 */
export async function stopUltraplan(
  taskId: string,
  sessionId: string,
  setAppState: (f: (prev: AppState) => AppState) => void,
): Promise<void> {
  // RemoteAgentTask.kill 会存档会话（使用 .catch）
  // ——此处无需单独的存档调用。
  await RemoteAgentTask.kill(taskId, setAppState);
  setAppState(prev =>
    prev.ultraplanSessionUrl || prev.ultraplanPendingChoice || prev.ultraplanLaunching
      ? {
          ...prev,
          ultraplanSessionUrl: undefined,
          ultraplanPendingChoice: undefined,
          ultraplanLaunching: undefined,
        }
      : prev,
  );
  const url = getRemoteSessionUrl(sessionId, process.env.SESSION_INGRESS_URL);
  enqueuePendingNotification({
    value: `Ultraplan 已停止。

会话：${url}`,
    mode: 'task-notification',
  });
  enqueuePendingNotification({
    value: '用户停止了上方的 ultraplan 会话。请勿响应停止通知——等待他们的下一条消息。',
    mode: 'task-notification',
    isMeta: true,
  });
}

/** 斜杠命令、关键词触发器和计划批准对话框的 "Ultraplan" 按钮的共享入口。当 seedPlan 存在时（对话框路径），它会被作为草稿前置以供优化；此时 blurb 可能为空。

立即返回面向用户的消息。资格检查、会话创建和任务注册在后台运行，失败情况通过 enqueuePendingNotification 上报。 */
export async function launchUltraplan(opts: {
  blurb: string;
  seedPlan?: string;
  promptIdentifier?: PromptIdentifier;
  getAppState: () => AppState;
  setAppState: (f: (prev: AppState) => AppState) => void;
  signal: AbortSignal;
  /** 如果调用方在启动前断开了远程控制，则为 true。 */
  disconnectedBridge?: boolean;
  /** 在 teleportToRemote 解析出会话 URL 后调用一次。已设置消息的调用方（REPL）会将其作为第二条转录消息追加，以便无需打开 ↓ 详情视图即可看到 URL。无法访问转录的调用方（ExitPlanModePermissionRequest）则省略此消息——状态胶囊仍会显示实时状态。 */
  onSessionReady?: (msg: string) => void;
}): Promise<string> {
  const { blurb, seedPlan, promptIdentifier, getAppState, setAppState, signal, disconnectedBridge, onSessionReady } =
    opts;

  const { ultraplanSessionUrl: active, ultraplanLaunching } = getAppState();
  if (active || ultraplanLaunching) {
    logEvent('tengu_ultraplan_create_failed', {
      reason: (active
        ? 'already_polling'
        : 'already_launching') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    return buildAlreadyActiveMessage(active);
  }

  if (!blurb && !seedPlan) {
    // 无事件——裸 /ultraplan 是用法查询，而非尝试启动。
    return [
      // 通过 <Markdown> 渲染；原始 <message> 被分
      // 词为 HTML 并丢弃。请用反斜杠转义方括号。
      '用法：/ultraplan \\<提示\\>，或在你的提示中包含 "ultraplan"',
      '在你的提示中',
      '',
      // '使用我们最强大的模型进行高级多智能体计划模式'，'(O
      // pus)。在网页版 Claude Code 中运行。当计划准
      // 备就绪时，'，'你可以在网页会话中执行它或将其发送回此处
      // 。'，'远程计划期间终端保持空闲。'，'需
      // 要 /login。'
      ...getDialogConfig().usageBlurb,
      '',
      `Terms: ${CCR_TERMS_URL}`,
    ].join('\n');
  }

  // Set synchronously before the detached flow to prevent duplicate launches
  // during the teleportToRemote window.
  setAppState(prev => (prev.ultraplanLaunching ? prev : { ...prev, ultraplanLaunching: true }));
  void launchDetached({
    blurb,
    seedPlan,
    promptIdentifier,
    getAppState,
    setAppState,
    signal,
    onSessionReady,
  });
  return buildLaunchMessage(disconnectedBridge);
}

async function launchDetached(opts: {
  blurb: string;
  seedPlan?: string;
  promptIdentifier?: PromptIdentifier;
  getAppState: () => AppState;
  setAppState: (f: (prev: AppState) => AppState) => void;
  signal: AbortSignal;
  onSessionReady?: (msg: string) => void;
}): Promise<void> {
  const {
    blurb,
    seedPlan,
    promptIdentifier = getPromptIdentifier(),
    getAppState,
    setAppState,
    signal,
    onSessionReady,
  } = opts;
  // Hoisted so the catch block can archive the remote session if an error
  // occurs after teleportToRemote succeeds (avoids 30min orphan).
  let sessionId: string | undefined;
  try {
    // const model = getUltraplanModel()

    const eligibility = await checkRemoteAgentEligibility();
    if (!eligibility.eligible) {
      logEvent('tengu_ultraplan_create_failed', {
        reason: 'precondition' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        precondition_errors: eligibility.errors
          .map(e => e.type)
          .join(',') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      const reasons = eligibility.errors.map(formatPreconditionError).join('\n');
      enqueuePendingNotification({
        value: `ultraplan：无法启动远程会话——
${reasons}`,
        mode: 'task-notification',
      });
      return;
    }

    const prompt = buildUltraplanPrompt(blurb, seedPlan, promptIdentifier);
    let bundleFailMsg: string | undefined;
    let createFailMsg: string | undefined;
    const session = await teleportToRemote({
      initialMessage: prompt,
      description: blurb || '优化本地计划',
      // model,
      permissionMode: 'plan',
      ultraplan: true,
      signal,
      useDefaultEnvironment: true,
      onBundleFail: msg => {
        bundleFailMsg = msg;
      },
      onCreateFail: msg => {
        createFailMsg = msg;
      },
    });
    if (!session) {
      let failMsg = bundleFailMsg ?? createFailMsg;
      logEvent('tengu_ultraplan_create_failed', {
        reason: (bundleFailMsg
          ? 'bundle_fail'
          : createFailMsg
            ? 'create_api_fail'
            : 'teleport_null') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      enqueuePendingNotification({
        value: `ultraplan：会话创建失败${failMsg ? ` — ${failMsg}` : ''}。详情请查看 --debug。`,
        mode: 'task-notification',
      });
      return;
    }
    sessionId = session.id;

    const url = getRemoteSessionUrl(session.id, process.env.SESSION_INGRESS_URL);
    setAppState(prev => ({
      ...prev,
      ultraplanSessionUrl: url,
      ultraplanLaunching: undefined,
    }));
    onSessionReady?.(buildSessionReadyMessage(url));
    logEvent('tengu_ultraplan_launched', {
      has_seed_plan: Boolean(seedPlan),
      prompt_identifier: promptIdentifier as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      // model: model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    // TODO(#23985)：用 ExitPlanModeScanner 替换 registerRemoteAgentTask + sta
    // rtDetachedPoll，并将其置于 startRemoteSessionPolling 内部。
    const { taskId } = registerRemoteAgentTask({
      remoteTaskType: 'ultraplan',
      session: { id: session.id, title: blurb || 'Ultraplan' },
      command: blurb,
      context: {
        abortController: new AbortController(),
        getAppState,
        setAppState,
      },
      isUltraplan: true,
    });
    startDetachedPoll(taskId, session.id, url, getAppState, setAppState);
    registerCleanup(async () => {
      if (getAppState().ultraplanSessionUrl === url) {
        await archiveRemoteSession(session.id, 1500);
      }
    });
  } catch (e) {
    logError(e);
    logEvent('tengu_ultraplan_create_failed', {
      reason: 'unexpected_error' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    enqueuePendingNotification({
      value: `ultraplan：意外错误——${errorMessage(e)}`,
      mode: 'task-notification',
    });

    enqueuePendingNotification({
      value: `Ultraplan 在启动期间遇到意外错误。请等待用户的下一条指令。`,
      mode: 'task-notification',
      isMeta: true,
    });

    if (sessionId) {
      // teleport 成功后发生错误——进行归档，以免远程会
      // 话无人轮询却持续运行 30 分钟。
      void archiveRemoteSession(sessionId).catch(err => logForDebugging('ultraplan：归档孤儿会话失败', err));
      // ultraplanSessionUrl may have been set before the throw; clear it so
      // the "already polling" guard doesn't block future launches.
      setAppState(prev => (prev.ultraplanSessionUrl ? { ...prev, ultraplanSessionUrl: undefined } : prev));
    }
  } finally {
    // No-op on success: the url-setting setAppState already cleared this.
    setAppState(prev => (prev.ultraplanLaunching ? { ...prev, ultraplanLaunching: undefined } : prev));
  }
}

const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const blurb = args.trim();

  // 裸 /ultraplan（无参数，无种子计划）仅显示用法——不显示对话框。
  if (!blurb) {
    const msg = await launchUltraplan({
      blurb,
      getAppState: context.getAppState,
      setAppState: context.setAppState,
      signal: context.abortController.signal,
    });
    onDone(msg, { display: 'system' });
    return null;
  }

  // 守卫与 launchUltraplan 自身的检查匹配——当会
  // 话已激活或正在启动时显示对话框会浪费用户点击，并在启动失败前设置 h
  // asSeenUltraplanTerms。
  const { ultraplanSessionUrl: active, ultraplanLaunching } = context.getAppState();
  if (active || ultraplanLaunching) {
    logEvent('tengu_ultraplan_create_failed', {
      reason: (active
        ? 'already_polling'
        : 'already_launching') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    onDone(buildAlreadyActiveMessage(active), { display: 'system' });
    return null;
  }

  // 通过 focusedInputDialog（底部区域，类似于权
  // 限对话框）挂载启动前对话框，而非返回 JSX（转录区域，锚定在
  // 回滚顶部）。REPL.tsx 处理选择时的启动/清除/取消。
  context.setAppState(prev => ({ ...prev, ultraplanLaunchPending: { blurb } }));
  // 'skip' 抑制（无内容）回显——对话框的选择处理器会添加真
  // 正的 /ultraplan 回显 + 启动确认。
  onDone(undefined, { display: 'skip' });
  return null;
};

export default {
  type: 'local-jsx',
  name: 'ultraplan',
  description: `~10–30 分钟 · 网页版 Claude Code 起草一个你可以编辑和批准的高级计划。参见 ${CCR_TERMS_URL}`,
  argumentHint: '<prompt>',
  // isEnabled: () => process.env.USER_TYPE === 'ant',
  isEnabled: () => isUltraplanEnabled(),
  load: () => Promise.resolve({ call }),
} satisfies Command;

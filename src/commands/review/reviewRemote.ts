/** 已远程执行 /ultrareview。使用当前仓库创建 CCR 会话，
将评审提示作为初始消息发送，并注册一个
RemoteAgentTask，以便轮询循环通过任务通知将结果传回本地
会话。镜像了 /ultraplan → CCR 流程。

TODO(#22051)：功能落地后传递 useBundleMode，以便捕获仅限本地/未提交的
仓库状态。GitHub 克隆路径（当前）仅适用于
已安装 Claude GitHub 应用且分支已推送的仓库。 */

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { fetchUltrareviewQuota } from '../../services/api/ultrareviewQuota.js'
import { fetchUtilization } from '../../services/api/usage.js'
import type { ToolUseContext } from '../../Tool.js'
import {
  checkRemoteAgentEligibility,
  formatPreconditionError,
  getRemoteTaskSessionUrl,
  registerRemoteAgentTask,
  type BackgroundRemoteSessionPrecondition,
} from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import { isEnterpriseSubscriber, isTeamSubscriber } from '../../utils/auth.js'
import { detectCurrentRepositoryWithHost } from '../../utils/detectRepository.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { getDefaultBranch, gitExe } from '../../utils/git.js'
import { teleportToRemote } from '../../utils/teleport.js'

// 一次性会话标志：一旦用户通过对话框确认超额计费，本次会
// 话中所有后续的 /ultrareview 调用都将直接进
// 行，无需再次提示。
let sessionOverageConfirmed = false

export function confirmOverage(): void {
  sessionOverageConfirmed = true
}

export type OverageGate =
  | { kind: 'proceed'; billingNote: string }
  | { kind: 'not-enabled' }
  | { kind: 'low-balance'; available: number }
  | { kind: 'needs-confirm' }

/** 判断用户是否可以启动 ultrareview 以及适用的
计费条款。并行获取配额和使用量信息。 */
export async function checkOverageGate(): Promise<OverageGate> {
  // 团队版和企业版计划包含 ultrareview —— 没有免
  // 费评审配额或额外用量对话框。配额端点仅适用于个人计划（pro/
  // max）；在团队/企业版上调用该端点会显示令人困惑的对话框。
  if (isTeamSubscriber() || isEnterpriseSubscriber()) {
    return { kind: 'proceed', billingNote: '' }
  }

  const [quota, utilization] = await Promise.all([
    fetchUltrareviewQuota(),
    fetchUtilization().catch(() => null),
  ])

  // 无配额信息（非订阅用户或端点故障）—— 允许通
  // 过，服务器端计费会处理。
  if (!quota) {
    return { kind: 'proceed', billingNote: '' }
  }

  if (quota.reviews_remaining > 0) {
    return {
      kind: 'proceed',
      billingNote: `这是第 ${quota.reviews_used + 1} 次免费 ultrareview，共 ${quota.reviews_limit} 次。`,
    }
  }

  // 使用量获取失败（临时网络错误、超时等）——
  // 允许通过，理由与上述配额回退方案相同。
  if (!utilization) {
    return { kind: 'proceed', billingNote: '' }
  }

  // 免费评审次数已用尽 —— 请检查额外用量设置。
  const extraUsage = utilization.extra_usage
  if (!extraUsage?.is_enabled) {
    logEvent('tengu_review_overage_not_enabled', {})
    return { kind: 'not-enabled' }
  }

  // 检查可用余额（monthly_limit 为 null 表示无限制）。
  const monthlyLimit = extraUsage.monthly_limit
  const usedCredits = extraUsage.used_credits ?? 0
  const available =
    monthlyLimit === null || monthlyLimit === undefined
      ? Infinity
      : monthlyLimit - usedCredits

  if (available < 10) {
    logEvent('tengu_review_overage_low_balance', { available })
    return { kind: 'low-balance', available }
  }

  if (!sessionOverageConfirmed) {
    logEvent('tengu_review_overage_dialog_shown', {})
    return { kind: 'needs-confirm' }
  }

  return {
    kind: 'proceed',
    billingNote: '本次评审将按额外用量计费。',
  }
}

/** 启动远程评审会话。返回 ContentBlockParam[] 描述
启动结果，以便注入本地对话（随后模型将使用此内容进行查询，
从而向用户描述启动过程）。

对于可恢复的故障（缺少合并基准、差异为空、bundle 过大），返回包含面向用户错误信息的 ContentBlockParam[]；
对于其他故障返回 null，以便调用方回退到本地评审提示。
原因已记录在分析数据中。

调用方必须在调用此函数之前运行 checkOverageGate()
（ultrareviewCommand.tsx 负责处理对话框）。 */
export async function launchRemoteReview(
  args: string,
  context: ToolUseContext,
  billingNote?: string,
): Promise<ContentBlockParam[] | null> {
  const eligibility = await checkRemoteAgentEligibility()
  // 合成的 DEFAULT_CODE_REVIEW_ENVIRONMENT_ID 无需按
  // 组织配置 CCR 即可工作，因此 no_remote_environment 不
  // 是阻碍。服务器端在会话创建时消耗配额以路由计费：前 N 次零费率，然后使用 ant
  // hropic:cccr 组织服务密钥（仅用于超额部分）。
  if (!eligibility.eligible) {
    const blockers = (
      eligibility as { eligible: false; errors: Array<{ type: string }> }
    ).errors.filter(e => e.type !== 'no_remote_environment')
    if (blockers.length > 0) {
      logEvent('tengu_review_remote_precondition_failed', {
        precondition_errors: blockers
          .map(e => e.type)
          .join(
            ',',
          ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      const reasons = (blockers as BackgroundRemoteSessionPrecondition[])
        .map(formatPreconditionError)
        .join('\n')
      return [
        {
          type: 'text',
          text: `无法启动 Ultrareview：
${reasons}`,
        },
      ]
    }
  }

  const resolvedBillingNote = billingNote ?? ''

  const prNumber = args.trim()
  const isPrNumber = /^\d+$/.test(prNumber)
  // 合成的 code_review 环境。Go 语言的 taggedid.FromUUID(TagEn
  // vironment, UUID{...,0x02}) 使用版本前缀 '01' 编码 —— 而非 P
  // ython 遗留的 tagged_id() 格式。已在生产环境验证。
  const CODE_REVIEW_ENV_ID = 'env_011111111111111111111113'
  // Lite-review 完全绕过 bughunter.go，因此它看不到 w
  // ebhook 的 bug_hunter_config（属于不同的 GB 项目）。这
  // 些环境变量是唯一的调优入口 —— 如果没有它们，将应用 run_hunt.sh
  // 的 bash 默认值（60分钟，120秒代理超时），而 120 秒超时会在验
  // 证器运行中途将其终止，导致无限重启。
  //
  // total_wallclock 必须保持在 RemoteAgentTask 的 30
  // 分钟轮询超时限制以下，并为最终处理留出余量（约 3 分钟合成）。各字段的防护措施
  // 与 autoDream.ts 保持一致 —— GB 缓存可能返回过期的错误类型值。
  const raw = getFeatureValue_CACHED_MAY_BE_STALE<Record<
    string,
    unknown
  > | null>('tengu_review_bughunter_config', null)
  const posInt = (v: unknown, fallback: number, max?: number): number => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
    const n = Math.floor(v)
    if (n <= 0) return fallback
    return max !== undefined && n > max ? fallback : n
  }
  // 上限：wallclock 设为 27 分钟，为在 RemoteAgentTa
  // sk 的 30 分钟轮询超时下进行最终处理留出约 3 分钟。如果 GB 设
  // 置高于此值，我们正在修复的挂起问题将重现 —— 此时应回退到安全的默认值。
  const commonEnvVars = {
    BUGHUNTER_DRY_RUN: '1',
    BUGHUNTER_FLEET_SIZE: String(posInt(raw?.fleet_size, 5, 20)),
    BUGHUNTER_MAX_DURATION: String(posInt(raw?.max_duration_minutes, 10, 25)),
    BUGHUNTER_AGENT_TIMEOUT: String(
      posInt(raw?.agent_timeout_seconds, 600, 1800),
    ),
    BUGHUNTER_TOTAL_WALLCLOCK: String(
      posInt(raw?.total_wallclock_minutes, 22, 27),
    ),
    ...(process.env.BUGHUNTER_DEV_BUNDLE_B64 && {
      BUGHUNTER_DEV_BUNDLE_B64: process.env.BUGHUNTER_DEV_BUNDLE_B64,
    }),
  }

  let session
  let command
  let target
  if (isPrNumber) {
    // PR 模式：通过 github.com 使用 refs/pull/N/head。Orchestrator --pr N。
    const repo = await detectCurrentRepositoryWithHost()
    if (!repo || repo.host !== 'github.com') {
      logEvent('tengu_review_remote_precondition_failed', {})
      return null
    }
    session = await teleportToRemote({
      initialMessage: null,
      description: `ultrareview：${repo.owner}/${repo.name}#${prNumber}`,
      signal: context.abortController.signal,
      branchName: `refs/pull/${prNumber}/head`,
      environmentId: CODE_REVIEW_ENV_ID,
      environmentVariables: {
        BUGHUNTER_PR_NUMBER: prNumber,
        BUGHUNTER_REPOSITORY: `${repo.owner}/${repo.name}`,
        ...commonEnvVars,
      },
    })
    command = `/ultrareview ${prNumber}`
    target = `${repo.owner}/${repo.name}#${prNumber}`
  } else {
    // 分支模式：打包工作树，orchestrator 与分叉
    // 点进行差异比较。无 PR，无现有评论，无去重。
    const baseBranch = (await getDefaultBranch()) || 'main'
    // 环境管理器在 bundle-clone 后执行 `git remote r
    // emove origin` 会删除 refs/remotes/origin/* —
    // — 容器中将无法解析基础分支名称。改为传递合并基准 SHA：它可以从 HEAD
    // 的历史记录中访问到，因此 `git diff <sha>` 无需命名引用即可工作。
    const { stdout: mbOut, code: mbCode } = await execFileNoThrow(
      gitExe(),
      ['merge-base', baseBranch, 'HEAD'],
      { preserveOutputOnError: false },
    )
    const mergeBaseSha = mbOut.trim()
    if (mbCode !== 0 || !mergeBaseSha) {
      logEvent('tengu_review_remote_precondition_failed', {})
      return [
        {
          type: 'text',
          text: `找不到与 ${baseBranch} 的合并基准。请确保您位于具有 ${baseBranch} 分支的 git 仓库中。`,
        },
      ]
    }

    // 在差异为空时尽早退出，而不是启动一个只会回
    // 显“无更改”的容器。
    const { stdout: diffStat, code: diffCode } = await execFileNoThrow(
      gitExe(),
      ['diff', '--shortstat', mergeBaseSha],
      { preserveOutputOnError: false },
    )
    if (diffCode === 0 && !diffStat.trim()) {
      logEvent('tengu_review_remote_precondition_failed', {})
      return [
        {
          type: 'text',
          text: `相对于 ${baseBranch} 分叉点无更改。请先进行一些提交或暂存文件。`,
        },
      ]
    }

    session = await teleportToRemote({
      initialMessage: null,
      description: `ultrareview: ${baseBranch}`,
      signal: context.abortController.signal,
      useBundle: true,
      environmentId: CODE_REVIEW_ENV_ID,
      environmentVariables: {
        BUGHUNTER_BASE_BRANCH: mergeBaseSha,
        ...commonEnvVars,
      },
    })
    if (!session) {
      logEvent('tengu_review_remote_teleport_failed', {})
      return [
        {
          type: 'text',
          text: '仓库过大。请推送 PR 并使用 `/ultrareview <PR#>`。',
        },
      ]
    }
    command = '/ultrareview'
    target = baseBranch
  }

  if (!session) {
    logEvent('tengu_review_remote_teleport_failed', {})
    return null
  }
  registerRemoteAgentTask({
    remoteTaskType: 'ultrareview',
    session,
    command,
    context,
    isRemoteReview: true,
  })
  logEvent('tengu_review_remote_launched', {})
  const sessionUrl = getRemoteTaskSessionUrl(session.id)
  // 简洁 —— 工具输出块对用户可见，因此模型不应
  // 重复相同信息。只需让 Claude 确认启动即可
  // ，无需重述目标/URL（两者均已在上方打印）。
  return [
    {
      type: 'text',
      text: `已为 ${target} 启动 Ultrareview（约 10–20 分钟，在云端运行）。跟踪链接：${sessionUrl}${resolvedBillingNote} 结果将通过任务通知送达。向用户简要确认启动，无需重复目标或 URL —— 两者均已在上方的工具输出中可见。`,
    },
  ]
}

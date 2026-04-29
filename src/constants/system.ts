// 关键系统常量单独抽出，以避免循环依赖

import { feature } from 'bun:bundle'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { logForDebugging } from '../utils/debug.js'
import { isEnvDefinedFalsy } from '../utils/envUtils.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { getWorkload } from '../utils/workloadContext.js'

const DEFAULT_PREFIX = `你是 Claude Code，Anthropic 官方出品的 Claude CLI。`
const AGENT_SDK_CLAUDE_CODE_PRESET_PREFIX = `你是 Claude Code，Anthropic 官方出品的 Claude CLI，运行在 Claude Agent SDK 中。`
const AGENT_SDK_PREFIX = `你是一个 Claude agent，基于 Anthropic 的 Claude Agent SDK 构建。`

const CLI_SYSPROMPT_PREFIX_VALUES = [
  DEFAULT_PREFIX,
  AGENT_SDK_CLAUDE_CODE_PRESET_PREFIX,
  AGENT_SDK_PREFIX,
] as const

export type CLISyspromptPrefix = (typeof CLI_SYSPROMPT_PREFIX_VALUES)[number]

/**
 * CLI 系统提示前缀的全部可能取值，供 splitSysPromptPrefix
 * 按内容而非位置识别前缀块。
 */
export const CLI_SYSPROMPT_PREFIXES: ReadonlySet<string> = new Set(
  CLI_SYSPROMPT_PREFIX_VALUES,
)

export function getCLISyspromptPrefix(options?: {
  isNonInteractive: boolean
  hasAppendSystemPrompt: boolean
}): CLISyspromptPrefix {
  const apiProvider = getAPIProvider()
  if (apiProvider === 'vertex') {
    return DEFAULT_PREFIX
  }

  if (options?.isNonInteractive) {
    if (options.hasAppendSystemPrompt) {
      return AGENT_SDK_CLAUDE_CODE_PRESET_PREFIX
    }
    return AGENT_SDK_PREFIX
  }
  return DEFAULT_PREFIX
}

/**
 * 是否启用归因（attribution）请求头。
 * 默认启用，可通过环境变量或 GrowthBook 开关关闭。
 */
function isAttributionHeaderEnabled(): boolean {
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_ATTRIBUTION_HEADER)) {
    return false
  }
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_attribution_header', true)
}

/**
 * 获取 API 请求的归因头字符串。
 * 返回包含 cc_version（含 fingerprint）与 cc_entrypoint 的头字段。
 * 默认启用，可通过环境变量或 GrowthBook 开关关闭。
 *
 * 启用 NATIVE_CLIENT_ATTESTATION 时包含 `cch=00000` 占位符。
 * 请求发出前，Bun 原生 HTTP 栈在请求体中定位该占位符，
 * 并将零替换为计算得到的哈希；服务端校验该令牌以确认请求来自真实 Claude Code 客户端。
 * 实现见 bun-anthropic/src/http/Attestation.zig。
 *
 * 使用占位符（而非从 Zig 注入）是为了等长替换，避免 Content-Length 变化与缓冲区重分配。
 */
export function getAttributionHeader(fingerprint: string): string {
  if (!isAttributionHeaderEnabled()) {
    return ''
  }

  const version = `${MACRO.VERSION}.${fingerprint}`
  const entrypoint = process.env.CLAUDE_CODE_ENTRYPOINT ?? 'unknown'

  // cch=00000 占位符由 Bun HTTP 栈覆盖为认证令牌
  const cch = feature('NATIVE_CLIENT_ATTESTATION') ? ' cch=00000;' : ''
  // cc_workload：按回合提示，便于 API 将例如 cron 发起的请求路由到低 QoS 池。
  // 缺省为交互式默认。与 fingerprint（仅由消息字符与版本计算，见上文）及
  // cch 认证（本字符串生成后在序列化体字节中被覆盖）兼容。
  // 服务端 _parse_cc_header 容忍未知扩展字段，旧版 API 会静默忽略。
  const workload = getWorkload()
  const workloadPair = workload ? ` cc_workload=${workload};` : ''
  const header = `x-anthropic-billing-header: cc_version=${version}; cc_entrypoint=${entrypoint};${cch}${workloadPair}`

  logForDebugging(`attribution header ${header}`)
  return header
}

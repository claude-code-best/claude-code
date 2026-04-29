/**
 * Shared analytics configuration
 *
 * Common logic for determining when analytics should be disabled
 * across all analytics systems (Datadog, 1P)
 */

import { isEnvTruthy } from '../../utils/envUtils.js'
import { isTelemetryDisabled } from '../../utils/privacyLevel.js'
/**
检查是否应禁用分析操作*
* 在以下情况下，分析功能将被禁用：
* - 测试环境（NODE_ENV 等于 'test'）
* - 第三方云服务提供商（Bedrock/Vertex）
* - 隐私级别为“不收集数据”或“关键流量”
* */
export function isAnalyticsDisabled(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY) ||
    isTelemetryDisabled()
  )
}

/**
* 检查是否应禁止反馈调查。
*
* 与 isAnalyticsDisabled() 不同，此方法不会阻止第三方提供商
（Bedrock/Vertex/Foundry）。该调查是本地 UI 提示，不包含
* 转录数据 — 企业客户通过 OTEL 收集回复。
*/
export function isFeedbackSurveyDisabled(): boolean {
  return process.env.NODE_ENV === 'test' || isTelemetryDisabled()
}

/**
 * OAuth / Claude.ai 账户相关类型 — 与令牌交换、`/api/oauth/profile`、角色与推荐接口对齐。
 */

/** 计费方式：来自 profile 的 `organization.billing_type` 与全局 `AccountInfo.billingType`。 */
export type BillingType =
  | 'stripe_subscription' // Stripe 订阅扣款
  | 'stripe_subscription_contracted' // Stripe 合约/企业约定计费
  | 'apple_subscription' // Apple 应用内订阅
  | 'google_play_subscription' // Google Play 订阅
  | string // 其它后端扩展值

/**
 * 归一化后的产品线：由 `fetchProfileInfo` 根据 `organization.organization_type` 映射得到。
 */
export type SubscriptionType =
  | 'max' // Claude Max
  | 'pro' // Claude Pro
  | 'enterprise' // 企业版
  | 'team' // 团队版

/**
 * 接口返回的原始组织类型（映射为 {@link SubscriptionType} 之前）。
 */
export type OAuthOrganizationType =
  | 'claude_max' // Max 档组织
  | 'claude_pro' // Pro 档组织
  | 'claude_enterprise' // 企业组织
  | 'claude_team' // 团队组织
  | string // 未知或新增类型

/**
 * 速率档位 id：来自 profile 的 `organization.rate_limit_tier`（如团队高倍率档）。
 */
export type RateLimitTier = string

/** 推荐活动 id：作为查询参数 `campaign`；代码默认常用 `claude_code_guest_pass`。 */
export type ReferralCampaign = string

export type ReferrerRewardInfo = {
  currency: string // ISO 货币代码（如 USD、EUR）
  amount_minor_units: number // 金额最小货币单位（如美分，需除以 100 展示）
}

export type ReferralCodeDetails = {
  referral_link?: string // 用户可复制分享的推荐链接
  campaign?: ReferralCampaign // 该链接所属活动 id
}

/**
 * `GET .../referral/eligibility` 响应；按组织缓存在 `passesEligibilityCache`（见 `config.ts`）。
 */
export type ReferralEligibilityResponse = {
  eligible: boolean // 当前用户/组织是否具备参与该推荐活动的资格
  referral_code_details?: ReferralCodeDetails // 推荐码与链接等活动侧详情
  referrer_reward?: ReferrerRewardInfo | null // 推荐人可获得的奖励（如 v1 活动现金券），无则 null
  remaining_passes?: number | null // 仍可发放的访客通行证数量，无数据时为 null
}

/**
 * `GET .../referral/redemptions` 响应；`/passes` 用于展示每张券是否已核销。
 */
export type ReferralRedemptionsResponse = {
  redemptions?: Array<Record<string, unknown> | null | undefined> // 已核销记录列表，槽位可为空表示未使用
  limit?: number // 总共可发放/核销次数上限（UI 默认回退为 3）
}

export type OAuthProfileAccount = {
  uuid: string // 账户唯一 id
  email: string // 登录邮箱
  display_name?: string | null // 展示用名称
  created_at?: string // 账户创建时间（ISO 字符串）
  has_claude_max?: boolean // 是否在 Console 侧已有 Max 订阅（部分 claude_cli_profile 返回）
  has_claude_pro?: boolean // 是否在 Console 侧已有 Pro 订阅（部分 claude_cli_profile 返回）
}

export type OAuthProfileOrganization = {
  uuid: string // 组织唯一 id
  organization_type?: OAuthOrganizationType | null // 组织产品类型（原始枚举）
  rate_limit_tier?: RateLimitTier | null // API 速率档位 id（如 Max 5×/20× 等）
  has_extra_usage_enabled?: boolean | null // 是否开通超额/额外用量能力
  billing_type?: BillingType | null // 计费渠道类型
  subscription_created_at?: string | null // 当前订阅起始时间（ISO 字符串）
}

/** `GET /api/oauth/profile` 与 `GET /api/claude_cli_profile` 的响应体。 */
export type OAuthProfileResponse = {
  account: OAuthProfileAccount // 用户账户信息
  organization: OAuthProfileOrganization // 所属组织与计费/限速信息
}

/**
 * 令牌端点 JSON（authorization_code / refresh_token 授权），与交换、刷新逻辑使用的字段一致。
 */
export type OAuthTokenExchangeResponse = {
  access_token: string // 访问令牌，调用受保护 API 时使用
  refresh_token?: string // 刷新令牌；刷新授权码流程中可能省略
  expires_in: number // access_token 有效期（秒）
  scope?: string // 空格分隔的授权 scope 列表
  account?: {
    uuid: string // 账户 id（与 profile 中 account 对应）
    email_address: string // 邮箱（令牌响应字段名，与 profile 的 email 同源）
  }
  organization?: {
    uuid?: string // 组织 id（若有组织上下文）
  }
}

/** 用户角色接口响应；写入全局配置 `oauthAccount` 的组织/工作区角色与组织名。 */
export type UserRolesResponse = {
  organization_role: string | null // 在组织内的角色
  workspace_role: string | null // 在工作区内的角色
  organization_name: string | null // 组织显示名称
}

/** 令牌交换里附带的账户快照（profile 拉取失败时用于回填本地账号信息）。 */
export type OAuthTokenAccountSnapshot = {
  uuid: string // 账户 id
  emailAddress: string // 邮箱（camelCase，与存储层一致）
  organizationUuid?: string // 组织 id（可选）
}

/**
 * Claude.ai OAuth 在内存与安全存储中的形态（见 `saveOAuthTokensIfNeeded`、`OAuthService.formatTokens`、`refreshOAuthToken`）。
 */
export type OAuthTokens = {
  accessToken: string // 访问令牌
  refreshToken: string | null // 刷新令牌；仅推理 env 令牌等场景可为 null
  expiresAt: number | null // accessToken 过期时间戳（毫秒）；未知时为 null
  scopes: string[] // 已授权 scope 列表，user:inference，user:mcp_servers，user:file_upload
  subscriptionType: SubscriptionType | null // 归一化订阅档；未拉取到 profile 时为 null
  rateLimitTier: RateLimitTier | null // 速率档位；未知时为 null
  profile?: OAuthProfileResponse // 完整 profile 缓存（可选，避免重复请求）
  tokenAccount?: OAuthTokenAccountSnapshot // 令牌响应中的账户摘要（profile 缺失时的兜底）
}

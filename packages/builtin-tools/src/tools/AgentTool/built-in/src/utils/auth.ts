/** 是否正在使用第三方（非 Anthropic 直连）API 或服务；与仓库根 `src/utils/auth.ts` 中 `isUsing3PServices` 签名一致。 */
export type isUsing3PServices = () => boolean // 返回 true 表示当前配置走兼容层或第三方模型端点

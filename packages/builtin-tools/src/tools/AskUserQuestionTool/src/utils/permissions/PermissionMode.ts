/** 将权限模式映射为 Ink 主题颜色键，用于状态行等 UI；与宿主 `getModeColor` 一致。 */
export type getModeColor =
  typeof import('src/utils/permissions/PermissionMode.js').getModeColor

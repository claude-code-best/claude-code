import type { SettingsJson } from 'src/utils/settings/types.js'

/** 返回各设置来源合并后的快照（已废弃函数名，行为同 `getInitialSettings`）；与 `src/utils/settings/settings.ts` 一致。 */
export type getSettings_DEPRECATED = () => SettingsJson // 无参数；至少得到可空字段填充后的合并设置对象

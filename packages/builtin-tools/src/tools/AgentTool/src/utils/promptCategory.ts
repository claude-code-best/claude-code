/** 按内置/自定义 Agent 类型解析用于遥测或分类的 `QuerySource`；与宿主 `getQuerySourceForAgent` 一致。 */
export type getQuerySourceForAgent =
  typeof import('src/utils/promptCategory.js').getQuerySourceForAgent

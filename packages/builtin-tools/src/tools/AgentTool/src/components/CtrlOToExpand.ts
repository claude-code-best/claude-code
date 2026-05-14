/** 「Ctrl+O 展开」提示组件；与宿主 `src/components/CtrlOToExpand.tsx` 中 `CtrlOToExpand` 一致。 */
export type CtrlOToExpand =
  typeof import('src/components/CtrlOToExpand.js').CtrlOToExpand

/** 标记子 Agent 输出上下文，用于抑制重复的展开提示；与宿主 `SubAgentProvider` 一致。 */
export type SubAgentProvider =
  typeof import('src/components/CtrlOToExpand.js').SubAgentProvider

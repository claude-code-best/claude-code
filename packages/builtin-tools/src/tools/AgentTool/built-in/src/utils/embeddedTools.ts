/** 当前构建是否将 Glob/Grep 嵌入其它工具而不单独注册；与仓库根 `src/utils/embeddedTools.ts` 中 `hasEmbeddedSearchTools` 一致。 */
export type hasEmbeddedSearchTools = () => boolean // 返回 true 时工具列表不包含独立的 Glob/Grep 工具名

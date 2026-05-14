/** 根据工具定义装配宿主侧可调用 `Tool` 实例的工厂函数类型。 */
export type buildTool = typeof import('src/Tool.js').buildTool

/** 工具定义泛型（输入 Schema、权限、进度等）；与宿主 `ToolDef` 一致。 */
export type ToolDef = import('src/Tool.js').ToolDef

/** 判断工具主名称或别名是否与查询名称相等；与宿主 `toolMatchesName` 一致。 */
export type toolMatchesName = typeof import('src/Tool.js').toolMatchesName

import type {
  createSkillCommand,
  parseSkillFrontmatterFields,
} from './loadSkillsDir.js'

/**
 * 用于注册两个 loadSkillsDir 函数的“只写一次”注册表，供 MCP 技能发现使用。
 * 该模块位于依赖图的叶子节点：它只导入类型，因此 mcpSkills.ts 和
 * loadSkillsDir.ts 都可以依赖它而不会形成循环依赖
 *（client.ts → mcpSkills.ts → loadSkillsDir.ts → … → client.ts）。
 *
 * 非字面量的动态导入方式（"await import(variable)"）在 Bun 打包的二进制中
 * 运行时会失败 —— 模块路径会基于 chunk 的 /$bunfs/root/… 路径解析，
 * 而不是原始源码目录，从而导致 “Cannot find module './loadSkillsDir.js'” 错误。
 * 字面量动态导入在 bunfs 中可以正常工作，但 dependency-cruiser 会追踪它，
 * 而由于 loadSkillsDir 传递性地依赖了几乎所有模块，这一条新增依赖边会在
 * diff 检查中扩散成大量新的循环依赖违规。
 *
 * 注册过程发生在 loadSkillsDir.ts 模块初始化时，该模块通过 commands.ts 的
 * 静态导入在启动阶段被提前执行 —— 远早于任何 MCP 服务建立连接。
 */

export type MCPSkillBuilders = {
  createSkillCommand: typeof createSkillCommand
  parseSkillFrontmatterFields: typeof parseSkillFrontmatterFields
}

let builders: MCPSkillBuilders | null = null

export function registerMCPSkillBuilders(b: MCPSkillBuilders): void {
  builders = b
}

export function getMCPSkillBuilders(): MCPSkillBuilders {
  if (!builders) {
    throw new Error(
      'MCP skill builders not registered — loadSkillsDir.ts has not been evaluated yet',
    )
  }
  return builders
}

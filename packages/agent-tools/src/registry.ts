import type { CoreTool, Tools } from './types.js'

/**
 * Checks if a tool matches the given name (primary name or alias).
 */
export function toolMatchesName(
  tool: { name: string; aliases?: string[] },
  name: string,
): boolean {
  return tool.name === name || (tool.aliases?.includes(name) ?? false)
}

/**
 * Finds a tool by name or alias from a list of tools.
 */
export function findToolByName(
  tools: Tools,
  name: string,
): CoreTool | undefined {
  return tools.find(t => toolMatchesName(t, name))
}

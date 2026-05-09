import { EXECUTE_TOOL_NAME } from './constants.js'

export const DESCRIPTION =
  'ExecuteExtraTool — execute a deferred tool by name with parameters. This tool is always available. Use it after discovering a tool via ToolSearch.'

export function getPrompt(): string {
  return `ExecuteExtraTool — execute a deferred tool by name. This tool is always available in your tool list. You do NOT need to search for it.

This tool accepts a tool_name and params object, looks up the target tool in the global tool registry, and delegates execution to it.

Use this tool after discovering a deferred tool via ToolSearch. The tool_name must match the exact name returned by ToolSearch (e.g., "CronCreate", "mcp__server__action").

Inputs:
- tool_name: The exact name of the target tool (string)
- params: The parameters to pass to the target tool (object)

If the tool is not found, an error message will be returned suggesting to use ToolSearch to discover available tools.`
}

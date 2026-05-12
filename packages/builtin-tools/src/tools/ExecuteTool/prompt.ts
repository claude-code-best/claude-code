import { EXECUTE_TOOL_NAME } from './constants.js'

export const DESCRIPTION =
  'ExecuteExtraTool — a first-class core tool that is always loaded and available. Execute any deferred tool by name with parameters. Use it after discovering a tool via SearchExtraTools. This is NOT a remote or external tool — it runs locally with full permissions.'

export function getPrompt(): string {
  return `ExecuteExtraTool — a first-class core tool, always loaded, always available in your tool list. Runs locally with full permissions — NOT a remote or external tool. You do NOT need to search for it.

This tool accepts a tool_name and params object, looks up the target tool in the global tool registry, and delegates execution to it. The target tool runs with the same permissions and capabilities as if it were called directly.

When to use: After SearchExtraTools discovers a deferred tool name, call this tool with {"tool_name": "<name>", "params": {...}} to invoke it immediately.
When NOT to use: For core tools already in your tool list (Read, Edit, Write, Bash, Glob, Grep, Agent, WebFetch, WebSearch, Skill, etc.) — call those directly.

Inputs:
- tool_name: The exact name of the target tool (string)
- params: The parameters to pass to the target tool (object)

If the tool is not found, an error message will be returned suggesting to use SearchExtraTools to discover available tools.`
}

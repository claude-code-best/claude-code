/**
 * Handler method wrapping for MCP server instrumentation
 *
 * Provides automatic error capture and span correlation for tool, resource,
 * and prompt handlers.
 */
import type { MCPServerInstance } from './types';
/**
 * Wraps tool handlers to associate them with request spans.
 * Instruments both `tool` (legacy API) and `registerTool` (new API) if present.
 * @param serverInstance - MCP server instance
 */
export declare function wrapToolHandlers(serverInstance: MCPServerInstance): void;
/**
 * Wraps resource handlers to associate them with request spans.
 * Instruments both `resource` (legacy API) and `registerResource` (new API) if present.
 * @param serverInstance - MCP server instance
 */
export declare function wrapResourceHandlers(serverInstance: MCPServerInstance): void;
/**
 * Wraps prompt handlers to associate them with request spans.
 * Instruments both `prompt` (legacy API) and `registerPrompt` (new API) if present.
 * @param serverInstance - MCP server instance
 */
export declare function wrapPromptHandlers(serverInstance: MCPServerInstance): void;
/**
 * Wraps all MCP handler types for span correlation.
 * Supports both the legacy API (`tool`, `resource`, `prompt`) and the newer API
 * (`registerTool`, `registerResource`, `registerPrompt`), instrumenting whichever methods are present.
 * @param serverInstance - MCP server instance
 */
export declare function wrapAllMCPHandlers(serverInstance: MCPServerInstance): void;
//# sourceMappingURL=handlers.d.ts.map
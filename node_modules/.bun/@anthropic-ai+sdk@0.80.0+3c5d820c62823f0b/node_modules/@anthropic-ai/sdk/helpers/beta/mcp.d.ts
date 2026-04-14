/**
 * Helper functions for integrating MCP (Model Context Protocol) SDK types
 * with the Anthropic SDK.
 *
 * These helpers reduce boilerplate when converting between MCP types and
 * Anthropic API types. The interfaces defined here use TypeScript's structural
 * typing to match MCP SDK types without requiring a direct dependency.
 */
import { BetaRunnableTool } from "../../lib/tools/BetaRunnableTool.js";
import { BetaTool, BetaMessageParam, BetaTextBlockParam, BetaImageBlockParam, BetaRequestDocumentBlock } from "../../resources/beta.js";
import { SDK_HELPER_SYMBOL, collectStainlessHelpers, stainlessHelperHeader } from "../../lib/stainless-helper-header.js";
export { SDK_HELPER_SYMBOL, collectStainlessHelpers, stainlessHelperHeader };
/**
 * Represents an MCP tool definition.
 * Matches the shape returned by `mcpClient.listTools()`.
 */
export interface MCPToolLike {
    name: string;
    description?: string | undefined;
    inputSchema: {
        type: 'object';
        properties?: Record<string, unknown> | null | undefined;
        required?: string[] | readonly string[] | null | undefined;
        [key: string]: unknown;
    };
}
/**
 * Represents the result of calling an MCP tool.
 * Matches the shape returned by `mcpClient.callTool()`.
 */
export interface MCPCallToolResultLike {
    content: MCPToolResultContentLike[];
    structuredContent?: object | undefined;
    isError?: boolean | undefined;
}
export type MCPToolResultContentLike = MCPTextContentLike | MCPImageContentLike | MCPAudioContentLike | MCPEmbeddedResourceLike | MCPResourceLinkLike;
export interface MCPTextContentLike {
    type: 'text';
    text: string;
}
export interface MCPImageContentLike {
    type: 'image';
    data: string;
    mimeType: string;
}
export interface MCPAudioContentLike {
    type: 'audio';
    data: string;
    mimeType: string;
}
export interface MCPEmbeddedResourceLike {
    type: 'resource';
    resource: MCPResourceContentsLike;
}
export interface MCPResourceLinkLike {
    type: 'resource_link';
    uri: string;
    name: string;
    mimeType?: string | undefined;
}
/**
 * Text resource contents from MCP.
 */
export interface MCPTextResourceContentsLike {
    uri: string;
    mimeType?: string | undefined;
    text: string;
}
/**
 * Blob (binary) resource contents from MCP.
 */
export interface MCPBlobResourceContentsLike {
    uri: string;
    mimeType?: string | undefined;
    blob: string;
}
/**
 * Resource contents - either text or blob.
 * Matches `TextResourceContents | BlobResourceContents` from MCP SDK.
 */
export type MCPResourceContentsLike = MCPTextResourceContentsLike | MCPBlobResourceContentsLike;
/**
 * Interface for an MCP client that can call tools.
 * Matches the relevant methods of `Client` from `@modelcontextprotocol/sdk`.
 */
export interface MCPClientLike {
    callTool(params: {
        name: string;
        arguments?: Record<string, unknown>;
    }): Promise<MCPCallToolResultLike>;
}
/**
 * Represents a message from an MCP prompt.
 * Matches the shape returned by `mcpClient.getPrompt()`.
 */
export interface MCPPromptMessageLike {
    role: 'user' | 'assistant';
    content: MCPPromptContentLike;
}
export type MCPPromptContentLike = MCPTextContentLike | MCPImageContentLike | MCPAudioContentLike | MCPEmbeddedResourceLike | MCPResourceLinkLike;
/**
 * Represents the contents of an MCP resource.
 * Matches the shape returned by `mcpClient.readResource()`.
 */
export interface MCPReadResourceResultLike {
    contents: MCPResourceContentsLike[];
}
/**
 * Error thrown when an MCP value cannot be converted to a format supported by the Claude API.
 */
export declare class UnsupportedMCPValueError extends Error {
    constructor(message: string);
}
/**
 * Converts an MCP tool to a BetaRunnableTool for use with the Anthropic SDK's
 * `toolRunner()` method.
 *
 * @param tool The MCP tool definition from `mcpClient.listTools()`
 * @param mcpClient The MCP client instance used to call the tool
 * @param extraProps Additional Claude API properties to include in the tool definition
 * @returns A runnable tool for use with `anthropic.beta.messages.toolRunner()`
 * @throws {UnsupportedMCPValueError} When the tool returns unsupported content types
 * @throws {UnsupportedMCPValueError} When the tool returns unsupported resource links
 * @throws {UnsupportedMCPValueError} When the tool returns resources with unsupported MIME types
 *
 * @example
 * ```ts
 * import { Client } from "@modelcontextprotocol/sdk/client/index.js";
 * import Anthropic from "@anthropic-ai/sdk";
 * import { mcpTool } from "@anthropic-ai/sdk/helpers/beta/mcp";
 *
 * const mcpClient = new Client({ name: "example", version: "1.0.0" });
 * const anthropic = new Anthropic();
 *
 * const tools = await mcpClient.listTools();
 * const runner = await anthropic.beta.messages.toolRunner({
 *   model: "claude-sonnet-4-20250514",
 *   max_tokens: 1024,
 *   tools: tools.tools.map(tool => mcpTool(tool, mcpClient)),
 *   messages: [{ role: "user", content: "Use the available tools" }],
 * });
 * ```
 */
export declare function mcpTool(tool: MCPToolLike, mcpClient: MCPClientLike, extraProps?: Partial<Omit<BetaTool, 'name' | 'description' | 'input_schema'>>): BetaRunnableTool<Record<string, unknown>>;
/**
 * Converts an array of MCP tools to BetaRunnableTools.
 *
 * @param tools Array of MCP tool definitions from `mcpClient.listTools()`
 * @param mcpClient The MCP client instance used to call the tools
 * @param extraProps Additional Claude API properties to include in each tool definition
 * @returns An array of runnable tools for use with `anthropic.beta.messages.toolRunner()`
 *
 * @example
 * ```ts
 * const { tools } = await mcpClient.listTools();
 * const runner = await anthropic.beta.messages.toolRunner({
 *   model: "claude-sonnet-4-20250514",
 *   max_tokens: 1024,
 *   tools: mcpTools(tools, mcpClient),
 *   messages: [{ role: "user", content: "Use the available tools" }],
 * });
 * ```
 */
export declare function mcpTools(tools: MCPToolLike[], mcpClient: MCPClientLike, extraProps?: Partial<Omit<BetaTool, 'name' | 'description' | 'input_schema'>>): BetaRunnableTool<Record<string, unknown>>[];
/**
 * Converts an MCP prompt message to an Anthropic BetaMessageParam.
 *
 * @param mcpMessage The MCP prompt message from `mcpClient.getPrompt()`
 * @param extraProps Additional Claude API properties to include in content blocks (e.g., `cache_control`)
 * @returns A message parameter for use with `anthropic.beta.messages.create()`
 * @throws {UnsupportedMCPValueError} When the message contains unsupported content types
 * @throws {UnsupportedMCPValueError} When the message contains unsupported resource links
 * @throws {UnsupportedMCPValueError} When the message contains resources with unsupported MIME types
 *
 * @example
 * ```ts
 * import { Client } from "@modelcontextprotocol/sdk/client/index.js";
 * import Anthropic from "@anthropic-ai/sdk";
 * import { mcpMessage } from "@anthropic-ai/sdk/helpers/beta/mcp";
 *
 * const mcpClient = new Client({ name: "example", version: "1.0.0" });
 * const anthropic = new Anthropic();
 *
 * const prompt = await mcpClient.getPrompt({
 *   name: "example-prompt",
 *   arguments: { arg1: "value" },
 * });
 *
 * await anthropic.beta.messages.create({
 *   model: "claude-sonnet-4-20250514",
 *   max_tokens: 1024,
 *   messages: prompt.messages.map(msg => mcpMessage(msg)),
 * });
 * ```
 */
export declare function mcpMessage(mcpMessage: MCPPromptMessageLike, extraProps?: Partial<Omit<BetaTextBlockParam, 'type' | 'text' | 'source'> & Omit<BetaImageBlockParam, 'type' | 'source'> & Omit<BetaRequestDocumentBlock, 'type' | 'source'>>): BetaMessageParam;
/**
 * Converts an array of MCP prompt messages to Anthropic BetaMessageParams.
 *
 * @param messages Array of MCP prompt messages from `mcpClient.getPrompt()`
 * @param extraProps Additional Claude API properties to include in content blocks (e.g., `cache_control`)
 * @returns An array of message parameters for use with `anthropic.beta.messages.create()`
 * @throws {UnsupportedMCPValueError} When any message contains unsupported content types
 * @throws {UnsupportedMCPValueError} When any message contains unsupported resource links
 * @throws {UnsupportedMCPValueError} When any message contains resources with unsupported MIME types
 *
 * @example
 * ```ts
 * const { messages } = await mcpClient.getPrompt({ name: "example-prompt" });
 * await anthropic.beta.messages.create({
 *   model: "claude-sonnet-4-20250514",
 *   max_tokens: 1024,
 *   messages: mcpMessages(messages),
 * });
 * ```
 */
export declare function mcpMessages(messages: MCPPromptMessageLike[], extraProps?: Partial<Omit<BetaTextBlockParam, 'type' | 'text' | 'source'> & Omit<BetaImageBlockParam, 'type' | 'source'> & Omit<BetaRequestDocumentBlock, 'type' | 'source'>>): BetaMessageParam[];
/**
 * Converts a single MCP prompt content item to an Anthropic content block.
 *
 * @param content The MCP content item (text, image, or embedded resource)
 * @param extraProps Additional Claude API properties to include in the content block (e.g., `cache_control`)
 * @returns A Claude content block for use in a message's content array
 * @throws {UnsupportedMCPValueError} When the content type is not supported (e.g., 'audio')
 * @throws {UnsupportedMCPValueError} When resource links use non-http/https protocols
 * @throws {UnsupportedMCPValueError} When resources have unsupported MIME types
 *
 * @example
 * ```ts
 * const { messages } = await mcpClient.getPrompt({ name: "my-prompt" });
 * // If you need to mix MCP content with other content:
 * await anthropic.beta.messages.create({
 *   model: "claude-sonnet-4-20250514",
 *   max_tokens: 1024,
 *   messages: [{
 *     role: "user",
 *     content: [
 *       mcpContent(messages[0].content),
 *       { type: "text", text: "Additional context" },
 *     ],
 *   }],
 * });
 * ```
 */
export declare function mcpContent(content: MCPPromptContentLike, extraProps?: Partial<Omit<BetaTextBlockParam, 'type' | 'text' | 'source'> & Omit<BetaImageBlockParam, 'type' | 'source'> & Omit<BetaRequestDocumentBlock, 'type' | 'source'>>): BetaTextBlockParam | BetaImageBlockParam | BetaRequestDocumentBlock;
/**
 * Converts MCP resource contents to an Anthropic content block.
 *
 * This helper is useful when you have resource contents from `mcpClient.readResource()`
 * and want to include them in a message or as a document source. It automatically
 * finds the first resource with a supported MIME type.
 *
 * @param result The result from `mcpClient.readResource()`
 * @param extraProps Additional Claude API properties to include in the content block (e.g., `cache_control`)
 * @returns A Claude content block
 * @throws {UnsupportedMCPValueError} When contents array is empty or none have a supported MIME type
 *
 * @example
 * ```ts
 * import { Client } from "@modelcontextprotocol/sdk/client/index.js";
 * import Anthropic from "@anthropic-ai/sdk";
 * import { mcpResourceToContent } from "@anthropic-ai/sdk/helpers/beta/mcp";
 *
 * const mcpClient = new Client({ name: "example", version: "1.0.0" });
 * const anthropic = new Anthropic();
 *
 * const resource = await mcpClient.readResource({ uri: "file:///example.txt" });
 * await anthropic.beta.messages.create({
 *   model: "claude-sonnet-4-20250514",
 *   max_tokens: 1024,
 *   messages: [{
 *     role: "user",
 *     content: [mcpResourceToContent(resource)],
 *   }],
 * });
 * ```
 */
export declare function mcpResourceToContent(result: MCPReadResourceResultLike, extraProps?: Partial<Omit<BetaRequestDocumentBlock, 'type' | 'source'>>): BetaTextBlockParam | BetaImageBlockParam | BetaRequestDocumentBlock;
/**
 * Converts an MCP resource to a File object suitable for uploading via `anthropic.beta.files.upload()`.
 *
 * @param result The result from `mcpClient.readResource()`
 * @returns A File object for use with `anthropic.beta.files.upload()`
 * @throws {UnsupportedMCPValueError} When contents array is empty
 *
 * @example
 * ```ts
 * import { Client } from "@modelcontextprotocol/sdk/client/index.js";
 * import Anthropic from "@anthropic-ai/sdk";
 * import { mcpResourceToFile } from "@anthropic-ai/sdk/helpers/beta/mcp";
 *
 * const mcpClient = new Client({ name: "example", version: "1.0.0" });
 * const anthropic = new Anthropic();
 *
 * const resource = await mcpClient.readResource({ uri: "file:///document.pdf" });
 *
 * const uploaded = await anthropic.beta.files.upload({
 *   file: mcpResourceToFile(resource),
 * });
 * ```
 */
export declare function mcpResourceToFile(result: MCPReadResourceResultLike): File;
//# sourceMappingURL=mcp.d.ts.map
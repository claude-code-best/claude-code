/**
 * Helper functions for integrating MCP (Model Context Protocol) SDK types
 * with the Anthropic SDK.
 *
 * These helpers reduce boilerplate when converting between MCP types and
 * Anthropic API types. The interfaces defined here use TypeScript's structural
 * typing to match MCP SDK types without requiring a direct dependency.
 */
import { ToolError } from "../../lib/tools/ToolError.mjs";
import { SDK_HELPER_SYMBOL, collectStainlessHelpers, stainlessHelperHeader, } from "../../lib/stainless-helper-header.mjs";
import { fromBase64 } from "../../internal/utils/base64.mjs";
export { SDK_HELPER_SYMBOL, collectStainlessHelpers, stainlessHelperHeader };
// -----------------------------------------------------------------------------
// Supported MIME types
// -----------------------------------------------------------------------------
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
function isSupportedImageType(mimeType) {
    return SUPPORTED_IMAGE_TYPES.includes(mimeType);
}
function isSupportedResourceMimeType(mimeType) {
    return (!mimeType ||
        mimeType.startsWith('text/') ||
        mimeType === 'application/pdf' ||
        isSupportedImageType(mimeType));
}
// -----------------------------------------------------------------------------
// Error classes
// -----------------------------------------------------------------------------
/**
 * Error thrown when an MCP value cannot be converted to a format supported by the Claude API.
 */
export class UnsupportedMCPValueError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedMCPValueError';
    }
}
// -----------------------------------------------------------------------------
// Helper functions
// -----------------------------------------------------------------------------
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
export function mcpTool(tool, mcpClient, extraProps) {
    // Transform inputSchema to match BetaTool.InputSchema (convert undefined to null)
    const inputSchema = {
        ...tool.inputSchema,
        type: 'object',
        properties: tool.inputSchema.properties ?? null,
        required: tool.inputSchema.required ?? null,
    };
    const betaTool = {
        name: tool.name,
        input_schema: inputSchema,
        ...(tool.description !== undefined ? { description: tool.description } : {}),
        ...extraProps,
    };
    const runnableTool = {
        ...betaTool,
        run: async (input) => {
            const result = await mcpClient.callTool({
                name: tool.name,
                arguments: input,
            });
            if (result.isError) {
                const content = result.content.map((item) => mcpContent(item));
                throw new ToolError(content);
            }
            // If content is empty but structuredContent is present, JSON encode it
            // Spec: "For backwards compatibility, a tool that returns structured content SHOULD also return the serialized JSON in a TextContent block."
            // meaning it's not required and cannot be assumed.
            if (result.content.length === 0 &&
                // Spec: "Structured content is returned as a JSON object in the structuredContent field of a result."
                typeof result.structuredContent === 'object' &&
                result.structuredContent !== null) {
                return JSON.stringify(result.structuredContent);
            }
            return result.content.map((item) => mcpContent(item));
        },
        parse: (content) => content,
        [SDK_HELPER_SYMBOL]: 'mcpTool',
    };
    return runnableTool;
}
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
export function mcpTools(tools, mcpClient, extraProps) {
    return tools.map((tool) => mcpTool(tool, mcpClient, extraProps));
}
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
export function mcpMessage(mcpMessage, extraProps) {
    const message = {
        role: mcpMessage.role,
        content: [mcpContent(mcpMessage.content, extraProps)],
        [SDK_HELPER_SYMBOL]: 'mcpMessage',
    };
    return message;
}
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
export function mcpMessages(messages, extraProps) {
    return messages.map((message) => mcpMessage(message, extraProps));
}
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
export function mcpContent(content, extraProps) {
    switch (content.type) {
        case 'text': {
            const textBlock = {
                type: 'text',
                text: content.text,
                ...extraProps,
                [SDK_HELPER_SYMBOL]: 'mcpContent',
            };
            return textBlock;
        }
        case 'image': {
            if (!isSupportedImageType(content.mimeType)) {
                throw new UnsupportedMCPValueError(`Unsupported image MIME type: ${content.mimeType}`);
            }
            const imageBlock = {
                type: 'image',
                source: {
                    type: 'base64',
                    data: content.data,
                    media_type: content.mimeType,
                },
                ...extraProps,
                [SDK_HELPER_SYMBOL]: 'mcpContent',
            };
            return imageBlock;
        }
        case 'resource':
            return mcpResourceContentToContentBlock(content.resource, extraProps, 'mcpContent');
        case 'resource_link':
        case 'audio':
            throw new UnsupportedMCPValueError(`Unsupported MCP content type: ${content.type}`);
        default:
            // This should never happen as we handle all MCPPromptContentLike types
            content;
            throw new UnsupportedMCPValueError(`Unsupported MCP content type: ${content.type}`);
    }
}
/**
 * Converts a single MCP resource contents item to an Anthropic content block.
 */
function mcpResourceContentToContentBlock(resourceContent, extraProps, helperName = 'mcpResourceToContent') {
    const mimeType = resourceContent.mimeType;
    // Handle images (requires blob - base64-encoded binary data)
    if (mimeType && isSupportedImageType(mimeType)) {
        if (!('blob' in resourceContent)) {
            throw new UnsupportedMCPValueError(`Image resource must have blob data, not text. URI: ${resourceContent.uri}`);
        }
        const imageBlock = {
            type: 'image',
            source: {
                type: 'base64',
                data: resourceContent.blob,
                media_type: mimeType,
            },
            ...extraProps,
            [SDK_HELPER_SYMBOL]: helperName,
        };
        return imageBlock;
    }
    // Handle PDFs (requires blob - base64-encoded binary data)
    if (mimeType === 'application/pdf') {
        if (!('blob' in resourceContent)) {
            throw new UnsupportedMCPValueError(`PDF resource must have blob data, not text. URI: ${resourceContent.uri}`);
        }
        const pdfBlock = {
            type: 'document',
            source: {
                type: 'base64',
                data: resourceContent.blob,
                media_type: 'application/pdf',
            },
            ...extraProps,
            [SDK_HELPER_SYMBOL]: helperName,
        };
        return pdfBlock;
    }
    // Handle text types (text/*, or no MIME type defaults to text)
    if (!mimeType || mimeType.startsWith('text/')) {
        const textDocBlock = {
            type: 'document',
            source: textSourceFromResource(resourceContent),
            ...extraProps,
            [SDK_HELPER_SYMBOL]: helperName,
        };
        return textDocBlock;
    }
    throw new UnsupportedMCPValueError(`Unsupported MIME type "${mimeType}" for resource: ${resourceContent.uri}`);
}
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
export function mcpResourceToContent(result, extraProps) {
    if (result.contents.length === 0) {
        throw new UnsupportedMCPValueError('Resource contents array must contain at least one item');
    }
    const supported = result.contents.find((c) => isSupportedResourceMimeType(c.mimeType));
    if (!supported) {
        const mimeTypes = result.contents.map((c) => c.mimeType).filter((m) => m !== undefined);
        throw new UnsupportedMCPValueError(`No supported MIME type found in resource contents. Available: ${mimeTypes.join(', ')}`);
    }
    return mcpResourceContentToContentBlock(supported, extraProps);
}
/**
 * Gets the raw bytes from an MCP resource.
 */
function bytesFromResource(resource) {
    if ('blob' in resource) {
        return fromBase64(resource.blob);
    }
    return new TextEncoder().encode(resource.text);
}
/**
 * Creates a text document source from an MCP resource, decoding base64 blob to UTF-8 if needed.
 */
function textSourceFromResource(resource) {
    const data = 'text' in resource ? resource.text : new TextDecoder().decode(fromBase64(resource.blob));
    return { type: 'text', data, media_type: 'text/plain' };
}
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
export function mcpResourceToFile(result) {
    if (result.contents.length === 0) {
        throw new UnsupportedMCPValueError('Resource contents array must contain at least one item');
    }
    const resourceContents = result.contents[0];
    const name = new URL(resourceContents.uri).pathname.split('/').at(-1) || 'file';
    const type = resourceContents.mimeType;
    const data = bytesFromResource(resourceContents);
    const file = new File([data], name, type ? { type } : undefined);
    file[SDK_HELPER_SYMBOL] = 'mcpResourceToFile';
    return file;
}
//# sourceMappingURL=mcp.mjs.map
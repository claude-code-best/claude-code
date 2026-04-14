/**
 * API surface definition for @anthropic-ai/claude-agent-sdk/browser.
 *
 * This file is the source of truth for the browser export's public types.
 * It imports ONLY from agentSdkTypes.ts so the compiled .d.ts has exactly
 * one import to rewrite (./agentSdkTypes → ./sdk) for the flat package layout.
 *
 * Compiled by scripts/build-ant-sdk-typings.sh; see build-agent-sdk.sh for the
 * path rewrite and copy into the package.
 */
import type { CanUseTool, HookCallbackMatcher, HookEvent, McpServerConfig, OnElicitation, Query, SDKUserMessage } from './agentSdkTypes.js';
export type { CanUseTool, ElicitationRequest, ElicitationResult, HookCallbackMatcher, HookEvent, McpSdkServerConfigWithInstance, McpServerConfig, OnElicitation, Query, SDKAssistantMessage, SDKMessage, SDKResultMessage, SDKSystemMessage, SDKUserMessage, } from './agentSdkTypes.js';
export { createSdkMcpServer, tool } from './agentSdkTypes.js';
export type OAuthCredential = {
    type: 'oauth';
    token: string;
};
export type AuthMessage = {
    type: 'auth';
    credential: OAuthCredential;
};
export type WebSocketOptions = {
    url: string;
    headers?: Record<string, string>;
    authMessage?: AuthMessage;
};
export type BrowserQueryOptions = {
    prompt: AsyncIterable<SDKUserMessage>;
    websocket: WebSocketOptions;
    abortController?: AbortController;
    canUseTool?: CanUseTool;
    hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
    mcpServers?: Record<string, McpServerConfig>;
    jsonSchema?: Record<string, unknown>;
    onElicitation?: OnElicitation;
};
/**
 * Create a Claude Code query using WebSocket transport in the browser.
 *
 * @example
 * ```typescript
 * import { query } from '@anthropic-ai/claude-agent-sdk/browser'
 *
 * const messages = query({
 *   prompt: messageStream,
 *   websocket: { url: 'wss://api.example.com/claude' },
 * })
 * for await (const message of messages) {
 *   console.log(message)
 * }
 * ```
 */
export declare function query(options: BrowserQueryOptions): Query;

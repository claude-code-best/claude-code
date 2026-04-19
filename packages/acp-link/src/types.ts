// JSON-RPC 2.0 Types
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcResponse
  | JsonRpcNotification;

// Helper to check message types
export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return "method" in msg && "id" in msg;
}

export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return "id" in msg && !("method" in msg);
}

export function isNotification(
  msg: JsonRpcMessage,
): msg is JsonRpcNotification {
  return "method" in msg && !("id" in msg);
}

// ACP Protocol Types

// Client -> Server messages (from extension to proxy)
export interface ProxyConnectParams {
  command: string; // Command to launch the agent (e.g., "claude-agent")
  args?: string[]; // Optional arguments
  cwd?: string; // Working directory for the agent
}

export interface ProxyMessage {
  type: "connect" | "disconnect" | "message";
  payload?: ProxyConnectParams | JsonRpcMessage;
}

// Server -> Client messages (from proxy to extension)
export interface ProxyStatus {
  type: "status";
  connected: boolean;
  agentInfo?: {
    name?: string;
    version?: string;
  };
  error?: string;
}

export interface ProxyAgentMessage {
  type: "agent_message";
  payload: JsonRpcMessage;
}

export interface ProxyError {
  type: "error";
  message: string;
  code?: string;
}

export type ProxyResponse = ProxyStatus | ProxyAgentMessage | ProxyError;

// ACP Initialization
export interface InitializeParams {
  protocolVersion: string;
  clientInfo: {
    name: string;
    version: string;
  };
  capabilities?: ClientCapabilities;
}

export interface ClientCapabilities {
  streaming?: boolean;
  toolApproval?: boolean;
}

export interface InitializeResult {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities?: ServerCapabilities;
}

export interface ServerCapabilities {
  streaming?: boolean;
  tools?: boolean;
}

// ACP Session
export interface SessionSetupParams {
  sessionId?: string;
  context?: SessionContext;
}

export interface SessionContext {
  workingDirectory?: string;
  files?: string[];
}

// ACP Prompt
export interface PromptParams {
  sessionId: string;
  messages: PromptMessage[];
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: string | ContentPart[];
}

export interface ContentPart {
  type: "text" | "image" | "file";
  text?: string;
  data?: string;
  mimeType?: string;
  path?: string;
}

// Content streaming notification
export interface ContentNotification {
  sessionId: string;
  content: string;
  done?: boolean;
}

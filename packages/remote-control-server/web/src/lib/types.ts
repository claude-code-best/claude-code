// =============================================================================
// Unified Chat Data Model — shared between ACP and RCS chat interfaces
// =============================================================================

import type { ToolCallContent, PermissionOption, PlanEntry } from "../acp/types";

// 工具调用状态
export type ToolCallStatus =
  | "running"
  | "complete"
  | "error"
  | "waiting_for_confirmation"
  | "rejected"
  | "canceled";

// 工具调用数据
export interface ToolCallData {
  id: string;
  title: string;
  status: ToolCallStatus;
  content?: ToolCallContent[];
  rawInput?: Record<string, unknown>;
  rawOutput?: Record<string, unknown>;
  // 权限请求（仅当 status === "waiting_for_confirmation"）
  permissionRequest?: {
    requestId: string;
    options: PermissionOption[];
  };
  // 独立权限请求（无匹配工具调用时创建）
  isStandalonePermission?: boolean;
}

// 助手消息块 — 普通消息或思考过程
export type AssistantChunk =
  | { type: "message"; text: string }
  | { type: "thought"; text: string };

// 用户消息中的图片
export interface UserMessageImage {
  mimeType: string;
  data: string; // base64 encoded
}

// 用户消息条目
export interface UserMessageEntry {
  type: "user_message";
  id: string;
  content: string;
  images?: UserMessageImage[];
}

// 助手消息条目
export interface AssistantMessageEntry {
  type: "assistant_message";
  id: string;
  chunks: AssistantChunk[];
}

// 工具调用条目
export interface ToolCallEntry {
  type: "tool_call";
  toolCall: ToolCallData;
}

// Plan 展示条目（Agent 执行计划）
export interface PlanDisplayEntry {
  type: "plan";
  id: string;
  entries: PlanEntry[];
}

// 统一聊天条目类型
export type ThreadEntry =
  | UserMessageEntry
  | AssistantMessageEntry
  | ToolCallEntry
  | PlanDisplayEntry;

// =============================================================================
// Chat 组件 Props 类型
// =============================================================================

// ChatInput 提交消息
export interface ChatInputMessage {
  text: string;
  images?: UserMessageImage[];
}

// 权限请求条目（用于 PermissionPanel）
export interface PendingPermission {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description?: string;
  options?: PermissionOption[];
}

// 会话列表条目（用于 SessionSidebar）
export interface SessionListItem {
  id: string;
  title?: string | null;
  updatedAt?: string | null;
  isActive?: boolean;
}

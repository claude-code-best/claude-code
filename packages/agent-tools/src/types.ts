// agent-tools — Core Tool interface definitions
// Protocol-level types, independent of any host framework

import type { z } from 'zod/v4'

// ============================================================================
// Schema types
// ============================================================================

/**
 * Zod schema type for any object with string keys.
 * Used as the Input generic constraint for Tool.
 */
export type AnyObject = z.ZodType<{ [key: string]: unknown }>

/**
 * JSON Schema format for MCP tool input schemas.
 * MCP servers provide this directly instead of Zod schemas.
 */
export type ToolInputJSONSchema = {
  [x: string]: unknown
  type: 'object'
  properties?: {
    [x: string]: unknown
  }
}

// ============================================================================
// Progress types
// ============================================================================

/**
 * Progress data from a running tool. Host defines concrete subtypes.
 * Typed as `any` at the protocol level — the host assigns real shapes.
 */
export type ToolProgressData = any

/**
 * A progress event from a tool execution.
 */
export type ToolProgress<P extends ToolProgressData = ToolProgressData> = {
  toolUseID: string
  data: P
}

/**
 * Callback for receiving progress updates during tool execution.
 */
export type ToolCallProgress<P extends ToolProgressData = ToolProgressData> = (
  progress: ToolProgress<P>,
) => void

// ============================================================================
// Result types
// ============================================================================

/**
 * Result returned by a tool's call() method.
 * @template T - The output data type
 * @template Message - The message type (host-specific, defaults to unknown)
 */
export type ToolResult<T, Message = unknown> = {
  data: T
  newMessages?: Message[]
  contextModifier?: (context: any) => any
  /** MCP protocol metadata (structuredContent, _meta) */
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
}

// ============================================================================
// Validation & Permission types
// ============================================================================

/**
 * Result of tool input validation.
 */
export type ValidationResult =
  | { result: true }
  | { result: false; message: string; errorCode: number }

/**
 * Result of a permission check for a tool invocation.
 */
export type PermissionResult =
  | { behavior: 'allow'; updatedInput: Record<string, unknown> }
  | { behavior: 'deny'; message: string }
  | { behavior: 'passthrough' }

// ============================================================================
// Core Tool interface
// ============================================================================

/**
 * The host-agnostic core Tool interface.
 *
 * This defines the protocol-level contract for any tool — independent of
 * React rendering, specific context types, or host infrastructure.
 *
 * The host (Claude Code) extends this with render methods, richer context
 * types, and other host-specific features. Host tools structurally satisfy
 * this interface because they implement all required fields.
 *
 * @template Input - Zod schema type for tool input
 * @template Output - Tool output data type
 * @template P - Tool progress data type
 * @template Context - Tool execution context type (host-specific)
 */
export interface CoreTool<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
  Context = unknown,
> {
  // ── Identity ──
  readonly name: string
  aliases?: string[]
  searchHint?: string

  // ── Schema ──
  readonly inputSchema: Input
  readonly inputJSONSchema?: ToolInputJSONSchema
  outputSchema?: z.ZodType<unknown>

  // ── Execution ──
  call(
    args: z.infer<Input>,
    context: Context,
    canUseTool: (...args: any[]) => Promise<any>,
    parentMessage: any,
    onProgress?: ToolCallProgress<P>,
  ): Promise<ToolResult<Output>>

  // ── Description ──
  description(
    input: z.infer<Input>,
    options: {
      isNonInteractiveSession: boolean
      toolPermissionContext: any
      tools: readonly CoreTool[]
    },
  ): Promise<string>

  prompt(options: {
    getToolPermissionContext: () => Promise<any>
    tools: readonly CoreTool[]
    agents: any[]
    allowedAgentTypes?: string[]
  }): Promise<string>

  // ── Behavioral properties ──
  isConcurrencySafe(input: z.infer<Input>): boolean
  isEnabled(): boolean
  isReadOnly(input: z.infer<Input>): boolean
  isDestructive?(input: z.infer<Input>): boolean
  isOpenWorld?(input: z.infer<Input>): boolean
  interruptBehavior?(): 'cancel' | 'block'
  requiresUserInteraction?(): boolean

  // ── MCP markers ──
  isMcp?: boolean
  isLsp?: boolean
  readonly shouldDefer?: boolean
  readonly alwaysLoad?: boolean
  mcpInfo?: { serverName: string; toolName: string }

  // ── Permissions ──
  validateInput?(
    input: z.infer<Input>,
    context: Context,
  ): Promise<ValidationResult>

  checkPermissions(
    input: z.infer<Input>,
    context: Context,
  ): Promise<PermissionResult>

  // ── Utility ──
  inputsEquivalent?(a: z.infer<Input>, b: z.infer<Input>): boolean
  getPath?(input: z.infer<Input>): string
  toAutoClassifierInput(input: z.infer<Input>): unknown
  backfillObservableInput?(input: Record<string, unknown>): void

  // ── Output ──
  maxResultSizeChars: number
  userFacingName(input: Partial<z.infer<Input>> | undefined): string
  mapToolResultToToolResultBlockParam(
    content: Output,
    toolUseID: string,
  ): any

  // ── Optional output helpers ──
  isResultTruncated?(output: Output): boolean
  getToolUseSummary?(input: Partial<z.infer<Input>> | undefined): string | null
  getActivityDescription?(
    input: Partial<z.infer<Input>> | undefined,
  ): string | null
  isTransparentWrapper?(): boolean
  isSearchOrReadCommand?(input: z.infer<Input>): {
    isSearch: boolean
    isRead: boolean
    isList?: boolean
  }
}

/**
 * A tool with a generic context type.
 * This is the default export — hosts can specify their own Context type.
 */
export type Tool<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = CoreTool<Input, Output, P>

/**
 * A collection of tools.
 */
export type Tools = readonly CoreTool[]

/**
 * SDK Control Types — inferred from Zod schemas in controlSchemas.ts / coreSchemas.ts.
 *
 * These types define the control protocol between the CLI bridge and the server.
 * Used by bridge/transport layer, remote session manager, and CLI print/IO paths.
 */
import type { z } from 'zod'
import type {
  SDKControlRequestSchema,
  SDKControlResponseSchema,
  SDKControlInitializeRequestSchema,
  SDKControlInitializeResponseSchema,
  SDKControlMcpSetServersResponseSchema,
  SDKControlReloadPluginsResponseSchema,
  SDKControlPermissionRequestSchema,
  SDKControlCancelRequestSchema,
  SDKControlRequestInnerSchema,
  StdoutMessageSchema,
  StdinMessageSchema,
} from './controlSchemas.js'
import type { SDKPartialAssistantMessageSchema } from './coreSchemas.js'

export type SDKControlRequest = z.infer<ReturnType<typeof SDKControlRequestSchema>>
export type SDKControlResponse = z.infer<ReturnType<typeof SDKControlResponseSchema>>
export type StdoutMessage = z.infer<ReturnType<typeof StdoutMessageSchema>>
export type SDKControlInitializeRequest = z.infer<ReturnType<typeof SDKControlInitializeRequestSchema>>
export type SDKControlInitializeResponse = z.infer<ReturnType<typeof SDKControlInitializeResponseSchema>>
export type SDKControlMcpSetServersResponse = z.infer<ReturnType<typeof SDKControlMcpSetServersResponseSchema>>
export type SDKControlReloadPluginsResponse = z.infer<ReturnType<typeof SDKControlReloadPluginsResponseSchema>>
export type StdinMessage = z.infer<ReturnType<typeof StdinMessageSchema>>
export type SDKPartialAssistantMessage = z.infer<ReturnType<typeof SDKPartialAssistantMessageSchema>>
export type SDKControlPermissionRequest = z.infer<ReturnType<typeof SDKControlPermissionRequestSchema>>
export type SDKControlCancelRequest = z.infer<ReturnType<typeof SDKControlCancelRequestSchema>>
export type SDKControlRequestInner = z.infer<ReturnType<typeof SDKControlRequestInnerSchema>>

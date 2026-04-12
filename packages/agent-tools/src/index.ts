// agent-tools — Tool interface definitions and registry utilities
// Pure types + pure functions, zero runtime dependencies

export type {
  AnyObject,
  ToolInputJSONSchema,
  ToolProgressData,
  ToolProgress,
  ToolCallProgress,
  ToolResult,
  ValidationResult,
  PermissionResult,
  CoreTool,
  Tool,
  Tools,
} from './types.js'

export { findToolByName, toolMatchesName } from './registry.js'

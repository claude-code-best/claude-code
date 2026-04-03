/**
 * @ant/computer-use-mcp — Stub implementation
 *
 * Provides type-safe stubs where all functions return reasonable default values.
 * Not actually called when feature('CHICAGO_MCP') = false,
 * but ensures imports don't error and types are correct.
 */

import type {
  ComputerUseHostAdapter,
  CoordinateMode,
  GrantFlags,
  Logger,
} from './types'

// Re-export types from types.ts
export type { CoordinateMode, Logger } from './types'
export type {
  ComputerUseConfig,
  ComputerUseHostAdapter,
  CuPermissionRequest,
  CuPermissionResponse,
  CuSubGates,
} from './types'
export { DEFAULT_GRANT_FLAGS } from './types'

// ---------------------------------------------------------------------------
// Types (defined here for callers that import from the main entry)
// ---------------------------------------------------------------------------

export interface DisplayGeometry {
  width: number
  height: number
  displayId?: number
  originX?: number
  originY?: number
}

export interface FrontmostApp {
  bundleId: string
  displayName: string
}

export interface InstalledApp {
  bundleId: string
  displayName: string
  path: string
}

export interface RunningApp {
  bundleId: string
  displayName: string
}

export interface ScreenshotResult {
  base64: string
  width: number
  height: number
}

export type ResolvePrepareCaptureResult = ScreenshotResult

export interface ScreenshotDims {
  width: number
  height: number
  displayWidth: number
  displayHeight: number
  displayId: number
  originX: number
  originY: number
}

export interface CuCallToolResultContent {
  type: 'image' | 'text'
  data?: string
  mimeType?: string
  text?: string
}

export interface CuCallToolResult {
  content: CuCallToolResultContent[]
  telemetry: {
    error_kind?: string
    [key: string]: unknown
  }
}

export type ComputerUseSessionContext = Record<string, unknown>

// ---------------------------------------------------------------------------
// API_RESIZE_PARAMS — Default screenshot resize parameters
// ---------------------------------------------------------------------------

export const API_RESIZE_PARAMS = {
  maxWidth: 1280,
  maxHeight: 800,
  maxPixels: 1280 * 800,
}

// ---------------------------------------------------------------------------
// ComputerExecutor — stub class
// ---------------------------------------------------------------------------

export class ComputerExecutor {
  capabilities: Record<string, boolean> = {}
}

// ---------------------------------------------------------------------------
// Functions — Stubs returning reasonable default values
// ---------------------------------------------------------------------------

/**
 * Calculate target screenshot dimensions.
 * Finds the optimal size between physical dimensions and API limits.
 */
export function targetImageSize(
  physW: number,
  physH: number,
  _params?: typeof API_RESIZE_PARAMS,
): [number, number] {
  const maxW = _params?.maxWidth ?? 1280
  const maxH = _params?.maxHeight ?? 800
  const scale = Math.min(1, maxW / physW, maxH / physH)
  return [Math.round(physW * scale), Math.round(physH * scale)]
}

/**
 * Bind session context and return a tool dispatch function.
 * Stub returns a dispatcher that always returns empty results.
 */
export function bindSessionContext(
  _adapter: ComputerUseHostAdapter,
  _coordinateMode: CoordinateMode,
  _ctx: ComputerUseSessionContext,
): (name: string, args: unknown) => Promise<CuCallToolResult> {
  return async (_name: string, _args: unknown) => ({
    content: [],
    telemetry: {},
  })
}

/**
 * Build the Computer Use tool definition list.
 * Stub returns an empty array (no tools).
 */
export function buildComputerUseTools(
  _capabilities?: Record<string, boolean>,
  _coordinateMode?: CoordinateMode,
  _installedAppNames?: string[],
): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  return []
}

/**
 * Create a Computer Use MCP server.
 * Stub returns null (service not enabled).
 */
export function createComputerUseMcpServer(
  _adapter?: ComputerUseHostAdapter,
  _coordinateMode?: CoordinateMode,
): null {
  return null
}

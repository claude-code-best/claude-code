export type {
  ComputerExecutor,
  DisplayGeometry,
  FrontmostApp,
  InstalledApp,
  ResolvePrepareCaptureResult,
  RunningApp,
  ScreenshotResult,
} from './executor.js'

export type {
  AppGrant,
  CuAppPermTier,
  ComputerUseHostAdapter,
  ComputerUseOverrides,
  ComputerUseSessionContext,
  CoordinateMode,
  CuGrantFlags,
  CuPermissionRequest,
  CuPermissionResponse,
  CuSubGates,
  CuTeachPermissionRequest,
  Logger,
  ResolvedAppRequest,
  ScreenshotDims,
  TeachStepRequest,
  TeachStepResult,
} from './types.js'

export { DEFAULT_GRANT_FLAGS } from './types.js'

export {
  SENTINEL_BUNDLE_IDS,
  getSentinelCategory,
} from './sentinelApps.js'
export type { SentinelCategory } from './sentinelApps.js'

export {
  categoryToTier,
  getDefaultTierForApp,
  getDeniedCategory,
  getDeniedCategoryByDisplayName,
  getDeniedCategoryForApp,
  isPolicyDenied,
} from './deniedApps.js'
export type { DeniedCategory } from './deniedApps.js'

export { isSystemKeyCombo, normalizeKeySequence } from './keyBlocklist.js'

export { ALL_SUB_GATES_OFF, ALL_SUB_GATES_ON } from './subGates.js'

export { API_RESIZE_PARAMS, targetImageSize } from './imageResize.js'
export type { ResizeParams } from './imageResize.js'

export { defersLockAcquire, handleToolCall } from './toolCalls.js'
export type {
  CuCallTelemetry,
  CuCallToolResult,
  CuErrorKind,
} from './toolCalls.js'

export { bindSessionContext, createComputerUseMcpServer } from './mcpServer.js'
export { buildComputerUseTools } from './tools.js'

export {
  comparePixelAtLocation,
  validateClickTarget,
} from './pixelCompare.js'
export type { CropRawPatchFn, PixelCompareResult } from './pixelCompare.js'

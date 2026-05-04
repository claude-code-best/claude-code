/**
 * Platform dispatcher for Computer Use.
 *
 * Loads the correct platform backend based on `process.platform`.
 * Each backend implements the same unified interface.
 */

import type {
  InputPlatform,
  ScreenshotPlatform,
  DisplayPlatform,
  AppsPlatform,
  WindowManagementPlatform,
} from './types.js'

export interface Platform {
  input: InputPlatform
  screenshot: ScreenshotPlatform
  display: DisplayPlatform
  apps: AppsPlatform
  windowManagement?: WindowManagementPlatform
}

let cached: Platform | undefined

export function loadPlatform(): Platform {
  if (cached) return cached

  switch (process.platform) {
    case 'darwin':
      cached = require('./darwin.js').platform
      break
    case 'win32':
      cached = require('./win32.js').platform
      break
    case 'linux':
      cached = require('./linux.js').platform
      break
    default:
      throw new Error(`Computer Use not supported on ${process.platform}`)
  }

  return cached!
}

export type {
  InputPlatform,
  ScreenshotPlatform,
  DisplayPlatform,
  AppsPlatform,
  WindowManagementPlatform,
} from './types.js'
export type {
  WindowHandle,
  ScreenshotResult,
  DisplayInfo,
  InstalledApp,
  FrontmostAppInfo,
  WindowAction,
} from './types.js'

import type { Buffer } from 'buffer'
import { isInBundledMode } from 'src/utils/bundledMode.js'

export type SharpInstance = {
  metadata(): Promise<{ width: number; height: number; format: string }>
  resize(
    width: number,
    height: number,
    options?: { fit?: string; withoutEnlargement?: boolean },
  ): SharpInstance
  jpeg(options?: { quality?: number }): SharpInstance
  png(options?: {
    compressionLevel?: number
    palette?: boolean
    colors?: number
  }): SharpInstance
  webp(options?: { quality?: number }): SharpInstance
  toBuffer(): Promise<Buffer>
}

export type SharpFunction = (input: Buffer) => SharpInstance

type SharpCreatorOptions = {
  create: {
    width: number
    height: number
    channels: 3 | 4
    background: { r: number; g: number; b: number }
  }
}

type SharpCreator = (options: SharpCreatorOptions) => SharpInstance

let imageProcessorModule: { default: SharpFunction } | null = null
let imageCreatorModule: { default: SharpCreator } | null = null

export async function getImageProcessor(): Promise<SharpFunction> {
  if (imageProcessorModule) {
    return imageProcessorModule.default
  }

  if (isInBundledMode()) {
    // 优先尝试加载原生图像处理器
    try {
      // 使用原生图像处理器模块
      const imageProcessor = await import('image-processor-napi')
      const sharpFn = (imageProcessor.sharp ??
        imageProcessor.default) as SharpFunction
      imageProcessorModule = { default: sharpFn }
      return sharpFn
    } catch {
      // Fall back to sharp if native module is not available
      console.warn('原生图像处理器不可用，回退到 sharp')
    }
  }

  // 对于非捆绑构建或作为回退方案，使用 sharp。
  // 单一结构转换：我们的 SharpFunction 是 sharp 实际类型接口的子集。
  const imported = (await import(
    'sharp'
  )) as unknown as MaybeDefault<SharpFunction>
  const sharp = unwrapDefault(imported)
  imageProcessorModule = { default: sharp }
  return sharp
}

/** * 获取图像创建器，用于从头生成新图像。
 * 注意：image-processor-napi 不支持图像创建，
 * 因此始终直接使用 sharp。 */
export async function getImageCreator(): Promise<SharpCreator> {
  if (imageCreatorModule) {
    return imageCreatorModule.default
  }

  const imported = (await import(
    'sharp'
  )) as unknown as MaybeDefault<SharpCreator>
  const sharp = unwrapDefault(imported)
  imageCreatorModule = { default: sharp }
  return sharp
}

// 动态导入的形态因模块互操作模式而异 —— ESM 返回 { default: fn }，CJS 直接返回 fn。
type MaybeDefault<T> = T | { default: T }

function unwrapDefault<T extends (...args: never[]) => unknown>(
  mod: MaybeDefault<T>,
): T {
  return typeof mod === 'function' ? mod : mod.default
}

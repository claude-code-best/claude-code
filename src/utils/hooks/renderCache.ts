import { createHash } from 'node:crypto'

/**
 * AssistantRender hook 的显示层渲染缓存。
 *
 * key = sha1(原文)[:16]（内容寻址，不依赖消息 uuid，resume/rewind 语义自然正确）；
 * value = hook 返回的替换文本。transform 只进本缓存、绝不写回 messages 数组，
 * 因此 transcript 与模型上下文始终保留原文，仅终端显示被替换。
 */
const renderCache = new Map<string, string>()

function renderCacheKey(text: string): string {
  return createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 16)
}

/** 取原文对应的渲染文本；未命中返回 undefined（显示层回退原文） */
export function getCachedRenderedText(text: string): string | undefined {
  return renderCache.get(renderCacheKey(text))
}

/** 写入缓存：AssistantRender hook 返回 updatedBlocks 时按 (原文, 替换文本) 记录 */
export function setMessageRenderCache(
  original: string,
  rendered: string,
): void {
  renderCache.set(renderCacheKey(original), rendered)
  renderCacheVersion++
}

/**
 * 渲染缓存版本号：每次写入/清空自增。
 * MessageRow 的 memo 比较器无法感知模块内缓存变化（prev/next 持同一 message 引用），
 * 因此由 Messages.tsx 把版本号作为 prop 下发，版本变化即强制该行重绘。
 */
let renderCacheVersion = 0

export function getRenderCacheVersion(): number {
  return renderCacheVersion
}

/**
 * 重绘纪元表：uuid → 命中写入时的全局版本号。
 * 静态定格行（滚出视口被 OffscreenFreeze 冻结）对 prop 变化免疫，
 * 由 Messages 把纪元并入行 key 触发该行重挂载（一次性重印，绕过 memo 与冻结）。
 */
const repaintEpochs = new Map<string, number>()

/** 执行器命中替换时调用：标记该消息需要重印 */
export function markMessageForRepaint(uuid: string): void {
  repaintEpochs.set(uuid, renderCacheVersion)
}

/** 该消息的重绘纪元（0 = 从未命中，key 不加后缀） */
export function getRepaintEpoch(uuid: string): number {
  return repaintEpochs.get(uuid) ?? 0
}

/** 清空缓存（会话重置等场景） */
export function clearRenderCache(): void {
  renderCache.clear()
  repaintEpochs.clear()
  renderCacheVersion++
}

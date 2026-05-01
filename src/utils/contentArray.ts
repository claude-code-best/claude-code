/**
 * 用于在内容数组中相对于 tool_result 块插入块的实用工具。由 API 层使用，以正确地将补充内容（例如缓存编辑指令）定位到用户消息中。
 *
 * 放置规则：
 * - 如果存在 tool_result 块：在最后一个之后插入
 * - 否则：在最后一个块之前插入
 * - 如果插入的块会成为最后一个元素，则追加一个文本延续块（某些 API 要求提示不能以非文本内容结尾）
 */

/**
 * 将块插入到内容数组中最后一个 tool_result 块之后。原地修改数组。
 *
 * @param content - 要修改的内容数组
 * @param block - 要插入的块
 */
export function insertBlockAfterToolResults(
  content: unknown[],
  block: unknown,
): void {
  // 找到最后一个 tool_result 块之后的位置
  let lastToolResultIndex = -1
  for (let i = 0; i < content.length; i++) {
    const item = content[i]
    if (
      item &&
      typeof item === 'object' &&
      'type' in item &&
      (item as { type: string }).type === 'tool_result'
    ) {
      lastToolResultIndex = i
    }
  }

  if (lastToolResultIndex >= 0) {
    const insertPos = lastToolResultIndex + 1
    content.splice(insertPos, 0, block)
    // 如果插入的块现在是最后一个，则追加一个文本延续
    if (insertPos === content.length - 1) {
      content.push({ type: 'text', text: '.' })
    }
  } else {
    // 没有 tool_result 块 —— 在最后一个块之前插入
    const insertIndex = Math.max(0, content.length - 1)
    content.splice(insertIndex, 0, block)
  }
}
/** Box 等组件上 `onPaste` / `onPasteCapture` 收到的粘贴事件形状（与括号粘贴解析结果对齐的占位约定）。 */
export type PasteEvent = {
  pastedText: string // 终端括号粘贴模式下解析出的 UTF-8 文本；允许为空字符串以表示空粘贴
}

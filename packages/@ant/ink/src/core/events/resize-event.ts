/** 终端尺寸变化时 `onResize` 回调收到的事件载荷（与 `stdout.columns` / `stdout.rows` 一致）。 */
export type ResizeEvent = {
  columns: number // 当前终端列数（宽度）
  rows: number // 当前终端行数（高度）
}

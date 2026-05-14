/** 渲染帧中虚拟终端光标的状态（列/行坐标与是否绘制），供 diff 与光标 preamble 使用。 */
export type Cursor = {
  x: number // 光标所在列，从 0 开始计
  y: number // 光标所在行，从 0 开始计
  visible: boolean // 本帧是否应在终端绘制光标（隐藏时不发射光标移动序列）
}

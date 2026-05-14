/** 主循环/流式输出旁路指示器所处的交互阶段。 */
export type SpinnerMode =
  | 'tool-input' // 等待用户对工具输入的响应
  | 'tool-use' // 工具执行中
  | 'responding' // 模型正在输出回复
  | 'thinking' // 模型思考/规划（不区分 provider 细节）
  | 'requesting' // 请求已发出、等待首包（含 shimmer 较快节奏）

/** 终端 24 位色（与 Ink `RGBColor` 及渐变插值工具一致）。 */
export type RGBColor = {
  r: number // 红 0–255
  g: number // 绿 0–255
  b: number // 蓝 0–255
}

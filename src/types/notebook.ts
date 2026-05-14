/** Jupyter / nbformat 单元格类型。 */
export type NotebookCellType =
  | 'code' // 可执行代码格
  | 'markdown' // 文档格
  | 'raw' // 原始文本格

/** 原始 notebook 中的流式输出单元。 */
export type NotebookStreamCellOutput = {
  output_type: 'stream' // stdout/stderr 流
  text?: string | string[] // 流片段，可为多段拼接
}

/** execute_result / display_data 的 data 载荷（节选常用键）。 */
export type NotebookDisplayData = Record<string, unknown> & {
  'text/plain'?: string | string[] // 纯文本回退表示
}

/** 原始 notebook 中的执行结果或展示型输出。 */
export type NotebookRichCellOutput = {
  output_type: 'execute_result' | 'display_data' // 执行结果或富展示
  data?: NotebookDisplayData // MIME 桶（含图片/png 等）
}

/** 原始 notebook 中的错误输出。 */
export type NotebookErrorCellOutput = {
  output_type: 'error' // 内核报错
  ename: string // 异常类型名
  evalue: string // 异常消息
  traceback: string[] // 栈跟踪行数组
}

/** 单元格原始输出联合（解析自 ipynb）。 */
export type NotebookCellOutput =
  | NotebookStreamCellOutput
  | NotebookRichCellOutput
  | NotebookErrorCellOutput

/** 解析前的 notebook 单元格（nbformat 子集）。 */
export type NotebookCell = {
  id?: string // 单元格 id（nbformat≥4.5 常见）
  cell_type: NotebookCellType // 单元类型
  source: string | string[] // 单元源码
  execution_count?: number | null // 代码格执行计数
  outputs?: NotebookCellOutput[] // 代码格输出列表
  metadata?: Record<string, unknown> // 额外元数据（编辑工具会写入）
}

/** Notebook 顶层 metadata 中与语言相关的子集。 */
export type NotebookMetadata = {
  language_info?: {
    name?: string // 默认内核语言名（如 python）
  }
}

/** 磁盘上的 `.ipynb` 根结构（用于读入与增量编辑）。 */
export type NotebookContent = {
  nbformat?: number // 主版本号（缺省按 4 处理）
  nbformat_minor?: number // 次版本号（影响 id 策略等）
  cells: NotebookCell[] // 单元序列
  metadata: NotebookMetadata // 文档级元数据
}

/** 规范化后的内联图片载荷（送入模型 image block）。 */
export type NotebookOutputImage = {
  image_data: string // base64 无空白
  media_type: 'image/png' | 'image/jpeg' // MIME 子类型
}

/** 经 `processOutput` 规范化后的流式输出（供工具消息使用）。 */
export type NotebookCellSourceStreamOutput = {
  output_type: 'stream'
  text: string // 已截断/拼接后的文本
}

/** 经 `processOutput` 规范化后的富输出。 */
export type NotebookCellSourceRichOutput = {
  output_type: 'execute_result' | 'display_data'
  text?: string // 从 text/plain 提取的正文
  image?: NotebookOutputImage // 若有 image/png 或 jpeg
}

/** 经 `processOutput` 规范化后的错误输出。 */
export type NotebookCellSourceErrorOutput = {
  output_type: 'error'
  text: string // 合并 ename/evalue/traceback 后的单段文本
}

/** 送入工具链前的单元输出联合。 */
export type NotebookCellSourceOutput =
  | NotebookCellSourceStreamOutput
  | NotebookCellSourceRichOutput
  | NotebookCellSourceErrorOutput

/** 送入模型工具结果的单元摘要结构。 */
export type NotebookCellSource = {
  cellType: NotebookCellType // 与源 cell 对齐的类型
  source: string // 拼接后的单元源码字符串
  execution_count?: number // 代码格保留执行计数
  cell_id: string // 稳定单元 id（无则生成 cell-{index}）
  language?: string // 代码格语言 id（非 python 时标注）
  outputs?: NotebookCellSourceOutput[] // 规范化后的输出列表
}

### Task 3: 异步读取路径改造

**背景:**
当前 `src/utils/readFileInRange.ts` 是 FileReadTool 的核心异步读取函数，提供 fast path（小文件整体读入）和 streaming path（大文件逐块扫描）两条路径，两者均硬编码 `encoding: 'utf8'`，导致非 UTF-8 编码文件读取乱码。本 Task 将两条路径改造为 Buffer 读取 + 编码检测 + TextDecoder 解码模式。fast path 改造简单（整体读 Buffer 后检测解码），streaming path 需要两阶段设计（先收集前 4KB 做编码检测，再用 `TextDecoder({ stream: true })` 逐 chunk 解码）。本 Task 依赖 Task 1（`src/utils/encoding.ts` 的 `detectEncoding` 和 `decodeBuffer`），输出被 Task 4 依赖（通过 `readFileInRange` 的返回值间接影响）。

**涉及文件:**
- 修改: `src/utils/readFileInRange.ts`
- 新建: `src/utils/__tests__/readFileInRange.test.ts`

**执行步骤:**

- [x] 在 `readFileInRange.ts` 中导入 `encoding.ts` 的函数
  - 位置: `src/utils/readFileInRange.ts` 文件顶部 import 区域，在 `import { formatFileSize } from './format.js'` 之后
  - 添加导入:
    ```typescript
    import { detectEncoding, decodeBuffer } from './encoding.js'
    ```
  - 原因: fast path 和 streaming path 都需要 `detectEncoding` 做编码检测，fast path 需要 `decodeBuffer` 做一次性解码

- [x] 改造 fast path — 将 `readFile` 从 UTF-8 字符串读取改为 Buffer 读取 + 检测 + 解码
  - 位置: `src/utils/readFileInRange.ts` 的 `readFileInRange` 函数内 fast path 分支
  - 将以下代码:
    ```typescript
    const text = await readFile(filePath, { encoding: 'utf8', signal })
    return readFileInRangeFast(text, stats.mtimeMs, offset, maxLines, ...)
    ```
    替换为:
    ```typescript
    const rawBuffer = await readFile(filePath, { signal })
    const encoding = detectEncoding(rawBuffer)
    const text = decodeBuffer(rawBuffer, encoding)
    return readFileInRangeFast(text, stats.mtimeMs, offset, maxLines, ...)
    ```
  - 关键变更: `readFile` 去掉 `encoding: 'utf8'` 选项，返回 `Buffer`；调用 `detectEncoding(rawBuffer)` 检测编码；调用 `decodeBuffer(rawBuffer, encoding)` 解码为字符串。
  - 原因: `readFile` 的 `encoding` 选项只支持 `BufferEncoding`，不支持 `gbk` 等 ICU 编码名

- [x] 改造 streaming path — 扩展 `StreamState` 类型，增加编码检测和解码相关字段
  - 位置: `src/utils/readFileInRange.ts` 的 `StreamState` 类型定义
  - 在现有字段之后添加以下字段:
    ```typescript
    type StreamState = {
      // ... 现有字段保持不变 ...
      /** 编码检测状态：null 表示尚未检测，string 表示已检测完成 */
      encoding: string | null
      /** TextDecoder 实例：检测完成后创建，用于逐 chunk 流式解码 */
      decoder: TextDecoder | null
      /** 检测阶段缓冲区：收集原始字节直到满 4KB 或 stream 结束 */
      detectionBuffer: number[]
    }
    ```
  - 原因: streaming 模式下 chunk 是增量到达的，需要缓冲阶段收集足够字节来调用 `detectEncoding`

- [x] 改造 `streamOnData` — 处理 Buffer chunk，实现两阶段（检测阶段 + 解码阶段）
  - 位置: `src/utils/readFileInRange.ts` 的 `streamOnData` 函数
  - 将函数签名从 `streamOnData(this: StreamState, chunk: string): void` 改为 `streamOnData(this: StreamState, chunk: Buffer): void`
  - 替换函数体为两阶段逻辑:
    ```typescript
    function streamOnData(this: StreamState, chunk: Buffer): void {
      this.totalBytesRead += chunk.length

      // ... maxBytes 检查保持不变 ...

      // Phase 1: 编码检测阶段
      if (this.encoding === null) {
        for (let i = 0; i < chunk.length; i++) {
          this.detectionBuffer.push(chunk[i])
        }
        if (this.detectionBuffer.length >= 4096) {
          this.encoding = detectEncoding(Buffer.from(this.detectionBuffer))
          this.decoder = new TextDecoder(this.encoding, { stream: true })
          const decoded = this.decoder.decode(Buffer.from(this.detectionBuffer))
          this.detectionBuffer = []
          processTextChunk(this, decoded)
        }
        return
      }

      // Phase 2: 解码阶段
      const decoded = this.decoder!.decode(chunk, { stream: true })
      processTextChunk(this, decoded)
    }
    ```
  - 原因: 两阶段设计确保编码检测在足够数据上执行（至少 4KB），检测完成后用 `TextDecoder({ stream: true })` 逐 chunk 解码

- [x] 提取行扫描逻辑为独立的 `processTextChunk` 辅助函数
  - 位置: `src/utils/readFileInRange.ts`，在 `streamOnData` 函数定义之前
  - 从原 `streamOnData` 提取行扫描逻辑到独立函数 `processTextChunk(state: StreamState, text: string): void`
  - 行扫描逻辑与原实现完全一致，仅变量名从 `this.` 改为 `state.`
  - 原因: 检测阶段和解码阶段复用同一段行扫描逻辑

- [x] 改造 `streamOnEnd` — 处理检测阶段缓冲区残留和最终 fragment
  - 位置: `src/utils/readFileInRange.ts` 的 `streamOnEnd` 函数
  - 在函数体开头插入检测阶段完成逻辑:
    ```typescript
    if (this.encoding === null) {
      this.encoding = detectEncoding(Buffer.from(this.detectionBuffer))
      this.decoder = new TextDecoder(this.encoding, { stream: true })
      const decoded = this.decoder.decode(Buffer.from(this.detectionBuffer))
      this.detectionBuffer = []
      processTextChunk(this, decoded)
    }
    ```
  - 原因: 小文件可能 < 4KB，stream 在检测缓冲区未满时就结束。必须在 `streamOnEnd` 中完成检测和解码

- [x] 改造 `readFileInRangeStreaming` — 创建 Buffer 模式的 stream，初始化新增字段
  - 位置: `src/utils/readFileInRange.ts` 的 `readFileInRangeStreaming` 函数
  - 将 `createReadStream` 调用去掉 `encoding: 'utf8'` 选项
  - 在 `state` 对象初始化中添加新字段: `encoding: null, decoder: null, detectionBuffer: []`
  - 原因: 去掉 `encoding: 'utf8'` 后，`data` 事件回调接收 `Buffer` 对象

- [x] 更新文件顶部注释，反映编码检测能力
  - 位置: `src/utils/readFileInRange.ts` 文件顶部注释
  - 注释已更新为: `Both paths auto-detect encoding via encoding.ts (BOM → UTF-8 fatal → fallback chain), decode with TextDecoder, and strip BOM and \r (CRLF → LF).`

- [x] 为改造后的 `readFileInRange` 编写单元测试
  - 测试文件: `src/utils/__tests__/readFileInRange.test.ts`
  - 测试场景:
    - **Fast path — UTF-8 文件**: 创建临时 UTF-8 文件 → 返回正确的 `content`、`lineCount`、`totalLines`
    - **Fast path — GBK 文件**: 创建临时 GBK 编码文件 → 返回正确的中文内容（非乱码），`totalBytes` 正确
    - **Fast path — 带行范围读取 GBK 文件**: 创建包含多行的 GBK 文件 → 返回指定行范围，内容正确
    - **Streaming path — 大 UTF-8 文件**: 创建超过 10MB 阈值的 UTF-8 文件 → 返回正确内容
    - **Streaming path — 大 GBK 文件**: 创建超过 10MB 阈值的 GBK 编码文件 → 返回正确的中文内容
    - **BOM 剥离**: 创建带 UTF-8 BOM 的文件 → `content` 不包含 BOM 字符
    - **空文件**: 创建空文件 → `content` 为空字符串，`totalLines` 为 1，`totalBytes` 为 0
  - 运行命令: `bun test src/utils/__tests__/readFileInRange.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 `readFileInRange.ts` 已导入 `encoding.ts` 的函数
  - `grep -n "detectEncoding\|decodeBuffer" src/utils/readFileInRange.ts`
  - 预期: import 行包含 `detectEncoding` 和 `decodeBuffer`，函数体中包含调用

- [x] 验证 streaming path 不再硬编码 `encoding: 'utf8'`
  - `grep -n "encoding: 'utf8'\|encoding: \"utf8\"" src/utils/readFileInRange.ts`
  - 预期: 无匹配结果

- [x] 验证 `createReadStream` 调用无 encoding 选项
  - `grep -A3 "createReadStream" src/utils/readFileInRange.ts`
  - 预期: `createReadStream` 的选项对象中不包含 `encoding` 属性

- [x] 验证 `StreamState` 类型包含编码检测新字段
  - `grep -n "encoding:\|decoder:\|detectionBuffer:" src/utils/readFileInRange.ts`
  - 预期: `StreamState` 类型定义中包含 `encoding`、`decoder`、`detectionBuffer` 字段

- [x] 验证 `processTextChunk` 函数存在
  - `grep -n "function processTextChunk" src/utils/readFileInRange.ts`
  - 预期: 函数定义存在

- [x] 运行 readFileInRange 单元测试
  - `bun test src/utils/__tests__/readFileInRange.test.ts`
  - 预期: 所有测试通过

- [x] 运行 precheck 确认无类型/lint/测试错误
  - `bun run precheck`
  - 预期: 零错误通过

**认知变更:**
- [x] [CLAUDE.md] `readFileInRange.ts` 的 streaming path 使用两阶段编码检测：先收集前 4KB 字节调用 `detectEncoding`，再用 `TextDecoder({ stream: true })` 逐 chunk 流式解码。`TextDecoder` 的 `{ stream: true }` 模式会自动处理多字节字符跨 chunk 边界问题。对于 < 4KB 的小文件，检测在 `streamOnEnd` 中完成。

---

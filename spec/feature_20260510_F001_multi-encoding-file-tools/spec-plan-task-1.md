### Task 1: 编码检测核心模块

**背景:**
当前 `src/utils/fileRead.ts` 的 `detectEncodingForResolvedPath` 仅通过 BOM 头识别 UTF-8 和 UTF-16LE，其他所有文件一律返回 `utf8`，导致 GBK 等非 UTF-8 编码文件读取乱码。本 Task 新建独立的编码检测工具模块 `src/utils/encoding.ts`，实现三层编码检测算法（BOM → UTF-8 fatal 验证 → GBK 回退），为后续 Task 2/3/4 的读写路径改造提供统一的编码检测和解码能力。本 Task 无前置依赖，是后续所有 Task 的基础。

**涉及文件:**
- 新建: `src/utils/encoding.ts`
- 新建: `src/utils/__tests__/encoding.test.ts`

**执行步骤:**

- [x] 创建 `src/utils/encoding.ts`，定义类型
  - 位置: 文件顶部
  - 导出以下类型:
    ```typescript
    /** 扩展编码类型，覆盖最常见的非 UTF-8 CJK 编码 */
    export type FileEncoding = BufferEncoding | 'gbk'

    /** TextDecoder 接受的编码名（string），比 FileEncoding 更宽泛 */
    export type DetectedEncoding = string
    ```
  - 原因: 后续 Task 2/3/4 需要这些类型来做编码标注和类型收窄

- [x] 实现 `detectEncoding(buffer: Buffer): FileEncoding` 函数
  - 位置: `src/utils/encoding.ts`，类型定义之后
  - 三层检测逻辑:
    ```typescript
    export function detectEncoding(buffer: Buffer): FileEncoding {
      // Layer 1: BOM 检测（与现有 fileRead.ts 逻辑一致）
      if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return 'utf-16le'
      }
      if (
        buffer.length >= 3 &&
        buffer[0] === 0xef &&
        buffer[1] === 0xbb &&
        buffer[2] === 0xbf
      ) {
        return 'utf-8'
      }

      // Layer 2: UTF-8 fatal 验证
      // fatal: true 模式下，无效 UTF-8 字节序列会抛出 TypeError
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buffer)
        return 'utf-8'
      } catch {
        // 不是合法 UTF-8，进入 Layer 3
      }

      // Layer 3: GBK 回退
      try {
        new TextDecoder('gbk', { fatal: true }).decode(buffer)
        return 'gbk'
      } catch {
        // 不是合法 GBK，latin1 作为最终兜底
      }

      return 'latin1'
    }
    ```
  - 原因: BOM 必须优先于 fatal 验证；GBK 作为唯一回退避免了多编码链的字节歧义问题；latin1 单字节编码永远成功

- [x] 实现 `decodeBuffer(buffer: Buffer, encoding: DetectedEncoding): string` 函数
  - 位置: `src/utils/encoding.ts`，`detectEncoding` 之后
  - 逻辑:
    ```typescript
    export function decodeBuffer(
      buffer: Buffer,
      encoding: DetectedEncoding,
    ): string {
      return new TextDecoder(encoding).decode(buffer)
    }
    ```
  - 原因: 统一解码入口，后续 Task 2/3 的读取路径都调用此函数

- [x] 实现 `encodeString(content: string, encoding: DetectedEncoding): { buffer: Buffer; converted: boolean }` 函数
  - 位置: `src/utils/encoding.ts`，`decodeBuffer` 之后
  - 逻辑:
    ```typescript
    export function encodeString(
      content: string,
      encoding: DetectedEncoding,
    ): { buffer: Buffer; converted: boolean } {
      if (encoding === 'utf-8' || encoding === 'utf8') {
        return { buffer: Buffer.from(content, 'utf-8'), converted: false }
      }
      if (encoding === 'utf-16le') {
        return { buffer: Buffer.from(content, 'utf-16le'), converted: false }
      }

      // 其他编码（如 gbk）：尝试 Buffer.from，失败则回退为 UTF-8
      try {
        const buf = Buffer.from(content, encoding as BufferEncoding)
        return { buffer: buf, converted: false }
      } catch {
        return { buffer: Buffer.from(content, 'utf-8'), converted: true }
      }
    }
    ```
  - 原因: `Buffer.from` 在 Bun 中可能支持 GBK 编码名，但 Node.js 不支持。try-catch 策略兼容两种运行时；`converted` 标志让 Task 4 的写入路径能向用户报告编码转换

- [x] 为编码检测和解码函数编写单元测试
  - 测试文件: `src/utils/__tests__/encoding.test.ts`
  - 测试场景:
    - **BOM 检测 — UTF-16LE**: 输入 `Buffer.from([0xff, 0xfe, 0x48, 0x00])` → 预期返回 `'utf-16le'`
    - **BOM 检测 — UTF-8 BOM**: 输入 `Buffer.from([0xef, 0xbb, 0xbf, 0x48, 0x65])` → 预期返回 `'utf-8'`
    - **UTF-8 验证**: 输入 `Buffer.from('Hello, 世界', 'utf-8')` → 预期返回 `'utf-8'`
    - **GBK 检测**: 输入 `Buffer.from([0xc4, 0xe3, 0xba, 0xc3])` → 预期返回 `'gbk'`
    - **空 buffer**: 输入 `Buffer.alloc(0)` → 预期返回 `'utf-8'`
    - **latin1 兜底**: 输入随机字节 `Buffer.from([0x80, 0x81, 0x82, 0x83, 0x84, 0x85])` → 预期返回 `'latin1'`
    - **BOM 优先于内容分析**: 输入带 UTF-8 BOM 的数据 → 预期返回 `'utf-8'`
    - **decodeBuffer — UTF-8**: 输入 UTF-8 编码的 buffer + encoding `'utf-8'` → 预期返回正确的中文字符串
    - **decodeBuffer — GBK**: 输入 GBK 编码的 buffer + encoding `'gbk'` → 预期返回正确的中文字符串
    - **decodeBuffer — UTF-16LE**: 输入 UTF-16LE 编码的 buffer + encoding `'utf-16le'` → 预期返回正确字符串
    - **decodeBuffer — 空 buffer**: 输入空 buffer → 预期返回空字符串
    - **encodeString — UTF-8**: 输入字符串 + encoding `'utf-8'` → 预期 `{ converted: false }`
    - **encodeString — utf8 别名**: 输入字符串 + encoding `'utf8'` → 预期 `{ converted: false }`
    - **encodeString — UTF-16LE**: 输入字符串 + encoding `'utf-16le'` → 预期 `{ converted: false }`
    - **encodeString — GBK**: 输入字符串 + encoding `'gbk'` → 预期返回有效的 Buffer（converted 视运行时而定）
  - 运行命令: `bun test src/utils/__tests__/encoding.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 `encoding.ts` 文件存在且导出正确
  - `grep -c "export" src/utils/encoding.ts`
  - 预期: 输出 >= 4（至少导出 FileEncoding, DetectedEncoding, detectEncoding, decodeBuffer, encodeString 共 5 个导出）

- [x] 验证类型检查通过
  - `bunx tsc --noEmit src/utils/encoding.ts 2>&1 | head -5`
  - 预期: 无类型错误输出

- [x] 运行编码检测单元测试
  - `bun test src/utils/__tests__/encoding.test.ts`
  - 预期: 所有测试通过，无失败用例

**认知变更:**
- [x] [CLAUDE.md] `src/utils/encoding.ts` 是文件编码检测的唯一入口，提供 `detectEncoding`（三层检测：BOM → UTF-8 fatal → GBK 回退）和 `decodeBuffer`/`encodeString` 函数。检测基于文件头部 4KB，零外部依赖，仅使用 TextDecoder API。`FileEncoding` 类型为 `BufferEncoding | 'gbk'`，覆盖最常见非 UTF-8 CJK 编码。latin1 作为最终兜底编码（单字节编码永远成功）。

---

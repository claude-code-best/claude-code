### Task 4: 写入路径和工具层适配

**背景:**
[业务语境] — 当用户通过 FileEditTool 或 FileWriteTool 编辑非 UTF-8 编码文件（如 GBK）时，写入操作需要将内部 UTF-8 字符串编码回原文件编码，否则写入的内容会乱码。当前 `writeTextContent` 只接受 `BufferEncoding` 类型，无法处理 gbk 等编码。
[修改原因] — `writeTextContent` 的 `encoding` 参数类型为 `BufferEncoding`，`writeFileSyncAndFlush_DEPRECATED` 内部直接将 encoding 传给 `fs.writeFileSync`（只接受标准 BufferEncoding）。`FileEditTool.validateInput` 中硬编码了 BOM-only 编码检测，无法识别 GBK 文件。
[上下游影响] — 本 Task 依赖 Task 1 创建的 `encodeString` 函数和 `FileEncoding` 类型。`FileEditTool` 和 `FileWriteTool` 通过 `writeTextContent` 间接依赖本 Task 的改造。BashTool 和 NotebookEditTool 也调用 `writeTextContent`，签名变更后它们无需额外改动（encoding 参数类型由上游传入，自动兼容）。

**涉及文件:**
- 修改: `src/utils/file.ts`
- 修改: `packages/builtin-tools/src/tools/FileEditTool/FileEditTool.ts`

**执行步骤:**

- [x] 在 `src/utils/file.ts` 中合并 `encodeString` 到 Task 2 已创建的 `encoding.js` 导入
  - 位置: 文件导入区域，Task 2 已添加的 `import { type FileEncoding, decodeBuffer } from './encoding.js'` 行
  - 将该行改为: `import { type FileEncoding, decodeBuffer, encodeString } from './encoding.js'`
  - 原因: 避免对同一模块创建两个 import 语句

- [x] 将 `writeTextContent` 的 `encoding` 参数类型从 `BufferEncoding` 改为 `FileEncoding`
  - 位置: `src/utils/file.ts:writeTextContent()`
  - 修改函数签名:
    ```typescript
    export function writeTextContent(
      filePath: string,
      content: string,
      encoding: FileEncoding,
      endings: LineEndingType,
    ): void
    ```
  - 修改函数体，在行尾处理之后、调用 `writeFileSyncAndFlush_DEPRECATED` 之前，增加编码判断逻辑:
    ```typescript
    const BUFFER_ENCODINGS = new Set<string>([
      'utf8', 'utf-8', 'utf16le', 'ucs2', 'ucs-2',
      'ascii', 'latin1', 'binary', 'base64', 'hex',
    ])

    if (BUFFER_ENCODINGS.has(encoding)) {
      writeFileSyncAndFlush_DEPRECATED(filePath, toWrite, { encoding: encoding as BufferEncoding })
    } else {
      // 非 BufferEncoding（如 gbk），使用 encodeString 获取 Buffer
      const { buffer, converted } = encodeString(toWrite, encoding)
      writeFileSyncAndFlush_DEPRECATED(filePath, buffer, { buffer })
      if (converted) {
        logForDebugging(
          `writeTextContent: encoding '${encoding}' unsupported for write, fell back to UTF-8 for ${filePath}`,
          { level: 'warn' },
        )
      }
    }
    ```
  - 原因: `fs.writeFileSync` 只接受标准 BufferEncoding，对于 gbk 等编码必须先转为 Buffer 再写入

- [x] 扩展 `writeFileSyncAndFlush_DEPRECATED` 支持 Buffer 写入
  - 位置: `src/utils/file.ts:writeFileSyncAndFlush_DEPRECATED()`
  - 修改函数签名中 `content` 参数类型和 `options` 类型:
    ```typescript
    export function writeFileSyncAndFlush_DEPRECATED(
      filePath: string,
      content: string | Buffer,
      options: { encoding?: BufferEncoding; mode?: number; buffer?: Buffer } = {},
    ): void
    ```
  - 修改原子写入路径的 `writeOptions` 构建逻辑:
    ```typescript
    const isBufferWrite = Buffer.isBuffer(content) || options.buffer !== undefined
    const writeData = options.buffer ?? content
    const writeOptions: {
      encoding?: BufferEncoding
      flush: boolean
      mode?: number
    } = {
      flush: true,
      ...(isBufferWrite ? {} : { encoding: options.encoding ?? 'utf-8' }),
    }
    ```
  - 修改非原子回退路径，使用相同的 `isBufferWrite` / `writeData` / `writeOptions` 模式
  - 原因: `fs.writeFileSync(path, buffer)` 可以直接写入 Buffer，不需要 encoding 参数

- [x] 在 `FileEditTool.ts` 中导入 `FileEncoding` 和 `detectEncoding` / `decodeBuffer`
  - 位置: `packages/builtin-tools/src/tools/FileEditTool/FileEditTool.ts` 导入区域
  - 添加: `import { detectEncoding, decodeBuffer, type FileEncoding } from 'src/utils/encoding.js'`
  - 原因: `validateInput` 编码检测和 `readFileForEdit` 返回类型需要 `FileEncoding` 类型

- [x] 将 `readFileForEdit` 返回类型中的 `encoding` 从 `BufferEncoding` 改为 `FileEncoding`
  - 位置: `packages/builtin-tools/src/tools/FileEditTool/FileEditTool.ts:readFileForEdit()`
  - 修改返回类型声明:
    ```typescript
    function readFileForEdit(absoluteFilePath: string): {
      content: string
      fileExists: boolean
      encoding: FileEncoding
      lineEndings: LineEndingType
    }
    ```
  - 原因: `readFileSyncWithMetadata` 返回的 `encoding` 类型已由 Task 2 改为 `FileEncoding`

- [x] 改造 `FileEditTool.validateInput` 中的编码检测逻辑
  - 位置: `packages/builtin-tools/src/tools/FileEditTool/FileEditTool.ts:validateInput()`
  - 将现有的 BOM-only 编码检测:
    ```typescript
    const encoding: BufferEncoding =
      fileBuffer.length >= 2 && fileBuffer[0] === 0xff && fileBuffer[1] === 0xfe
        ? 'utf16le'
        : 'utf8'
    fileContent = fileBuffer.toString(encoding).replaceAll('\r\n', '\n')
    ```
  - 替换为:
    ```typescript
    const encoding: FileEncoding = detectEncoding(fileBuffer)
    fileContent = decodeBuffer(fileBuffer, encoding).replaceAll('\r\n', '\n')
    ```
  - 原因: 使 validateInput 也能正确识别 GBK 文件，避免编辑时因编码检测不一致导致 old_string 匹配失败

- [x] 为 `writeTextContent` 的多编码写入能力编写单元测试
  - 测试文件: `src/utils/__tests__/file.test.ts`
  - 在现有测试 describe 块之后追加新的 describe('writeTextContent with multi-encoding') 块
  - 测试场景:
    - UTF-8 写入: 写入 UTF-8 内容 → 文件内容正确，无回退警告
    - UTF-16LE 写入: 写入 UTF-16LE 内容（含 BOM） → 文件二进制内容与预期一致
    - GBK 写入回退: 对 gbk 编码调用 `writeTextContent` → 文件以 UTF-8 写入（`encodeString` 回退行为），内容不损坏
    - CRLF 行尾 + GBK: `endings: 'CRLF'` + gbk 编码 → 行尾正确转换为 `\r\n`，编码回退为 UTF-8
  - 注意: 需要 mock `src/utils/debug.ts`（使用共享 mock `tests/mocks/debug.ts`）
  - 运行命令: `bun test src/utils/__tests__/file.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证 `writeTextContent` 签名使用 `FileEncoding` 类型
  - `grep -n 'encoding: FileEncoding' src/utils/file.ts`
  - 预期: 输出包含 `writeTextContent` 函数定义行

- [x] 验证 `writeFileSyncAndFlush_DEPRECATED` 支持 Buffer 写入
  - `grep -n 'content: string | Buffer' src/utils/file.ts`
  - 预期: 输出包含 `writeFileSyncAndFlush_DEPRECATED` 函数定义行

- [x] 验证 `FileEditTool.readFileForEdit` 返回类型已更新
  - `grep -n 'encoding: FileEncoding' packages/builtin-tools/src/tools/FileEditTool/FileEditTool.ts`
  - 预期: 输出包含 `readFileForEdit` 函数的返回类型声明

- [x] 验证 `FileEditTool.validateInput` 使用 `detectEncoding`
  - `grep -n 'detectEncoding' packages/builtin-tools/src/tools/FileEditTool/FileEditTool.ts`
  - 预期: 输出包含 validateInput 内部的调用

- [x] 运行 file.ts 单元测试
  - `bun test src/utils/__tests__/file.test.ts`
  - 预期: 所有测试通过，无新增失败

- [x] 运行 FileEditTool 工具函数测试
  - `bun test packages/builtin-tools/src/tools/FileEditTool/__tests__/utils.test.ts`
  - 预期: 所有现有测试通过

- [x] 运行完整 precheck
  - `bun run precheck`
  - 预期: typecheck + lint + test 零错误通过

---

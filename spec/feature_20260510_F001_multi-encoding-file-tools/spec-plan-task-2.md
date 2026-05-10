### Task 2: 同步读取路径集成

**背景:**
当前同步读取路径（`fileRead.ts` → `file.ts` → `fileReadCache.ts`）的编码检测仅通过 BOM 头识别 UTF-8 和 UTF-16LE，非 BOM 编码文件一律按 UTF-8 读取导致乱码。本 Task 将 `detectEncodingForResolvedPath` 的内部实现从 BOM-only 升级为调用 Task 1 创建的 `encoding.ts` 三层检测，并将返回类型从 `BufferEncoding` 扩展为 `FileEncoding`。同时将所有 `fs.readFileSync(path, { encoding })` 调用改为先读 Buffer 再用 `decodeBuffer` 解码，以支持 `gbk` 等非 `BufferEncoding` 编码。本 Task 依赖 Task 1（`src/utils/encoding.ts`），输出被 Task 4（写入路径适配）依赖。

**涉及文件:**
- 修改: `src/utils/fileRead.ts`
- 修改: `src/utils/file.ts`
- 修改: `src/utils/fileReadCache.ts`
- 新建: `src/utils/__tests__/fileRead.test.ts`

**执行步骤:**

- [x] 在 `fileRead.ts` 中导入 `encoding.ts` 的类型和函数
  - 位置: `src/utils/fileRead.ts` 文件顶部 import 区域，在 `import { getFsImplementation, safeResolvePath } from './fsOperations.js'` 之后
  - 添加导入:
    ```typescript
    import { type FileEncoding, decodeBuffer, detectEncoding } from './encoding.js'
    ```
  - 原因: 后续步骤需要 `FileEncoding` 类型、`detectEncoding` 检测函数和 `decodeBuffer` 解码函数

- [x] 改造 `detectEncodingForResolvedPath` 函数，使用 `encoding.ts` 的三层检测
  - 位置: `src/utils/fileRead.ts` 的 `detectEncodingForResolvedPath` 函数
  - 将函数体替换为以下逻辑:
    ```typescript
    export function detectEncodingForResolvedPath(
      resolvedPath: string,
    ): FileEncoding {
      const { buffer, bytesRead } = getFsImplementation().readSync(resolvedPath, {
        length: 4096,
      })

      // Empty files default to utf8 — nothing to detect
      if (bytesRead === 0) {
        return 'utf8'
      }

      return detectEncoding(buffer.subarray(0, bytesRead))
    }
    ```
  - 关键变更:
    - 返回类型从 `BufferEncoding` 改为 `FileEncoding`
    - 删除内联的 BOM 检测逻辑，改为调用 `detectEncoding(buffer.subarray(0, bytesRead))`
    - 使用 `buffer.subarray(0, bytesRead)` 截取实际读取的字节，避免尾部零字节干扰检测
  - 原因: 将检测逻辑委托给 `encoding.ts` 的三层算法，消除代码重复

- [x] 改造 `readFileSyncWithMetadata` 函数，支持非 `BufferEncoding` 解码
  - 位置: `src/utils/fileRead.ts` 的 `readFileSyncWithMetadata` 函数
  - 将函数签名和内部逻辑改为:
    ```typescript
    export function readFileSyncWithMetadata(filePath: string): {
      content: string
      encoding: FileEncoding
      lineEndings: LineEndingType
    } {
      const fs = getFsImplementation()
      const { resolvedPath, isSymlink } = safeResolvePath(fs, filePath)

      if (isSymlink) {
        logForDebugging(`Reading through symlink: ${filePath} -> ${resolvedPath}`)
      }

      const encoding = detectEncodingForResolvedPath(resolvedPath)
      // Read raw Buffer first — fs.readFileSync encoding option only accepts
      // BufferEncoding, not gbk etc.
      const rawBuffer = fs.readFileBytesSync(resolvedPath)
      const raw = decodeBuffer(rawBuffer, encoding)
      const lineEndings = detectLineEndingsForString(raw.slice(0, 4096))
      return {
        content: raw.replaceAll('\r\n', '\n'),
        encoding,
        lineEndings,
      }
    }
    ```
  - 关键变更:
    - 返回类型中 `encoding` 从 `BufferEncoding` 改为 `FileEncoding`
    - `fs.readFileSync(resolvedPath, { encoding })` 改为 `fs.readFileBytesSync(resolvedPath)` 读取 Buffer
    - 新增 `decodeBuffer(rawBuffer, encoding)` 解码为字符串
  - 原因: `fs.readFileSync` 的 `encoding` 选项只接受 `BufferEncoding`（utf8/utf16le/latin1 等），传入 `'gbk'` 会在运行时报错

- [x] 更新 `file.ts` 中 `detectFileEncoding` 的返回类型
  - 位置: `src/utils/file.ts` 的 `detectFileEncoding` 函数签名
  - 将 `): BufferEncoding {` 改为 `): FileEncoding {`
  - 在文件顶部 import 区域添加:
    ```typescript
    import { type FileEncoding, decodeBuffer, encodeString } from './encoding.js'
    ```
  - 原因: `detectFileEncoding` 调用 `detectEncodingForResolvedPath`，返回类型已改为 `FileEncoding`

- [x] 更新 `file.ts` 中 `detectLineEndings` 的 encoding 参数类型和解码逻辑
  - 位置: `src/utils/file.ts` 的 `detectLineEndings` 函数
  - 将函数签名改为:
    ```typescript
    export function detectLineEndings(
      filePath: string,
      encoding: FileEncoding = 'utf8',
    ): LineEndingType {
    ```
  - 将内部 `buffer.toString(encoding, 0, bytesRead)` 改为:
    ```typescript
    const content = decodeBuffer(buffer.subarray(0, bytesRead), encoding)
    ```
  - 原因: `buffer.toString('gbk')` 不可靠，统一使用 `decodeBuffer` 通过 `TextDecoder` 解码

- [x] 更新 `fileReadCache.ts` 的类型和解码逻辑
  - 位置: `src/utils/fileReadCache.ts`
  - 在文件顶部 import 区域添加:
    ```typescript
    import { type FileEncoding, decodeBuffer } from './encoding.js'
    ```
  - 将 `CachedFileData` 类型中 `encoding: BufferEncoding` 改为 `encoding: FileEncoding`
  - 将 `readFile` 方法返回类型改为 `{ content: string; encoding: FileEncoding }`
  - 将缓存未命中读取逻辑改为:
    ```typescript
    const encoding = detectFileEncoding(filePath)
    const rawBuffer = fs.readFileBytesSync(filePath)
    const content = decodeBuffer(rawBuffer, encoding).replaceAll('\r\n', '\n')
    ```
  - 原因: 与 `fileRead.ts` 相同——必须改为 Buffer 读取 + `decodeBuffer` 解码

- [x] 为改造后的 `detectEncodingForResolvedPath` 和 `readFileSyncWithMetadata` 编写单元测试
  - 测试文件: `src/utils/__tests__/fileRead.test.ts`
  - 测试场景:
    - **UTF-8 文件读取**: 创建临时 UTF-8 文件 → 返回 `encoding: 'utf-8'`，content 与写入内容一致
    - **GBK 文件读取**: 创建临时 GBK 编码文件 → 返回 `encoding: 'gbk'`，content 包含正确的中文字符
    - **空文件读取**: 创建空文件 → 返回 `encoding: 'utf8'`，content 为空字符串
    - **UTF-16LE BOM 文件读取**: 创建带 BOM 的 UTF-16LE 文件 → 返回 `encoding: 'utf-16le'`
    - **detectEncodingForResolvedPath 返回类型**: 验证返回值为 `FileEncoding` 类型
  - Mock 策略: 使用 `tests/mocks/debug.ts` mock `debug.ts`，使用 `tests/mocks/log.ts` mock `log.ts`
  - 运行命令: `bun test src/utils/__tests__/fileRead.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 `fileRead.ts` 的导入和返回类型已更新
  - `grep -n "FileEncoding\|decodeBuffer\|detectEncoding" src/utils/fileRead.ts`
  - 预期: 输出包含 import 行中的 `FileEncoding`、`decodeBuffer`，以及函数体中的 `detectEncoding` 调用

- [x] 验证 `file.ts` 的类型已更新
  - `grep -n "FileEncoding\|decodeBuffer" src/utils/file.ts`
  - 预期: `detectFileEncoding` 返回 `FileEncoding`，`detectLineEndings` 参数类型为 `FileEncoding`

- [x] 验证 `fileReadCache.ts` 的类型已更新
  - `grep -n "FileEncoding\|decodeBuffer" src/utils/fileReadCache.ts`
  - 预期: `CachedFileData` 和 `readFile` 返回类型使用 `FileEncoding`

- [x] 验证 `fileRead.ts` 中不再有内联 BOM 检测逻辑
  - `grep -c "0xff\|0xfe\|0xef\|0xbb\|0xbf" src/utils/fileRead.ts`
  - 预期: 输出为 0

- [x] 运行 fileRead 单元测试
  - `bun test src/utils/__tests__/fileRead.test.ts`
  - 预期: 所有测试通过

- [x] 运行 precheck 确认无类型/lint/测试错误
  - `bun run precheck`
  - 预期: 零错误通过

**认知变更:**
- [x] [CLAUDE.md] `fs.readFileSync(path, { encoding })` 的 `encoding` 选项只接受 `BufferEncoding`（utf8/utf16le/latin1/ascii/binary/hex/base64/ucs2/utf16le），不支持 `gbk` 等 ICU 编码名。读取非 UTF-8 文件时必须先 `fs.readFileSync(path)` 读 Buffer，再用 `TextDecoder` 解码。项目中所有文件读取路径（fileRead.ts、fileReadCache.ts、file.ts）已统一使用 `decodeBuffer` 函数处理此逻辑。

---

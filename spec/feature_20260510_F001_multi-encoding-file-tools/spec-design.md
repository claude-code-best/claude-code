# Feature: 20260510_F001 - multi-encoding-file-tools

## 需求背景

当前文件读写工具（FileReadTool、FileWriteTool、FileEditTool）的编码检测非常简单——仅通过 BOM 头识别 UTF-8 和 UTF-16LE，其他所有情况默认按 UTF-8 处理。对于 GBK/GB2312 等非 BOM 编码文件，读取时会产生乱码，导致 AI 模型无法正确理解和编辑这些文件。

这在中文 Windows 用户场景中尤其常见：许多旧项目、日志文件、配置文件使用 GBK 编码，当前工具链无法处理。

## 目标

- 文件读取时自动检测编码并正确解码，对 AI 模型完全透明（不增加 encoding 参数）
- 文件写入时保持原文件编码，不改变用户的编码习惯
- 覆盖 GBK 编码（最常见非 UTF-8 CJK 编码），latin1 作为最终兜底
- 零外部依赖，仅使用 Node.js/Bun 内置的 TextDecoder/TextEncoder

## 范围变更

**仅保留 GBK 编码支持**。Shift_JIS、EUC-JP、EUC-KR、Big5、GB18030、ISO-8859-1 已移出范围。原因：多编码回退链存在字节序列歧义（如 GBK 和 Shift_JIS 共享大量有效字节范围），导致误检测。GBK 覆盖了最核心的中文 Windows 用户场景。

## 方案设计

### 架构概述

新增一个独立的编码工具模块 `src/utils/encoding.ts`，提供编码检测和解码/编码函数。现有文件读写路径通过调用此模块实现对非 UTF-8 编码的支持。

```
                    ┌─────────────────────────┐
                    │   src/utils/encoding.ts  │
                    │  detectEncoding(buffer)  │
                    │  decodeBuffer(buf, enc)  │
                    │  encodeString(str, enc)  │
                    └─────────┬───────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     fileRead.ts      readFileInRange.ts    file.ts
   (readFileSync     (异步读取路径)      (writeTextContent)
   WithMetadata)
```

### 编码检测算法（三层检测）

检测基于文件头部 4KB 数据，分三层依次判断：

**第一层：BOM 检测（现有逻辑保留）**
- `FF FE` → UTF-16LE
- `EF BB BF` → UTF-8（带 BOM）

**第二层：UTF-8 验证**
- 用 `new TextDecoder('utf-8', { fatal: true })` 对头部 4KB 做解码
- 成功 → 文件为 UTF-8（覆盖绝大多数现代源码文件）
- 失败（抛出 TypeError）→ 进入第三层

**第三层：GBK 回退**
- 用 `new TextDecoder('gbk', { fatal: true })` 尝试解码头部 4KB
- 成功 → 文件为 GBK（覆盖中文 Windows 用户最常见的非 UTF-8 编码）
- 失败 → `latin1`（单字节编码，永远成功，作为最终兜底）

```typescript
// src/utils/encoding.ts 核心逻辑

export type FileEncoding = BufferEncoding | 'gbk'
export type DetectedEncoding = string

export function detectEncoding(buffer: Buffer): FileEncoding {
  // Layer 1: BOM
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return 'utf-16le'
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf-8'
  }

  // Layer 2: UTF-8 validation
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return 'utf-8'
  } catch {}

  // Layer 3: GBK fallback
  try {
    new TextDecoder('gbk', { fatal: true }).decode(buffer)
    return 'gbk'
  } catch {}

  return 'latin1'
}
```

### 读取路径改造

#### `src/utils/fileRead.ts` — `detectEncodingForResolvedPath`

将现有的 BOM-only 检测替换为调用 `encoding.ts` 的 `detectEncoding` 函数。返回值从 `BufferEncoding` 改为 `FileEncoding`（`BufferEncoding | 'gbk'`）。

`readFileSyncWithMetadata` 函数先读 raw Buffer，再用 `decodeBuffer` 解码，而非使用 `fs.readFileSync` 的 encoding 选项（该选项只接受 `BufferEncoding`，不支持 `gbk`）。

#### `src/utils/readFileInRange.ts` — 异步读取

当前两个路径（fast path 和 streaming path）都硬编码 `encoding: 'utf8'`：

**Fast path 改造**：
- `readFile` 改为读取 Buffer（去掉 encoding 参数）
- 读取后调用 `detectEncoding(buffer)` 检测编码
- 用 `decodeBuffer` 解码为字符串
- 后续行处理逻辑不变

**Streaming path 改造**：
- `createReadStream` 去掉 `encoding: 'utf8'`，改为 Buffer 模式
- 第一个 chunk 做编码检测（同时保留 BOM 剥离逻辑）
- 后续 chunk 拼接后用 `TextDecoder` 解码
- 注意：streaming 路径需要特殊处理——先收集足够字节做检测，再逐行扫描

**Streaming 编码处理策略**：
streaming 路径改为两阶段：
1. **检测阶段**：前 4KB 数据到达后立即检测编码
2. **解码阶段**：用检测到的编码创建一个 `TextDecoder`（`{ stream: true }` 模式），逐 chunk 解码

### 写入路径改造

#### 编码回写策略

写入时需要将内部 UTF-8 字符串编码回原文件编码。由于 `TextEncoder` 只支持 UTF-8 输出，需要使用 `TextDecoder` 的反向操作。

**最终决定**：对于非 UTF-8 文件的写回，尝试使用 `Buffer.from(content, encoding)` 编码，失败则自动转换为 UTF-8 并在结果消息中注明。这样既满足了零依赖约束，也避免了数据损坏。

#### `src/utils/file.ts` — `writeTextContent`

现有函数签名 `writeTextContent(filePath, content, encoding, lineEndings)` 已接受 encoding 参数。需要：
- 扩展类型，接受 `FileEncoding` 而非仅 `BufferEncoding`
- 对于 UTF-8 和 UTF-16LE，行为不变
- 对于 GBK，使用 `encodeString` 函数尝试编码，失败则回退为 UTF-8 写入

#### `FileWriteTool` 和 `FileEditTool`

这两个工具的 `call` 方法中，`writeTextContent` 调用已传递 `encoding`（来自 `readFileSyncWithMetadata` 的返回值）。改动很小——只需确保类型系统接受新编码名。

### 类型扩展

```typescript
// 扩展编码类型 — 仅添加 GBK
export type FileEncoding = BufferEncoding | 'gbk'
```

在 `readFileSyncWithMetadata` 返回类型中将 `encoding` 从 `BufferEncoding` 改为 `FileEncoding`。

## 实现要点

### 关键技术决策

1. **检测只用头部 4KB**：避免全文件扫描，性能开销极小（多几次 TextDecoder 调用，每次 ~1μs）
2. **GBK 作为唯一回退**：中文 Windows 用户最多，且避免了多编码回退链的字节序列歧义问题
3. **TextDecoder fatal 模式**：`{ fatal: true }` 是检测的关键——如果字节序列不符合编码规范会抛异常，借此区分不同编码
4. **streaming 路径的两阶段设计**：先攒够检测数据再开始行扫描，避免半字符解码问题
5. **latin1 最终兜底**：单字节编码永远成功，确保任何文件都能被读取

### 难点

1. **Streaming 编码解码**：`TextDecoder` 支持 `{ stream: true }` 模式处理多字节字符的 chunk 边界，但需要在检测完成前缓冲数据
2. **编码回写的零依赖方案**：`TextEncoder` 只输出 UTF-8，非 UTF-8 编码回写需要额外处理。务实方案是 UTF-8 写入 + 消息提示
3. **混合编码文件**：极少见，不在本次覆盖范围内

### 依赖

- 零外部依赖，仅使用 `TextDecoder`（Node.js 13+ / Bun 内置 full-icu）
- Bun 运行时对 GBK 的 TextDecoder 支持已验证可用（Bun 1.3.13）

## 验收标准

- [x] FileReadTool 能正确读取 GBK 编码的中文文本文件，显示正确的中文内容
- [x] FileReadTool 能正确读取 UTF-8 文件（行为不变，回归测试通过）
- [x] FileReadTool 能正确读取 UTF-16LE 文件（行为不变）
- [x] FileEditTool 能编辑 GBK 文件并写回，内容不乱码
- [x] FileWriteTool 编辑 GBK 文件后写回，编码保持或合理转换
- [x] readFileInRange 的 fast path 路径支持非 UTF-8 编码
- [x] readFileInRange 的 streaming path 支持非 UTF-8 编码
- [x] 编码检测性能：4KB 数据检测耗时 < 1ms
- [x] `bun run precheck` typecheck + lint + 相关测试零错误
- [x] 新增编码相关单元测试覆盖检测和解码逻辑

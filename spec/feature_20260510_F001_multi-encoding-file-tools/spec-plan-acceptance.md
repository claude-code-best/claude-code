### Acceptance Task: 多编码文件工具验收

**前置条件:**
- 所有 Task 0-4 已执行完毕
- 运行环境: 当前开发环境（Bun）

**范围变更:** 仅保留 GBK 编码支持，Shift_JIS/EUC-JP/EUC-KR/Big5/GB18030/ISO-8859-1 已移除。

**端到端验证:**

1. 运行完整测试套件确保无回归
   - `bun run precheck`
   - 预期: typecheck + lint fix + test 全部零错误通过
   - 失败排查: 检查各 Task 的测试步骤，特别是 Task 1 的编码检测测试和 Task 3 的 readFileInRange 测试

2. 验证 GBK 文件读取正确性
   - 创建 GBK 编码测试文件：`bun -e "const fs = require('fs'); const b = Buffer.from([0xC4, 0xE3, 0xBA, 0xC3, 0xCA, 0xC0, 0xBD, 0xE7, 0x0A]); fs.writeFileSync('/tmp/test-gbk.txt', b)"`
   - 读取并验证：`bun -e "import { readFileSyncWithMetadata } from './src/utils/fileRead.js'; const r = readFileSyncWithMetadata('/tmp/test-gbk.txt'); console.log('encoding:', r.encoding); console.log('content:', r.content)"`
   - 预期: encoding 为 `gbk`，content 为 "你好世界"
   - 失败排查: 检查 Task 1 的 detectEncoding 逻辑、Task 2 的 readFileSyncWithMetadata 集成

3. 验证 UTF-8 文件读取回归
   - `bun -e "import { readFileSyncWithMetadata } from './src/utils/fileRead.js'; const fs = require('fs'); fs.writeFileSync('/tmp/test-utf8.txt', 'Hello 世界\n'); const r = readFileSyncWithMetadata('/tmp/test-utf8.txt'); console.log('encoding:', r.encoding); console.log('content:', r.content)"`
   - 预期: encoding 为 `utf-8`，content 为 "Hello 世界"
   - 失败排查: 检查 Task 1 的 UTF-8 fatal 验证逻辑

4. 验证 UTF-16LE 文件读取回归
   - `bun -e "const fs = require('fs'); const b = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('Hello', 'utf16le')]); fs.writeFileSync('/tmp/test-utf16le.txt', b); import { readFileSyncWithMetadata } from './src/utils/fileRead.js'; const r = readFileSyncWithMetadata('/tmp/test-utf16le.txt'); console.log('encoding:', r.encoding); console.log('content:', r.content)"`
   - 预期: encoding 为 `utf-16le`，content 为 "Hello"
   - 失败排查: 检查 Task 1 的 BOM 检测层、Task 2 的集成

5. 验证 readFileInRange 异步路径的 GBK 支持
   - `bun -e "import { readFileInRange } from './src/utils/readFileInRange.js'; const r = await readFileInRange('/tmp/test-gbk.txt', 0); console.log('content:', r.content); console.log('totalLines:', r.totalLines)"`
   - 预期: content 为 "你好世界"，totalLines 为 1
   - 失败排查: 检查 Task 3 的 fast path 改造

6. 验证 GBK 文件写入（UTF-8 回退）
   - `bun -e "import { writeTextContent } from './src/utils/file.js'; writeTextContent('/tmp/test-gbk-write.txt', '测试写入', 'gbk', 'LF'); const fs = require('fs'); const content = fs.readFileSync('/tmp/test-gbk-write.txt', 'utf8'); console.log('written:', content)"`
   - 预期: 文件成功写入，内容为 "测试写入"（UTF-8 回退或 GBK 编码均可接受）
   - 失败排查: 检查 Task 4 的 writeTextContent 改造和 encodeString 函数

7. 验证编码检测性能
   - `bun -e "import { detectEncoding } from './src/utils/encoding.js'; const buf = Buffer.alloc(4096, 0x41); const start = performance.now(); for (let i = 0; i < 1000; i++) detectEncoding(buf); console.log('avg:', (performance.now() - start) / 1000, 'ms')"`
   - 预期: 平均检测耗时 < 1ms
   - 失败排查: 检查 Task 1 的检测逻辑是否有不必要的重复操作

---

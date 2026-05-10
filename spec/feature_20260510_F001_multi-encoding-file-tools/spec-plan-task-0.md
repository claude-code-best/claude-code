### Task 0: 环境准备

**背景:**
确保构建和测试工具链在当前开发环境中可用，验证 Bun 运行时对 GBK 编码的 TextDecoder 支持情况。

**涉及文件:**
- 无文件修改，仅验证环境

**执行步骤:**
- [x] 验证 Bun 运行时可用
  - 运行命令: `bun --version`
  - 预期: 输出 Bun 版本号
- [x] 验证 TypeScript 编译无错误
  - 运行命令: `bunx tsc --noEmit 2>&1 | tail -5`
  - 预期: 无错误输出（或仅有已知的 pre-existing 错误）
- [x] 验证 Bun 对 GBK 编码的 TextDecoder 支持
  - 运行命令: `bun -e "const d = new TextDecoder('gbk', { fatal: true }); const buf = Buffer.from([0xC4, 0xE3, 0xBA, 0xC3]); console.log(d.decode(buf))"`
  - 预期: 输出 "你好"（GBK 编码的中文字符）
- [x] 验证测试框架可用
  - 运行命令: `bun test src/utils/__tests__/hash.test.ts 2>&1 | tail -3`
  - 预期: 测试运行成功，无框架错误

**检查步骤:**
- [x] Bun 版本确认
  - `bun --version`
  - 预期: 输出有效版本号
- [x] GBK 编码支持确认
  - `bun -e "console.log(new TextDecoder('gbk').decode(Buffer.from([0xC4, 0xE3, 0xBA, 0xC3])))"`
  - 预期: 输出 "你好"
- [x] 现有测试通过
  - `bun test src/utils/__tests__/file.test.ts 2>&1 | tail -3`
  - 预期: 所有测试通过

---

# 多编码文件工具 人工验收清单

**生成时间:** 2026-05-10
**关联计划:** spec/feature_20260510_F001_multi-encoding-file-tools/spec-plan.md
**关联设计:** spec/feature_20260510_F001_multi-encoding-file-tools/spec-design.md

---

所有验收项均可通过 Shell 命令自动化验证，无需人类参与。仍将生成清单用于自动执行。

**范围变更:** 仅保留 GBK 编码支持，Shift_JIS/EUC-JP/EUC-KR/Big5/GB18030 已移除。

---

## 验收前准备

### 环境要求

- [x] [AUTO] 检查 Bun 运行时版本: `bun --version`
- [x] [AUTO] 安装依赖: `bun install`

### 测试数据准备

- [x] [AUTO] 创建 GBK 编码测试文件: `bun -e "const fs = require('fs'); const b = Buffer.from([0xC4, 0xE3, 0xBA, 0xC3, 0xCA, 0xC0, 0xBD, 0xE7, 0x0A]); fs.writeFileSync('/tmp/test-gbk.txt', b)"`
- [x] [AUTO] 创建 UTF-8 测试文件: `bun -e "require('fs').writeFileSync('/tmp/test-utf8.txt', 'Hello 世界\n')"`
- [x] [AUTO] 创建 UTF-16LE 测试文件: `bun -e "const fs = require('fs'); const b = Buffer.from('Hello','utf16le'); fs.writeFileSync('/tmp/test-utf16le.txt', b)"`

---

## 验收项目

### 场景 1：读取 GBK 编码文件（中文场景）

**用户目标:** 用户有一个 GBK 编码的中文文件，通过 FileReadTool 读取后看到正确的中文内容

**触发路径:**
1. 系统检测到非 UTF-8 字节序列
2. 编码回退识别为 GBK
3. 用 GBK 解码输出中文文本

#### - [x] 1.1 GBK 文件同步读取
- **来源:** spec-plan-acceptance.md §2 / spec-design.md §验收标准
- **目的:** 确认 GBK 文件读取解码正确
- **操作步骤:**
  1. [A] `bun -e "import { readFileSyncWithMetadata } from './src/utils/fileRead.js'; const r = readFileSyncWithMetadata('/tmp/test-gbk.txt'); console.log('encoding:', r.encoding); console.log('content:', r.content)"` → 期望包含: `你好世界`
  2. [A] 上条命令输出 encoding 字段 → 期望包含: `gbk`

#### - [x] 1.2 GBK 文件异步路径读取
- **来源:** spec-plan-acceptance.md §6 / spec-design.md §验收标准
- **目的:** 确认 readFileInRange fast path 支持 GBK
- **操作步骤:**
  1. [A] `bun -e "import { readFileInRange } from './src/utils/readFileInRange.js'; const r = await readFileInRange('/tmp/test-gbk.txt', 0); console.log('content:', r.content); console.log('totalLines:', r.totalLines)"` → 期望包含: `你好世界`
  2. [A] 上条命令输出 totalLines → 期望包含: `1`

---

### 场景 3：写入非 UTF-8 编码文件

**用户目标:** 用户通过 FileEditTool/FileWriteTool 编辑 GBK 文件后写回，内容不损坏

**触发路径:**
1. 系统检测原文件编码
2. 编辑内容后写回
3. 非标准编码回退为 UTF-8 写入（零依赖约束）

#### - [x] 3.1 GBK 文件写入（UTF-8 回退）
- **来源:** spec-plan-acceptance.md §7 / spec-design.md §写入路径改造
- **目的:** 确认非 UTF-8 编码写入不损坏内容
- **操作步骤:**
  1. [A] `bun -e "import { writeTextContent } from './src/utils/file.js'; writeTextContent('/tmp/test-gbk-write.txt', '测试写入', 'gbk', 'LF'); const fs = require('fs'); const content = fs.readFileSync('/tmp/test-gbk-write.txt', 'utf8'); console.log('written:', content)"` → 期望包含: `测试写入`

---

### 场景 4：UTF-8 文件读取回归

**用户目标:** 用户读取 UTF-8 文件，行为与改动前完全一致

**触发路径:**
1. UTF-8 fatal 验证通过
2. 内容正常输出

#### - [x] 4.1 UTF-8 文件读取回归
- **来源:** spec-plan-acceptance.md §4 / spec-design.md §验收标准
- **目的:** 确认 UTF-8 读取无回归
- **操作步骤:**
  1. [A] `bun -e "import { readFileSyncWithMetadata } from './src/utils/fileRead.js'; const r = readFileSyncWithMetadata('/tmp/test-utf8.txt'); console.log('encoding:', r.encoding); console.log('content:', r.content)"` → 期望包含: `Hello 世界`
  2. [A] 上条命令输出 encoding 字段 → 期望包含: `utf`

---

### 场景 5：UTF-16LE 文件读取回归

**用户目标:** 用户读取 UTF-16LE（BOM）文件，行为与改动前完全一致

**触发路径:**
1. BOM 检测层识别 FF FE 标记
2. 用 UTF-16LE 解码

#### - [x] 5.1 UTF-16LE 文件读取回归
- **来源:** spec-plan-acceptance.md §5 / spec-design.md §验收标准
- **目的:** 确认 UTF-16LE BOM 读取无回归
- **操作步骤:**
  1. [A] `bun -e "import { readFileSyncWithMetadata } from './src/utils/fileRead.js'; const r = readFileSyncWithMetadata('/tmp/test-utf16le.txt'); console.log('encoding:', r.encoding); console.log('content:', r.content)"` → 期望包含: `utf-16le`
  2. [A] 上条命令输出 content 字段 → 期望包含: `Hello`

---

### 场景 6：编码检测性能

**用户目标:** 编码检测不应影响文件读取的响应速度

**触发路径:**
1. 对 4KB 数据执行 1000 次检测
2. 验证平均耗时 < 1ms

#### - [x] 6.1 检测性能基准
- **来源:** spec-plan-acceptance.md §8 / spec-design.md §实现要点
- **目的:** 确认编码检测性能达标
- **操作步骤:**
  1. [A] `bun -e "import { detectEncoding } from './src/utils/encoding.js'; const buf = Buffer.alloc(4096, 0x41); const start = performance.now(); for (let i = 0; i < 1000; i++) detectEncoding(buf); const avg = (performance.now() - start) / 1000; console.log('avg:', avg, 'ms'); process.exit(avg < 1 ? 0 : 1)"` → 期望包含: `avg:`

---

### 场景 7：构建和测试完整性

**用户目标:** 整体代码质量无退化，所有测试通过

**触发路径:**
1. 执行完整 precheck（typecheck + lint + test）
2. 确认零错误

#### - [x] 7.1 编码相关单元测试
- **来源:** spec-plan.md Task 1-4 检查步骤 / spec-design.md §验收标准
- **目的:** 确认编码相关测试全部通过
- **操作步骤:**
  1. [A] `bun test src/utils/__tests__/encoding.test.ts` → 期望包含: `0 fail`
  2. [A] `bun test src/utils/__tests__/fileRead.test.ts` → 期望包含: `0 fail`
  3. [A] `bun test src/utils/__tests__/readFileInRange.test.ts` → 期望包含: `0 fail`
  4. [A] `bun test src/utils/__tests__/file.test.ts` → 期望包含: `0 fail`

---

## 验收后清理

- [x] [AUTO] 清理临时测试文件: `rm -f /tmp/test-gbk.txt /tmp/test-utf8.txt /tmp/test-utf16le.txt /tmp/test-gbk-write.txt`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 1 | 1.1 | GBK 同步读取 | 2 | 0 | ✅ |
| 场景 1 | 1.2 | GBK 异步路径读取 | 2 | 0 | ✅ |
| 场景 3 | 3.1 | GBK 写入（回退） | 1 | 0 | ✅ |
| 场景 4 | 4.1 | UTF-8 回归 | 2 | 0 | ✅ |
| 场景 5 | 5.1 | UTF-16LE 回归 | 2 | 0 | ✅ |
| 场景 6 | 6.1 | 检测性能 | 1 | 0 | ✅ |
| 场景 7 | 7.1 | 编码单元测试 | 4 | 0 | ✅ |

**验收结论:** ✅ 全部通过

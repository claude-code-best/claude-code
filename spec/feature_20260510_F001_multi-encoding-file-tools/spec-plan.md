# 多编码文件工具 执行计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 为文件读写工具添加自动编码检测，支持 GBK 编码的透明读写（latin1 作为最终兜底）。

**技术栈:** TextDecoder/TextEncoder（零外部依赖）、Bun test 框架、TypeScript strict mode

**设计文档:** spec/feature_20260510_F001_multi-encoding-file-tools/spec-design.md

**范围变更:** 仅保留 GBK 编码支持，Shift_JIS/EUC-JP/EUC-KR/Big5/GB18030/ISO-8859-1 已移除。

## 改动总览

新建编码检测核心模块 `src/utils/encoding.ts`，提供三层检测（BOM → UTF-8 fatal 验证 → GBK 回退 → latin1 兜底）和解码工具函数。同步读取路径（fileRead.ts → file.ts → fileReadCache.ts）集成新检测逻辑，异步读取路径（readFileInRange.ts）改造为 Buffer 读取 + 检测后解码。写入路径（writeTextContent）扩展类型支持新编码名，非标准编码回退为 UTF-8 写入。FileEditTool 和 FileWriteTool 仅需类型适配。

---

## 任务索引

### Task 0: 环境准备
📄 详情见: `spec-plan-task-0.md`

验证构建工具链和测试环境是否就绪，确认 Bun 运行时对 GBK 编码的 TextDecoder 支持。

### Task 1: 编码检测核心模块
📄 详情见: `spec-plan-task-1.md`

新建 `src/utils/encoding.ts`，实现三层编码检测算法（BOM → UTF-8 fatal 验证 → GBK 回退）和 Buffer 解码/编码函数。

### Task 2: 同步读取路径集成
📄 详情见: `spec-plan-task-2.md`

改造 `fileRead.ts` 和 `file.ts` 的编码检测，集成新模块，更新类型定义。

### Task 3: 异步读取路径改造
📄 详情见: `spec-plan-task-3.md`

改造 `readFileInRange.ts` 的 fast path 和 streaming path，支持非 UTF-8 编码。

### Task 4: 写入路径和工具层适配
📄 详情见: `spec-plan-task-4.md`

扩展写入路径类型，更新 FileEditTool/FileWriteTool 的类型注解。

### Acceptance Task
📄 详情见: `spec-plan-acceptance.md`

端到端验证所有功能是否正确实现。

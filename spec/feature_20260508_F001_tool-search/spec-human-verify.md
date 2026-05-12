# Tool Search 基础设施层 人工验收清单

**生成时间:** 2026-05-08
**关联计划:** spec/feature_20260508_F001_tool-search/spec-plan-1.md
**关联设计:** spec/feature_20260508_F001_tool-search/spec-design.md

> 所有验收项均可自动化验证，无需人类参与。仍将生成清单用于自动执行。

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 检查 Bun 运行时: `bun --version`
- [ ] [AUTO] 检查 TypeScript 编译: `bunx tsc --noEmit --pretty 2>&1 | tail -5`

---

## 验收项目

### 场景 1：核心工具白名单与延迟判定

> 验证 `CORE_TOOLS` 常量正确定义，`isDeferredTool` 已重构为白名单制判定。

#### - [x] 1.1 CORE_TOOLS 常量已定义且被引用
- **来源:** spec-plan-1.md Task 1 / spec-design.md §1
- **目的:** 确认核心工具白名单已建立
- **操作步骤:**
  1. [A] `grep -c "CORE_TOOLS" src/constants/tools.ts` → 期望包含: 数字 ≥ 2
  2. [A] `grep -rn "CORE_TOOLS" src/ packages/builtin-tools/src/ --include="*.ts" 2>/dev/null | wc -l` → 期望包含: 数字 ≥ 3

#### - [x] 1.2 isDeferredTool 函数体仅含白名单逻辑
- **来源:** spec-plan-1.md Task 1
- **目的:** 确认延迟判定从"排除例外"改为"包含准入"
- **操作步骤:**
  1. [A] `grep -A 8 "export function isDeferredTool" packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts` → 期望包含: `CORE_TOOLS.has`
  2. [A] `grep -A 8 "export function isDeferredTool" packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts` → 期望包含: `return true`

#### - [x] 1.3 isDeferredTool 不再依赖旧 feature flag 逻辑
- **来源:** spec-plan-1.md Task 1
- **目的:** 确认旧的分散特判规则已清理
- **操作步骤:**
  1. [A] `grep "feature(" packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts` → 期望精确: ""
  2. [A] `grep "shouldDefer" packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts` → 期望精确: ""

#### - [x] 1.4 CORE_TOOLS 与 isDeferredTool 单元测试通过
- **来源:** spec-plan-1.md Task 1
- **目的:** 确认白名单制逻辑正确
- **操作步骤:**
  1. [A] `bun test src/constants/__tests__/tools.test.ts 2>&1 | tail -5` → 期望包含: `pass`

---

### 场景 2：TF-IDF 工具索引

> 验证 `localSearch.ts` 算法函数已导出，`toolIndex.ts` 正确构建 TF-IDF 索引并支持搜索。

#### - [x] 2.1 localSearch.ts 三个 TF-IDF 核心函数已导出
- **来源:** spec-plan-1.md Task 2
- **目的:** 确认算法复用基础已建立
- **操作步骤:**
  1. [A] `grep -c "export function computeWeightedTf\|export function computeIdf\|export function cosineSimilarity" src/services/skillSearch/localSearch.ts` → 期望精确: "3"

#### - [x] 2.2 toolIndex.ts 导出正确的接口与函数
- **来源:** spec-plan-1.md Task 2
- **目的:** 确认索引模块 API 完整
- **操作步骤:**
  1. [A] `grep -c "export function\|export interface" src/services/toolSearch/toolIndex.ts` → 期望包含: 数字 ≥ 6

#### - [x] 2.3 toolIndex.ts TypeScript 编译无错误
- **来源:** spec-plan-1.md Task 2
- **目的:** 确认类型安全
- **操作步骤:**
  1. [A] `bunx tsc --noEmit src/services/toolSearch/toolIndex.ts 2>&1 | head -20` → 期望包含: 无 error 行（或为空输出）

#### - [x] 2.4 toolIndex.ts 单元测试通过
- **来源:** spec-plan-1.md Task 2
- **目的:** 确认索引构建和搜索逻辑正确
- **操作步骤:**
  1. [A] `bun test src/services/toolSearch/__tests__/toolIndex.test.ts 2>&1 | tail -10` → 期望包含: `pass`

#### - [x] 2.5 localSearch.ts 原有测试未回归
- **来源:** spec-plan-1.md Task 2
- **目的:** 确认导出变更未破坏现有功能
- **操作步骤:**
  1. [A] `bun test src/services/skillSearch/__tests__/localSearch.test.ts 2>&1 | tail -10` → 期望包含: `pass`

---

### 场景 3：ExecuteTool 执行入口

> 验证 ExecuteTool 工具包文件齐全、实现符合 buildTool 规范、权限透传正确。

#### - [x] 3.1 ExecuteTool 常量文件正确
- **来源:** spec-plan-1.md Task 3
- **目的:** 确认工具名常量已定义
- **操作步骤:**
  1. [A] `grep -n 'EXECUTE_TOOL_NAME' packages/builtin-tools/src/tools/ExecuteTool/constants.ts` → 期望包含: `export const EXECUTE_TOOL_NAME`

#### - [x] 3.2 ExecuteTool prompt 文件正确
- **来源:** spec-plan-1.md Task 3
- **目的:** 确认 prompt 与 description 已导出
- **操作步骤:**
  1. [A] `grep -n 'export' packages/builtin-tools/src/tools/ExecuteTool/prompt.ts` → 期望包含: `DESCRIPTION`
  2. [A] `grep -n 'export' packages/builtin-tools/src/tools/ExecuteTool/prompt.ts` → 期望包含: `getPrompt`

#### - [x] 3.3 ExecuteTool 使用 buildTool 构建
- **来源:** spec-plan-1.md Task 3 / spec-design.md §4
- **目的:** 确认遵循工具框架规范
- **操作步骤:**
  1. [A] `grep -n 'buildTool\|satisfies ToolDef' packages/builtin-tools/src/tools/ExecuteTool/ExecuteTool.ts` → 期望包含: `buildTool`
  2. [A] `grep -n 'buildTool\|satisfies ToolDef' packages/builtin-tools/src/tools/ExecuteTool/ExecuteTool.ts` → 期望包含: `satisfies ToolDef`

#### - [x] 3.4 isDeferredTool 正确排除 ExecuteTool
- **来源:** spec-plan-1.md Task 3
- **目的:** 确认执行入口不被延迟加载
- **操作步骤:**
  1. [A] `grep -n 'EXECUTE_TOOL_NAME' packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts` → 期望包含: `EXECUTE_TOOL_NAME`

#### - [x] 3.5 ExecuteTool 单元测试通过
- **来源:** spec-plan-1.md Task 3
- **目的:** 确认工具执行、权限透传、错误处理正确
- **操作步骤:**
  1. [A] `bun test packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.test.ts 2>&1 | tail -5` → 期望包含: `pass`

---

### 场景 4：ToolSearchTool 搜索增强

> 验证 TF-IDF 搜索路径、discover 模式、并行搜索合并、文本模式输出均已实现。

#### - [x] 4.1 TF-IDF 搜索依赖已正确导入
- **来源:** spec-plan-1.md Task 4
- **目的:** 确认搜索层依赖就位
- **操作步骤:**
  1. [A] `grep -n "getToolIndex\|searchTools\|modelSupportsToolReference" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts` → 期望包含: `getToolIndex`
  2. [A] `grep -n "getToolIndex\|searchTools\|modelSupportsToolReference" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts` → 期望包含: `searchTools`
  3. [A] `grep -n "getToolIndex\|searchTools\|modelSupportsToolReference" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts` → 期望包含: `modelSupportsToolReference`

#### - [x] 4.2 discover: 查询模式已实现
- **来源:** spec-plan-1.md Task 4 / spec-design.md §3
- **目的:** 确认纯发现搜索路径可用
- **操作步骤:**
  1. [A] `grep -n "discoverMatch\|discover:" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts` → 期望包含: `discoverMatch`

#### - [x] 4.3 关键词搜索与 TF-IDF 搜索并行执行
- **来源:** spec-plan-1.md Task 4 / spec-design.md §3
- **目的:** 确认两路搜索并行而非串行
- **操作步骤:**
  1. [A] `grep -n "Promise.all" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts` → 期望包含: `Promise.all`
  2. [A] `grep -n "searchToolsWithKeywords\|getToolIndex" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts | grep -i promise` → 期望包含: `searchToolsWithKeywords`

#### - [x] 4.4 结果合并使用加权求和
- **来源:** spec-plan-1.md Task 4 / spec-design.md §3
- **目的:** 确认混合搜索结果正确排序
- **操作步骤:**
  1. [A] `grep -n "KEYWORD_WEIGHT\|TFIDF_WEIGHT" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts` → 期望包含: `KEYWORD_WEIGHT`
  2. [A] `grep -n "KEYWORD_WEIGHT\|TFIDF_WEIGHT" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts` → 期望包含: `TFIDF_WEIGHT`

#### - [x] 4.5 mapToolResultToToolResultBlockParam 支持文本模式回退
- **来源:** spec-plan-1.md Task 4 / spec-design.md §3（跨 API provider 兼容）
- **目的:** 确认非 Anthropic provider 下返回文本格式
- **操作步骤:**
  1. [A] `grep -n "supportsToolRef\|ExecuteTool" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts` → 期望包含: `supportsToolRef`
  2. [A] `grep -n "supportsToolRef\|ExecuteTool" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts` → 期望包含: `ExecuteTool`

#### - [x] 4.6 prompt.ts 包含 discover: 模式文档
- **来源:** spec-plan-1.md Task 4
- **目的:** 确认模型可知晓 discover 查询模式
- **操作步骤:**
  1. [A] `grep -n "discover:" packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts` → 期望包含: `discover:`

#### - [x] 4.7 ToolSearchTool 增强后 TypeScript 编译无新增错误
- **来源:** spec-plan-1.md Task 4
- **目的:** 确认类型安全
- **操作步骤:**
  1. [A] `bunx tsc --noEmit --pretty 2>&1 | head -30` → 期望包含: 无新增 error 行

#### - [x] 4.8 ToolSearchTool 搜索增强单元测试通过
- **来源:** spec-plan-1.md Task 4
- **目的:** 确认 discover 模式、并行搜索、文本回退均正确
- **操作步骤:**
  1. [A] `bun test packages/builtin-tools/src/tools/ToolSearchTool/__tests__/ToolSearchTool.test.ts 2>&1 | tail -10` → 期望包含: `pass`

---

### 场景 5：端到端集成验证

> 验证全量测试、类型检查、构建产物均无回归。

#### - [x] 5.1 全量测试套件通过
- **来源:** spec-plan-1.md Task 5 / spec-design.md 验收标准
- **目的:** 确认所有新增测试无回归
- **操作步骤:**
  1. [A] `bun test src/constants/__tests__/tools.test.ts src/services/toolSearch/__tests__/toolIndex.test.ts packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.test.ts packages/builtin-tools/src/tools/ToolSearchTool/__tests__/ 2>&1 | tail -10` → 期望包含: `pass`

#### - [x] 5.2 TypeScript 全量类型检查通过
- **来源:** spec-plan-1.md Task 5 / spec-design.md 验收标准
- **目的:** 确认无新增类型错误
- **操作步骤:**
  1. [A] `bunx tsc --noEmit --pretty 2>&1 | grep -i "error" | head -20` → 期望包含: 无新增 error 行（或为空输出）

#### - [x] 5.3 CORE_TOOLS 在关键文件中被引用
- **来源:** spec-plan-1.md Task 5
- **目的:** 确认白名单常量已集成到延迟判定和工具索引
- **操作步骤:**
  1. [A] `grep -rn "CORE_TOOLS" src/ packages/builtin-tools/src/ --include="*.ts" 2>/dev/null` → 期望包含: `tools.ts`
  2. [A] `grep -rn "CORE_TOOLS" src/ packages/builtin-tools/src/ --include="*.ts" 2>/dev/null` → 期望包含: `prompt.ts`

#### - [x] 5.4 项目构建成功
- **来源:** spec-plan-1.md Task 5 / spec-design.md 验收标准
- **目的:** 确认构建产物可用
- **操作步骤:**
  1. [A] `bun run build 2>&1 | tail -5` → 期望包含: `dist/cli.js`

#### - [x] 5.5 precheck 零错误通过
- **来源:** spec-design.md 验收标准 / CLAUDE.md
- **目的:** 确认 typecheck + lint fix + test 全通过
- **操作步骤:**
  1. [A] `bun run precheck 2>&1 | tail -10` → 期望包含: 无 error 或 fail

---

## 验收后清理

本功能为纯库代码变更，无后台服务启动，无需清理。

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 1 | 1.1 | CORE_TOOLS 常量已定义且被引用 | 2 | 0 | ✅ |
| 场景 1 | 1.2 | isDeferredTool 函数体仅含白名单逻辑 | 2 | 0 | ✅ |
| 场景 1 | 1.3 | isDeferredTool 不再依赖旧 feature flag 逻辑 | 2 | 0 | ✅ |
| 场景 1 | 1.4 | CORE_TOOLS 与 isDeferredTool 单元测试通过 | 1 | 0 | ✅ |
| 场景 2 | 2.1 | localSearch.ts 三个 TF-IDF 核心函数已导出 | 1 | 0 | ✅ |
| 场景 2 | 2.2 | toolIndex.ts 导出正确的接口与函数 | 1 | 0 | ✅ |
| 场景 2 | 2.3 | toolIndex.ts TypeScript 编译无错误 | 1 | 0 | ✅ |
| 场景 2 | 2.4 | toolIndex.ts 单元测试通过 | 1 | 0 | ✅ |
| 场景 2 | 2.5 | localSearch.ts 原有测试未回归 | 1 | 0 | ✅ |
| 场景 3 | 3.1 | ExecuteTool 常量文件正确 | 1 | 0 | ✅ |
| 场景 3 | 3.2 | ExecuteTool prompt 文件正确 | 2 | 0 | ✅ |
| 场景 3 | 3.3 | ExecuteTool 使用 buildTool 构建 | 2 | 0 | ✅ |
| 场景 3 | 3.4 | isDeferredTool 正确排除 ExecuteTool | 1 | 0 | ✅ |
| 场景 3 | 3.5 | ExecuteTool 单元测试通过 | 1 | 0 | ✅ |
| 场景 4 | 4.1 | TF-IDF 搜索依赖已正确导入 | 3 | 0 | ✅ |
| 场景 4 | 4.2 | discover: 查询模式已实现 | 1 | 0 | ✅ |
| 场景 4 | 4.3 | 关键词搜索与 TF-IDF 搜索并行执行 | 2 | 0 | ✅ |
| 场景 4 | 4.4 | 结果合并使用加权求和 | 2 | 0 | ✅ |
| 场景 4 | 4.5 | 文本模式回退支持跨 API provider | 2 | 0 | ✅ |
| 场景 4 | 4.6 | prompt.ts 包含 discover: 模式文档 | 1 | 0 | ✅ |
| 场景 4 | 4.7 | 搜索增强后 TypeScript 编译无新增错误 | 1 | 0 | ✅ |
| 场景 4 | 4.8 | ToolSearchTool 搜索增强单元测试通过 | 1 | 0 | ✅ |
| 场景 5 | 5.1 | 全量测试套件通过 | 1 | 0 | ✅ |
| 场景 5 | 5.2 | TypeScript 全量类型检查通过 | 1 | 0 | ✅ |
| 场景 5 | 5.3 | CORE_TOOLS 在关键文件中被引用 | 2 | 0 | ✅ |
| 场景 5 | 5.4 | 项目构建成功 | 1 | 0 | ✅ |
| 场景 5 | 5.5 | precheck 零错误通过 | 1 | 0 | ✅ |

**验收结论:** ✅ 全部通过

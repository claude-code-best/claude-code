# TREE_SITTER_BASH — Bash AST 解析

> Feature Flag: `FEATURE_TREE_SITTER_BASH=1`
> 实现状态：完整可用（纯 TypeScript 实现，~7000+ 行）
> 引用数：3

## 一、功能概述

TREE_SITTER_BASH 启用一个完整的 Bash AST 解析器，用于安全验证 Bash 命令。它用完整的树遍历安全分析器取代了旧的基于正则表达式的 shell-quote 解析器。关键属性是 **fail-closed**：任何无法识别的内容都被归类为 `too-complex` 并需要用户批准。

### 关联 Feature

| Feature | 说明 |
|---------|------|
| `TREE_SITTER_BASH` | 激活用于权限检查的 AST 解析器 |
| `TREE_SITTER_BASH_SHADOW` | Shadow/观测模式：运行解析器但丢弃结果，仅记录遥测 |

## 二、安全架构

### 2.1 Fail-Closed 设计

核心设计使用 **allowlist** 遍历模式：

- `walkArgument()` 只处理已知安全的节点类型（`word`、`number`、`raw_string`、`string`、`concatenation`、`arithmetic_expansion`、`simple_expansion`）
- 任何未知节点类型 → `tooComplex()` → 需要用户批准
- 解析器加载但失败（超时/节点预算/panic）→ 返回 `PARSE_ABORTED` 符号（区别于"模块未加载"）

### 2.2 解析结果

```ts
parseForSecurity(cmd) 返回：
  { kind: 'simple', commands: SimpleCommand[] }     // 可静态分析
  { kind: 'too-complex', reason, nodeType }          // 需要用户批准
  { kind: 'parse-unavailable' }                      // 解析器未加载
```

### 2.3 安全检查层次

```
parseForSecurity(cmd)
      │
      ▼
parseCommandRaw(cmd) → AST root node
      │
      ▼
预检查：控制字符、Unicode 空白、反斜杠+空白、
        zsh ~[ ] 语法、zsh =cmd 展开、大括号+引号混淆
      │
      ▼
walkProgram(root) → collectCommands(root, commands, varScope)
      │
      ├── 'command'         → walkCommand()
      ├── 'pipeline'/'list' → 结构性，递归子节点
      ├── 'for_statement'   → 跟踪循环变量为 VAR_PLACEHOLDER
      ├── 'if/while'        → 作用域隔离的分支
      ├── 'subshell'        → 作用域复制
      ├── 'variable_assignment' → walkVariableAssignment()
      ├── 'declaration_command' → 验证 declare/export flags
      ├── 'test_command'    → walk test expressions
      └── 其他              → tooComplex()
      │
      ▼
checkSemantics(commands)
  ├── EVAL_LIKE_BUILTINS（eval, source, exec, trap...）
  ├── ZSH_DANGEROUS_BUILTINS（zmodload, emulate...）
  ├── SUBSCRIPT_EVAL_FLAGS（test -v, printf -v, read -a）
  ├── Shell keywords as argv[0]（误解析检测）
  ├── /proc/*/environ 访问
  ├── jq system() 和危险 flags
  └── 包装器剥离（time, nohup, timeout, nice, env, stdbuf）
```

## 三、实现架构

### 3.1 核心模块

| 模块 | 文件 | 行数 | 职责 |
|------|------|------|------|
| 门控入口 | `src/utils/bash/parser.ts` | ~110 | `parseCommand()`、`parseCommandRaw()`、`ensureInitialized()` |
| Bash 解析器 | `src/utils/bash/bashParser.ts` | 4437 | 纯 TS 词法分析 + 递归下降解析器 |
| 安全分析器 | `src/utils/bash/ast.ts` | 2680 | 树遍历安全分析 + `parseForSecurity()` |
| AST 分析辅助 | `src/utils/bash/treeSitterAnalysis.ts` | 507 | 引号上下文、复合结构、危险模式提取 |
| 权限检查入口 | `src/tools/BashTool/bashPermissions.ts` | — | 集成 AST 结果到权限决策 |

### 3.2 Bash 解析器

文件：`src/utils/bash/bashParser.ts`（4437 行）

- 纯 TypeScript 实现（无原生依赖）
- 生成与 tree-sitter-bash 兼容的 AST
- 关键类型：`TsNode`（type、text、startIndex、endIndex、children）
- 安全限制：`PARSE_TIMEOUT_MS = 50`、`MAX_NODES = 50_000` — 防止对抗性输入导致 OOM

### 3.3 安全分析器

文件：`src/utils/bash/ast.ts`（2680 行）

核心函数：

| 函数 | 职责 |
|------|------|
| `parseForSecurity(cmd)` | 顶层入口，返回 `simple/too-complex/parse-unavailable` |
| `parseForSecurityFromAst(cmd, root)` | 接受预解析 AST |
| `checkSemantics(commands)` | 后解析语义检查 |
| `walkCommand()` | 提取 argv、envVars、redirects |
| `walkArgument()` | Allowlist 参数遍历 |
| `collectCommands()` | 递归收集所有命令 |

### 3.4 AST 分析辅助

文件：`src/utils/bash/treeSitterAnalysis.ts`（507 行）

| 函数 | 职责 |
|------|------|
| `extractQuoteContext()` | 识别单引号、双引号、ANSI-C 字符串、heredoc |
| `extractCompoundStructure()` | 检测管道、子 shell、命令组 |
| `hasActualOperatorNodes()` | 区分真实 `;`/`&&`/`||` 与转义形式 |
| `extractDangerousPatterns()` | 检测命令替换、参数展开、heredocs |
| `analyzeCommand()` | 单次遍历提取 |

### 3.5 Shadow 模式

`TREE_SITTER_BASH_SHADOW` 运行解析器但**从不影响权限决策**：

```ts
// Shadow 模式：记录遥测，然后强制使用旧版路径
astResult = { kind: 'parse-unavailable' }
astRoot = null
// 记录: available, astTooComplex, astSemanticFail, subsDiffer, ...
```

记录 `tengu_tree_sitter_shadow` 事件，包含与旧版 `splitCommand()` 的对比数据。用于在不影响行为的情况下收集遥测。

## 四、关键设计决策

1. **Allowlist 遍历**：只处理已知安全的节点类型，未知类型直接 `tooComplex()`
2. **PARSE_ABORTED 符号**：区分"解析器未加载"和"解析器加载但失败"。后者阻止回退旧版（旧版缺少 `EVAL_LIKE_BUILTINS` 检查）
3. **变量作用域跟踪**：`VAR=value && cmd $VAR` 模式。静态值解析为真实字符串，`$()` 输出使用 `VAR_PLACEHOLDER`
4. **PS4/IFS Allowlist**：PS4 赋值使用严格字符白名单 `[A-Za-z0-9 _+:.\/=\[\]-]`，只允许 `${VAR}` 引用
5. **包装器剥离**：从 argv 前面剥离 `time/nohup/timeout/nice/env/stdbuf`，未知标志 → fail-closed
6. **Shadow 安全性**：Shadow 模式**总是**强制 `astResult = { kind: 'parse-unavailable' }`，绝不影响权限

## 五、使用方式

```bash
# 激活 AST 解析用于权限检查
FEATURE_TREE_SITTER_BASH=1 bun run dev

# Shadow 模式（仅遥测，不影响行为）
FEATURE_TREE_SITTER_BASH_SHADOW=1 bun run dev
```

## 六、文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/utils/bash/parser.ts` | ~110 | 门控入口点 |
| `src/utils/bash/bashParser.ts` | 4437 | 纯 TS bash 解析器 |
| `src/utils/bash/ast.ts` | 2680 | 安全分析器（核心） |
| `src/utils/bash/treeSitterAnalysis.ts` | 507 | AST 分析辅助 |
| `packages/builtin-tools/src/tools/BashTool/bashPermissions.ts` | ~140 | 权限集成 + Shadow 遥测 |

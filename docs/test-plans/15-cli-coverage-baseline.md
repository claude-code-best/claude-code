# Plan 15 — CLI 参数测试 + 覆盖率基线

> 优先级：低 | 预估 ~15 个测试用例

---

## 15.1 `src/main.tsx` CLI 参数测试

**目标**：覆盖 Commander.js 配置的参数解析和模式切换。

### 前置条件

`src/main.tsx` 的 Commander 实例通常在模块顶层创建。测试策略：
- 直接构造 Commander 实例或 mock `main.tsx` 的 program 导出
- 使用 `parseArgs` 而非 `parse`（不触发 `process.exit`）

### 用例

| # | 用例 | 输入 | 期望 |
|---|------|------|------|
| 1 | 默认模式 | `[]` | 模式为 REPL |
| 2 | pipe 模式 | `["-p"]` | 模式为 pipe |
| 3 | pipe 带输入 | `["-p", "say hello"]` | 输入为 `"say hello"` |
| 4 | print 模式 | `["--print", "hello"]` | 等效于 pipe |
| 5 | verbose | `["-v"]` | verbose 标志为 true |
| 6 | model 选择 | `["--model", "claude-opus-4-6"]` | model 值正确传递 |
| 7 | system prompt | `["--system-prompt", "custom"]` | system prompt 被设置 |
| 8 | help | `["--help"]` | 显示帮助信息，不报错 |
| 9 | version | `["--version"]` | 显示版本号 |
| 10 | unknown flag | `["--nonexistent"]` | 不报错（Commander 允许未知参数时） |

> **风险**：`main.tsx` 可能执行初始化逻辑（auth、analytics），需要在 mock 环境中运行。如果复杂度过高，降级为只测试参数解析部分。

---

## 15.2 覆盖率基线

### 运行命令

```bash
bun test --coverage 2>&1 | tail -50
```

### 记录内容

| 模块 | 当前覆盖率 | 目标 |
|------|-----------|------|
| `src/utils/` | 待测量 | >= 80% |
| `src/utils/permissions/` | 待测量 | >= 60% |
| `src/utils/model/` | 待测量 | >= 60% |
| `src/Tool.ts` + `src/tools.ts` | 待测量 | >= 80% |
| `src/utils/claudemd.ts` | 待测量 | >= 40%（核心逻辑难测） |
| 整体 | 待测量 | 不设强制指标 |

### 后续行动

- 将基线数据填入 `testing-spec.md` §4
- 识别覆盖率最低的 10 个文件，排入后续测试计划
- 如 `bun test --coverage` 输出不可用（Bun 版本限制），改用手动计算已测/总导出函数比

---

## 验收标准

- [ ] CLI 参数至少覆盖 5 个核心 flag
- [ ] 覆盖率基线数据记录到 testing-spec.md
- [ ] `bun test` 全部通过

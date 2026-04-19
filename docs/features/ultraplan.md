# ULTRAPLAN — 增强规划

> Feature Flag: `FEATURE_ULTRAPLAN=1`
> 实现状态：关键字检测完整，命令处理完整，CCR 远程会话完整
> 引用数：10

## 一、功能概述

ULTRAPLAN 在用户输入中检测 "ultraplan" 关键字时，自动进入增强计划模式。相比普通 plan mode，ultraplan 提供更深入的规划能力，支持本地和远程（CCR）执行。

### 触发方式

| 方式 | 行为 |
|------|------|
| 输入含 "ultraplan" 的文本 | 自动重定向到 `/ultraplan` 命令 |
| `/ultraplan` 斜杠命令 | 直接执行 |
| 彩虹高亮 | 输入框中 "ultraplan" 关键字彩虹动画 |

## 二、实现架构

### 2.1 模块状态

| 模块 | 文件 | 行数 | 状态 |
|------|------|------|------|
| 命令处理器 | `src/commands/ultraplan.tsx` | 525 | **完整** |
| CCR 会话 | `src/utils/ultraplan/ccrSession.ts` | 349 | **完整** |
| 关键字检测 | `src/utils/ultraplan/keyword.ts` | 127 | **完整** |
| 嵌入式提示 | `src/utils/ultraplan/prompt.txt` | 1 | **完整** |
| REPL 对话框 | `src/screens/REPL.tsx` | — | **布线** |
| 关键字高亮 | `src/components/PromptInput/PromptInput.tsx` | — | **布线** |

### 2.2 关键字检测

文件：`src/utils/ultraplan/keyword.ts`（127 行）

`findUltraplanTriggerPositions(text)` 智能过滤：
- 排除引号内的 "ultraplan"
- 排除路径中的 "ultraplan"（如 `/path/to/ultraplan/`）
- 排除斜杠命令以外的上下文
- `replaceUltraplanKeyword(text)` 清理关键字

### 2.3 CCR 远程会话

文件：`src/utils/ultraplan/ccrSession.ts`（349 行）

`ExitPlanModeScanner` 类实现完整的事件状态机：
- `pollForApprovedExitPlanMode()` — 3 秒轮询间隔
- 超时处理和重试
- 支持远程（teleport）和本地执行

### 2.4 数据流

```
用户输入 "帮我 ultraplan 重构这个模块"
         │
         ▼
processUserInput 检测 "ultraplan"
         │
         ▼
重定向到 /ultraplan 命令
         │
         ├── 本地执行 → EnterPlanMode
         │
         └── 远程执行 → teleportToRemote → CCR 会话
                │
                ▼
         ExitPlanModeScanner 轮询
                │
                ▼
         用户在远程审批 → 本地收到结果
```

## 三、需要补全的内容

| 模块 | 说明 |
|------|------|
| `src/screens/REPL.tsx` 中的 UltraplanChoiceDialog / UltraplanLaunchDialog | 用户选择本地/远程执行的对话框组件 |
| `src/commands/ultraplan/` | 空目录，可能是未合并的子命令结构 |

## 四、关键设计决策

1. **智能关键字过滤**：排除引号和路径中的 "ultraplan"，避免误触发
2. **本地/远程双模式**：支持本地 plan mode 和 CCR 远程会话
3. **彩虹高亮反馈**：输入框中 "ultraplan" 关键字使用彩虹动画，暗示这是特殊功能
4. **processUserInput 集成**：在用户输入处理管道中拦截，无缝重定向

## 五、使用方式

```bash
# 启用 feature
FEATURE_ULTRAPLAN=1 bun run dev

# 在 REPL 中使用
# > ultraplan 重构认证模块
# > /ultraplan
```

## 六、文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/commands/ultraplan.tsx` | 525 | 斜杠命令处理器 |
| `src/utils/ultraplan/ccrSession.ts` | 349 | CCR 远程会话管理 |
| `src/utils/ultraplan/keyword.ts` | 127 | 关键字检测和替换 |
| `src/utils/ultraplan/prompt.txt` | 1 | 嵌入式提示 |
| `src/utils/processUserInput/processUserInput.ts:468` | — | 关键字重定向 |
| `src/components/PromptInput/PromptInput.tsx` | — | 彩虹高亮 |

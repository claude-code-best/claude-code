# Windows Terminal Agent Teams 分屏分析报告

> 生成日期：2026-04-21

## 概述

Claude Code 官方 Agent Teams 使用 **tmux** 实现分屏可视化：每个 teammate 在独立的 tmux pane 中运行，用户可以实时看到每个 agent 的工作进度。由于 tmux 不原生支持 Windows，项目添加了 **Windows Terminal 后端**（`WindowsTerminalBackend`），通过 `wt.exe` 的 `split-pane` 和 `new-tab` CLI 命令实现等效的分屏功能。

本文档分析 Windows Terminal 后端的完整实现状态、与 Agent Teams spawn 管道的集成情况，以及当前阻止其正常工作的具体问题。

---

## 架构概览

项目实现了一套多后端 teammate 可视化系统，采用两层抽象：

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Teams spawn 管道                        │
│  (AgentTool → getTeammateExecutor() → TeammateExecutor.spawn()) │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │     TeammateExecutor 接口     │  ← 高层：spawn/sendMessage/terminate/kill
              │     (types.ts:312-336)       │
              └──────┬───────────────┬───────┘
                     │               │
          ┌──────────┴──┐   ┌───────┴────────────┐
          │ InProcess   │   │ PaneBackendExecutor │  ← 适配器
          │ Backend     │   │ (PaneBackendExecutor│     将 PaneBackend 适配为
          │             │   │  .ts:73-402)        │     TeammateExecutor
          └─────────────┘   └───────┬─────────────┘
                                    │
                     ┌──────────────┼──────────────┐
                     │              │              │
              ┌──────┴──┐   ┌──────┴──┐   ┌──────┴──────────┐
              │  Tmux   │   │ iTerm2  │   │ Windows Terminal │  ← PaneBackend 接口
              │ Backend │   │ Backend │   │    Backend       │     (types.ts:43-181)
              └─────────┘   └─────────┘   └─────────────────┘
```

### 文件关系

| 文件 | 角色 | 行数 |
|------|------|------|
| `src/utils/swarm/backends/types.ts` | 接口定义（`BackendType`、`PaneBackend`、`TeammateExecutor`） | 350 行 |
| `src/utils/swarm/backends/registry.ts` | 后端检测、选择、缓存 | 565 行 |
| `src/utils/swarm/backends/detection.ts` | 环境探测（tmux/iTerm2/Windows Terminal） | 153 行 |
| `src/utils/swarm/backends/PaneBackendExecutor.ts` | PaneBackend → TeammateExecutor 适配器 | 403 行 |
| `src/utils/swarm/backends/WindowsTerminalBackend.ts` | Windows Terminal 后端实现 | 221 行 |
| `src/utils/swarm/backends/TmuxBackend.ts` | tmux 后端实现 | — |
| `src/utils/swarm/backends/ITermBackend.ts` | iTerm2 后端实现 | — |
| `src/utils/swarm/backends/InProcessBackend.ts` | 进程内后端（静默模式） | — |
| `src/utils/swarm/backends/teammateModeSnapshot.ts` | 会话启动时的模式快照 | 88 行 |

---

## 后端检测优先级链

`registry.ts:160-319` 的 `detectAndGetBackend()` 函数实现了以下检测流程：

```
detectAndGetBackend() 检测流程
│
├─ [最高优先] 用户显式指定 teammateMode === 'windows-terminal'  (行 183-201)
│   └─ 检查 platform === 'windows' && wt.exe 可用 → WindowsTerminalBackend
│
├─ [优先级 1] 在 tmux 内运行 (insideTmux === true)              (行 203-216)
│   └─ 始终使用 TmuxBackend（即使在 iTerm2 内）
│
├─ [优先级 2] 在 iTerm2 内运行                                    (行 219-276)
│   ├─ it2 CLI 可用 → ITermBackend
│   ├─ it2 不可用但 tmux 可用 → TmuxBackend (fallback)
│   └─ 都不可用 → 抛错
│
├─ [优先级 3] Windows 平台 + wt.exe 可用                         (行 278-296)
│   └─ WindowsTerminalBackend（auto 模式自动检测）
│
├─ [优先级 4] tmux 可用（外部会话模式）                            (行 298-314)
│   └─ TmuxBackend
│
└─ [兜底] 无可用后端 → 抛错，显示安装指南                          (行 317-318)
```

### auto 模式的 in-process 判断（registry.ts:423-462）

`isInProcessEnabled()` 决定是否跳过 pane 后端：

```typescript
// registry.ts:452-455
const insideTmux = isInsideTmuxSync()
const inITerm2 = isInITerm2()
const inWindowsTerminal = isInWindowsTerminal()
enabled = !insideTmux && !inITerm2 && !inWindowsTerminal
```

- 在 tmux/iTerm2/Windows Terminal 内 → `false`（使用 pane 后端）
- 其他环境（如 VS Code Terminal、普通 cmd.exe） → `true`（使用 in-process，无分屏可视化）

---

## WindowsTerminalBackend 实现状态

`WindowsTerminalBackend.ts` 实现了完整的 `PaneBackend` 接口：

### 已实现功能

| 功能 | 方法 | 行号 | 说明 |
|------|------|------|------|
| 分屏创建 | `createTeammatePaneInSwarmView()` | 73-85 | `wt.exe -w 0 split-pane --vertical --title <name>` |
| 新标签页创建 | `createTeammateWindowInSwarmView()` | 87-99 | `wt.exe -w -1 new-tab --title <name>` |
| 命令发送 | `sendCommandToPane()` | 101-133 | PowerShell 包装，PID 文件跟踪 |
| 进程终止 | `killPane()` | 166-199 | 通过 PID 文件 + `Stop-Process -Id <pid> -Force` |

### 不支持的功能（Windows Terminal CLI 限制）

| 功能 | 方法 | 行号 | 说明 |
|------|------|------|------|
| 边框颜色 | `setPaneBorderColor()` | 135-141 | wt.exe 不支持 per-pane 边框颜色 |
| 标题更新 | `setPaneTitle()` | 143-150 | 标题在启动时设置，不可动态更新 |
| 边框状态 | `enablePaneBorderStatus()` | 152-157 | 不支持 |
| 窗格重排 | `rebalancePanes()` | 159-164 | Windows Terminal 自行管理布局 |
| 隐藏/显示 | `hidePane()` / `showPane()` | 201-214 | 不支持 |

### PaneBackendExecutor 中的 Windows 适配

`PaneBackendExecutor.ts:191-194` 针对 `windows-terminal` 后端构建 PowerShell 命令（而非 bash）：

```typescript
// PaneBackendExecutor.ts:191-194
const spawnCommand =
  this.type === 'windows-terminal'
    ? buildPowerShellSpawnCommand(binaryPath, allArgs, workingDir)
    : `cd ${quote([workingDir])} && env ${envStr} ${quote([binaryPath])} ${quote(allArgs)}`
```

### 自注册机制

```typescript
// WindowsTerminalBackend.ts:219-220
// 模块导入时自动注册到 registry
registerWindowsTerminalBackend(WindowsTerminalBackend)
```

```typescript
// registry.ts:82-88 — ensureBackendsRegistered() 动态导入所有后端
await import('./TmuxBackend.js')
await import('./ITermBackend.js')
await import('./WindowsTerminalBackend.js')
```

---

## 发现的问题

### 问题 1: CLI `--teammate-mode` choices 缺少 `windows-terminal`

**文件**: `src/main.tsx:4580-4584`

**当前代码**:
```typescript
program.addOption(
  new Option('--teammate-mode <mode>', 'How to spawn teammates: "tmux", "in-process", or "auto"')
    .choices(['auto', 'tmux', 'in-process'])
    .hideHelp(),
);
```

**问题**: Commander.js 的 `.choices()` 会在解析时校验输入值。传入 `--teammate-mode windows-terminal` 会被 Commander 直接拒绝，返回错误而非传递给下游逻辑。

**预期修复**:
```typescript
program.addOption(
  new Option('--teammate-mode <mode>', 'How to spawn teammates: "tmux", "windows-terminal", "in-process", or "auto"')
    .choices(['auto', 'tmux', 'windows-terminal', 'in-process'])
    .hideHelp(),
);
```

---

### 问题 2: Settings UI 选项缺少 `windows-terminal`

**文件**: `src/components/Settings/Config.tsx:1067`

**当前代码**:
```typescript
options: ['auto', 'tmux', 'in-process'],
```

**问题**: 用户在 `/config` 设置界面看不到 `windows-terminal` 选项，无法通过 UI 切换到 Windows Terminal 模式。

**预期修复**:
```typescript
options: ['auto', 'tmux', 'windows-terminal', 'in-process'],
```

同时需要更新 `onChange` 中的类型守卫（行 1070-1074）：
```typescript
// 当前
if (mode !== 'auto' && mode !== 'tmux' && mode !== 'in-process') {
  return
}
// 修复后
if (mode !== 'auto' && mode !== 'tmux' && mode !== 'windows-terminal' && mode !== 'in-process') {
  return
}
```

---

### 问题 3: `TeammateOptions` 类型缺少 `windows-terminal`

**文件**: `src/main.tsx:5632-5641`

**当前代码**:
```typescript
type TeammateOptions = {
  agentId?: string;
  agentName?: string;
  teamName?: string;
  agentColor?: string;
  planModeRequired?: boolean;
  parentSessionId?: string;
  teammateMode?: 'auto' | 'tmux' | 'in-process';  // ← 缺少 'windows-terminal'
  agentType?: string;
};
```

**问题**: TypeScript 类型层面就排除了 `windows-terminal`，任何尝试赋值 `'windows-terminal'` 的代码都会产生类型错误。

**预期修复**:
```typescript
teammateMode?: 'auto' | 'tmux' | 'windows-terminal' | 'in-process';
```

**注意**: `config.ts:529` 的 `GlobalConfig` 类型和 `teammateModeSnapshot.ts:13` 的 `TeammateMode` 类型**已经包含** `'windows-terminal'`。只有 `main.tsx` 的 `TeammateOptions` 落后了。

---

### 问题 4: `extractTeammateOptions` 验证过滤掉 `windows-terminal`

**文件**: `src/main.tsx:5643-5660`

**当前代码**:
```typescript
function extractTeammateOptions(options: unknown): TeammateOptions {
  // ...
  teammateMode:
    teammateMode === 'auto' || teammateMode === 'tmux' || teammateMode === 'in-process'
      ? teammateMode
      : undefined,  // ← 'windows-terminal' 被过滤为 undefined
  // ...
}
```

**问题**: 即使 CLI 参数和 config 传入了 `'windows-terminal'`，这个函数也会将其丢弃为 `undefined`，导致下游回退到 `'auto'` 默认值。

**预期修复**:
```typescript
teammateMode:
  teammateMode === 'auto' || teammateMode === 'tmux' || teammateMode === 'windows-terminal' || teammateMode === 'in-process'
    ? teammateMode
    : undefined,
```

---

### 问题 5: auto 模式在非 Windows Terminal 终端中的 fallback 陷阱

**文件**: `src/utils/swarm/backends/registry.ts:452-455` 和 `detection.ts:121-127`

**当前逻辑**:
```typescript
// registry.ts:452-455 — isInProcessEnabled() 中的 auto 模式判断
const insideTmux = isInsideTmuxSync()
const inITerm2 = isInITerm2()
const inWindowsTerminal = isInWindowsTerminal()
enabled = !insideTmux && !inITerm2 && !inWindowsTerminal
```

```typescript
// detection.ts:121-127 — isInWindowsTerminal() 的实现
export function isInWindowsTerminal(): boolean {
  if (isInWindowsTerminalCached !== null) {
    return isInWindowsTerminalCached
  }
  isInWindowsTerminalCached = !!process.env.WT_SESSION
  return isInWindowsTerminalCached
}
```

**问题**: `isInWindowsTerminal()` 只检查 `WT_SESSION` 环境变量，该变量仅在 **Windows Terminal 内部启动的进程** 中被设置。如果用户在以下环境运行 Claude Code：

- VS Code 集成终端
- 普通 cmd.exe / PowerShell 窗口
- ConEmu / Cmder 等第三方终端

`WT_SESSION` 不存在 → `isInWindowsTerminal()` 返回 `false` → `isInProcessEnabled()` 返回 `true` → **直接使用 in-process 模式，完全跳过 WindowsTerminalBackend**，用户看不到任何分屏效果。

然而，这些环境中 `wt.exe` 可能仍然可用（Windows Terminal 已安装）。`detectAndGetBackend()` 的优先级 3（行 278-296）中确实检查了 `isWindowsTerminalAvailable()`（即 `wt.exe --version` 是否返回 0），但 `isInProcessEnabled()` 在更早的阶段就拦截了调用链，根本不会走到 `detectAndGetBackend()`。

**预期修复方案**:

方案 A（推荐）: 在 auto 模式的 `isInProcessEnabled()` 中增加对 `wt.exe` 可用性的检查：
```typescript
// 如果不在任何已知 pane 环境内，但 wt.exe 可用，仍使用 pane 后端
if (getPlatform() === 'windows') {
  // isWindowsTerminalAvailable() 是异步的，需要调整 isInProcessEnabled 为异步
  // 或者使用同步的可用性缓存
  return false  // 让 detectAndGetBackend() 去做详细检测
}
```

方案 B: 让 `isInProcessEnabled()` 在 Windows 平台上始终返回 `false`（auto 模式下），强制走 `detectAndGetBackend()` 的完整检测流程，该流程已正确处理 Windows Terminal 检测。

**注意**: `isInProcessEnabled()` 是同步函数，而 `isWindowsTerminalAvailable()` 是异步函数（需要执行 `wt.exe --version`）。修复需要考虑这个异步性问题，可能需要在启动时预检测并缓存结果。

---

## 修复建议汇总

| 优先级 | 文件 | 行号 | 修改内容 |
|--------|------|------|---------|
| P0 | `src/main.tsx` | 4582 | `.choices()` 添加 `'windows-terminal'` |
| P0 | `src/main.tsx` | 5639 | `TeammateOptions.teammateMode` 类型添加 `'windows-terminal'` |
| P0 | `src/main.tsx` | 5656-5657 | `extractTeammateOptions` 验证条件添加 `'windows-terminal'` |
| P0 | `src/components/Settings/Config.tsx` | 1067 | `options` 数组添加 `'windows-terminal'` |
| P0 | `src/components/Settings/Config.tsx` | 1071-1074 | `onChange` 类型守卫添加 `'windows-terminal'` |
| P1 | `src/utils/swarm/backends/registry.ts` | 452-455 | auto 模式在 Windows 平台优化 fallback 策略 |

P0 修复完成后，用户可以通过以下方式使用 Windows Terminal 分屏：
1. `claude --teammate-mode windows-terminal`（CLI 参数）
2. `/config` → Teammate mode → `windows-terminal`（Settings UI）
3. 在 Windows Terminal 内运行时，auto 模式自动检测（已有逻辑）

P1 修复后，在非 Windows Terminal 终端（如 VS Code Terminal）中 auto 模式也能正确检测到 `wt.exe` 并使用分屏。

---

## 相关文件索引

### 核心架构

- `src/utils/swarm/backends/types.ts` — `BackendType`、`PaneBackend`、`TeammateExecutor` 接口定义
- `src/utils/swarm/backends/registry.ts` — 后端检测、选择、缓存、`getTeammateExecutor()`
- `src/utils/swarm/backends/detection.ts` — 环境探测函数
- `src/utils/swarm/backends/PaneBackendExecutor.ts` — PaneBackend → TeammateExecutor 适配器
- `src/utils/swarm/backends/teammateModeSnapshot.ts` — 会话启动时模式快照

### 后端实现

- `src/utils/swarm/backends/WindowsTerminalBackend.ts` — Windows Terminal 后端
- `src/utils/swarm/backends/TmuxBackend.ts` — tmux 后端
- `src/utils/swarm/backends/ITermBackend.ts` — iTerm2 后端
- `src/utils/swarm/backends/InProcessBackend.ts` — 进程内后端

### 入口与配置

- `src/entrypoints/cli.tsx:345-371` — `--tmux` + `--worktree` 快速路径
- `src/main.tsx:4580-4584` — `--teammate-mode` CLI 选项定义
- `src/main.tsx:5632-5660` — `TeammateOptions` 类型和 `extractTeammateOptions()` 函数
- `src/main.tsx:1593-1609` — teammate 选项提取和验证入口
- `src/components/Settings/Config.tsx:1060-1089` — Settings UI 中的 teammate mode 设置
- `src/utils/config.ts:528-529` — `GlobalConfig.teammateMode` 类型定义（已包含 `windows-terminal`）

### 测试

- `src/utils/swarm/backends/__tests__/WindowsTerminalBackend.test.ts` — Windows Terminal 后端单元测试
- `src/utils/swarm/backends/__tests__/PaneBackendExecutor.test.ts` — 适配器单元测试

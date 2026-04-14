# Task 016: 向后兼容 + 测试

> 设计文档: [daemon-restructure-design.md](../features/daemon-restructure-design.md) § 五
> 依赖: Task 014, Task 015
> 分支: `feat/integrate-5-branches`

## 目标

确保旧命令向后兼容 (deprecation 警告 + 正常代理)，并为重构后的命令结构编写测试。

## 文件清单

### 新增

| 文件 | 说明 |
|------|------|
| `src/daemon/__tests__/daemonMain.test.ts` | daemonMain 子命令路由测试 |
| `src/cli/bg/__tests__/engine.test.ts` | BgEngine 选择逻辑测试 |
| `src/cli/bg/__tests__/detached.test.ts` | DetachedEngine 启动/停止测试 |
| `src/cli/bg/__tests__/tail.test.ts` | 日志 tail 功能测试 |

### 修改

| 文件 | 变更 |
|------|------|
| `src/entrypoints/cli.tsx` | 确认 deprecation 路径正确代理 |

## 实现方案

### 1. 向后兼容矩阵

| 旧命令 | 新命令 | 处理方式 |
|--------|--------|---------|
| `claude ps` | `claude daemon status` | stderr 输出 `[deprecated] Use: claude daemon status`，然后执行 |
| `claude logs <x>` | `claude daemon logs <x>` | 同上 |
| `claude attach <x>` | `claude daemon attach <x>` | 同上 |
| `claude kill <x>` | `claude daemon kill <x>` | 同上 |
| `claude --bg` | `claude daemon bg` | 保留为快捷方式，**不** deprecate (太常用) |
| `claude new <t>` | `claude job new <t>` | stderr deprecation + 执行 |
| `claude list` | `claude job list` | stderr deprecation + 执行 |
| `claude reply <id>` | `claude job reply <id>` | stderr deprecation + 执行 |

**关键**: deprecation 输出到 stderr 而非 stdout，不影响脚本管道。

### 2. 测试计划

#### 2.1 daemonMain 路由测试

```typescript
describe('daemonMain', () => {
  test('无参数默认 status', async () => { ... })
  test('start 调用 runSupervisor', async () => { ... })
  test('stop 调用 handleDaemonStop', async () => { ... })
  test('bg 委托给 bg.handleBgStart', async () => { ... })
  test('attach 委托给 bg.attachHandler', async () => { ... })
  test('logs 委托给 bg.logsHandler', async () => { ... })
  test('kill 委托给 bg.killHandler', async () => { ... })
  test('未知子命令设置 exitCode=1', async () => { ... })
})
```

#### 2.2 引擎选择测试

```typescript
describe('selectEngine', () => {
  test('win32 返回 DetachedEngine', async () => { ... })
  test('darwin + tmux 可用返回 TmuxEngine', async () => { ... })
  test('darwin + tmux 不可用返回 DetachedEngine', async () => { ... })
  test('linux + tmux 可用返回 TmuxEngine', async () => { ... })
})
```

#### 2.3 DetachedEngine 测试

```typescript
describe('DetachedEngine', () => {
  test('available 始终返回 true', async () => { ... })
  test('start 创建 detached 子进程并写入日志', async () => { ... })
  test('start 返回的 PID 文件存在', async () => { ... })
})
```

#### 2.4 Tail 测试

```typescript
describe('tailLog', () => {
  test('输出已有日志内容', async () => { ... })
  test('追加内容时实时输出', async () => { ... })
  test('SIGINT 退出 tail', async () => { ... })
})
```

### 3. 集成验证脚本

可选: 在 `scripts/` 下添加一个手动验证脚本:

```bash
#!/bin/bash
# scripts/verify-daemon-restructure.sh
echo "=== 1. claude daemon status ==="
bun run dev -- daemon status

echo "=== 2. claude daemon bg (should start) ==="
bun run dev -- daemon bg --help

echo "=== 3. claude ps (deprecated) ==="
bun run dev -- ps 2>&1 | head -1

echo "=== 4. claude job list ==="
bun run dev -- job list

echo "=== 5. claude list (deprecated) ==="
bun run dev -- list 2>&1 | head -1
```

## 验证清单

- [ ] 旧命令全部正常工作 (仅多一行 stderr 警告)
- [ ] `--bg` 保持无警告
- [ ] 所有新增测试通过
- [ ] 现有 2695 个测试无回归
- [ ] tsc --noEmit 零错误
- [ ] 手动在 Windows + macOS/Linux 上验证关键路径

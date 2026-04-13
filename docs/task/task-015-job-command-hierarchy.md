# Task 015: /job 命令层级化

> 设计文档: [daemon-restructure-design.md](../features/daemon-restructure-design.md) § 三.2
> 依赖: 无 (可与 Task 013 并行)
> 分支: `feat/integrate-5-branches`

## 目标

将 `claude new/list/reply` 收归 `/job` 命名空间，实现 CLI + REPL 双注册。

## 背景

当前 `new`, `list`, `reply` 是顶级 CLI 命令 (`cli.tsx:250-261`)，容易与其他命令冲突（特别是 `list` 这种通用词）。需要收归 `claude job <subcommand>` 并新增 REPL `/job` 入口。

## 文件清单

### 新增

| 文件 | 说明 |
|------|------|
| `src/commands/job/index.ts` | `/job` REPL 斜杠命令注册 |
| `src/commands/job/job.tsx` | `/job` 子命令路由 |

### 修改

| 文件 | 变更 |
|------|------|
| `src/entrypoints/cli.tsx` | 新增 `job` 快速路径 + 旧 `new/list/reply` deprecation 代理 |
| `src/commands.ts` | 注册 `/job` 斜杠命令 |

### 不动

| 文件 | 说明 |
|------|------|
| `src/cli/handlers/templateJobs.ts` | 内部 handler 不变，只是被调用方式变了 |
| `src/jobs/state.ts` | job 状态管理不变 |
| `src/jobs/templates.ts` | 模板发现不变 |
| `src/jobs/classifier.ts` | 任务分类器不变 |

## 实现方案

### 1. CLI 快速路径 (`cli.tsx`)

**改后**:
```typescript
// 新: claude job <subcommand>
if (
  feature('TEMPLATES') &&
  args[0] === 'job'
) {
  profileCheckpoint('cli_templates_path')
  const { templatesMain } = await import('../cli/handlers/templateJobs.js')
  await templatesMain(args.slice(1))
  process.exit(0)
}

// 向后兼容 (deprecated)
if (
  feature('TEMPLATES') &&
  (args[0] === 'new' || args[0] === 'list' || args[0] === 'reply')
) {
  console.error(`[deprecated] Use: claude job ${args[0]} ${args.slice(1).join(' ')}`.trim())
  profileCheckpoint('cli_templates_path')
  const { templatesMain } = await import('../cli/handlers/templateJobs.js')
  await templatesMain(args)
  process.exit(0)
}
```

### 2. templateJobs.ts 新增 status 子命令

在现有 `switch` 中增加:
```typescript
case 'status':
  handleStatus(args.slice(1))
  break
```

```typescript
function handleStatus(args: string[]): void {
  const jobId = args[0]
  if (!jobId) {
    console.error('Usage: claude job status <job-id>')
    process.exitCode = 1
    return
  }
  const state = readJobState(jobId)
  if (!state) {
    console.error(`Job not found: ${jobId}`)
    process.exitCode = 1
    return
  }
  console.log(`Job: ${state.jobId}`)
  console.log(`  Template: ${state.templateName}`)
  console.log(`  Status: ${state.status}`)
  console.log(`  Created: ${state.createdAt}`)
  console.log(`  Updated: ${state.updatedAt}`)
}
```

### 3. REPL 斜杠命令

**`src/commands/job/index.ts`**:
```typescript
import type { Command } from '../../commands.js'
import { feature } from 'bun:bundle'

const job = {
  type: 'local-jsx',
  name: 'job',
  description: 'Manage template jobs',
  argumentHint: '[list|new|reply|status]',
  isEnabled: () => {
    if (feature('TEMPLATES')) return true
    return false
  },
  load: () => import('./job.js'),
} satisfies Command

export default job
```

**`src/commands/job/job.tsx`**:
```typescript
export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const parts = args.trim().split(/\s+/)
  const sub = parts[0] || 'list'

  // 委托给 templatesMain
  const { templatesMain } = await import('../../cli/handlers/templateJobs.js')

  // 捕获 console.log 输出作为结果返回给 REPL
  const lines: string[] = []
  const origLog = console.log
  const origError = console.error
  console.log = (...a: unknown[]) => lines.push(a.join(' '))
  console.error = (...a: unknown[]) => lines.push(a.join(' '))

  try {
    await templatesMain([sub, ...parts.slice(1)])
  } finally {
    console.log = origLog
    console.error = origError
  }

  onDone(lines.join('\n') || 'Done.', { display: 'system' })
  return null
}
```

### 4. commands.ts 注册

```typescript
const jobCmd = feature('TEMPLATES')
  ? require('./commands/job/index.js').default
  : null

// COMMANDS 数组:
...(jobCmd ? [jobCmd] : []),
```

## 验证清单

- [ ] `claude job list` 列出模板
- [ ] `claude job new <template>` 创建任务
- [ ] `claude job reply <id> <text>` 回复任务
- [ ] `claude job status <id>` 显示任务状态
- [ ] `claude job` (无参数) 等同于 `claude job list`
- [ ] `claude new/list/reply` 输出 deprecation 警告 + 正常工作
- [ ] REPL 中 `/job` 可用
- [ ] REPL 中 `/job list` 显示模板列表
- [ ] tsc --noEmit 零错误
- [ ] bun test 通过

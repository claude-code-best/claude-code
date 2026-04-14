# Task 003: TEMPLATES — job 文件系统 MVP

> 来源: [stub-recovery-design-1-4.md](../features/stub-recovery-design-1-4.md) 第 3 项
> 优先级: P2
> 工作量: 中等
> 状态: DONE
> 阶段: MVP

## 目标

把 `new` / `list` / `reply` 做成可用的模板任务系统。第一阶段不碰复杂的自动分类与自动执行。

## 背景

- 命令入口只有 fast-path (`src/entrypoints/cli.tsx:249`)
- handler 是空的 (`src/cli/handlers/templateJobs.ts`)
- `markdownConfigLoader` 已把 `templates` 纳入配置目录 (`src/utils/markdownConfigLoader.ts:29`)
- `query/stopHooks` 已预留 job classifier 链路 (`src/query/stopHooks.ts:103`)
- `jobs/classifier.ts` 仍是 stub (`src/jobs/classifier.ts`)

## 实现方案

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/jobs/state.ts` | job 状态管理 |
| `src/jobs/templates.ts` | 模板解析与列表 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/cli/handlers/templateJobs.ts` | 实现 `new` / `list` / `reply` handler |

### 模板来源

`.claude/templates/*.md`

### 模板格式

复用现有 markdown + frontmatter 解析，不另外设计 DSL。

### list 命令

- 列出所有模板
- 显示: 模板名, description, 路径

### new 命令

- 解析模板
- 在 `~/.claude/jobs/<job-id>/` 下创建 job 目录
- 写入 `template.md`, `input.txt`, `state.json`
- 返回 job id 与目录路径

### reply 命令

- 将回复写入 `replies.jsonl` 或 `input.txt`
- 更新 `state.json`

## 验证步骤

- [ ] `list` 能列出 `.claude/templates` 下的所有模板
- [ ] `new <template> [args...]` 能创建 job 目录和状态文件
- [ ] `reply <job-id> <text>` 能更新 job 内容和状态
- [ ] frontmatter schema 最小字段集已定义

## Phase 2 (后续)

- [ ] 恢复 `src/jobs/classifier.ts`
- [ ] 让带 `CLAUDE_JOB_DIR` 的 job session 在 turn 完成后自动更新 `state.json`
- [ ] 再决定是否补自动 job runner

### 为什么拆分

- 当前是 "template job commands"，不是单纯模板列表
- 自动 job 运行链路没有足够现成实现
- 先做文件系统 job lifecycle 更稳

## 风险

- frontmatter schema 需要先定义最小字段集
- 一旦扩展到"自动运行 job"，范围会明显膨胀

## 依赖

无硬性依赖，可独立实施。

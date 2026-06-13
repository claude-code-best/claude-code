// 引擎级常量。无运行时依赖。

/**
 * Workflow 工具名。PascalCase 与系统其他工具（Agent/Bash/CronCreate…）一致，
 * 否则大小写敏感的 toolMatchesName 会让模型自然的 select:Workflow 匹配失败。
 */
export const WORKFLOW_TOOL_NAME = 'Workflow'

/** 用户命名 workflow 文件目录（相对项目根）。 */
export const WORKFLOW_DIR_NAME = '.claude/workflows'

/** workflow run 持久化目录（journal + run 记录）。 */
export const WORKFLOW_RUNS_DIR = '.claude/workflow-runs'

/** 命名 workflow 支持的脚本扩展名（按优先级）。 */
export const WORKFLOW_SCRIPT_EXTENSIONS = ['.ts', '.js', '.mjs'] as const

/** 并发：信号量许可 = min(MAX_CONCURRENCY_CAP, cpuCores - MAX_CONCURRENCY_OFFSET)。 */
export const MAX_CONCURRENCY_OFFSET = 2
export const MAX_CONCURRENCY_CAP = 16

/** 单个 workflow 生命周期内 agent() 总数上限。 */
export const MAX_TOTAL_AGENTS = 1000

/** 单次 parallel()/pipeline() 调用的 items 上限。 */
export const MAX_ITEMS_PER_CALL = 4096

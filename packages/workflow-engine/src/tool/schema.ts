import { z } from 'zod/v4'

/** Workflow 工具输入 schema。args 为任意 JSON 值（对象/数组/字符串等）。 */
export const workflowInputSchema = z.object({
  script: z
    .string()
    .optional()
    .describe('自包含的 workflow 脚本源码（inline）'),
  name: z
    .string()
    .optional()
    .describe('命名 workflow，解析到 .claude/workflows/<name>.ts|js|mjs'),
  scriptPath: z.string().optional().describe('已有脚本文件的绝对路径'),
  args: z
    .unknown()
    .optional()
    .describe(
      '透传给脚本的 args 全局变量。传真实 JSON 值（对象/数组/字符串），不要传 JSON 字符串。',
    ),
  resumeFromRunId: z
    .string()
    .optional()
    .describe('resume 指定 run，重放 journal'),
  description: z.string().optional().describe('本次调用的简短描述（3-5 词）'),
  title: z.string().optional().describe('进度查看器标题'),
})

/**
 * Workflow 工具输入类型——从 schema 派生，避免手工 type 与 schema 漂移。
 * 旧实现里 {@link WorkflowInput} 在 types.ts 手写、schema 在 schema.ts，
 * 中间靠 `as unknown as z.ZodType<WorkflowInput>` 双重断言连接——schema 改字段
 * 但 type 没动时 TS 不会报错。z.infer 后 schema/type 永远同步。
 */
export type WorkflowInput = z.infer<typeof workflowInputSchema>

/** schema 的 typeof 类型（用于"以 schema 为准"的精确签名）。 */
export type WorkflowInputSchema = typeof workflowInputSchema

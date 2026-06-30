import { z } from 'zod/v4'

/** Workflow tool input schema. args is any JSON value (object/array/string/etc.). */
export const workflowInputSchema = z.object({
  script: z
    .string()
    .optional()
    .describe('Self-contained workflow script source (inline)'),
  name: z
    .string()
    .optional()
    .describe('Named workflow, resolved to .claude/workflows/<name>.ts|js|mjs'),
  scriptPath: z
    .string()
    .optional()
    .describe('Absolute path to an existing script file'),
  args: z
    .unknown()
    .optional()
    .describe(
      'The args global variable passed through to the script. Pass a real JSON value (object/array/string), not a JSON string.',
    ),
  resumeFromRunId: z
    .string()
    .optional()
    .describe('Resume the specified run, replaying the journal'),
  description: z
    .string()
    .optional()
    .describe('A short description of this invocation (3-5 words)'),
  title: z.string().optional().describe('Progress viewer title'),
  maxConcurrency: z
    .number()
    .int()
    .min(1)
    .max(16)
    .optional()
    .describe(
      'Concurrency cap for agent(). Defaults to 3 (max 16). When the workflow contains heavy parallel/pipeline fan-out, you may confirm the desired concurrency with the user via AskUserQuestion before launching.',
    ),
})

/**
 * Workflow tool input type — derived from the schema to avoid hand-written type/schema drift.
 * In the old implementation {@link WorkflowInput} was hand-written in types.ts and the schema in schema.ts,
 * bridged by a `as unknown as z.ZodType<WorkflowInput>` double assertion — when the schema changed fields
 * but the type did not, TS would not flag it. With z.infer, schema/type stay in sync forever.
 */
export type WorkflowInput = z.infer<typeof workflowInputSchema>

/** typeof type of the schema (used for "schema is the source of truth" precise signatures). */
export type WorkflowInputSchema = typeof workflowInputSchema

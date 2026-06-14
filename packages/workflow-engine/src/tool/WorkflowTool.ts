import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod/v4'
import { WORKFLOW_DIR_NAME, WORKFLOW_TOOL_NAME } from '../constants.js'
import { resolveNamedWorkflow } from '../engine/namedWorkflows.js'
import { runWorkflow } from '../engine/runWorkflow.js'
import { parseScript } from '../engine/script.js'
import { containsPath, sanitizeWorkflowName } from '../engine/paths.js'
import type { WorkflowPorts } from '../ports.js'
import type { WorkflowRunResult } from '../types.js'
import { workflowInputSchema, type WorkflowInput } from './schema.js'
import { persistInlineScript } from './persistInline.js'

/** 自包含工具描述符（核心 wiring 用 buildTool 包装它）。零核心层依赖。 */
export type WorkflowToolDescriptor = {
  name: string
  inputSchema: z.ZodType<WorkflowInput>
  isEnabled: () => boolean
  isReadOnly: (input: WorkflowInput) => boolean
  description: () => Promise<string>
  prompt: () => Promise<string>
  renderToolUseMessage: (input: Partial<WorkflowInput>) => string
  call: (
    input: WorkflowInput,
    context: unknown,
    canUseTool: unknown,
    parentMessage: unknown,
    onProgress?: unknown,
  ) => Promise<{ data: { output: string } }>
  mapToolResultToToolResultBlockParam: (
    data: { output: string },
    toolUseId: string,
  ) => {
    tool_use_id: string
    type: 'tool_result'
    content: Array<{ type: 'text'; text: string }>
  }
}

const WORKFLOW_TOOL_PROMPT = `Use the Workflow tool to execute a workflow script that orchestrates multiple subagents deterministically. The script runs in the background; you receive a run_id immediately and are notified on completion.

Provide the script inline via "script", or reference a named workflow via "name" (resolved from .claude/workflows/), or an existing file via "scriptPath". Pass "args" as a real JSON value (object/array/string), not a stringified string.

Use "resumeFromRunId" to resume a prior run — completed agent() calls replay from the journal instantly.

Concurrency: default is 3 (hard ceiling 16). OMIT maxConcurrency to use 3. To set maxConcurrency to ANY value other than 3, you MUST first ask the user via AskUserQuestion — propose 3 / 6 / 9 (or other tiers matching the fan-out width) with 3 marked "(Recommended)". The ONLY exception: the user has ALREADY specified a concurrency number in this session ("use 6", "maxConcurrency 9") — then honor it without re-asking. Never silently raise concurrency above 3 just because the workflow fans out; 3 is the recommended default.

Script execution model (common pitfalls — getting these wrong is the #1 cause of script errors): the script is the body of \`new AsyncFunction\` — NOT an ESM module, and TypeScript is NOT transpiled. Therefore:
- Do NOT use \`import\` — \`agent\`, \`parallel\`, \`pipeline\`, \`phase\`, \`log\`, \`workflow\`, \`args\`, and \`budget\` are injected as parameters; reference them directly.
- Do NOT use TS type annotations, \`interface\`, \`enum\`, \`as\`, or generics — the engine does not transpile, so even a .ts file with type syntax fails to parse.
- Keep EXACTLY ONE \`export const meta = {...}\` (plain literal) and remove every other \`export\` / \`export default\`.
- Return the result with a top-level \`return\`.
Prefer .js / .mjs. See /ultracode for the full playbook and quality patterns.`

export function createWorkflowTool(
  ports: WorkflowPorts,
): WorkflowToolDescriptor {
  return {
    name: WORKFLOW_TOOL_NAME,
    inputSchema: workflowInputSchema,
    // No per-session runtime opt-in gate here: the "ultracode is on for the
    // session" signal is injected by the harness (claude.ai/client), not held
    // in any repo state. This tool is compiled in/out via feature('WORKFLOW_SCRIPTS')
    // in src/tools.ts; beyond that it is always enabled when present.
    isEnabled: () => true,
    isReadOnly: () => false,

    async description() {
      return '执行一个 workflow 脚本，编排多个子 agent 完成任务'
    },

    async prompt() {
      return WORKFLOW_TOOL_PROMPT
    },

    renderToolUseMessage(input) {
      if (input.resumeFromRunId)
        return `Workflow resume: ${input.resumeFromRunId}`
      const id =
        input.name ?? input.scriptPath ?? (input.script ? 'inline' : 'unknown')
      return `Workflow: ${id}`
    },

    async call(input, context, canUseTool, parentMessage) {
      const host = ports.hostFactory({ context, canUseTool, parentMessage })

      // 解析脚本源
      let script: string
      let workflowFile: string | undefined
      try {
        const resolved = await resolveScriptSource(input, host.cwd)
        script = resolved.script
        workflowFile = resolved.workflowFile
      } catch (e) {
        return { data: { output: `Error: ${(e as Error).message}` } }
      }

      // 快速校验（meta + 语法），失败直接返错给模型，不进后台
      try {
        parseScript(script)
      } catch (e) {
        return {
          data: { output: `Error: 脚本校验失败：${(e as Error).message}` },
        }
      }

      const workflowName = input.name ?? input.title ?? 'workflow'
      const { runId, signal } = ports.taskRegistrar.register(
        {
          workflowName,
          ...(workflowFile ? { workflowFile } : {}),
          ...(input.description ? { summary: input.description } : {}),
          ...(host.toolUseId ? { toolUseId: host.toolUseId } : {}),
          ...(input.resumeFromRunId ? { runId: input.resumeFromRunId } : {}),
        },
        host.handle,
      )

      // inline 入口持久化脚本到 run 目录，返回可复用路径（ultracode skill 承诺的
      // inline → 持久化 → 编辑 → scriptPath 重提迭代循环）。写盘失败降级为占位符
      // + warn，不阻断 run（script 已在内存）。
      if (!workflowFile && input.script) {
        try {
          workflowFile = await persistInlineScript(
            input.script,
            runId,
            host.cwd,
          )
        } catch (e) {
          ports.logger.warn?.(
            `inline script persist failed: ${(e as Error).message}`,
          )
        }
      }

      // detached 执行
      void runWorkflow({
        script,
        ...(input.args !== undefined
          ? { args: normalizeArgs(input.args) }
          : {}),
        runId,
        workflowName,
        ports,
        host: host.handle,
        signal,
        cwd: host.cwd,
        budgetTotal: host.budgetTotal,
        ...(input.maxConcurrency !== undefined
          ? { maxConcurrency: input.maxConcurrency }
          : {}),
        ...(input.resumeFromRunId ? { resume: true } : {}),
      })
        .then(result => onFinish(ports, result, runId))
        .catch(e => ports.taskRegistrar.fail(runId, (e as Error).message))

      const scriptPath = workflowFile ?? `<inline run ${runId}>`
      return {
        data: {
          output: [
            'Workflow 已启动（后台执行）。',
            `run_id: ${runId}`,
            `workflow: ${workflowName}`,
            `script: ${scriptPath}`,
            '',
            '完成时会自动通知。用 /workflows 查看实时进度。',
          ].join('\n'),
        },
      }
    },

    mapToolResultToToolResultBlockParam(data, toolUseId) {
      return {
        tool_use_id: toolUseId,
        type: 'tool_result',
        content: [{ type: 'text', text: data.output }],
      }
    },
  }
}

function onFinish(
  ports: WorkflowPorts,
  result: WorkflowRunResult,
  runId: string,
): void {
  if (result.status === 'completed') {
    const summary =
      result.returnValue == null
        ? '(no return value)'
        : formatValue(result.returnValue)
    ports.taskRegistrar.complete(runId, summary)
  } else if (result.status === 'failed') {
    ports.taskRegistrar.fail(runId, result.error ?? 'workflow failed')
  } else {
    ports.taskRegistrar.kill(runId)
  }
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 500)
  try {
    return JSON.stringify(v).slice(0, 500)
  } catch {
    return String(v)
  }
}

/**
 * 防御性归一化 args：旧 `z.string()` 契约下模型可能发送字符串化的 JSON 对象。
 * 仅当字符串能 JSON.parse 出对象/数组时归一化；纯字符串、数字等保留原值。
 */
function normalizeArgs(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) return parsed
    return raw
  } catch {
    return raw
  }
}

async function resolveScriptSource(
  input: WorkflowInput,
  cwd: string,
): Promise<{ script: string; workflowFile?: string }> {
  if (input.script) return { script: input.script }
  if (input.scriptPath) {
    const resolved = resolve(cwd, input.scriptPath)
    if (!containsPath(cwd, resolved)) {
      throw new Error(
        `scriptPath "${input.scriptPath}" 越界（resolve 后 ${resolved} 不在 cwd ${cwd} 之内）`,
      )
    }
    return {
      script: await readFile(resolved, 'utf-8'),
      workflowFile: resolved,
    }
  }
  if (input.name) {
    if (sanitizeWorkflowName(input.name) === null) {
      throw new Error(
        `命名 workflow 名字 "${input.name}" 非法（含路径分隔符或为 . / ..）`,
      )
    }
    const found = await resolveNamedWorkflow(
      join(cwd, WORKFLOW_DIR_NAME),
      input.name,
    )
    if (!found) {
      throw new Error(
        `命名 workflow "${input.name}" 未找到（查找目录 ${WORKFLOW_DIR_NAME}/）`,
      )
    }
    return { script: found.content, workflowFile: found.path }
  }
  throw new Error('必须提供 script、name 或 scriptPath 之一')
}

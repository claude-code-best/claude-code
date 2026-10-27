import { Ajv, type ErrorObject } from 'ajv'
import { z } from 'zod/v4'
import {
  buildTool,
  findToolByName,
  type Tool,
  type ToolDef,
  type ToolUseContext,
  type ToolResult,
  type Tools,
} from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { logForDebugging } from 'src/utils/debug.js'
import { createUserMessage } from 'src/utils/messages.js'
import { formatZodValidationError } from 'src/utils/toolErrors.js'
import { findUndeclaredKeys } from 'src/utils/toolSchemaRender.js'
import {
  extractDiscoveredToolNames,
  isSearchExtraToolsEnabledOptimistic,
  isSearchExtraToolsToolAvailable,
} from 'src/utils/searchExtraTools.js'
import { DESCRIPTION, getPrompt } from './prompt.js'
import { EXECUTE_TOOL_NAME } from './constants.js'
import { isDeferredTool } from '../SearchExtraToolsTool/prompt.js'

export const inputSchema = lazySchema(() =>
  z.object({
    tool_name: z
      .string()
      .describe(
        'The exact name of the target tool to execute (e.g., "CronCreate", "mcp__server__action")',
      ),
    params: z
      .record(z.string(), z.unknown())
      .describe('The parameters to pass to the target tool'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export const outputSchema = lazySchema(() =>
  z.object({
    result: z.unknown(),
    tool_name: z.string(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

type JsonSchemaObject = Record<string, unknown>
type JsonValidator = ((data: unknown) => boolean) & {
  errors?: ErrorObject[] | null
}

// MCP tool schemas are stable for the lifetime of a session, so compile each
// one once and reuse it. Keyed by schema identity so the Ajv JIT codegen runs
// at most once per tool rather than on every ExecuteExtraTool call.
const jsonValidatorCache = new WeakMap<object, JsonValidator | null>()

function compileJsonSchemaValidator(schema: object): JsonValidator | null {
  const candidates: object[] = [schema]
  if ('$schema' in schema) {
    // Ajv 8 bundles draft-07 only; an explicit 2019-09/2020-12 $schema would
    // throw "no schema with key or ref". Strip it and fall back to draft-07
    // semantics, which cover the constructs MCP tool schemas actually use.
    const clone = { ...(schema as JsonSchemaObject) }
    delete clone.$schema
    candidates.push(clone)
  }
  let lastError: unknown
  for (const candidate of candidates) {
    try {
      const ajv = new Ajv({ allErrors: true, strict: false })
      return ajv.compile(candidate as never) as JsonValidator
    } catch (err) {
      // Try the next candidate; on exhaustion fall through to null (skip
      // validation rather than blocking execution on an unusable schema).
      lastError = err
    }
  }
  // Log rather than swallow: a schema we cannot compile means this tool skips
  // client-side validation entirely and the original bug silently returns.
  logForDebugging(
    `ExecuteExtraTool: could not compile JSON Schema validator (validation skipped): ${String(lastError)}`,
  )
  return null
}

function getJsonSchemaValidator(schema: object): JsonValidator | null {
  const cached = jsonValidatorCache.get(schema)
  if (cached !== undefined) return cached
  const validator = compileJsonSchemaValidator(schema)
  jsonValidatorCache.set(schema, validator)
  return validator
}

/**
 * Build a model-readable error that names the offending fields AND the
 * expected property names, so the model can correct the call instead of
 * blindly retrying. MCP schemas rarely set additionalProperties:false, so a
 * renamed key surfaces as a missing required property rather than as an
 * unknown key — spelling out both the expected names AND the keys the model
 * actually sent is what lets it see the rename instead of guessing again.
 *
 * `undeclaredKeys` is passed in rather than recomputed because the caller
 * needs it to decide whether to reject at all: a schema whose properties are
 * all optional accepts a renamed key without emitting any JSON Schema error.
 */
function formatJsonSchemaMismatchError(
  toolName: string,
  schema: JsonSchemaObject,
  params: Record<string, unknown>,
  errors: readonly ErrorObject[],
  undeclaredKeys: readonly string[],
): string {
  const problems =
    errors
      .map(e => `${e.instancePath || '(params)'} ${e.message ?? 'is invalid'}`)
      .join('; ') || 'the parameter names do not match the tool schema'

  const properties = schema.properties as JsonSchemaObject | undefined
  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  )
  let expected = ''
  if (properties) {
    expected =
      ' Expected parameters: ' +
      Object.entries(properties)
        .map(([key, def]) => {
          const type =
            def && typeof def === 'object' && 'type' in def
              ? String((def as { type?: unknown }).type)
              : 'any'
          return `${key} (${type}${required.has(key) ? ', required' : ''})`
        })
        .join(', ') +
      '.'
  }

  // Name the keys the model actually sent that the schema does not declare.
  // This is the direct signal for a renamed-parameter bug: the
  // required-property error alone never mentions the stray key, and when the
  // schema declares no required property there is no error to begin with.
  const unexpected =
    undeclaredKeys.length > 0
      ? ` You sent undeclared key(s): ${undeclaredKeys.join(', ')}.`
      : ''

  return (
    `Invalid parameters for tool "${toolName}": ${problems}.${expected}${unexpected}` +
    ` The keys in "params" must exactly match these property names.` +
    ` Call SearchExtraTools({"query": "select:${toolName}"}) to see the full schema, then retry.`
  )
}

export const ExecuteTool = buildTool({
  name: EXECUTE_TOOL_NAME,
  searchHint: 'execute run invoke call a deferred tool by name with parameters',
  maxResultSizeChars: 100_000,
  isConcurrencySafe() {
    return false
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return getPrompt()
  },
  async call(input, context, canUseTool, parentMessage, onProgress) {
    const tools: Tools = context.options.tools ?? []

    const targetTool = findToolByName(tools, input.tool_name)
    if (!targetTool) {
      return {
        data: {
          result: null,
          tool_name: input.tool_name,
        },
        newMessages: [
          createUserMessage({
            content: `Tool "${input.tool_name}" not found. Use SearchExtraTools to discover available tools.`,
          }),
        ],
      }
    }

    // Guard: block execution of undiscovered deferred tools.
    // When tool search is active, deferred tools must be discovered via
    // SearchExtraTools first so the model has seen their schemas and knows
    // the correct parameters.  Executing an undiscovered tool almost always
    // fails with parameter validation errors.
    if (
      isSearchExtraToolsEnabledOptimistic() &&
      isSearchExtraToolsToolAvailable(tools) &&
      isDeferredTool(targetTool)
    ) {
      const discovered = extractDiscoveredToolNames(context.messages)
      if (!discovered.has(input.tool_name)) {
        return {
          data: {
            result: null,
            tool_name: input.tool_name,
          },
          newMessages: [
            createUserMessage({
              content: `Tool "${input.tool_name}" has not been discovered yet. You must first use SearchExtraTools to discover this tool before executing it.\n\nUsage: SearchExtraTools("select:${input.tool_name}")`,
            }),
          ],
        }
      }
    }

    // Check if the target tool is currently enabled
    if (!targetTool.isEnabled()) {
      return {
        data: {
          result: null,
          tool_name: input.tool_name,
        },
        newMessages: [
          createUserMessage({
            content: `工具 "${input.tool_name}" 当前不可用：Remote Control 未连接。`,
          }),
        ],
      }
    }

    // Schema-validate params against the target tool BEFORE delegating.
    // ExecuteExtraTool passes raw params straight from the model to
    // validateInput/call without re-running the target's zod schema, so a
    // wrong field name (e.g. 'schedule' instead of 'cron') or a missing
    // required field reaches the tool as undefined and the first
    // .trim()/.length/.split() crashes with "undefined is not an object".
    // CronCreateTool's .trim() crash was the reported symptom; centralizing
    // the check here covers every deferred tool without relying on each one
    // to defensively guard its own validateInput. Tools whose schema is zod
    // are handled here; tools exposing a raw JSON Schema (MCP tools,
    // StructuredOutput) are handled by the inputJSONSchema branch below.
    //
    // Ordering matters: MCP tools expose a passthrough zod schema, so this
    // branch succeeds and copies params through verbatim. It must NOT start
    // stripping unknown keys — the JSON Schema branch below needs the keys the
    // model actually sent in order to name the rename in its error.
    const targetSchema = targetTool.inputSchema as
      | { safeParse?: (data: unknown) => unknown }
      | undefined
    if (targetSchema?.safeParse) {
      const parsed = targetSchema.safeParse(input.params) as
        | { success: true; data: Record<string, unknown> }
        | { success: false; error: z.ZodError }
      if (!parsed.success) {
        return {
          data: {
            result: null,
            tool_name: input.tool_name,
          },
          newMessages: [
            createUserMessage({
              content: formatZodValidationError(input.tool_name, parsed.error),
            }),
          ],
        }
      }
      // Use parsed params going forward — picks up .default() values and
      // strips unknown keys for strictObject schemas so validateInput/call
      // never see fields they don't expect.
      input.params = parsed.data
    }

    // MCP tools (and any tool declaring a raw JSON Schema) carry their real
    // schema in inputJSONSchema, not zod. Validate params against it so a
    // renamed or invented field is rejected here with a precise error instead
    // of being forwarded to the MCP server, which would fail opaquely or
    // silently return empty results.
    const inputJSONSchema = (targetTool as { inputJSONSchema?: object })
      .inputJSONSchema
    if (inputJSONSchema && typeof inputJSONSchema === 'object') {
      const validate = getJsonSchemaValidator(inputJSONSchema)
      const errors =
        validate && !validate(input.params) ? (validate.errors ?? []) : []
      // JSON Schema permits undeclared properties by default, so a schema that
      // declares no `required` (or only optional ones) accepts a renamed key
      // without emitting any error — the wrong name would then be forwarded
      // and the original bug would come back silently. Reject undeclared keys
      // whenever the schema declares properties and does not explicitly allow
      // extras; findUndeclaredKeys owns that decision.
      const undeclaredKeys = findUndeclaredKeys(inputJSONSchema, input.params)
      if (errors.length > 0 || undeclaredKeys.length > 0) {
        return {
          data: {
            result: null,
            tool_name: input.tool_name,
          },
          newMessages: [
            createUserMessage({
              content: formatJsonSchemaMismatchError(
                input.tool_name,
                inputJSONSchema as JsonSchemaObject,
                input.params,
                errors,
                undeclaredKeys,
              ),
            }),
          ],
        }
      }
    }

    // Validate input before delegating — prevents crashes when the model
    // omits required params (e.g. TeamCreate without team_name →
    // sanitizeName(undefined).replace() TypeError).
    if (targetTool.validateInput) {
      const validation = await targetTool.validateInput(
        input.params as Record<string, unknown>,
        context,
      )
      if (!validation.result) {
        return {
          data: {
            result: null,
            tool_name: input.tool_name,
          },
          newMessages: [
            createUserMessage({
              content: `Invalid parameters for tool "${input.tool_name}": ${validation.message}`,
            }),
          ],
        }
      }
    }

    // Check permissions on the target tool
    const permResult = await targetTool.checkPermissions?.(
      input.params as Record<string, unknown>,
      context,
    )
    if (permResult && permResult.behavior === 'deny') {
      return {
        data: {
          result: null,
          tool_name: input.tool_name,
        },
        newMessages: [
          createUserMessage({
            content: `Permission denied for tool "${input.tool_name}": ${permResult.message ?? 'Permission denied'}`,
          }),
        ],
      }
    }

    // Delegate execution to the target tool
    const targetResult: ToolResult<unknown> = await targetTool.call(
      input.params as Record<string, unknown>,
      context,
      canUseTool,
      parentMessage,
      onProgress,
    )

    return {
      ...targetResult,
      data: {
        result: targetResult.data,
        tool_name: input.tool_name,
      },
    }
  },
  async checkPermissions() {
    return {
      behavior: 'passthrough',
      message: 'ExecuteExtraTool delegates permission to the target tool.',
    }
  },
  renderToolUseMessage(input) {
    return `${input.tool_name}`
  },
  userFacingName() {
    return 'ExecuteExtraTool'
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: JSON.stringify(content),
    }
  },
  // Output shape: { result: <inner tool output>, tool_name: string }.
  // Delegate rendering to the inner tool when it defines its own
  // renderToolResultMessage so deferred tools can show their own UI
  // (e.g. ArtifactTool displays its uploaded URL). Without this, the
  // ExecuteExtraTool tool_result row renders nothing below the tool_use
  // line. The inner tool expects its own input shape, so unwrap params.
  //
  // Inline the lookup rather than calling findToolByName — deferred tools
  // are matched by exact name (no aliases needed), and avoiding the
  // shared helper keeps this method resilient to src/Tool.js mocks in
  // co-located test files (process-global mock.module pollution).
  renderToolResultMessage(content, progressMessages, options) {
    const innerTool = options.tools.find(t => t.name === content.tool_name)
    if (!innerTool?.renderToolResultMessage) return null
    // Guard against null/undefined result — several error branches in this
    // tool (tool-not-found, validation-failed, permission-denied, etc.) set
    // result: null, and delegating null to the inner tool's UI would crash
    // on any property access (e.g. output.worktreeBranch).
    if (content.result == null || typeof content.result !== 'object')
      return null
    const innerInput = (options.input as { params?: unknown } | undefined)
      ?.params
    return innerTool.renderToolResultMessage(
      content.result as never,
      progressMessages,
      {
        ...options,
        input: innerInput,
      },
    )
  },
} satisfies ToolDef<InputSchema, Output>)

/**
 * OpenAI 适配器：将 OpenAI Chat Completions API 包装为 Anthropic SDK 兼容接口。
 *
 * 核心思路：
 *   claude.ts 所有调用都通过 anthropic.beta.messages.create()，
 *   此适配器实现相同接口，内部转发到 OpenAI SDK，无需修改 claude.ts。
 *
 * 环境变量：
 *   CLAUDE_CODE_USE_OPENAI=1   启用 OpenAI 提供商
 *   OPENAI_API_KEY             OpenAI API 密钥（必填）
 *   OPENAI_BASE_URL            自定义 base URL（可选，兼容第三方 OpenAI 代理）
 *   OPENAI_DEFAULT_MODEL       默认模型（可选，如 gpt-4o）
 */

import { logForDebugging } from '../../utils/debug.js'
import { getMaxOutputTokensForModel } from './claude.js';

// ---------- 类型别名（避免直接引用 SDK 的深层类型） ----------

type AnyRecord = Record<string, unknown>
type ContentBlock = AnyRecord
type MessageParam = { role: string; content: string | ContentBlock[] }

// ---------- System Prompt 转换 ----------

function convertSystem(system: unknown): Array<{ role: 'system'; content: string }> {
  if (!system) return []
  if (typeof system === 'string') return [{ role: 'system', content: system }]
  if (Array.isArray(system)) {
    const text = (system as Array<{ type: string; text: string }>)
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
    return text ? [{ role: 'system', content: text }] : []
  }
  return []
}

// ---------- 消息转换：Anthropic -> OpenAI ----------

function contentBlockToOpenAI(block: AnyRecord): AnyRecord | null {
  const type = block.type as string
  if (type === 'text') {
    return { type: 'text', text: block.text }
  }
  if (type === 'image') {
    const src = block.source as AnyRecord
    if (src.type === 'base64') {
      return {
        type: 'image_url',
        image_url: { url: `data:${src.media_type};base64,${src.data}` },
      }
    }
    if (src.type === 'url') {
      return { type: 'image_url', image_url: { url: src.url } }
    }
  }
  // 其他类型转为文本占位（document 等）
  return { type: 'text', text: JSON.stringify(block) }
}

function convertMessages(messages: MessageParam[]): AnyRecord[] {
  const result: AnyRecord[] = []

  for (const msg of messages) {
    // 纯字符串内容
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content })
      continue
    }

    const content = msg.content as AnyRecord[]

    if (msg.role === 'assistant') {
      // 分离 text 块和 tool_use 块
      const textParts = content
        .filter(b => b.type === 'text')
        .map(b => b.text as string)
        .join('')
      const toolUses = content.filter(b => b.type === 'tool_use')

      const assistantMsg: AnyRecord = {
        role: 'assistant',
        content: textParts || null,
      }
      if (toolUses.length > 0) {
        assistantMsg.tool_calls = toolUses.map(tu => ({
          id: tu.id,
          type: 'function',
          function: {
            name: tu.name,
            arguments:
              typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input),
          },
        }))
        // OpenAI 规范：有 tool_calls 时 content 如果为空则必须是 null，不能是 ''
        if (!textParts) assistantMsg.content = null
      }
      result.push(assistantMsg)
    } else {
      // user 角色：分离普通内容和 tool_result
      const nonToolResults = content.filter(b => b.type !== 'tool_result')
      const toolResults = content.filter(b => b.type === 'tool_result')

      if (nonToolResults.length > 0) {
        const parts = nonToolResults
          .map(b => contentBlockToOpenAI(b))
          .filter(Boolean) as AnyRecord[]
        const simplified =
          parts.length === 1 && parts[0].type === 'text' ? (parts[0].text as string) : parts
        result.push({ role: 'user', content: simplified })
      }

      // 每个 tool_result 转换为独立的 tool 消息
      for (const tr of toolResults) {
        let toolContent = ''
        const trContent = tr.content
        if (typeof trContent === 'string') {
          toolContent = trContent
        } else if (Array.isArray(trContent)) {
          toolContent = (trContent as Array<{ type: string; text: string }>)
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n')
        }
        result.push({ role: 'tool', content: toolContent, tool_call_id: tr.tool_use_id })
      }
    }
  }

  return result
}

// ---------- 工具定义转换 ----------

function convertTools(tools: AnyRecord[]): AnyRecord[] {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))
}

// ---------- Stop reason 映射 ----------

function convertStopReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'tool_calls':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    case 'content_filter':
      return 'stop_sequence'
    default:
      return 'end_turn'
  }
}

// ---------- 非流式响应转换 ----------

function convertCompletionToMessage(completion: AnyRecord): AnyRecord {
  const choices = completion.choices as AnyRecord[]
  const choice = choices[0]
  const message = choice.message as AnyRecord
  const content: AnyRecord[] = []

  if (message.content) {
    content.push({ type: 'text', text: message.content })
  }

  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls as AnyRecord[]) {
      const fn = tc.function as AnyRecord
      let input: AnyRecord = {}
      try {
        input = JSON.parse(fn.arguments as string)
      } catch {
        // arguments 不是合法 JSON 时保留原字符串
        input = { _raw: fn.arguments }
      }
      content.push({ type: 'tool_use', id: tc.id, name: fn.name, input })
    }
  }

  const usage = completion.usage as AnyRecord | undefined
  return {
    id: completion.id,
    type: 'message',
    role: 'assistant',
    content,
    model: completion.model,
    stop_reason: convertStopReason((choice.finish_reason as string) ?? null),
    stop_sequence: null,
    usage: {
      input_tokens: (usage?.prompt_tokens as number) || 0,
      output_tokens: (usage?.completion_tokens as number) || 0,
    },
  }
}

// ---------- 流式事件转换 ----------

async function* toAnthropicStream(
  openaiStream: AsyncIterable<AnyRecord>,
  modelId: string,
): AsyncGenerator<AnyRecord> {
  let messageStarted = false
  let textBlockIndex = -1
  let nextContentIndex = 0
  // openai tool_call.index -> { anthropicIdx, id }
  const toolCallMap = new Map<number, { anthropicIdx: number; id: string }>()

  for await (const chunk of openaiStream) {
    const choices = (chunk.choices as AnyRecord[] | undefined) ?? []
    const choice = choices[0] as AnyRecord | undefined
    if (!choice) continue

    const delta = (choice.delta as AnyRecord | undefined) ?? {}

    // ---- message_start（只发一次）----
    if (!messageStarted) {
      messageStarted = true
      yield {
        type: 'message_start',
        message: {
          id: chunk.id ?? 'msg_openai',
          type: 'message',
          role: 'assistant',
          content: [],
          model: (chunk.model as string) || modelId,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      }
    }

    // ---- 文本内容 ----
    const textDelta = delta.content as string | null | undefined
    if (textDelta != null && textDelta !== '') {
      if (textBlockIndex === -1) {
        textBlockIndex = nextContentIndex++
        yield {
          type: 'content_block_start',
          index: textBlockIndex,
          content_block: { type: 'text', text: '' },
        }
      }
      yield {
        type: 'content_block_delta',
        index: textBlockIndex,
        delta: { type: 'text_delta', text: textDelta },
      }
    }

    // ---- 工具调用 ----
    const toolCallDeltas = delta.tool_calls as AnyRecord[] | null | undefined
    if (toolCallDeltas) {
      for (const tc of toolCallDeltas) {
        const tcIndex = tc.index as number
        if (!toolCallMap.has(tcIndex)) {
          const anthropicIdx = nextContentIndex++
          const id = (tc.id as string) || `call_${anthropicIdx}`
          toolCallMap.set(tcIndex, { anthropicIdx, id })
          const fn = (tc.function as AnyRecord) ?? {}
          yield {
            type: 'content_block_start',
            index: anthropicIdx,
            content_block: {
              type: 'tool_use',
              id,
              name: (fn.name as string) || '',
              input: '',
            },
          }
        }
        const entry = toolCallMap.get(tcIndex)!
        const fn = (tc.function as AnyRecord) ?? {}
        const args = fn.arguments as string | undefined
        if (args) {
          yield {
            type: 'content_block_delta',
            index: entry.anthropicIdx,
            delta: { type: 'input_json_delta', partial_json: args },
          }
        }
      }
    }

    // ---- 结束 ----
    const finishReason = choice.finish_reason as string | null | undefined
    if (finishReason) {
      if (textBlockIndex !== -1) {
        yield { type: 'content_block_stop', index: textBlockIndex }
      }
      for (const { anthropicIdx } of toolCallMap.values()) {
        yield { type: 'content_block_stop', index: anthropicIdx }
      }

      const usageChunk = chunk.usage as AnyRecord | undefined
      yield {
        type: 'message_delta',
        delta: { stop_reason: convertStopReason(finishReason), stop_sequence: null },
        usage: { output_tokens: (usageChunk?.completion_tokens as number) || 0 },
      }
      yield { type: 'message_stop' }
    }
  }
}

// ---------- 参数构建 ----------

function buildOpenAIParams(params: AnyRecord): AnyRecord {
  const messages: AnyRecord[] = [
    ...convertSystem(params.system),
    ...convertMessages((params.messages as MessageParam[]) || []),
  ]
  const model: string = process.env.OPENAI_DEFAULT_MODEL || params.model as string
  const openaiParams: AnyRecord = {
    // OPENAI_DEFAULT_MODEL 可覆盖 configs.ts 中的默认映射（例如 gpt-4o）
    model: model,
    messages,
    // max_tokens: OPENAI_MAX_TOKENS 已在 getMaxOutputTokensForModel 中处理，
    // params.max_tokens 已是正确值；这里保留 env var 检查作为兜底，
    // 并对未设置时做 16384 安全上限（兼容 gpt-4o 系列上限）
    max_tokens: getMaxOutputTokensForModel(model),
  }

  if (params.temperature !== undefined) openaiParams.temperature = params.temperature
  if (params.top_p !== undefined) openaiParams.top_p = params.top_p

  const tools = params.tools as AnyRecord[] | undefined
  if (tools?.length) {
    openaiParams.tools = convertTools(tools)
    openaiParams.tool_choice = 'auto'
  }

  // outputFormat（Anthropic json_schema）→ OpenAI response_format
  // 用于 generateSessionTitle 等需要结构化输出的场景
  const outputFormat = params.outputFormat as AnyRecord | undefined
  if (outputFormat?.type === 'json_schema' && outputFormat.schema) {
    openaiParams.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'output',
        strict: true,
        schema: outputFormat.schema,
      },
    }
  }

  // thinking / extended-thinking：OpenAI 没有直接对应，忽略
  return openaiParams
}

// ---------- 适配器工厂 ----------

export function createOpenAIAdapter(config: {
  apiKey: string
  baseURL?: string
  defaultModel?: string
}): unknown {
  // 懒加载 OpenAI SDK（与 Bedrock/Vertex 保持一致的动态 import 模式）
  let cachedClient: unknown = null

  async function getClient(): Promise<AnyRecord> {
    if (!cachedClient) {
      const { default: OpenAI } = await import('openai')
      // 调试代理：设置 OPENAI_DEBUG_PROXY 可将流量转发到抓包工具
      // 例如：OPENAI_DEBUG_PROXY=http://127.0.0.1:9005
      const debugProxy = process.env.OPENAI_DEBUG_PROXY
      let httpAgent: unknown = undefined
      if (debugProxy) {
        const { HttpsProxyAgent } = await import('https-proxy-agent')
        httpAgent = new HttpsProxyAgent(debugProxy)
        logForDebugging(`[OpenAI] 使用调试代理: ${debugProxy}`)
      }
      cachedClient = new (OpenAI as unknown as new (opts: AnyRecord) => AnyRecord)({
        apiKey: config.apiKey,
        ...(config.baseURL ? { baseURL: config.baseURL } : {}),
        dangerouslyAllowBrowser: true,
        ...(httpAgent ? { httpAgent } : {}),
      })
      logForDebugging(`[OpenAI] 客户端初始化完成 baseURL=${config.baseURL ?? '默认'}`)
    }
    return cachedClient as AnyRecord
  }

  return {
    beta: {
      messages: {
        /**
         * 仿 Anthropic SDK 的 `beta.messages.create()` 接口：
         *   - stream: false → 返回 Promise<BetaMessage>
         *   - stream: true  → 返回带 withResponse() 方法的对象
         */
        create(params: AnyRecord, options?: AnyRecord) {
          if (params.stream) {
            // --- 流式调用 ---
            const openaiStreamPromise = (async () => {
              const client = await getClient()
              const completions = (client.chat as AnyRecord).completions as AnyRecord
              const openaiParams = { ...buildOpenAIParams(params), stream: true } as AnyRecord
              logForDebugging(
                `[OpenAI] 流式请求 model=${openaiParams.model} max_tokens=${openaiParams.max_tokens} ` +
                `messages=${(openaiParams.messages as AnyRecord[]).length} tools=${(openaiParams.tools as AnyRecord[] | undefined)?.length ?? 0}`,
              )
              // 使用 OpenAI SDK 的 withResponse() 获取原始 Response 对象
              const { data: rawStream, response } = await (
                (completions.create as Function)(openaiParams, {
                  signal: options?.signal,
                }) as { withResponse(): Promise<{ data: AsyncIterable<AnyRecord>; response: Response }> }
              ).withResponse()
              logForDebugging(
                `[OpenAI] 流式响应头收到 status=${response.status} ` +
                `request-id=${response.headers?.get('x-request-id') ?? '-'}`,
              )
              return { rawStream, response }
            })()

            return {
              withResponse: async () => {
                const { rawStream, response } = await openaiStreamPromise
                const anthropicStream = toAnthropicStream(rawStream, params.model as string)
                return {
                  data: anthropicStream,
                  response,
                  request_id:
                    (response as Response).headers?.get('x-request-id') ?? undefined,
                }
              },
            }
          }

          // --- 非流式调用 ---
          return (async () => {
            const client = await getClient()
            const completions = (client.chat as AnyRecord).completions as AnyRecord
            const openaiParams = buildOpenAIParams(params)
            logForDebugging(
              `[OpenAI] 非流式请求 model=${openaiParams.model} max_tokens=${openaiParams.max_tokens} ` +
              `messages=${(openaiParams.messages as AnyRecord[]).length}`,
            )
            try {
              const completion = await (completions.create as Function)(openaiParams, {
                signal: options?.signal,
                timeout: options?.timeout,
              })
              logForDebugging(
                `[OpenAI] 非流式响应 id=${completion.id} finish=${completion.choices?.[0]?.finish_reason} ` +
                `usage=${JSON.stringify(completion.usage ?? {})}`,
              )
              return convertCompletionToMessage(completion)
            } catch (err) {
              logForDebugging(
                `[OpenAI] 请求失败 ${err instanceof Error ? err.message : String(err)}`,
                { level: 'error' },
              )
              throw err
            }
          })()
        },
      },
    },
  }
}

import type {
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseInputItem,
  Tool,
} from 'openai/resources/responses/responses.mjs'
import { normalizeCodexCallId } from './callIds.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Codex preflight: ${label} must be a string.`)
  }

  return value
}

function sanitizeMessageItem(item: Record<string, unknown>): ResponseInputItem {
  const role = assertString(item.role, 'message.role')
  const content = item.content

  if ((role !== 'user' && role !== 'assistant') || !Array.isArray(content)) {
    throw new Error('Codex preflight: message items require role and content array.')
  }

  return item as unknown as ResponseInputItem
}

function sanitizeFunctionCallItem(item: Record<string, unknown>): ResponseInputItem {
  const callId = normalizeCodexCallId(item.call_id)
  const name = assertString(item.name, 'function_call.name').trim()
  const argumentsValue = item.arguments

  if (!callId) {
    throw new Error('Codex preflight: function_call.call_id is required.')
  }
  if (name.length === 0) {
    throw new Error('Codex preflight: function_call.name is required.')
  }
  if (typeof argumentsValue !== 'string') {
    throw new Error('Codex preflight: function_call.arguments must be a string.')
  }

  return {
    ...item,
    call_id: callId,
    name,
    arguments: argumentsValue,
  } as ResponseInputItem
}

function sanitizeFunctionCallOutputItem(
  item: Record<string, unknown>,
): ResponseInputItem {
  const callId = normalizeCodexCallId(item.call_id)
  const output = item.output

  if (!callId) {
    throw new Error('Codex preflight: function_call_output.call_id is required.')
  }
  if (
    typeof output !== 'string' &&
    !(Array.isArray(output) && output.every(part => isRecord(part)))
  ) {
    throw new Error(
      'Codex preflight: function_call_output.output must be a string or content array.',
    )
  }

  return {
    ...item,
    call_id: callId,
  } as ResponseInputItem
}

function sanitizeInputItem(item: unknown): ResponseInputItem {
  if (!isRecord(item) || typeof item.type !== 'string') {
    throw new Error('Codex preflight: each input item requires a type.')
  }

  switch (item.type) {
    case 'message':
      return sanitizeMessageItem(item)
    case 'function_call':
      return sanitizeFunctionCallItem(item)
    case 'function_call_output':
      return sanitizeFunctionCallOutputItem(item)
    default:
      throw new Error(`Codex preflight: unsupported input item type "${item.type}".`)
  }
}

function sanitizeTool(tool: unknown): Tool {
  if (!isRecord(tool) || tool.type !== 'function') {
    throw new Error('Codex preflight: only function tools are supported.')
  }

  const name = assertString(tool.name, 'tool.name').trim()
  const parameters = isRecord(tool.parameters) ? tool.parameters : {}

  if (name.length === 0) {
    throw new Error('Codex preflight: tool.name is required.')
  }

  return {
    ...tool,
    type: 'function',
    name,
    parameters,
  } as Tool
}

export function sanitizeCodexRequest(
  request: ResponseCreateParamsNonStreaming,
): ResponseCreateParamsNonStreaming {
  if (typeof request.model !== 'string' || request.model.trim().length === 0) {
    throw new Error('Codex preflight: model is required.')
  }

  if (
    request.instructions !== undefined &&
    request.instructions !== null &&
    typeof request.instructions !== 'string'
  ) {
    throw new Error('Codex preflight: instructions must be a string.')
  }

  if (!Array.isArray(request.input)) {
    throw new Error('Codex preflight: input must be an array.')
  }

  return {
    ...request,
    model: request.model.trim(),
    instructions: request.instructions?.trim() || undefined,
    input: request.input.map(sanitizeInputItem),
    tools: request.tools?.map(sanitizeTool),
  }
}

export function toStreamingCodexRequest(
  request: ResponseCreateParamsNonStreaming,
): ResponseCreateParamsStreaming {
  return {
    ...request,
    stream: true,
  }
}

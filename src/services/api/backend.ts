import type {
  AssistantMessage,
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
} from '../../types/message.js'
import type { Tools } from '../../Tool.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import type { ThinkingConfig } from '../../utils/thinking.js'
import { getMainLoopBackend } from '../../utils/model/providers.js'
import {
  type Options,
  queryModelWithStreaming as queryAnthropicModelWithStreaming,
} from './claude.js'
import { queryCodexWithStreaming } from './codex.js'

export type MainLoopStreamArgs = {
  messages: Message[]
  systemPrompt: SystemPrompt
  thinkingConfig: ThinkingConfig
  tools: Tools
  signal: AbortSignal
  options: Options
}

export type MainLoopBackendName = 'anthropic' | 'codex'

export interface MainLoopBackendTransport {
  readonly name: MainLoopBackendName
  startSession?(args: MainLoopStreamArgs): Promise<void>
  streamTurn(
    args: MainLoopStreamArgs,
  ): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void>
  interruptTurn?(sessionId: string): Promise<void>
}

const anthropicBackend: MainLoopBackendTransport = {
  name: 'anthropic',
  streamTurn: queryAnthropicModelWithStreaming,
}

const codexBackend: MainLoopBackendTransport = {
  name: 'codex',
  streamTurn: queryCodexWithStreaming,
}

export function getMainLoopBackendTransport(): MainLoopBackendTransport {
  return getMainLoopBackend() === 'codex' ? codexBackend : anthropicBackend
}

export async function* queryModelWithStreaming(
  args: MainLoopStreamArgs,
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  yield* getMainLoopBackendTransport().streamTurn(args)
}

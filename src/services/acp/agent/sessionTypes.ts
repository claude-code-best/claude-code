import type {
  ClientCapabilities,
  SessionModeState,
  SessionModelState,
  SessionConfigOption,
} from '@agentclientprotocol/sdk'
import type { QueryEngine } from '../../../QueryEngine.js'
import type { Command } from '../../../types/command.js'
import type { AppState } from '../../../state/AppStateStore.js'
import type { ToolUseCache } from '../bridge.js'

// ── Session state ─────────────────────────────────────────────────

export type AcpSession = {
  queryEngine: QueryEngine
  cancelled: boolean
  cancelGeneration: number
  cwd: string
  sessionFingerprint: string
  modes: SessionModeState
  models: SessionModelState
  configOptions: SessionConfigOption[]
  promptRunning: boolean
  pendingMessages: Map<string, PendingPrompt>
  pendingQueue: string[]
  pendingQueueHead: number
  toolUseCache: ToolUseCache
  clientCapabilities?: ClientCapabilities
  appState: AppState
  commands: Command[]
}

export type PendingPrompt = {
  resolve: (cancelled: boolean) => void
}

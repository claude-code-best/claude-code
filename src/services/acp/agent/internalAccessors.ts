/**
 * Internal accessors for AcpAgent private fields and session-state helpers,
 * shared across the prototype-augmentation modules (createSessionMethod /
 * sessionLifecycle / promptFlow).
 *
 * AcpAgent's `conn` and `clientCapabilities` fields are declared `private`
 * on the shell class. TS-only privacy (no #) means bracket access still
 * works at runtime, but we cast through `unknown` to keep tsc strict happy
 * without widening the public API surface of the class.
 */
import type {
  AgentSideConnection,
  ClientCapabilities,
} from '@agentclientprotocol/sdk'
import type { AcpAgent } from './AcpAgent.js'
import type { AcpSession } from './sessionTypes.js'

type AcpAgentInternals = {
  conn: AgentSideConnection
  clientCapabilities: ClientCapabilities | undefined
}

export function getConnection(agent: AcpAgent): AgentSideConnection {
  return (agent as unknown as AcpAgentInternals).conn
}

export function readClientCapabilities(
  agent: AcpAgent,
): ClientCapabilities | undefined {
  return (agent as unknown as AcpAgentInternals).clientCapabilities
}

/**
 * Update the session's current mode/model id based on the configId.
 *
 * This logic was originally the private `AcpAgent.syncSessionConfigState`
 * method on the shell class. It is called by the prototype-augmented
 * `updateConfigOption` (sessionLifecycle.ts) and `setSessionConfigOption`
 * (promptFlow.ts). Moving it here keeps it next to its only callers and
 * avoids the `noUnusedPrivateClassMembers` false positive that the
 * cast-based access would otherwise trigger on the shell.
 */
export function syncSessionConfigState(
  _agent: AcpAgent,
  session: AcpSession,
  configId: string,
  value: string,
): void {
  if (configId === 'mode') {
    session.modes = { ...session.modes, currentModeId: value }
  } else if (configId === 'model') {
    session.models = { ...session.models, currentModelId: value }
  }
}

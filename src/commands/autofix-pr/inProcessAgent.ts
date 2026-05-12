import { randomUUID } from 'node:crypto'
import { getSessionId } from '../../bootstrap/state.js'
import type { SessionId } from '../../types/ids.js'

export type AutofixTeammate = {
  agentId: string
  agentName: 'autofix-pr'
  teamName: '_autofix'
  color: undefined
  planModeRequired: false
  parentSessionId: SessionId
  abortController: AbortController
  taskId: string
}

export function createAutofixTeammate(
  _initialMessage: string,
  _target: string,
): AutofixTeammate {
  return {
    agentId: randomUUID(),
    agentName: 'autofix-pr',
    teamName: '_autofix',
    color: undefined,
    planModeRequired: false,
    parentSessionId: getSessionId(),
    abortController: new AbortController(),
    taskId: randomUUID(),
  }
}

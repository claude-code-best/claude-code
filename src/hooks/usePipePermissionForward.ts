/**
 * usePipePermissionForward — Forward slave permission requests to master UI.
 *
 * Subscribes to slave pipe messages via subscribePipeEntries, and:
 * 1. permission_request → enqueue into toolUseConfirmQueue for master approval
 * 2. permission_cancel → remove from queue
 * 3. stream/error/done → display as system messages
 */
import { feature } from 'bun:bundle'
import { useEffect } from 'react'
import type { Tool, ToolUseContext } from '../Tool.js'
import type { MessageType } from '../types/message.js'

type Deps = {
  store: { getState: () => any }
  tools: Tool<any, any>[]
  setMessages: (action: React.SetStateAction<MessageType[]>) => void
  setToolUseConfirmQueue: (action: React.SetStateAction<any[]>) => void
  getToolUseContext: (...args: any[]) => ToolUseContext
  mainLoopModel: string
}

export function usePipePermissionForward({
  store,
  tools,
  setMessages,
  setToolUseConfirmQueue,
  getToolUseContext,
  mainLoopModel,
}: Deps): void {
  useEffect(() => {
    if (!feature('UDS_INBOX')) return
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { subscribePipeEntries, getSlaveClient } =
      require('./useMasterMonitor.js') as typeof import('./useMasterMonitor.js')
    const { getPipeIpc } =
      require('../utils/pipeTransport.js') as typeof import('../utils/pipeTransport.js')
    const { createAssistantMessage, createSystemMessage } =
      require('../utils/messages.js') as typeof import('../utils/messages.js')
    /* eslint-enable @typescript-eslint/no-require-imports */

    return subscribePipeEntries(
      (pipeName: string, entry: { type: string; content: string }) => {
        const content = entry.content.trim()
        const pipeIpcState = getPipeIpc(store.getState())
        const peerInfo = (pipeIpcState.discoveredPipes ?? []).find(
          (pipe: { pipeName: string }) => pipe.pipeName === pipeName,
        )
        const isLan = peerInfo?.ip && peerInfo.ip !== pipeIpcState.localIp
        const displayRole = peerInfo
          ? isLan
            ? `${peerInfo.role} ${peerInfo.hostname}/${peerInfo.ip}`
            : peerInfo.role
          : pipeName

        if (entry.type === 'permission_request') {
          try {
            const payload = JSON.parse(content)
            const tool = tools.find(
              candidate => candidate.name === payload.toolName,
            )
            const client = getSlaveClient(pipeName)
            if (!client) return

            if (!tool) {
              client.send({
                type: 'permission_response',
                data: JSON.stringify({
                  requestId: payload.requestId,
                  behavior: 'deny',
                  feedback: `Tool "${payload.toolName}" is not available in main.`,
                }),
              })
              return
            }

            const assistantMessage = createAssistantMessage({ content: '' })
            const toolUseContext = getToolUseContext(
              [],
              [],
              new AbortController(),
              mainLoopModel,
            )
            setToolUseConfirmQueue((queue: any[]) => [
              ...queue,
              {
                assistantMessage,
                tool,
                description: payload.description,
                input: payload.input,
                toolUseContext,
                toolUseID: `pipe:${payload.requestId}`,
                permissionResult: payload.permissionResult,
                permissionPromptStartTimeMs:
                  payload.permissionPromptStartTimeMs,
                workerBadge: {
                  name: `${displayRole} / ${pipeName}`,
                  color: 'cyan',
                },
                onUserInteraction() {},
                onAbort() {
                  client.send({
                    type: 'permission_response',
                    data: JSON.stringify({
                      requestId: payload.requestId,
                      behavior: 'deny',
                      feedback: 'Permission request was aborted in main.',
                    }),
                  })
                },
                onAllow(
                  updatedInput: any,
                  permissionUpdates: any,
                  feedback: any,
                  contentBlocks: any,
                ) {
                  client.send({
                    type: 'permission_response',
                    data: JSON.stringify({
                      requestId: payload.requestId,
                      behavior: 'allow',
                      updatedInput,
                      permissionUpdates,
                      feedback,
                      contentBlocks,
                    }),
                  })
                },
                onReject(feedback: any, contentBlocks: any) {
                  client.send({
                    type: 'permission_response',
                    data: JSON.stringify({
                      requestId: payload.requestId,
                      behavior: 'deny',
                      feedback,
                      contentBlocks,
                    }),
                  })
                },
                async recheckPermission() {},
              },
            ])
          } catch {
            // Malformed permission request — ignore
          }
          return
        }

        if (entry.type === 'permission_cancel') {
          try {
            const payload = JSON.parse(content)
            setToolUseConfirmQueue((queue: any[]) =>
              queue.filter(
                (item: any) => item.toolUseID !== `pipe:${payload.requestId}`,
              ),
            )
          } catch {
            // Malformed — ignore
          }
          return
        }

        let message: any = null

        if (entry.type === 'stream' && content) {
          message = createSystemMessage(
            `[${displayRole} / ${pipeName}] ${content}`,
            'warning',
          )
        } else if (entry.type === 'error') {
          message = createSystemMessage(
            `[${displayRole} / ${pipeName}] Error: ${content || 'no output'}`,
            'error',
          )
        } else if (entry.type === 'done') {
          message = createSystemMessage(
            `[${displayRole} / ${pipeName}] Completed`,
            'warning',
          )
        }

        if (message) {
          setMessages((prev: MessageType[]) => [...prev, message])
        }
      },
    )
  }, [
    getToolUseContext,
    mainLoopModel,
    setMessages,
    setToolUseConfirmQueue,
    store,
    tools,
  ])
}

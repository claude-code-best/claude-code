import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { describe, expect, test } from 'bun:test'
import { z } from 'zod/v4'
import { createLinkedTransportPair } from '../../../src/services/mcp/InProcessTransport.js'
import {
  createIdeBridgeServer,
  type DiffController,
} from '../src/server/bridgeServer.js'

const SelectionChangedSchema = z.object({
  method: z.literal('selection_changed'),
  params: z.object({
    selection: z
      .object({
        start: z.object({ line: z.number(), character: z.number() }),
        end: z.object({ line: z.number(), character: z.number() }),
      })
      .nullable(),
    text: z.string().optional(),
    filePath: z.string().optional(),
  }),
})

function createTestClient() {
  return new Client({
    name: 'vscode-ide-bridge-test-client',
    version: '0.0.1',
  })
}

describe('ide bridge MCP server', () => {
  test('lists the bridge tools and delegates openDiff calls', async () => {
    const openDiffCalls: Array<Record<string, unknown>> = []
    const diffController: DiffController = {
      async openDiff(args) {
        openDiffCalls.push(args)
        return {
          content: [{ type: 'text', text: 'TAB_CLOSED' }],
        }
      },
      async closeTab() {
        return {
          content: [{ type: 'text', text: 'TAB_CLOSED' }],
        }
      },
      async closeAllDiffTabs() {
        return {
          content: [{ type: 'text', text: 'OK' }],
        }
      },
    }

    const bridge = createIdeBridgeServer({ diffController })
    const client = createTestClient()
    const [clientTransport, serverTransport] = createLinkedTransportPair()

    await bridge.server.connect(serverTransport)
    await client.connect(clientTransport)

    const toolResult = await client.listTools()
    expect(toolResult.tools.map(tool => tool.name)).toEqual([
      'openDiff',
      'close_tab',
      'closeAllDiffTabs',
    ])

    const openDiffResult = await client.callTool({
      name: 'openDiff',
      arguments: {
        old_file_path: 'D:/vibe/claude-code/src/cli/print.ts',
        new_file_path: 'D:/vibe/claude-code/src/cli/print.ts',
        new_file_contents: 'new content',
        tab_name: 'tab-1',
      },
    })

    expect(openDiffResult.content[0]).toEqual({
      type: 'text',
      text: 'TAB_CLOSED',
    })
    expect(openDiffCalls).toHaveLength(1)
    expect(openDiffCalls[0]?.tab_name).toBe('tab-1')
  })

  test('forwards selection_changed notifications to the connected client', async () => {
    const diffController: DiffController = {
      async openDiff() {
        return {
          content: [{ type: 'text', text: 'TAB_CLOSED' }],
        }
      },
      async closeTab() {
        return {
          content: [{ type: 'text', text: 'TAB_CLOSED' }],
        }
      },
      async closeAllDiffTabs() {
        return {
          content: [{ type: 'text', text: 'OK' }],
        }
      },
    }

    const bridge = createIdeBridgeServer({ diffController })
    const client = createTestClient()
    const [clientTransport, serverTransport] = createLinkedTransportPair()

    await bridge.server.connect(serverTransport)
    await client.connect(clientTransport)

    const notificationPromise = new Promise<z.infer<typeof SelectionChangedSchema>>(
      resolve => {
        client.setNotificationHandler(SelectionChangedSchema, notification => {
          resolve(notification)
        })
      },
    )

    await bridge.notifySelectionChanged({
      selection: {
        start: { line: 4, character: 2 },
        end: { line: 6, character: 0 },
      },
      text: 'selected text',
      filePath: 'D:/vibe/claude-code/src/cli/print.ts',
    })

    const notification = await notificationPromise
    expect(notification.params.filePath).toBe(
      'D:/vibe/claude-code/src/cli/print.ts',
    )
    expect(notification.params.text).toBe('selected text')
    expect(notification.params.selection?.start.line).toBe(4)
  })
})

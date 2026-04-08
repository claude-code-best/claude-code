import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import type { SelectionChangedParams } from './selectionPublisher.js'
import {
  CloseAllDiffTabsArgumentsSchema,
  CloseTabArgumentsSchema,
  IdeConnectedNotificationSchema,
  OpenDiffArgumentsSchema,
  type CloseTabArguments,
  type OpenDiffArguments,
} from './protocol.js'

export type DiffController = {
  openDiff(args: OpenDiffArguments): Promise<CallToolResult>
  closeTab(args: CloseTabArguments): Promise<CallToolResult>
  closeAllDiffTabs(): Promise<CallToolResult>
}

type CreateIdeBridgeServerOptions = {
  diffController: DiffController
}

const IDE_BRIDGE_TOOLS: Tool[] = [
  {
    name: 'openDiff',
    description: 'Open a diff view in the IDE and resolve when the user acts.',
    inputSchema: {
      type: 'object',
      properties: {
        old_file_path: { type: 'string' },
        new_file_path: { type: 'string' },
        new_file_contents: { type: 'string' },
        tab_name: { type: 'string' },
      },
      required: [
        'old_file_path',
        'new_file_path',
        'new_file_contents',
        'tab_name',
      ],
      additionalProperties: false,
    },
  },
  {
    name: 'close_tab',
    description: 'Close a previously opened IDE tab by Claude Code tab name.',
    inputSchema: {
      type: 'object',
      properties: {
        tab_name: { type: 'string' },
      },
      required: ['tab_name'],
      additionalProperties: false,
    },
  },
  {
    name: 'closeAllDiffTabs',
    description: 'Close all diff tabs created by the IDE bridge.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
]

export function createIdeBridgeServer(options: CreateIdeBridgeServerOptions): {
  server: Server
  notifySelectionChanged(params: SelectionChangedParams): Promise<void>
  getConnectedCliPid(): number | null
} {
  const server = new Server(
    {
      name: 'claude-code-vscode-ide-bridge',
      version: '0.0.1',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  let connectedCliPid: number | null = null

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: IDE_BRIDGE_TOOLS,
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async request => {
    switch (request.params.name) {
      case 'openDiff':
        return options.diffController.openDiff(
          OpenDiffArgumentsSchema.parse(request.params.arguments ?? {}),
        )
      case 'close_tab':
        return options.diffController.closeTab(
          CloseTabArgumentsSchema.parse(request.params.arguments ?? {}),
        )
      case 'closeAllDiffTabs':
        CloseAllDiffTabsArgumentsSchema.parse(request.params.arguments ?? {})
        return options.diffController.closeAllDiffTabs()
      default:
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Unsupported IDE tool: ${request.params.name}`,
            },
          ],
        }
    }
  })

  server.setNotificationHandler(IdeConnectedNotificationSchema, notification => {
    connectedCliPid = notification.params.pid
  })

  return {
    server,
    async notifySelectionChanged(params) {
      await server.notification({
        method: 'selection_changed',
        params,
      })
    },
    getConnectedCliPid() {
      return connectedCliPid
    },
  }
}

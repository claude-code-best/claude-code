import { WebSocketServer } from 'ws'
import { createIdeBridgeServer } from './bridgeServer.js'
import { createDiffController } from './diffController.js'
import {
  buildLockfilePayload,
  removeLockfile,
  writeLockfile,
} from './lockfile.js'
import { createAuthToken } from './randomToken.js'
import { ServerWebSocketTransport } from './serverWebSocketTransport.js'
import {
  clearClaudeCodeIdePort,
  setClaudeCodeIdePort,
} from './terminalEnvironment.js'
import { getActiveSelectionSnapshot, getWorkspaceFolderPaths } from './workspaceInfo.js'

type BridgeStatus = {
  port: number | null
  lockfilePath: string | null
  hasConnectedClient: boolean
  connectedCliPid: number | null
  workspaceFolders: string[]
  lastSelectionSentAt: string | null
}

type ActiveConnection = {
  socket: any
  bridge: ReturnType<typeof createIdeBridgeServer>
  transport: ServerWebSocketTransport
}

export class LocalIdeBridgeService {
  private readonly diffController
  private readonly ideName = 'VS Code'
  private readonly runningInWindows = process.platform === 'win32'

  private server: any | null = null
  private port: number | null = null
  private lockfilePath: string | null = null
  private authToken = ''
  private activeConnection: ActiveConnection | null = null
  private lastSelectionSentAt: string | null = null
  private disposed = false

  constructor(
    private readonly vscode: any,
    private readonly outputChannel: any,
    private readonly environmentVariableCollection?: {
      replace(name: string, value: string): void
      delete(name: string): void
    },
  ) {
    this.diffController = createDiffController(outputChannel)
  }

  async start(): Promise<void> {
    if (this.server || this.disposed) {
      return
    }

    this.authToken = createAuthToken()
    this.server = await this.createWebSocketServer()
    this.port = this.getServerPort()
    await this.refreshLockfile()

    this.outputChannel.appendLine(
      `[bridge] listening on ws://127.0.0.1:${this.port}`,
    )
  }

  async restart(): Promise<void> {
    await this.stop()
    this.disposed = false
    await this.start()
  }

  async refreshLockfile(): Promise<void> {
    if (!this.port) {
      return
    }

    setClaudeCodeIdePort(this.environmentVariableCollection, this.port)
    await removeLockfile(this.lockfilePath)
    this.lockfilePath = await writeLockfile(
      this.port,
      buildLockfilePayload({
        pid: process.pid,
        ideName: this.ideName,
        workspaceFolders: getWorkspaceFolderPaths(
          this.vscode.workspace.workspaceFolders,
        ),
        authToken: this.authToken,
        runningInWindows: this.runningInWindows,
      }),
    )

    this.outputChannel.appendLine(`[bridge] lockfile -> ${this.lockfilePath}`)
    this.outputChannel.appendLine(
      `[bridge] terminal env CLAUDE_CODE_SSE_PORT=${this.port}`,
    )
  }

  async publishActiveSelection(): Promise<void> {
    if (!this.activeConnection) {
      return
    }

    const snapshot = getActiveSelectionSnapshot(this.vscode.window.activeTextEditor)

    if (!snapshot.selection && !snapshot.filePath) {
      return
    }

    await this.activeConnection.bridge.notifySelectionChanged(snapshot)
    this.lastSelectionSentAt = new Date().toISOString()
  }

  getStatus(): BridgeStatus {
    return {
      port: this.port,
      lockfilePath: this.lockfilePath,
      hasConnectedClient: this.activeConnection !== null,
      connectedCliPid:
        this.activeConnection?.bridge.getConnectedCliPid() ?? null,
      workspaceFolders: getWorkspaceFolderPaths(
        this.vscode.workspace.workspaceFolders,
      ),
      lastSelectionSentAt: this.lastSelectionSentAt,
    }
  }

  async stop(): Promise<void> {
    await this.closeActiveConnection()

    if (this.server) {
      await new Promise<void>(resolve => {
        this.server?.close(() => resolve())
      })
      this.server = null
    }

    await removeLockfile(this.lockfilePath)
    clearClaudeCodeIdePort(this.environmentVariableCollection)
    this.lockfilePath = null
    this.port = null
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }

    this.disposed = true
    await this.stop()
    await this.diffController.dispose()
  }

  private async createWebSocketServer(): Promise<any> {
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
    })

    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve())
      server.once('error', (error: Error) => reject(error))
    })

    server.on('connection', (socket: any, request: any) => {
      const authHeader = request.headers['x-claude-code-ide-authorization']
      if (authHeader !== this.authToken) {
        this.outputChannel.appendLine('[bridge] rejected unauthorized client')
        socket.close(4003, 'unauthorized')
        return
      }

      void this.handleConnection(socket)
    })

    return server
  }

  private getServerPort(): number {
    const address = this.server?.address()
    if (!address || typeof address === 'string') {
      throw new Error('Unable to determine bridge port')
    }
    return address.port
  }

  private async handleConnection(socket: any): Promise<void> {
    await this.closeActiveConnection()

    const bridge = createIdeBridgeServer({
      diffController: this.diffController,
    })
    const transport = new ServerWebSocketTransport(socket)

    socket.on('close', () => {
      if (this.activeConnection?.socket === socket) {
        this.activeConnection = null
      }
    })

    await bridge.server.connect(transport)

    this.activeConnection = {
      socket,
      bridge,
      transport,
    }

    this.outputChannel.appendLine('[bridge] CLI client connected')
    await this.publishActiveSelection().catch(error => {
      this.outputChannel.appendLine(
        `[bridge] failed to publish initial selection: ${(error as Error).message}`,
      )
    })
  }

  private async closeActiveConnection(): Promise<void> {
    if (!this.activeConnection) {
      return
    }

    const connection = this.activeConnection
    this.activeConnection = null

    await connection.transport.close().catch(() => {})
  }
}

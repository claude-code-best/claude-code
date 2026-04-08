import * as vscode from 'vscode'
import { LocalIdeBridgeService } from './server/localIdeBridgeService.js'

let bridgeService: LocalIdeBridgeService | null = null

export async function activate(context: any): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    'Claude Code IDE Bridge',
  )

  bridgeService = new LocalIdeBridgeService(
    vscode,
    outputChannel,
    context.environmentVariableCollection,
  )
  await bridgeService.start()

  context.subscriptions.push(
    outputChannel,
    {
      dispose: () => {
        void bridgeService?.dispose()
      },
    },
    vscode.commands.registerCommand('claudeCodeBridge.restart', async () => {
      await bridgeService?.restart()
      const status = bridgeService?.getStatus()
      vscode.window.showInformationMessage(
        `Claude Code Bridge 已重启${status?.port ? `，端口 ${status.port}` : ''}`,
      )
    }),
    vscode.commands.registerCommand('claudeCodeBridge.showStatus', () => {
      const status = bridgeService?.getStatus()
      outputChannel.show(true)
      outputChannel.appendLine(
        `[status] port=${status?.port ?? 'n/a'} connected=${String(status?.hasConnectedClient ?? false)} cliPid=${status?.connectedCliPid ?? 'n/a'} lockfile=${status?.lockfilePath ?? 'n/a'}`,
      )
      vscode.window.showInformationMessage(
        status?.port
          ? `Claude Code Bridge 正在监听 127.0.0.1:${status.port}`
          : 'Claude Code Bridge 尚未启动',
      )
    }),
    vscode.window.onDidChangeTextEditorSelection(() => {
      void bridgeService?.publishActiveSelection()
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      void bridgeService?.publishActiveSelection()
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void bridgeService?.refreshLockfile()
    }),
  )

  await bridgeService.publishActiveSelection()
}

export async function deactivate(): Promise<void> {
  await bridgeService?.dispose()
  bridgeService = null
}

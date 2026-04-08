import { readFile } from 'node:fs/promises'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as vscode from 'vscode'
import type { DiffController } from './bridgeServer.js'
import type { OpenDiffArguments } from './protocol.js'

const DIFF_SCHEME = 'claude-code-bridge'
const ACCEPT_LABEL = '接受'
const REJECT_LABEL = '拒绝'

type DiffSession = {
  tabName: string
  leftUri: any
  rightUri: any
  filePath: string
  hasBeenVisible: boolean
  settled: boolean
  resolve: (result: CallToolResult) => void
}

class VirtualDocumentProvider {
  private readonly contents = new Map<string, string>()

  provideTextDocumentContent(uri: any): string {
    return this.contents.get(uri.toString()) ?? ''
  }

  set(uri: any, content: string): void {
    this.contents.set(uri.toString(), content)
  }

  delete(uri: any): void {
    this.contents.delete(uri.toString())
  }
}

function createTextResult(text: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  }
}

function createFileSavedResult(contents: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: 'FILE_SAVED',
      },
      {
        type: 'text',
        text: contents,
      },
    ],
  }
}

function buildDiffUri(kind: 'left' | 'right', tabName: string, filePath: string) {
  return vscode.Uri.parse(
    `${DIFF_SCHEME}:/${kind}/${encodeURIComponent(tabName)}?filePath=${encodeURIComponent(filePath)}`,
  )
}

function getDocumentFullRange(document: any): any {
  const lineCount = Math.max(document?.lineCount ?? 1, 1)
  const lastLine = document?.lineAt?.(lineCount - 1)
  const lastCharacter = lastLine?.text?.length ?? 0
  return new vscode.Range(0, 0, lineCount - 1, lastCharacter)
}

async function replaceDocumentContents(
  editor: any,
  nextContent: string,
): Promise<void> {
  const currentContent = editor?.document?.getText?.() ?? ''
  if (currentContent === nextContent) {
    return
  }

  await editor.edit((editBuilder: any) => {
    editBuilder.replace(
      getDocumentFullRange(editor.document),
      nextContent,
    )
  })
}

function matchesSessionDocument(session: DiffSession, document: any): boolean {
  const uriString = document?.uri?.toString?.()
  const fsPath = document?.uri?.fsPath

  return (
    uriString === session.rightUri.toString() ||
    (typeof fsPath === 'string' && fsPath === session.filePath)
  )
}

export function createDiffController(outputChannel: any): DiffController & {
  dispose(): Promise<void>
} {
  const provider = new VirtualDocumentProvider()
  const sessions = new Map<string, DiffSession>()

  const providerDisposable =
    vscode.workspace.registerTextDocumentContentProvider(
      DIFF_SCHEME,
      provider,
    )

  const visibilityDisposable = vscode.window.onDidChangeVisibleTextEditors(
    (editors: any[]) => {
      const visibleUris = new Set(
        editors.map(editor => editor?.document?.uri?.toString?.()),
      )

      for (const session of sessions.values()) {
        const leftVisible = visibleUris.has(session.leftUri.toString())
        const rightVisible = visibleUris.has(session.rightUri.toString())

        if (leftVisible || rightVisible) {
          session.hasBeenVisible = true
          continue
        }

        if (session.hasBeenVisible) {
          void settleSession(
            session.tabName,
            createTextResult('TAB_CLOSED'),
            false,
          )
        }
      }
    },
  )

  const saveDisposable = vscode.workspace.onDidSaveTextDocument(
    (document: any) => {
      for (const session of sessions.values()) {
        if (!matchesSessionDocument(session, document)) {
          continue
        }

        void settleSession(
          session.tabName,
          createFileSavedResult(document.getText()),
          true,
        )
      }
    },
  )

  async function settleSession(
    tabName: string,
    result: CallToolResult,
    closeEditors: boolean,
  ): Promise<void> {
    const session = sessions.get(tabName)
    if (!session || session.settled) {
      return
    }

    session.settled = true
    sessions.delete(tabName)
    provider.delete(session.leftUri)
    provider.delete(session.rightUri)

    if (closeEditors) {
      await closeSessionEditors(session).catch(() => {})
    }

    session.resolve(result)
  }

  async function closeSessionEditors(session: DiffSession): Promise<void> {
    for (const editor of vscode.window.visibleTextEditors ?? []) {
      if (
        matchesSessionDocument(session, editor?.document) &&
        editor?.document?.isDirty
      ) {
        await vscode.window.showTextDocument(editor.document, {
          preview: false,
          preserveFocus: false,
          viewColumn: editor.viewColumn,
        })
        await vscode.commands.executeCommand('workbench.action.files.revert')
      }
    }

    const matchedTabs: any[] = []

    for (const group of vscode.window.tabGroups?.all ?? []) {
      for (const tab of group.tabs ?? []) {
        const original = tab?.input?.original?.toString?.()
        const modified = tab?.input?.modified?.toString?.()
        const uri = tab?.input?.uri?.toString?.()
        if (
          original === session.leftUri.toString() ||
          modified === session.rightUri.toString() ||
          uri === session.rightUri.toString() ||
          tab?.input?.uri?.fsPath === session.filePath ||
          tab?.label === session.tabName
        ) {
          matchedTabs.push(tab)
        }
      }
    }

    if (matchedTabs.length > 0 && vscode.window.tabGroups?.close) {
      await vscode.window.tabGroups.close(matchedTabs, true)
      return
    }

    for (const editor of vscode.window.visibleTextEditors ?? []) {
      const uri = editor?.document?.uri?.toString?.()
      if (
        uri === session.leftUri.toString() ||
        uri === session.rightUri.toString()
      ) {
        await vscode.window.showTextDocument(editor.document, {
          preview: false,
          preserveFocus: false,
          viewColumn: editor.viewColumn,
        })
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
      }
    }
  }

  return {
    async openDiff(args: OpenDiffArguments): Promise<CallToolResult> {
      await settleSession(args.tab_name, createTextResult('TAB_CLOSED'), true)

      const leftContent = await readFile(args.old_file_path, 'utf8').catch(
        () => '',
      )
      const leftUri = buildDiffUri('left', args.tab_name, args.old_file_path)
      const rightUri = vscode.Uri.file(args.new_file_path)

      provider.set(leftUri, leftContent)

      const rightDocument = await vscode.workspace.openTextDocument(rightUri)
      const rightEditor = await vscode.window.showTextDocument(rightDocument, {
        preview: false,
        preserveFocus: true,
      })
      await replaceDocumentContents(rightEditor, args.new_file_contents)

      const resultPromise = new Promise<CallToolResult>(resolve => {
        sessions.set(args.tab_name, {
          tabName: args.tab_name,
          leftUri,
          rightUri,
          filePath: args.new_file_path,
          hasBeenVisible: false,
          settled: false,
          resolve,
        })
      })

      outputChannel.appendLine(
        `[diff] open ${args.tab_name} -> ${args.new_file_path}`,
      )

      await vscode.commands.executeCommand(
        'vscode.diff',
        leftUri,
        rightUri,
        args.tab_name,
        {
          preview: false,
        },
      )

      queueMicrotask(() => {
        const visibleUris = new Set(
          (vscode.window.visibleTextEditors ?? []).map((editor: any) =>
            editor?.document?.uri?.toString?.(),
          ),
        )
        const session = sessions.get(args.tab_name)
        if (!session) {
          return
        }
        if (
          visibleUris.has(session.leftUri.toString()) ||
          visibleUris.has(session.rightUri.toString())
        ) {
          session.hasBeenVisible = true
        }
      })

      void vscode.window
        .showInformationMessage(
          `Claude Code 提议了对 ${args.new_file_path} 的修改`,
          ACCEPT_LABEL,
          REJECT_LABEL,
        )
        .then((choice: string | undefined) => {
          if (choice === ACCEPT_LABEL) {
            void settleSession(
              args.tab_name,
              createTextResult('TAB_CLOSED'),
              true,
            )
          } else if (choice === REJECT_LABEL) {
            void settleSession(
              args.tab_name,
              createTextResult('DIFF_REJECTED'),
              true,
            )
          }
        })

      return resultPromise
    },

    async closeTab(args): Promise<CallToolResult> {
      const session = sessions.get(args.tab_name)
      if (session) {
        await closeSessionEditors(session).catch(() => {})
        await settleSession(args.tab_name, createTextResult('TAB_CLOSED'), false)
      }
      return createTextResult('TAB_CLOSED')
    },

    async closeAllDiffTabs(): Promise<CallToolResult> {
      for (const tabName of [...sessions.keys()]) {
        const session = sessions.get(tabName)
        if (!session) {
          continue
        }
        await closeSessionEditors(session).catch(() => {})
        await settleSession(tabName, createTextResult('TAB_CLOSED'), false)
      }
      return createTextResult('OK')
    },

    async dispose(): Promise<void> {
      visibilityDisposable.dispose()
      saveDisposable.dispose()
      providerDisposable.dispose()
      await this.closeAllDiffTabs()
    },
  }
}

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, mock, test } from 'bun:test'

type FakeUri = {
  scheme: string
  fsPath: string
  path: string
  query: string
  toString(): string
}

type FakeDocument = {
  uri: FakeUri
  isDirty: boolean
  lineCount: number
  lineAt(index: number): { text: string }
  getText(): string
  setText(next: string): void
}

function createFakeUri(
  scheme: string,
  fsPath: string,
  query = '',
): FakeUri {
  const normalizedFsPath = fsPath.replaceAll('\\', '/')
  return {
    scheme,
    fsPath,
    path: fsPath,
    query,
    toString() {
      if (scheme === 'file') {
        return `file://${normalizedFsPath}`
      }
      return `${scheme}:/${normalizedFsPath}${query ? `?${query}` : ''}`
    },
  }
}

function createFakeVscode() {
  const documents = new Map<string, FakeDocument>()
  const saveListeners = new Set<(document: FakeDocument) => void>()
  const visibleEditorListeners = new Set<(editors: any[]) => void>()
  const visibleTextEditors: any[] = []

  function createDocument(uri: FakeUri, initialText = ''): FakeDocument {
    let text = initialText
    return {
      uri,
      isDirty: false,
      get lineCount() {
        return Math.max(text.split('\n').length, 1)
      },
      lineAt(index: number) {
        return {
          text: text.split('\n')[index] ?? '',
        }
      },
      getText() {
        return text
      },
      setText(next: string) {
        text = next
        this.isDirty = true
      },
    }
  }

  const vscode = {
    Uri: {
      parse(value: string) {
        const match = value.match(/^([a-z-]+):\/(.+?)(?:\?(.*))?$/i)
        if (!match) {
          throw new Error(`Unsupported URI: ${value}`)
        }
        const [, scheme, path, query = ''] = match
        return createFakeUri(
          scheme,
          decodeURIComponent(path),
          query,
        )
      },
      file(filePath: string) {
        return createFakeUri('file', filePath)
      },
    },
    Range: class {
      constructor(
        public startLine: number,
        public startCharacter: number,
        public endLine: number,
        public endCharacter: number,
      ) {}
    },
    workspace: {
      registerTextDocumentContentProvider() {
        return { dispose() {} }
      },
      onDidSaveTextDocument(handler: (document: FakeDocument) => void) {
        saveListeners.add(handler)
        return {
          dispose() {
            saveListeners.delete(handler)
          },
        }
      },
      async openTextDocument(uri: FakeUri) {
        const key = uri.toString()
        const existing = documents.get(key)
        if (existing) {
          return existing
        }
        const doc = createDocument(uri)
        documents.set(key, doc)
        return doc
      },
    },
    window: {
      visibleTextEditors,
      tabGroups: {
        all: [],
        async close() {},
      },
      onDidChangeVisibleTextEditors(handler: (editors: any[]) => void) {
        visibleEditorListeners.add(handler)
        return {
          dispose() {
            visibleEditorListeners.delete(handler)
          },
        }
      },
      async showTextDocument(document: FakeDocument) {
        const editor = {
          document,
          viewColumn: 1,
          async edit(
            callback: (editBuilder: { replace(range: unknown, text: string): void }) => void,
          ) {
            callback({
              replace(_range, text) {
                document.setText(text)
              },
            })
            return true
          },
        }
        if (!visibleTextEditors.includes(editor)) {
          visibleTextEditors.splice(0, visibleTextEditors.length, editor)
          for (const listener of visibleEditorListeners) {
            listener([...visibleTextEditors])
          }
        }
        return editor
      },
      async showInformationMessage() {
        return undefined
      },
    },
    commands: {
      async executeCommand() {},
    },
    __documents: documents,
    async __emitSave(document: FakeDocument) {
      document.isDirty = false
      for (const listener of saveListeners) {
        listener(document)
      }
    },
  }

  return vscode
}

async function waitForDocument(
  filePath: string,
  attempts = 20,
): Promise<FakeDocument | undefined> {
  for (let i = 0; i < attempts; i++) {
    const document = fakeVscode.__documents.get(
      fakeVscode.Uri.file(filePath).toString(),
    )
    if (document) {
      return document
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  return undefined
}

const fakeVscode = createFakeVscode()
mock.module('vscode', () => fakeVscode)

afterEach(() => {
  fakeVscode.__documents.clear()
  fakeVscode.window.visibleTextEditors.splice(
    0,
    fakeVscode.window.visibleTextEditors.length,
  )
})

describe('diff controller', () => {
  test('returns FILE_SAVED with the saved file contents', async () => {
    const { createDiffController } = await import(
      '../src/server/diffController.js'
    )

    const tempDir = mkdtempSync(join(tmpdir(), 'claude-code-bridge-'))
    const filePath = join(tempDir, 'sample.ts')
    writeFileSync(filePath, 'const before = true\n')

    const controller = createDiffController({
      appendLine() {},
    })

    const resultPromise = controller.openDiff({
      old_file_path: filePath,
      new_file_path: filePath,
      new_file_contents: 'const proposed = true\n',
      tab_name: 'sample.ts',
    })

    const savedDocument = await waitForDocument(filePath)
    expect(savedDocument).toBeDefined()

    savedDocument?.setText('const saved = true\n')
    await fakeVscode.__emitSave(savedDocument as FakeDocument)

    const result = await Promise.race([
      resultPromise,
      new Promise(resolve =>
        setTimeout(() => resolve('timed-out'), 200),
      ),
    ])

    expect(result).toEqual({
      content: [
        { type: 'text', text: 'FILE_SAVED' },
        { type: 'text', text: 'const saved = true\n' },
      ],
    })

    await controller.dispose()
  })
})

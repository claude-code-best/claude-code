import { buildSelectionChangedParams } from './selectionPublisher.js'

type WorkspaceFolderLike = {
  uri?: {
    fsPath?: string
  }
}

type EditorLike = {
  document?: {
    uri?: {
      fsPath?: string
    }
    getText(selection: unknown): string
  }
  selection?: {
    start: {
      line: number
      character: number
    }
    end: {
      line: number
      character: number
    }
    isEmpty?: boolean
  }
}

export function getWorkspaceFolderPaths(
  workspaceFolders: WorkspaceFolderLike[] | undefined,
): string[] {
  return (workspaceFolders ?? [])
    .map(folder => folder.uri?.fsPath)
    .filter((value): value is string => Boolean(value))
}

export function getActiveSelectionSnapshot(editor: EditorLike | undefined) {
  const filePath = editor?.document?.uri?.fsPath
  const selection = editor?.selection

  if (!editor?.document || !selection || selection.isEmpty) {
    return buildSelectionChangedParams({
      filePath,
    })
  }

  return buildSelectionChangedParams({
    filePath,
    text: editor.document.getText(selection),
    start: selection.start,
    end: selection.end,
  })
}

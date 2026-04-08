import { describe, expect, test } from 'bun:test'
import {
  getActiveSelectionSnapshot,
  getWorkspaceFolderPaths,
} from '../src/server/workspaceInfo.js'

describe('workspace info helpers', () => {
  test('collects workspace folder fs paths', () => {
    expect(
      getWorkspaceFolderPaths([
        { uri: { fsPath: 'D:/vibe/claude-code' } },
        { uri: { fsPath: 'D:/vibe/another-project' } },
      ]),
    ).toEqual(['D:/vibe/claude-code', 'D:/vibe/another-project'])
  })

  test('extracts the active editor selection text and file path', () => {
    const snapshot = getActiveSelectionSnapshot({
      document: {
        uri: { fsPath: 'D:/vibe/claude-code/src/cli/print.ts' },
        getText(selection: unknown) {
          expect(selection).toEqual({
            start: { line: 3, character: 1 },
            end: { line: 5, character: 0 },
            isEmpty: false,
          })
          return 'selected lines'
        },
      },
      selection: {
        start: { line: 3, character: 1 },
        end: { line: 5, character: 0 },
        isEmpty: false,
      },
    })

    expect(snapshot.filePath).toBe('D:/vibe/claude-code/src/cli/print.ts')
    expect(snapshot.text).toBe('selected lines')
    expect(snapshot.selection?.start.line).toBe(3)
  })
})

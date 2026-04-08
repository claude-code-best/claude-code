import { describe, expect, test } from 'bun:test'
import { buildSelectionChangedParams } from '../src/server/selectionPublisher.js'

describe('selection publisher helpers', () => {
  test('serializes a selected range with text and file path', () => {
    const params = buildSelectionChangedParams({
      filePath: 'D:/vibe/claude-code/src/cli/print.ts',
      text: 'const value = 1',
      start: { line: 10, character: 2 },
      end: { line: 10, character: 17 },
    })

    expect(params.filePath).toBe('D:/vibe/claude-code/src/cli/print.ts')
    expect(params.text).toBe('const value = 1')
    expect(params.selection?.start.line).toBe(10)
    expect(params.selection?.end.character).toBe(17)
  })

  test('keeps file context when there is no active selection', () => {
    const params = buildSelectionChangedParams({
      filePath: 'D:/vibe/claude-code/src/cli/print.ts',
    })

    expect(params.filePath).toBe('D:/vibe/claude-code/src/cli/print.ts')
    expect(params.selection).toBeNull()
  })
})

import { describe, expect, test } from 'bun:test'
import {
  clearClaudeCodeIdePort,
  setClaudeCodeIdePort,
} from '../src/server/terminalEnvironment.js'

type FakeEnvironmentVariableCollection = {
  replaceCalls: Array<{ name: string; value: string }>
  deleteCalls: string[]
  replace(name: string, value: string): void
  delete(name: string): void
}

function createFakeCollection(): FakeEnvironmentVariableCollection {
  return {
    replaceCalls: [],
    deleteCalls: [],
    replace(name, value) {
      this.replaceCalls.push({ name, value })
    },
    delete(name) {
      this.deleteCalls.push(name)
    },
  }
}

describe('terminal environment sync', () => {
  test('sets CLAUDE_CODE_SSE_PORT to the active bridge port', () => {
    const collection = createFakeCollection()

    setClaudeCodeIdePort(collection, 52075)

    expect(collection.replaceCalls).toEqual([
      {
        name: 'CLAUDE_CODE_SSE_PORT',
        value: '52075',
      },
    ])
  })

  test('clears CLAUDE_CODE_SSE_PORT when the bridge stops', () => {
    const collection = createFakeCollection()

    clearClaudeCodeIdePort(collection)

    expect(collection.deleteCalls).toEqual(['CLAUDE_CODE_SSE_PORT'])
  })
})

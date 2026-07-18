import { beforeAll, describe, expect, mock, test } from 'bun:test'

mock.module('bun:bundle', () => ({ feature: () => true }))

let command: {
  name: string
  aliases?: string[]
  description: string
}

beforeAll(async () => {
  const module = await import('../index.js')
  command = module.default
})

describe('remote control worker command metadata', () => {
  test('uses Worker as the primary name and retains legacy aliases', () => {
    expect(command.name).toBe('remote-control-worker')
    expect(command.aliases).toEqual(['remote-control-server', 'rcs'])
    expect(command.description).toContain('Bridge Worker')
  })
})

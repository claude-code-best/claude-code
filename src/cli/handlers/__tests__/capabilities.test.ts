import { describe, expect, test } from 'bun:test'
import {
  buildCapabilities,
  getCapabilitiesOutput,
  parseCapabilitiesArgs,
} from '../capabilities.js'

describe('buildCapabilities', () => {
  test('describes required Remote Control features and unknown manifest entries', () => {
    const capabilities = buildCapabilities([
      'BRIDGE_MODE',
      'DAEMON',
      'SESSION_TERMINALS',
      'CUSTOM_FEATURE',
    ])

    expect(
      capabilities.find(capability => capability.name === 'BRIDGE_MODE'),
    ).toMatchObject({
      compiled: true,
      activation: 'runtime-config',
    })
    expect(
      capabilities.find(capability => capability.name === 'DAEMON')?.usage,
    ).toContain('ccb daemon')
    expect(
      capabilities.find(capability => capability.name === 'SESSION_TERMINALS')
        ?.usage,
    ).toContain('bun run rcs:local')
    expect(
      capabilities.find(capability => capability.name === 'CUSTOM_FEATURE'),
    ).toMatchObject({
      compiled: true,
      activation: 'always',
    })
  })

  test('reports known features that were not compiled', () => {
    const capabilities = buildCapabilities([])

    expect(
      capabilities.find(capability => capability.name === 'BRIDGE_MODE'),
    ).toMatchObject({
      compiled: false,
      activation: 'not-compiled',
    })
  })

  test('documents automatic and headless model streaming', () => {
    const streaming = buildCapabilities([]).find(
      capability => capability.name === 'model-streaming',
    )

    expect(streaming).toMatchObject({ compiled: true, activation: 'always' })
    expect(streaming?.usage).toContain(
      '--print --verbose --output-format stream-json --include-partial-messages',
    )
  })
})

describe('getCapabilitiesOutput', () => {
  test('emits a versioned deterministic JSON payload', () => {
    const parsed = JSON.parse(
      getCapabilitiesOutput({
        json: true,
        compiledFeatures: ['SESSION_TERMINALS', 'BRIDGE_MODE'],
      }),
    ) as {
      version: number
      compiledFeatures: string[]
      capabilities: Array<{ name: string }>
    }

    expect(parsed.version).toBe(1)
    expect(parsed.compiledFeatures).toEqual([
      'SESSION_TERMINALS',
      'BRIDGE_MODE',
    ])
    expect(parsed.capabilities.map(capability => capability.name)).toEqual(
      [...parsed.capabilities.map(capability => capability.name)].sort(),
    )
  })

  test('emits readable text with activation and usage', () => {
    const output = getCapabilitiesOutput({
      json: false,
      compiledFeatures: ['BRIDGE_MODE'],
    })

    expect(output).toContain('BRIDGE_MODE')
    expect(output).toContain('runtime-config')
    expect(output).toContain('Usage:')
  })
})

describe('parseCapabilitiesArgs', () => {
  test('accepts no options or only --json', () => {
    expect(parseCapabilitiesArgs([])).toEqual({ json: false })
    expect(parseCapabilitiesArgs(['--json'])).toEqual({ json: true })
  })

  test('rejects unknown options', () => {
    expect(() => parseCapabilitiesArgs(['--bad'])).toThrow(
      'Unknown capabilities option: --bad',
    )
  })
})

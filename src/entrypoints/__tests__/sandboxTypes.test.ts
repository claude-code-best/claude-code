import { describe, expect, test } from 'bun:test'
import {
  SandboxNetworkConfigSchema,
  SandboxSettingsSchema,
} from '../sandboxTypes.js'

describe('SandboxNetworkConfigSchema — SDK sub-field passthrough (T10g)', () => {
  test('accepts deniedDomains array', () => {
    const result = SandboxNetworkConfigSchema().safeParse({
      allowedDomains: ['example.com'],
      deniedDomains: ['malicious.example'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data?.deniedDomains).toEqual(['malicious.example'])
    }
  })

  test('accepts allowMachLookup array', () => {
    const result = SandboxNetworkConfigSchema().safeParse({
      allowMachLookup: ['com.apple.coresimulator.*'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data?.allowMachLookup).toEqual([
        'com.apple.coresimulator.*',
      ])
    }
  })

  test('preserves all existing sub-fields', () => {
    const result = SandboxNetworkConfigSchema().safeParse({
      allowedDomains: ['a.com'],
      deniedDomains: ['b.com'],
      allowManagedDomainsOnly: true,
      allowUnixSockets: ['/tmp/sock'],
      allowAllUnixSockets: true,
      allowLocalBinding: true,
      allowMachLookup: ['com.apple.foo'],
      httpProxyPort: 8080,
      socksProxyPort: 1080,
    })
    expect(result.success).toBe(true)
  })

  test('rejects non-array deniedDomains', () => {
    const result = SandboxNetworkConfigSchema().safeParse({
      deniedDomains: 'malicious.example',
    })
    expect(result.success).toBe(false)
  })
})

describe('SandboxSettingsSchema — network subtree accepts new fields', () => {
  test('preserves deniedDomains inside sandbox.network', () => {
    const result = SandboxSettingsSchema().safeParse({
      enabled: true,
      network: {
        allowedDomains: ['allowed.com'],
        deniedDomains: ['denied.com'],
        allowMachLookup: ['com.apple.bar'],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.network?.deniedDomains).toEqual(['denied.com'])
      expect(result.data.network?.allowMachLookup).toEqual(['com.apple.bar'])
    }
  })
})

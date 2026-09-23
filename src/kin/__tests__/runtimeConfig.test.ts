import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import { readKinRuntimeConfig } from '../runtimeConfig'
import {
  COMPACT_IDENTITY,
  IDENTITY,
  getSystemLayout,
  layoutSystemBlocks,
} from '../systemLayout'

const originalEnv = {
  path: process.env.KIN_KERNEL_CONFIG_PATH,
  native: process.env.CLAUDE_CODE_KIN_NATIVE_SLOTS,
  layout: process.env.CLAUDE_CODE_SYSTEM_LAYOUT,
  mode: process.env.KIN_SYSTEM_MODE,
}

function restoreEnv(): void {
  for (const [key, value] of [
    ['KIN_KERNEL_CONFIG_PATH', originalEnv.path],
    ['CLAUDE_CODE_KIN_NATIVE_SLOTS', originalEnv.native],
    ['CLAUDE_CODE_SYSTEM_LAYOUT', originalEnv.layout],
    ['KIN_SYSTEM_MODE', originalEnv.mode],
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

afterEach(restoreEnv)

describe('Kin runtime configuration', () => {
  test('reads updated kernel config on every native job', () => {
    const root = mkdtempSync(join(tmpdir(), 'kin-runtime-config-'))
    const path = join(root, 'kernel.json')
    process.env.KIN_KERNEL_CONFIG_PATH = path
    process.env.CLAUDE_CODE_KIN_NATIVE_SLOTS = '1'
    try {
      writeFileSync(
        path,
        JSON.stringify({
          default_cache_ttl: '5m',
          persona_preset: 'zero',
          system_layout: 'zero',
          timezone: 'UTC',
        }),
      )
      expect(readKinRuntimeConfig()).toMatchObject({
        default_cache_ttl: '5m',
        persona_preset: 'zero',
        system_layout: 'zero',
        timezone: 'UTC',
      })
      writeFileSync(
        path,
        JSON.stringify({
          default_cache_ttl: '1h',
          persona_preset: 'official_full',
          system_layout: 'identity',
          timezone: 'America/Los_Angeles',
        }),
      )
      expect(readKinRuntimeConfig()).toMatchObject({
        default_cache_ttl: '1h',
        persona_preset: 'official_full',
        system_layout: 'identity',
        timezone: 'America/Los_Angeles',
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('native file config overrides fixed standalone layout environment', () => {
    const root = mkdtempSync(join(tmpdir(), 'kin-runtime-layout-'))
    const path = join(root, 'kernel.json')
    process.env.KIN_KERNEL_CONFIG_PATH = path
    process.env.CLAUDE_CODE_KIN_NATIVE_SLOTS = '1'
    process.env.CLAUDE_CODE_SYSTEM_LAYOUT = 'zero'
    process.env.KIN_SYSTEM_MODE = 'zero'
    try {
      writeFileSync(
        path,
        JSON.stringify({
          default_cache_ttl: '1h',
          persona_preset: 'official',
          system_layout: 'identity',
        }),
      )
      expect(getSystemLayout(readKinRuntimeConfig())).toBe('identity')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('layoutSystemBlocks keeps the three persona contracts distinct', () => {
    const common = {
      attribution: 'x-anthropic-billing-header: cc_version=test;',
    }
    const zero = layoutSystemBlocks({
      ...common,
      runtime: {
        default_cache_ttl: '5m',
        persona_preset: 'zero',
        system_layout: 'zero',
      },
    })
    expect(zero[0]).toContain(`prompt_version=${COMPACT_IDENTITY}`)
    expect(zero).not.toContain(IDENTITY)

    const official = layoutSystemBlocks({
      ...common,
      runtime: {
        default_cache_ttl: '1h',
        persona_preset: 'official',
        system_layout: 'identity',
      },
    })
    expect(official).toContain(IDENTITY)
    expect(official).not.toContain('# Environment\nTime zone:')

    const full = layoutSystemBlocks({
      ...common,
      officialFullPrompt: [
        'official static prompt',
        '# Environment\nTime zone: UTC',
      ],
      runtime: {
        default_cache_ttl: '1h',
        persona_preset: 'official_full',
        system_layout: 'identity',
      },
    })
    expect(full).toContain(
      'official static prompt\n\n# Environment\nTime zone: UTC',
    )
  })

  test('removes turn-scoped attribution fields from the native cache prefix', () => {
    const blocks = layoutSystemBlocks({
      attribution:
        'x-anthropic-billing-header: cc_version=test; cch=abcdef; cc_workload=cron;',
      runtime: {
        default_cache_ttl: '1h',
        persona_preset: 'official',
        system_layout: 'identity',
      },
    })
    expect(blocks[0]).toBe('x-anthropic-billing-header: cc_version=test;')
  })
})

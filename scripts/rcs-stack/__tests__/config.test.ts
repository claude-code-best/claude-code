import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { needsProductionWebBuild, resolveStackConfig } from '../config.js'

describe('resolveStackConfig', () => {
  test('generates and shares a secret without exposing it as metadata', () => {
    const config = resolveStackConfig('local', {}, () => 'generated-secret')

    expect(config.host).toBe('127.0.0.1')
    expect(config.port).toBe(3000)
    expect(config.healthUrl).toBe('http://127.0.0.1:3000/health')
    expect(config.readyUrl).toBe('http://127.0.0.1:3000/ready')
    expect(config.rcsEnv.RCS_API_KEYS).toBe('generated-secret')
    expect(config.workerEnv.CLAUDE_BRIDGE_OAUTH_TOKEN).toBe('generated-secret')
    expect(config.apiKeyCount).toBe(1)
    expect(JSON.stringify(config.publicSummary)).not.toContain(
      'generated-secret',
    )
  })

  test('preserves multiple keys and selects the first non-empty worker key', () => {
    const config = resolveStackConfig('local', {
      RCS_API_KEYS: ' first , second ',
      CLAUDE_BRIDGE_OAUTH_TOKEN: 'stale',
    })

    expect(config.rcsEnv.RCS_API_KEYS).toBe('first,second')
    expect(config.workerEnv.CLAUDE_BRIDGE_OAUTH_TOKEN).toBe('first')
    expect(config.apiKeyCount).toBe(2)
  })

  test('rejects an explicitly empty key list', () => {
    expect(() => resolveStackConfig('local', { RCS_API_KEYS: ' , ' })).toThrow(
      'RCS_API_KEYS must contain at least one non-empty key',
    )
  })

  test('uses loopback for the local worker when RCS listens on all interfaces', () => {
    const config = resolveStackConfig(
      'dev',
      { RCS_HOST: '0.0.0.0', RCS_PORT: '4100' },
      () => 'generated-secret',
    )

    expect(config.host).toBe('0.0.0.0')
    expect(config.healthUrl).toBe('http://127.0.0.1:4100/health')
    expect(config.workerEnv.CLAUDE_BRIDGE_BASE_URL).toBe(
      'http://127.0.0.1:4100',
    )
    expect(config.webUrl).toBe('http://127.0.0.1:5173/code/')
  })

  test('respects an explicit bridge base URL', () => {
    const config = resolveStackConfig(
      'local',
      { CLAUDE_BRIDGE_BASE_URL: 'https://rcs.example.test/' },
      () => 'generated-secret',
    )

    expect(config.workerEnv.CLAUDE_BRIDGE_BASE_URL).toBe(
      'https://rcs.example.test/',
    )
  })
})

test('production Web build is only needed for local mode with no dist', () => {
  expect(needsProductionWebBuild('local', false)).toBe(true)
  expect(needsProductionWebBuild('local', true)).toBe(false)
  expect(needsProductionWebBuild('dev', false)).toBe(false)
})

test('package scripts expose layered RCS entrypoints', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(import.meta.dir, '../../../package.json'), 'utf8'),
  ) as { scripts: Record<string, string> }

  expect(pkg.scripts['rcs:local']).toBe(
    'bun run scripts/rcs-stack/main.ts local',
  )
  expect(pkg.scripts['rcs:dev']).toBe('bun run scripts/rcs-stack/main.ts dev')
  expect(pkg.scripts['rcs:server']).toBe('bun run scripts/rcs.ts')
  expect(pkg.scripts['rcs:worker']).toBe('bun run scripts/rcs-worker.ts')
  expect(pkg.scripts.rcs).toBe('bun run rcs:server')
})

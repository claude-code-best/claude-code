import { describe, expect, test } from 'bun:test'
import { envDisplayName } from '../shell/EnvPicker'

describe('environment identity presentation', () => {
  test('uses the durable device label and workspace directory', () => {
    expect(
      envDisplayName({
        id: 'env-stable',
        device_name: 'Xie MacBook',
        machine_name: 'hostname.local',
        workspace_key: 'wrk-repo',
        directory: '/Users/xie/code/Real-Agentic',
        status: 'active',
      }),
    ).toBe('Xie MacBook · Real-Agentic')
  })

  test('falls back to the legacy machine name', () => {
    expect(
      envDisplayName({
        id: 'env-legacy',
        machine_name: 'legacy-host',
        status: 'active',
      }),
    ).toBe('legacy-host')
  })
})

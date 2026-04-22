import { describe, expect, test } from 'bun:test'
import { buildInheritedCliFlags } from '../spawnUtils'

describe('buildInheritedCliFlags', () => {
  test('propagates auto permission mode to process-based teammates', () => {
    const flags = buildInheritedCliFlags({ permissionMode: 'auto' })

    expect(flags).toContain('--permission-mode auto')
  })
})

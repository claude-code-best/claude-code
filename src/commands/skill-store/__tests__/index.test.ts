/**
 * Unit tests for the skill-store command definition (index.tsx)
 */

import { describe, expect, test } from 'bun:test'
import type { LocalJSXCommandModule } from '../../../types/command.js'
import skillStoreCommand from '../index.js'

describe('skillStoreCommand definition', () => {
  test('name is skill-store', () => {
    expect(skillStoreCommand.name).toBe('skill-store')
  })

  test('aliases include ss and cloud-skills', () => {
    expect(skillStoreCommand.aliases).toContain('ss')
    expect(skillStoreCommand.aliases).toContain('cloud-skills')
  })

  test('type is local-jsx', () => {
    expect(skillStoreCommand.type).toBe('local-jsx')
  })

  test('isHidden is boolean (dynamic: false when ANTHROPIC_API_KEY set, true when absent)', () => {
    // isHidden = !process.env['ANTHROPIC_API_KEY']
    expect(typeof skillStoreCommand.isHidden).toBe('boolean')
  })

  test('isEnabled returns true', () => {
    const cmd = skillStoreCommand as unknown as { isEnabled: () => boolean }
    expect(cmd.isEnabled()).toBe(true)
  })

  test('availability includes claude-ai', () => {
    expect(skillStoreCommand.availability).toContain('claude-ai')
  })

  test('load resolves a call function', async () => {
    const cmd = skillStoreCommand as unknown as {
      load: () => Promise<LocalJSXCommandModule>
    }
    const loaded = await cmd.load()
    expect(typeof loaded.call).toBe('function')
  })
})

import { describe, test, expect } from 'bun:test'
import { DISCOVER_SKILLS_TOOL_NAME } from '../prompt.js'

describe('DiscoverSkillsTool', () => {
  test('DISCOVER_SKILLS_TOOL_NAME is not empty', () => {
    expect(DISCOVER_SKILLS_TOOL_NAME).toBe('DiscoverSkills')
    expect(DISCOVER_SKILLS_TOOL_NAME.length).toBeGreaterThan(0)
  })

  test('tool exports are functions', async () => {
    const { DiscoverSkillsTool } = await import('../DiscoverSkillsTool.js')
    expect(DiscoverSkillsTool).toBeDefined()
    expect(DiscoverSkillsTool.name).toBe('DiscoverSkills')
    expect(typeof DiscoverSkillsTool.call).toBe('function')
  })

  test('tool has correct metadata', async () => {
    const { DiscoverSkillsTool } = await import('../DiscoverSkillsTool.js')
    expect(await DiscoverSkillsTool.description()).toContain('skill')
    expect(DiscoverSkillsTool.userFacingName()).toBe('Discover Skills')
    expect(DiscoverSkillsTool.isReadOnly()).toBe(true)
    expect(DiscoverSkillsTool.isConcurrencySafe()).toBe(true)
  })

  test('renderToolUseMessage formats input', async () => {
    const { DiscoverSkillsTool } = await import('../DiscoverSkillsTool.js')
    const msg = DiscoverSkillsTool.renderToolUseMessage({
      description: 'deploy to cloudflare',
    })
    expect(msg).toContain('deploy to cloudflare')
  })

  test('mapToolResultToToolResultBlockParam formats empty results', async () => {
    const { DiscoverSkillsTool } = await import('../DiscoverSkillsTool.js')
    const result = DiscoverSkillsTool.mapToolResultToToolResultBlockParam(
      { results: [], count: 0 },
      'test-id',
    )
    expect(result.content).toContain('No matching skills')
  })

  test('mapToolResultToToolResultBlockParam formats results', async () => {
    const { DiscoverSkillsTool } = await import('../DiscoverSkillsTool.js')
    const result = DiscoverSkillsTool.mapToolResultToToolResultBlockParam(
      {
        results: [{ name: 'test-skill', description: 'A test skill', score: 0.85 }],
        count: 1,
      },
      'test-id',
    )
    expect(result.content).toContain('test-skill')
    expect(result.content).toContain('0.85')
  })
})

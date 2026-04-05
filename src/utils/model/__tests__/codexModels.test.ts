import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getCodexModels,
  getDefaultCodexModel,
  isKnownCodexModel,
  resetCodexModelsCacheForTests,
} from '../codexModels'

describe('codexModels', () => {
  const originalPath = process.env.CLAUDE_CODE_CODEX_MODELS_CACHE_PATH

  afterEach(() => {
    resetCodexModelsCacheForTests()
    if (originalPath !== undefined) {
      process.env.CLAUDE_CODE_CODEX_MODELS_CACHE_PATH = originalPath
    } else {
      delete process.env.CLAUDE_CODE_CODEX_MODELS_CACHE_PATH
    }
  })

  test('reads visible models from the Codex cache file', () => {
    const dir = join(tmpdir(), `ccb-codex-models-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const cachePath = join(dir, 'models_cache.json')
    writeFileSync(
      cachePath,
      JSON.stringify({
        models: [
          {
            slug: 'gpt-5.4',
            display_name: 'gpt-5.4',
            description: 'Latest frontier agentic coding model.',
            visibility: 'list',
            isDefault: true,
          },
          {
            slug: 'hidden-model',
            display_name: 'Hidden',
            description: 'Should not be shown',
            visibility: 'hidden',
          },
        ],
      }),
    )
    process.env.CLAUDE_CODE_CODEX_MODELS_CACHE_PATH = cachePath

    const models = getCodexModels()
    expect(models).toHaveLength(1)
    expect(models[0]?.id).toBe('gpt-5.4')
    expect(getDefaultCodexModel()).toBe('gpt-5.4')
    expect(isKnownCodexModel('gpt-5.4')).toBe(true)

    rmSync(dir, { recursive: true, force: true })
  })
})

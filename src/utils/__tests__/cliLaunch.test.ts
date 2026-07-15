import { describe, expect, test } from 'bun:test'
import { buildScriptLaunchArgs } from '../cliLaunch.js'

describe('buildScriptLaunchArgs', () => {
  test('uses Bun run with a tsconfig override for source children', () => {
    expect(
      buildScriptLaunchArgs(
        ['--feature', 'BRIDGE_MODE'],
        '/repo/src/entrypoints/cli.tsx',
        {
          useBunRun: true,
          tsconfigOverride: '/tmp/claude-code-source-tsconfig.json',
        },
      ),
    ).toEqual([
      'run',
      '--feature',
      'BRIDGE_MODE',
      '--tsconfig-override=/tmp/claude-code-source-tsconfig.json',
      '/repo/src/entrypoints/cli.tsx',
    ])
  })

  test('keeps the existing direct launch shape for non-Bun children', () => {
    expect(
      buildScriptLaunchArgs([], '/repo/dist/cli.js', { useBunRun: false }),
    ).toEqual(['/repo/dist/cli.js'])
  })
})

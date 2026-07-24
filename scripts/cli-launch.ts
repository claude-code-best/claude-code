import { join, resolve } from 'node:path'
import { buildSessionLaunchSpec } from '../src/utils/cliLaunch.ts'
import { DEFAULT_BUILD_FEATURES, getMacroDefines } from './defines.ts'
import { resolveEnabledFeatures } from './feature-resolution.ts'

/**
 * The one source of truth for source-mode CLI bootstrap flags.  Both the
 * interactive dev launcher and the headless RCS worker use this builder, so a
 * Session child receives the same feature/MACRO surface as a normal CLI.
 */
export function buildSourceCliLaunchSpec(
  projectRoot = resolve(import.meta.dir, '..'),
  env: NodeJS.ProcessEnv = process.env,
) {
  const features = resolveEnabledFeatures(DEFAULT_BUILD_FEATURES, env)
  const defines = {
    ...getMacroDefines(features),
    'process.env.NODE_ENV': JSON.stringify('production'),
  }
  const defineArgs = Object.entries(defines).flatMap(([key, value]) => [
    '-d',
    `${key}:${value}`,
  ])
  const featureArgs = features.flatMap(feature => ['--feature', feature])
  return buildSessionLaunchSpec({
    projectRoot,
    target: 'source-cli',
    cliEntryPath: join(projectRoot, 'src/entrypoints/cli.tsx'),
    bootstrapArgs: [...defineArgs, ...featureArgs],
  })
}

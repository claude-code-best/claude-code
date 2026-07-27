import { describe, expect, test } from 'bun:test'
import {
  buildSessionLaunchSpec,
  InvalidSessionCliTargetError,
  validateSessionLaunchSpec,
} from '../../src/utils/cliLaunch.ts'
import { buildSourceCliLaunchSpec } from '../cli-launch.ts'

describe('explicit Session CLI launch contract', () => {
  test('points source sessions at the real CLI entrypoint', () => {
    const spec = buildSourceCliLaunchSpec(process.cwd())
    expect(spec.target).toBe('source-cli')
    expect(spec.cliEntryPath).toBe(`${process.cwd()}/src/entrypoints/cli.tsx`)
    expect(spec.scriptArgs).toContain(spec.cliEntryPath)
    expect(spec.scriptArgs).not.toContain('--inspect-wait')
  })

  test('rejects worker and supervisor scripts as Session targets', () => {
    const spec = buildSessionLaunchSpec({
      projectRoot: process.cwd(),
      target: 'source-cli',
      cliEntryPath: `${process.cwd()}/scripts/rcs-worker.ts`,
      bootstrapArgs: [],
    })
    expect(() => validateSessionLaunchSpec(spec, () => true)).toThrow(
      InvalidSessionCliTargetError,
    )
  })
})

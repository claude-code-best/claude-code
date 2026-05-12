import { describe, expect, mock, test } from 'bun:test'
import type { ToolPermissionContext } from '../../../Tool'
import { logMock } from '../../../../tests/mocks/log'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/platform.ts', () => ({
  getPlatform: () => 'windows',
}))
mock.module('src/utils/windowsPaths.ts', () => ({
  windowsPathToPosixPath: (p: string) =>
    p.startsWith('\\\\')
      ? p.replace(/\\/g, '/')
      : p
          .replace(
            /^([A-Za-z]):/,
            (_m: string, d: string) => `/${d.toLowerCase()}`,
          )
          .replace(/\\/g, '/'),
}))
mock.module('src/utils/path.ts', () => ({
  containsPathTraversal: (path: string) =>
    /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(path),
  expandPath: (path: string) => path,
  getDirectoryForPath: (path: string) => {
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    return slash === -1 ? path : path.slice(0, slash)
  },
  sanitizePath: (path: string) => path,
}))

const { matchingRuleForInput, patternWithRoot } = await import('../filesystem')

function makePermissionContext(
  rules: Partial<
    Pick<
      ToolPermissionContext,
      'alwaysAllowRules' | 'alwaysDenyRules' | 'alwaysAskRules'
    >
  >,
): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: rules.alwaysAllowRules ?? {},
    alwaysDenyRules: rules.alwaysDenyRules ?? {},
    alwaysAskRules: rules.alwaysAskRules ?? {},
    isBypassPermissionsModeAvailable: true,
  }
}

describe('patternWithRoot (Windows)', () => {
  test('C:\\Users\\me\\config.json → root=C:\\', () => {
    const r = patternWithRoot('C:\\Users\\me\\config.json', 'localSettings')
    expect(r.root).toBe('C:\\')
    expect(r.relativePattern).toBe('Users/me/config.json')
  })

  test('C:/Users/me/config.json → root=C:\\', () => {
    const r = patternWithRoot('C:/Users/me/config.json', 'localSettings')
    expect(r.root).toBe('C:\\')
    expect(r.relativePattern).toBe('Users/me/config.json')
  })

  test('D:\\projects\\app\\main.ts → root=D:\\', () => {
    const r = patternWithRoot('D:\\projects\\app\\main.ts', 'localSettings')
    expect(r.root).toBe('D:\\')
    expect(r.relativePattern).toBe('projects/app/main.ts')
  })

  test('/c/Users/me/config.json (POSIX) → drive root', () => {
    const r = patternWithRoot('/c/Users/me/config.json', 'localSettings')
    expect(r.root).toBe('C:\\')
    expect(r.relativePattern).toBe('Users/me/config.json')
  })

  test('/d/projects/main.ts → D: drive root', () => {
    const r = patternWithRoot('/d/projects/main.ts', 'localSettings')
    expect(r.root).toBe('D:\\')
    expect(r.relativePattern).toBe('projects/main.ts')
  })

  test('src/config.ts → root=null (relative on Windows too)', () => {
    const r = patternWithRoot('src/config.ts', 'localSettings')
    expect(r.root).toBeNull()
    expect(r.relativePattern).toBe('src/config.ts')
  })
})

describe('matchingRuleForInput (Windows)', () => {
  test('matches deny rule written with backslash drive path', () => {
    const context = makePermissionContext({
      alwaysDenyRules: {
        localSettings: ['Read(C:\\Users\\me\\config.json)'],
      },
    })

    const rule = matchingRuleForInput(
      'C:\\Users\\me\\config.json',
      context,
      'read',
      'deny',
    )

    expect(rule).not.toBeNull()
    expect(rule?.ruleBehavior).toBe('deny')
    expect(rule?.ruleValue.ruleContent).toBe('C:\\Users\\me\\config.json')
  })

  test('matches deny rule written with slash drive path', () => {
    const context = makePermissionContext({
      alwaysDenyRules: {
        localSettings: ['Read(C:/Users/me/config.json)'],
      },
    })

    const rule = matchingRuleForInput(
      'C:\\Users\\me\\config.json',
      context,
      'read',
      'deny',
    )

    expect(rule).not.toBeNull()
    expect(rule?.ruleBehavior).toBe('deny')
    expect(rule?.ruleValue.ruleContent).toBe('C:/Users/me/config.json')
  })

  test('does not match same relative path on a different drive', () => {
    const context = makePermissionContext({
      alwaysDenyRules: {
        localSettings: ['Read(C:\\Users\\me\\config.json)'],
      },
    })

    const rule = matchingRuleForInput(
      'D:\\Users\\me\\config.json',
      context,
      'read',
      'deny',
    )

    expect(rule).toBeNull()
  })
})

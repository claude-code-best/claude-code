import { describe, expect, test } from 'bun:test'
import {
  windowsPathToPosixPath,
  posixPathToWindowsPath,
  findGitBashPathOrNullWithDeps,
  type GitBashDiscoveryDeps,
} from '../windowsPaths'

// ─── windowsPathToPosixPath ────────────────────────────────────────────

describe('windowsPathToPosixPath', () => {
  test('converts drive letter path to posix', () => {
    expect(windowsPathToPosixPath('C:\\Users\\foo')).toBe('/c/Users/foo')
  })

  test('lowercases the drive letter', () => {
    expect(windowsPathToPosixPath('D:\\Work\\project')).toBe('/d/Work/project')
  })

  test('handles lowercase drive letter input', () => {
    expect(windowsPathToPosixPath('e:\\data')).toBe('/e/data')
  })

  test('converts UNC path', () => {
    expect(windowsPathToPosixPath('\\\\server\\share\\dir')).toBe(
      '//server/share/dir',
    )
  })

  test('converts root drive path', () => {
    expect(windowsPathToPosixPath('D:\\')).toBe('/d/')
  })

  test('converts relative path by flipping backslashes', () => {
    expect(windowsPathToPosixPath('src\\main.ts')).toBe('src/main.ts')
  })

  test('handles forward slashes in windows drive path', () => {
    // The regex matches both / and \\ after drive letter
    expect(windowsPathToPosixPath('C:/Users/foo')).toBe('/c/Users/foo')
  })

  test('already-posix relative path passes through', () => {
    expect(windowsPathToPosixPath('src/main.ts')).toBe('src/main.ts')
  })

  test('handles deeply nested path', () => {
    expect(
      windowsPathToPosixPath(
        'C:\\Users\\me\\Documents\\project\\src\\index.ts',
      ),
    ).toBe('/c/Users/me/Documents/project/src/index.ts')
  })
})

// ─── posixPathToWindowsPath ────────────────────────────────────────────

describe('posixPathToWindowsPath', () => {
  test('converts MSYS2/Git Bash drive path to windows', () => {
    expect(posixPathToWindowsPath('/c/Users/foo')).toBe('C:\\Users\\foo')
  })

  test('uppercases the drive letter', () => {
    expect(posixPathToWindowsPath('/d/Work/project')).toBe('D:\\Work\\project')
  })

  test('converts cygdrive path', () => {
    expect(posixPathToWindowsPath('/cygdrive/d/work')).toBe('D:\\work')
  })

  test('converts cygdrive root path', () => {
    expect(posixPathToWindowsPath('/cygdrive/c/')).toBe('C:\\')
  })

  test('converts UNC posix path to windows UNC', () => {
    expect(posixPathToWindowsPath('//server/share/dir')).toBe(
      '\\\\server\\share\\dir',
    )
  })

  test('converts root drive posix path', () => {
    expect(posixPathToWindowsPath('/d/')).toBe('D:\\')
  })

  test('converts bare drive mount (no trailing slash)', () => {
    expect(posixPathToWindowsPath('/e')).toBe('E:\\')
  })

  test('converts relative path by flipping forward slashes', () => {
    expect(posixPathToWindowsPath('src/main.ts')).toBe('src\\main.ts')
  })

  test('handles deeply nested posix path', () => {
    expect(
      posixPathToWindowsPath('/c/Users/me/Documents/project/src/index.ts'),
    ).toBe('C:\\Users\\me\\Documents\\project\\src\\index.ts')
  })
})

// ─── round-trip conversions ────────────────────────────────────────────

describe('round-trip conversions', () => {
  test('drive path round-trips windows -> posix -> windows', () => {
    const original = 'C:\\Users\\foo\\bar'
    const posix = windowsPathToPosixPath(original)
    const back = posixPathToWindowsPath(posix)
    expect(back).toBe(original)
  })

  test('drive path round-trips posix -> windows -> posix', () => {
    const original = '/c/Users/foo/bar'
    const win = posixPathToWindowsPath(original)
    const back = windowsPathToPosixPath(win)
    expect(back).toBe(original)
  })
})

// ─── findGitBashPathOrNullWithDeps ─────────────────────────────────────

// These tests exercise the pure discovery helper with mock dependencies.
// Using the DI variant (rather than mocking modules) keeps these tests
// hermetic — no `mock.module` calls, so other tests in the same `bun test`
// process are unaffected. See CLAUDE.md "跨文件 mock 污染" for context.

/** Build a deps object where only specific paths "exist". */
function makeDeps(opts: {
  exists?: ReadonlyArray<string>
  bashInPath?: string | null
  gitInPath?: string | null
  cwd?: string
  execThrows?: boolean
  envOverride?: string
}): GitBashDiscoveryDeps {
  const existsSet = new Set(opts.exists ?? [])
  return {
    checkExists: p => existsSet.has(p),
    execCommand: cmd => {
      if (opts.execThrows) throw new Error('where.exe not found')
      if (cmd.includes('where.exe bash')) return opts.bashInPath ?? ''
      if (cmd.includes('where.exe git')) return opts.gitInPath ?? ''
      return ''
    },
    cwdFn: () => opts.cwd ?? '/safe/cwd',
    // Default to empty string so we bypass `process.env.CLAUDE_CODE_GIT_BASH_PATH`
    // (the production function falls back to process.env when this is undefined).
    envOverride: opts.envOverride ?? '',
  }
}

describe('findGitBashPathOrNullWithDeps', () => {
  test('honors envOverride when file exists', () => {
    const override = 'D:\\custom\\path\\bash.exe'
    const deps: GitBashDiscoveryDeps = {
      ...makeDeps({}),
      envOverride: override,
    }
    deps.checkExists = p => p === override

    expect(findGitBashPathOrNullWithDeps(deps)).toBe(override)
  })

  test('returns null when envOverride points to missing file', () => {
    const deps: GitBashDiscoveryDeps = {
      ...makeDeps({ exists: [] }),
      envOverride: 'D:\\missing\\bash.exe',
    }
    expect(findGitBashPathOrNullWithDeps(deps)).toBeNull()
  })

  test('returns bash from where.exe when bash is in PATH', () => {
    // Simulates the portable-install case (D:\software\Git\usr\bin\bash.exe)
    // where bash is in PATH but doesn't match the conventional
    // <git>/../../bin/bash.exe derivation.
    const bashPath = 'D:\\software\\Git\\usr\\bin\\bash.exe'
    const deps = makeDeps({
      exists: [bashPath],
      bashInPath: bashPath,
    })
    expect(findGitBashPathOrNullWithDeps(deps)).toBe(bashPath)
  })

  test('derives bash from git path using standard layout', () => {
    // Standard Git for Windows: git at <root>/cmd/git.exe, bash at <root>/bin/bash.exe
    const gitPath = 'C:\\Program Files\\Git\\cmd\\git.exe'
    const bashPath = 'C:\\Program Files\\Git\\bin\\bash.exe'
    const deps = makeDeps({
      exists: [bashPath],
      gitInPath: gitPath,
    })
    expect(findGitBashPathOrNullWithDeps(deps)).toBe(bashPath)
  })

  test('derives bash from git path using portable layout (usr/bin/bash.exe)', () => {
    // PortableGit / custom installs: git at <root>/cmd/git.exe,
    // bash at <root>/usr/bin/bash.exe — the case that previously caused
    // process.exit(1) on D:\software\Git\ installations.
    const gitPath = 'D:\\software\\Git\\cmd\\git.exe'
    const bashPath = 'D:\\software\\Git\\usr\\bin\\bash.exe'
    const deps = makeDeps({
      exists: [bashPath], // only portable layout bash exists
      gitInPath: gitPath,
    })
    expect(findGitBashPathOrNullWithDeps(deps)).toBe(bashPath)
  })

  test('derives bash from git path using sibling layout', () => {
    // Some installs put git and bash in the same bin/ directory.
    const gitPath = 'C:\\Some\\Install\\bin\\git.exe'
    const bashPath = 'C:\\Some\\Install\\bin\\bash.exe'
    const deps = makeDeps({
      exists: [bashPath],
      gitInPath: gitPath,
    })
    expect(findGitBashPathOrNullWithDeps(deps)).toBe(bashPath)
  })

  test('falls back to default bash locations when nothing else matches', () => {
    const defaultBash = 'C:\\Program Files\\Git\\bin\\bash.exe'
    const deps = makeDeps({
      exists: [defaultBash],
      execThrows: true,
    })
    expect(findGitBashPathOrNullWithDeps(deps)).toBe(defaultBash)
  })

  test('falls back to usr/bin default layout when standard is absent', () => {
    // Default-locations branch also tries the `usr/bin` variant of
    // Program Files paths.
    const bashPath = 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'
    const deps = makeDeps({
      exists: [bashPath],
      execThrows: true,
    })
    expect(findGitBashPathOrNullWithDeps(deps)).toBe(bashPath)
  })

  test('returns null when no discovery method finds bash', () => {
    const deps = makeDeps({
      exists: [],
      execThrows: true,
    })
    expect(findGitBashPathOrNullWithDeps(deps)).toBeNull()
  })

  test('prefers envOverride over where.exe result', () => {
    const override = 'D:\\env\\bash.exe'
    const fromPath = 'D:\\software\\Git\\usr\\bin\\bash.exe'
    const deps: GitBashDiscoveryDeps = {
      ...makeDeps({
        exists: [override, fromPath],
        bashInPath: fromPath,
      }),
      envOverride: override,
    }
    expect(findGitBashPathOrNullWithDeps(deps)).toBe(override)
  })

  test('prefers where.exe bash over git-path derivation', () => {
    // where.exe bash is more reliable than the <git>/../../bin/bash.exe
    // derivation when git is at a non-standard location.
    const fromPath = 'D:\\software\\Git\\usr\\bin\\bash.exe'
    const gitPath = 'D:\\software\\Git\\cmd\\git.exe'
    const derivedBash = 'D:\\software\\Git\\bin\\bash.exe' // doesn't exist
    const deps = makeDeps({
      exists: [fromPath], // only fromPath exists; derived layout absent
      bashInPath: fromPath,
      gitInPath: gitPath,
    })
    expect(findGitBashPathOrNullWithDeps(deps)).toBe(fromPath)
    // Derived path must not be probed — we already have a where.exe hit.
    expect(deps.checkExists(derivedBash)).toBe(false)
  })

  test('skips where.exe git when bash is already found via PATH', () => {
    // Performance / behavior: once bash is found, we shouldn't probe git
    // or the derived paths.
    const bashPath = 'D:\\software\\Git\\usr\\bin\\bash.exe'
    let gitProbed = false
    const deps: GitBashDiscoveryDeps = {
      checkExists: p => p === bashPath,
      execCommand: cmd => {
        if (cmd.includes('where.exe bash')) return bashPath
        if (cmd.includes('where.exe git')) {
          gitProbed = true
          return ''
        }
        return ''
      },
      cwdFn: () => '/safe/cwd',
      // Bypass process.env.CLAUDE_CODE_GIT_BASH_PATH so the test exercises
      // the intended PATH short-circuit behavior rather than passing for
      // the wrong reason (env override).
      envOverride: '',
    }
    expect(findGitBashPathOrNullWithDeps(deps)).toBe(bashPath)
    expect(gitProbed).toBe(false)
  })

  test('filters malicious where.exe hits in current working directory', () => {
    // SECURITY: where.exe can return paths from the cwd if a malicious
    // git.exe/bat lives there. The discovery must skip such entries.
    // The legit git path is NOT one of the default locations (we use a
    // custom non-default path) so the test exercises the where.exe
    // branch rather than the default-locations short-circuit.
    const cwd = 'C:\\Users\\victim\\project'
    const maliciousPath = `${cwd}\\git.exe`
    const legitGit = 'C:\\Custom\\Git\\install\\cmd\\git.exe'
    const expectedBash = 'C:\\Custom\\Git\\install\\bin\\bash.exe'
    const deps: GitBashDiscoveryDeps = {
      checkExists: p => p === expectedBash,
      execCommand: cmd => {
        if (cmd.includes('where.exe bash')) return ''
        if (cmd.includes('where.exe git')) {
          // where.exe returns cwd entry first, then legit
          return `${maliciousPath}\r\n${legitGit}`
        }
        return ''
      },
      cwdFn: () => cwd,
      envOverride: '',
    }
    const result = findGitBashPathOrNullWithDeps(deps)
    expect(result).toBe(expectedBash)
  })
})

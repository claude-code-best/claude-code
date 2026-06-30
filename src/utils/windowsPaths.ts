import { existsSync } from 'fs'
import memoize from 'lodash-es/memoize.js'
import * as path from 'path'
import * as pathWin32 from 'path/win32'
import { getCwd } from './cwd.js'
import { logForDebugging } from './debug.js'
import { execSync_DEPRECATED } from './execSyncWrapper.js'
import { memoizeWithLRU } from './memoize.js'
import { getPlatform } from './platform.js'

/**
 * If Windows, set the SHELL environment variable to git-bash path.
 * This is used by BashTool and Shell.ts for user shell commands.
 * COMSPEC is left unchanged for system process execution.
 */
export function setShellIfWindows(): void {
  if (getPlatform() === 'windows') {
    const gitBashPath = findGitBashPath()
    process.env.SHELL = gitBashPath
    // Propagate to child processes so they skip filesystem probing
    process.env.CLAUDE_CODE_GIT_BASH_PATH = gitBashPath
    logForDebugging(`Using bash path: "${gitBashPath}"`)
  }
}

/**
 * Dependencies for git-bash discovery. Exposed as a parameter so the
 * discovery logic can be unit-tested without `mock.module` polluting
 * other tests in the same process (see CLAUDE.md "跨文件 mock 污染").
 */
export type GitBashDiscoveryDeps = {
  /** Returns true iff the path exists on disk. */
  checkExists: (filePath: string) => boolean
  /** Executes a shell command and returns its trimmed stdout. May throw. */
  execCommand: (cmd: string) => string
  /** Returns the current working directory (used to filter PATH-based lookups). */
  cwdFn: () => string
  /**
   * `USERPROFILE` used to derive Scoop Git install paths. When provided,
   * this is used instead of `process.env.USERPROFILE` — keeps the pure
   * helper hermetic so the Scoop fallback can be tested without
   * depending on the live environment.
   */
  userProfile?: string | undefined
  /**
   * Optional override for `process.env.CLAUDE_CODE_GIT_BASH_PATH`. When
   * provided, this is used instead of the live environment — useful for tests.
   */
  envOverride?: string | undefined
}

const DEFAULT_DEPS: GitBashDiscoveryDeps = {
  checkExists: existsSync,
  execCommand: cmd =>
    execSync_DEPRECATED(cmd, { stdio: 'pipe', encoding: 'utf8' }).trim(),
  cwdFn: getCwd,
  userProfile: process.env.USERPROFILE,
  envOverride: undefined,
}

/**
 * Search common install locations for bash.exe directly. Returns the first
 * existing candidate or null if none match. Used as a last-resort fallback
 * when `where.exe` cannot locate bash via PATH and git is also unknown.
 */
function searchDefaultBashLocations(
  checkExists: (p: string) => boolean,
  userProfile?: string,
): string | null {
  const candidates = [
    // Standard Git for Windows install locations (both layouts).
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
  ]
  // Scoop install: %USERPROFILE%\scoop\apps\git\current\usr\bin\bash.exe
  if (userProfile) {
    candidates.push(
      `${userProfile}\\scoop\\apps\\git\\current\\usr\\bin\\bash.exe`,
    )
  }
  for (const candidate of candidates) {
    if (checkExists(candidate)) {
      return candidate
    }
  }
  return null
}

/**
 * Look up an executable on Windows. Tries common install locations first
 * (for `git`), then falls back to `where.exe`. Filters out entries in the
 * current working directory to avoid executing malicious copies.
 *
 * Pure variant — takes its dependencies as parameters so it can be unit-tested
 * without process-global mocks.
 */
function findExecutableWithDeps(
  executable: string,
  deps: GitBashDiscoveryDeps,
): string | null {
  // For git, check common installation locations first
  if (executable === 'git') {
    const defaultLocations = [
      // check 64 bit before 32 bit
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      // intentionally don't look for C:\Program Files\Git\mingw64\bin\git.exe
      // because that directory is the "raw" tools with no environment setup
    ]

    for (const location of defaultLocations) {
      if (deps.checkExists(location)) {
        return location
      }
    }
  }

  // Fall back to where.exe
  try {
    const result = deps.execCommand(`where.exe ${executable}`)
    // SECURITY: Filter out any results from the current directory
    // to prevent executing malicious git.bat/cmd/exe files
    //
    // Use path.win32.* here so that `where.exe`'s Windows-style backslash
    // paths are evaluated with Windows semantics regardless of the host
    // OS. On POSIX, `path.resolve('C:\\foo')` treats the backslashes as
    // literal characters and produces a wrong (relative) result, which
    // would let cwd shadowing slip past this check. pathWin32 is
    // already imported for the bash derivation below.
    const paths = result
      .split(/\r?\n/)
      .map(p => p.trim())
      .filter(Boolean)
    const cwd = pathWin32.resolve(deps.cwdFn()).toLowerCase()

    for (const candidatePath of paths) {
      // Normalize and compare paths to ensure we're not in current directory
      const normalizedPath = pathWin32.resolve(candidatePath).toLowerCase()
      const pathDir = pathWin32.dirname(normalizedPath).toLowerCase()
      // path.win32.relative(cwd, pathDir) returns:
      //   ''               → pathDir === cwd
      //   '..' / '../...'   → pathDir is outside cwd (or above it)
      //   'subdir/...'     → pathDir is inside cwd
      // We reject entries whose dir is cwd itself or anywhere inside cwd.
      const relativePathDir = pathWin32.relative(cwd, pathDir)

      if (
        relativePathDir === '' ||
        (!relativePathDir.startsWith('..') &&
          !pathWin32.isAbsolute(relativePathDir))
      ) {
        logForDebugging(
          `Skipping potentially malicious executable in current directory: ${candidatePath}`,
        )
        continue
      }

      // Return the first valid path that's not in the current directory
      return candidatePath
    }

    return null
  } catch {
    return null
  }
}

/**
 * Pure discovery helper for git-bash.exe. Returns `null` if not found.
 * See `findGitBashPathOrNull` for production invocation.
 *
 * Exported for testing — tests can pass mock `checkExists`, `execCommand`,
 * and `cwdFn` to exercise each branch in isolation without polluting the
 * module registry (which would affect other tests via `mock.module`).
 */
export function findGitBashPathOrNullWithDeps(
  deps: GitBashDiscoveryDeps = DEFAULT_DEPS,
): string | null {
  const envOverride = deps.envOverride ?? process.env.CLAUDE_CODE_GIT_BASH_PATH

  // 1. Honor explicit CLAUDE_CODE_GIT_BASH_PATH override
  if (envOverride) {
    return deps.checkExists(envOverride) ? envOverride : null
  }

  // 2. Look up bash.exe directly via PATH. This is the most reliable
  //    method for non-default install locations (e.g. D:\software\Git\)
  //    where bash sits at <root>/usr/bin/bash.exe rather than the
  //    conventional <root>/bin/bash.exe.
  const fromPath = findExecutableWithDeps('bash', deps)
  if (fromPath && deps.checkExists(fromPath)) {
    return fromPath
  }

  // 3. Derive bash from git's location, trying multiple layouts since
  //    non-standard Git installs (scoop, chocolatey, manual / portable)
  //    place bash differently relative to git.exe.
  const gitPath = findExecutableWithDeps('git', deps)
  if (gitPath) {
    const candidates = [
      // Standard Git for Windows: git at <root>/cmd/git.exe, bash at <root>/bin/bash.exe
      pathWin32.join(gitPath, '..', '..', 'bin', 'bash.exe'),
      // PortableGit / custom installs: git at <root>/cmd/git.exe, bash at <root>/usr/bin/bash.exe
      pathWin32.join(gitPath, '..', '..', 'usr', 'bin', 'bash.exe'),
      // Some installs: git at <root>/bin/git.exe, bash at <root>/bin/bash.exe
      pathWin32.join(gitPath, '..', 'bash.exe'),
    ]
    for (const candidate of candidates) {
      if (deps.checkExists(candidate)) {
        return candidate
      }
    }
  }

  // 4. Last resort: scan common install locations for bash.exe directly
  return searchDefaultBashLocations(deps.checkExists, deps.userProfile)
}

/**
 * Find the path where `bash.exe` included with git-bash exists. Returns
 * `null` if no suitable bash.exe can be located.
 *
 * Discovery order (each step is skipped if the previous one resolves):
 *   1. `CLAUDE_CODE_GIT_BASH_PATH` env var, if set and the file exists
 *   2. `where.exe bash` lookup (works whenever Git Bash's bin dir is in PATH,
 *      e.g. portable installs at `D:\software\Git\` where bash is at
 *      `<root>/usr/bin/bash.exe` rather than the conventional `<root>/bin/bash.exe`)
 *   3. Derive from `where.exe git`, trying multiple relative layouts
 *      (standard Git for Windows, PortableGit, sibling install)
 *   4. Check common default install locations directly
 *
 * Memoized so repeated calls within the same process only search once.
 * Test-friendly variant: does NOT call `process.exit`, unlike `findGitBashPath`.
 */
export const findGitBashPathOrNull = memoize(() =>
  findGitBashPathOrNullWithDeps(),
)

/**
 * Find the path where `bash.exe` included with git-bash exists, exiting
 * the process if not found.
 *
 * Thin wrapper over `findGitBashPathOrNull` that handles the
 * `process.exit(1)` failure path. Exported separately so the discovery
 * logic in `findGitBashPathOrNullWithDeps` can be unit-tested without
 * invoking `process.exit`.
 */
export function findGitBashPath(): string {
  const result = findGitBashPathOrNull()
  if (result !== null) {
    return result
  }
  const envOverride = process.env.CLAUDE_CODE_GIT_BASH_PATH
  if (envOverride) {
    console.error(
      `Claude Code was unable to find CLAUDE_CODE_GIT_BASH_PATH path "${envOverride}"`,
    )
  } else {
    console.error(
      'Claude Code on Windows requires git-bash (https://git-scm.com/downloads/win). If installed but not in PATH, set environment variable pointing to your bash.exe, similar to: CLAUDE_CODE_GIT_BASH_PATH=C:\\Program Files\\Git\\bin\\bash.exe',
    )
  }
  // eslint-disable-next-line custom-rules/no-process-exit
  process.exit(1)
}

/** Convert a Windows path to a POSIX path using pure JS. */
export const windowsPathToPosixPath = memoizeWithLRU(
  (windowsPath: string): string => {
    // Handle UNC paths: \\server\share -> //server/share
    if (windowsPath.startsWith('\\\\')) {
      return windowsPath.replace(/\\/g, '/')
    }
    // Handle drive letter paths: C:\Users\foo -> /c/Users/foo
    const match = windowsPath.match(/^([A-Za-z]):[/\\]/)
    if (match) {
      const driveLetter = match[1]!.toLowerCase()
      return '/' + driveLetter + windowsPath.slice(2).replace(/\\/g, '/')
    }
    // Already POSIX or relative — just flip slashes
    return windowsPath.replace(/\\/g, '/')
  },
  (p: string) => p,
  500,
)

/** Convert a POSIX path to a Windows path using pure JS. */
export const posixPathToWindowsPath = memoizeWithLRU(
  (posixPath: string): string => {
    // Handle UNC paths: //server/share -> \\server\share
    if (posixPath.startsWith('//')) {
      return posixPath.replace(/\//g, '\\')
    }
    // Handle /cygdrive/c/... format
    const cygdriveMatch = posixPath.match(/^\/cygdrive\/([A-Za-z])(\/|$)/)
    if (cygdriveMatch) {
      const driveLetter = cygdriveMatch[1]!.toUpperCase()
      const rest = posixPath.slice(('/cygdrive/' + cygdriveMatch[1]).length)
      return driveLetter + ':' + (rest || '\\').replace(/\//g, '\\')
    }
    // Handle /c/... format (MSYS2/Git Bash)
    const driveMatch = posixPath.match(/^\/([A-Za-z])(\/|$)/)
    if (driveMatch) {
      const driveLetter = driveMatch[1]!.toUpperCase()
      const rest = posixPath.slice(2)
      return driveLetter + ':' + (rest || '\\').replace(/\//g, '\\')
    }
    // Already Windows or relative — just flip slashes
    return posixPath.replace(/\//g, '\\')
  },
  (p: string) => p,
  500,
)

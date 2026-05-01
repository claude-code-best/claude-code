import { mkdirSync, writeFileSync } from 'fs'
import {
  getApiKeyFromFd,
  getOauthTokenFromFd,
  setApiKeyFromFd,
  setOauthTokenFromFd,
} from '../bootstrap/state.js'
import { logForDebugging } from './debug.js'
import { isEnvTruthy } from './envUtils.js'
import { errorMessage, isENOENT } from './errors.js'
import { getFsImplementation } from './fsOperations.js'

/**
 * CCR 中众所周知的令牌文件位置。Go 环境管理器会创建
 * /home/claude/.claude/remote/ 并（最终）也会写入这些文件。
 * 在此之前，本模块在成功读取 FD 时写入这些文件，以便在 CCR 容器内生成的子进程
 * 能够找到令牌，而无需继承 FD —— 但子进程无法继承管道 FD（管道 FD 无法跨越 tmux/shell 边界）。
 */
const CCR_TOKEN_DIR = '/home/claude/.claude/remote'
export const CCR_OAUTH_TOKEN_PATH = `${CCR_TOKEN_DIR}/.oauth_token`
export const CCR_API_KEY_PATH = `${CCR_TOKEN_DIR}/.api_key`
export const CCR_SESSION_INGRESS_TOKEN_PATH = `${CCR_TOKEN_DIR}/.session_ingress_token`

/**
 * 尽力将令牌写入一个已知位置，供子进程访问。
 * 仅在 CCR 下生效：在 CCR 之外没有 /home/claude/ 目录，也没有理由将本应通过 FD 避免落盘的令牌写入磁盘。
 */
export function maybePersistTokenForSubprocesses(
  path: string,
  token: string,
  tokenName: string,
): void {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) {
    return
  }
  try {
    // eslint-disable-next-line custom-rules/no-sync-fs -- CCR 中的一次性启动写入，调用方为同步
    mkdirSync(CCR_TOKEN_DIR, { recursive: true, mode: 0o700 })
    // eslint-disable-next-line custom-rules/no-sync-fs -- CCR 中的一次性启动写入，调用方为同步
    writeFileSync(path, token, { encoding: 'utf8', mode: 0o600 })
    logForDebugging(`已将 ${tokenName} 持久化到 ${path} 供子进程访问`)
  } catch (error) {
    logForDebugging(
      `无法将 ${tokenName} 持久化到磁盘（非致命错误）: ${errorMessage(error)}`,
      { level: 'error' },
    )
  }
}

/**
 * 从已知文件中回退读取。该路径仅在 CCR 中存在（环境管理器会创建目录），
 * 因此文件不存在是其他环境中的预期情况 —— 视为“无回退”，而非错误。
 */
export function readTokenFromWellKnownFile(
  path: string,
  tokenName: string,
): string | null {
  try {
    const fsOps = getFsImplementation()
    // eslint-disable-next-line custom-rules/no-sync-fs -- CCR 子进程路径的回退读取，启动时一次性操作，调用方为同步
    const token = fsOps.readFileSync(path, { encoding: 'utf8' }).trim()
    if (!token) {
      return null
    }
    logForDebugging(`从已知文件 ${path} 读取到 ${tokenName}`)
    return token
  } catch (error) {
    // ENOENT 是 CCR 之外的预期结果 —— 保持静默。其他错误（如权限配置错误导致的 EACCES）
    // 值得记录到调试日志，以便子进程认证失败时不至于难以排查。
    if (!isENOENT(error)) {
      logForDebugging(
        `从 ${path} 读取 ${tokenName} 失败: ${errorMessage(error)}`,
        { level: 'debug' },
      )
    }
    return null
  }
}

/**
 * 共享的 FD 或已知文件凭据读取器。
 *
 * 优先级顺序：
 *  1. 文件描述符（旧有路径）—— 环境变量指向由 Go 环境管理器通过 cmd.ExtraFiles 传递的管道 FD。
 *     管道在第一次读取时耗尽，且无法跨越 exec/tmux 边界。
 *  2. 已知文件 —— 在成功读取 FD 时由本函数写入（最终环境管理器也会直接写入）。
 *     适用于无法继承 FD 的子进程。
 *
 * 如果两个来源都没有凭据，则返回 null。结果缓存在全局状态中。
 */
function getCredentialFromFd({
  envVar,
  wellKnownPath,
  label,
  getCached,
  setCached,
}: {
  envVar: string
  wellKnownPath: string
  label: string
  getCached: () => string | null | undefined
  setCached: (value: string | null) => void
}): string | null {
  const cached = getCached()
  if (cached !== undefined) {
    return cached
  }

  const fdEnv = process.env[envVar]
  if (!fdEnv) {
    // 没有 FD 环境变量 —— 要么不在 CCR 中，要么是子进程且其父进程已剥离了（无用的）FD 环境变量。尝试已知文件。
    const fromFile = readTokenFromWellKnownFile(wellKnownPath, label)
    setCached(fromFile)
    return fromFile
  }

  const fd = parseInt(fdEnv, 10)
  if (Number.isNaN(fd)) {
    logForDebugging(
      `${envVar} 必须是有效的文件描述符编号，当前值为: ${fdEnv}`,
      { level: 'error' },
    )
    setCached(null)
    return null
  }

  try {
    // 在 macOS/BSD 上使用 /dev/fd，在 Linux 上使用 /proc/self/fd
    const fsOps = getFsImplementation()
    const fdPath =
      process.platform === 'darwin' || process.platform === 'freebsd'
        ? `/dev/fd/${fd}`
        : `/proc/self/fd/${fd}`

    // eslint-disable-next-line custom-rules/no-sync-fs -- 旧有 FD 路径，启动时读取一次，调用方为同步
    const token = fsOps.readFileSync(fdPath, { encoding: 'utf8' }).trim()
    if (!token) {
      logForDebugging(`文件描述符包含空的 ${label}`, {
        level: 'error',
      })
      setCached(null)
      return null
    }
    logForDebugging(`成功从文件描述符 ${fd} 读取 ${label}`)
    setCached(token)
    maybePersistTokenForSubprocesses(wellKnownPath, token, label)
    return token
  } catch (error) {
    logForDebugging(
      `从文件描述符 ${fd} 读取 ${label} 失败: ${errorMessage(error)}`,
      { level: 'error' },
    )
    // 设置了 FD 环境变量但读取失败 —— 通常是继承了环境变量但未继承 FD 的子进程（ENXIO）。尝试已知文件。
    const fromFile = readTokenFromWellKnownFile(wellKnownPath, label)
    setCached(fromFile)
    return fromFile
  }
}

/**
 * 获取 CCR 注入的 OAuth 令牌。关于 FD 与磁盘的权衡，参见 getCredentialFromFd。
 * 环境变量: CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR。
 * 已知文件: /home/claude/.claude/remote/.oauth_token。
 */
export function getOAuthTokenFromFileDescriptor(): string | null {
  return getCredentialFromFd({
    envVar: 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
    wellKnownPath: CCR_OAUTH_TOKEN_PATH,
    label: 'OAuth token',
    getCached: getOauthTokenFromFd,
    setCached: setOauthTokenFromFd,
  })
}

/**
 * 获取 CCR 注入的 API 密钥。关于 FD 与磁盘的权衡，参见 getCredentialFromFd。
 * 环境变量: CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR。
 * 已知文件: /home/claude/.claude/remote/.api_key。
 */
export function getApiKeyFromFileDescriptor(): string | null {
  return getCredentialFromFd({
    envVar: 'CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR',
    wellKnownPath: CCR_API_KEY_PATH,
    label: 'API key',
    getCached: getApiKeyFromFd,
    setCached: setApiKeyFromFd,
  })
}
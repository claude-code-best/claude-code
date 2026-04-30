import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com'
export const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c'

export interface AccountData {
  token: string
  baseUrl: string
  userId?: string
  savedAt: string
}

export function getStateDir(): string {
  const dir =
    process.env.WEIXIN_STATE_DIR ||
    join(homedir(), '.claude', 'channels', 'weixin')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function accountPath(): string {
  return join(getStateDir(), 'account.json')
}

export function loadAccount(): AccountData | null {
  const path = accountPath()
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as AccountData
  } catch {
    return null
  }
}

export function saveAccount(data: AccountData): void {
  const path = accountPath()
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  chmodSync(path, 0o600)
}

export function clearAccount(): void {
  const path = accountPath()
  if (existsSync(path)) {
    unlinkSync(path)
  }
}

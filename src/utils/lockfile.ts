/**
 * proper-lockfile 的惰性访问器。
 *
 * proper-lockfile 依赖 graceful-fs，后者在首次 require 时会猴子补丁（monkey-patch）每个 fs 方法（约 8ms）。
 * 即使没有发生锁定操作（例如执行 `--help`），静态导入 proper-lockfile 也会将这一开销引入启动路径。
 *
 * 请导入本模块，而不是直接导入 `proper-lockfile`。只有在第一次实际调用锁定函数时，才会加载底层的包。
 */

import type { CheckOptions, LockOptions, UnlockOptions } from 'proper-lockfile'

type Lockfile = typeof import('proper-lockfile')

let _lockfile: Lockfile | undefined

function getLockfile(): Lockfile {
  if (!_lockfile) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _lockfile = require('proper-lockfile') as Lockfile
  }
  return _lockfile
}

export function lock(
  file: string,
  options?: LockOptions,
): Promise<() => Promise<void>> {
  return getLockfile().lock(file, options)
}

export function lockSync(file: string, options?: LockOptions): () => void {
  return getLockfile().lockSync(file, options)
}

export function unlock(file: string, options?: UnlockOptions): Promise<void> {
  return getLockfile().unlock(file, options)
}

export function check(file: string, options?: CheckOptions): Promise<boolean> {
  return getLockfile().check(file, options)
}

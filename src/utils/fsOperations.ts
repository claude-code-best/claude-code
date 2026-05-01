import * as fs from 'fs'
import {
  mkdir as mkdirPromise,
  open,
  readdir as readdirPromise,
  readFile as readFilePromise,
  rename as renamePromise,
  rmdir as rmdirPromise,
  rm as rmPromise,
  stat as statPromise,
  unlink as unlinkPromise,
} from 'fs/promises'
import { homedir } from 'os'
import * as nodePath from 'path'
import { getErrnoCode } from './errors.js'
import { slowLogging } from './slowOperations.js'

/** 基于 Node.js fs 模块的简化文件系统操作接口。
提供常用同步操作的子集，并带有类型安全。
允许为替代实现（例如 mock、virtual）提供抽象。 */
export type FsOperations = {
  // 文件访问与信息操作
  /** 获取当前工作目录 */
  cwd(): string
  /** 检查文件或目录是否存在 */
  existsSync(path: string): boolean
  /** 异步获取文件状态 */
  stat(path: string): Promise<fs.Stats>
  /** 异步列出目录内容并附带文件类型信息 */
  readdir(path: string): Promise<fs.Dirent[]>
  /** 异步删除文件 */
  unlink(path: string): Promise<void>
  /** 异步删除空目录 */
  rmdir(path: string): Promise<void>
  /** 异步删除文件和目录（支持递归选项） */
  rm(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<void>
  /** 异步递归创建目录。 */
  mkdir(path: string, options?: { mode?: number }): Promise<void>
  /** 异步将文件内容读取为字符串 */
  readFile(path: string, options: { encoding: BufferEncoding }): Promise<string>
  /** 异步重命名/移动文件 */
  rename(oldPath: string, newPath: string): Promise<void>
  /** 获取文件状态 */
  statSync(path: string): fs.Stats
  /** 获取文件状态，不跟踪符号链接 */
  lstatSync(path: string): fs.Stats

  // 文件内容操作
  /** 使用指定编码将文件内容读取为字符串 */
  readFileSync(
    path: string,
    options: {
      encoding: BufferEncoding
    },
  ): string
  /** 将原始文件字节读取为 Buffer */
  readFileBytesSync(path: string): Buffer
  /** 从文件开头读取指定字节数 */
  readSync(
    path: string,
    options: {
      length: number
    },
  ): {
    buffer: Buffer
    bytesRead: number
  }
  /** 向文件追加字符串 */
  appendFileSync(path: string, data: string, options?: { mode?: number }): void
  /** 将文件从源路径复制到目标路径 */
  copyFileSync(src: string, dest: string): void
  /** 删除文件 */
  unlinkSync(path: string): void
  /** 重命名/移动文件 */
  renameSync(oldPath: string, newPath: string): void
  /** 创建硬链接 */
  linkSync(target: string, path: string): void
  /** 创建符号链接 */
  symlinkSync(
    target: string,
    path: string,
    type?: 'dir' | 'file' | 'junction',
  ): void
  /** 读取符号链接 */
  readlinkSync(path: string): string
  /** 解析符号链接并返回规范路径名 */
  realpathSync(path: string): string

  // 目录操作
  /** 递归创建目录。若未指定，模式默认为 0o777 & ~umask。 */
  mkdirSync(
    path: string,
    options?: {
      mode?: number
    },
  ): void
  /** 列出目录内容并附带文件类型信息 */
  readdirSync(path: string): fs.Dirent[]
  /** 将目录内容列出为字符串 */
  readdirStringSync(path: string): string[]
  /** 检查目录是否为空 */
  isDirEmptySync(path: string): boolean
  /** 删除空目录 */
  rmdirSync(path: string): void
  /** 删除文件和目录（支持递归选项） */
  rmSync(
    path: string,
    options?: {
      recursive?: boolean
      force?: boolean
    },
  ): void
  /** 创建一个可写流，用于将数据写入文件。 */
  createWriteStream(path: string): fs.WriteStream
  /** 异步将原始文件字节读取为 Buffer。
当设置了 maxBytes 时，仅读取最多该字节数。 */
  readFileBytes(path: string, maxBytes?: number): Promise<Buffer>
}

/** 安全地解析文件路径，优雅地处理符号链接和错误。

错误处理策略：
- 如果文件不存在，返回原始路径（允许创建文件）
- 如果符号链接解析失败（损坏的符号链接、权限拒绝、循环链接），
  返回原始路径并将其标记为非符号链接
- 这确保操作可以继续使用原始路径，而不是失败

@param fs 要使用的文件系统实现
@param filePath 要解析的路径
@returns 包含解析后的路径以及是否为符号链接的对象 */
export function safeResolvePath(
  fs: FsOperations,
  filePath: string,
): { resolvedPath: string; isSymlink: boolean; isCanonical: boolean } {
  // 在任何文件系统访问之前阻止 UNC 路径，以防止在 Windo
  // ws 上验证期间发起网络请求（DNS/SMB）
  if (filePath.startsWith('//') || filePath.startsWith('\\\\')) {
    return { resolvedPath: filePath, isSymlink: false, isCanonical: false }
  }

  try {
    // 在调用 realpathSync 之前检查特殊文件类型（FIFO、套接字、设备）
    // 。realpathSync 可能会在 FIFO 上阻塞等待写入者，
    // 导致挂起。如果文件不存在，lstatSync 会抛出 ENOEN
    // T，下面的 catch 会通过返回原始路径来处理（允许创建文件）。
    const stats = fs.lstatSync(filePath)
    if (
      stats.isFIFO() ||
      stats.isSocket() ||
      stats.isCharacterDevice() ||
      stats.isBlockDevice()
    ) {
      return { resolvedPath: filePath, isSymlink: false, isCanonical: false }
    }

    const resolvedPath = fs.realpathSync(filePath)
    return {
      resolvedPath,
      isSymlink: resolvedPath !== filePath,
      // realpathSync 返回：resolvedPath 是规范
      // 的（所有路径组件中的符号链接都已解析）。调用者可以在此路径上跳
      // 过进一步的符号链接解析。
      isCanonical: true,
    }
  } catch (_error) {
    // 如果 lstat/realpath 因任何原因失败（ENOENT
    // 、损坏的符号链接、EACCES、ELOOP 等），返回原始路径以允
    // 许操作继续
    return { resolvedPath: filePath, isSymlink: false, isCanonical: false }
  }
}

/** 检查文件路径是否重复并应跳过。
解析符号链接以检测指向同一文件的重复项。
如果不是重复项，则将解析后的路径添加到 loadedPaths。

@returns 如果文件应跳过（是重复项），则返回 true */
export function isDuplicatePath(
  fs: FsOperations,
  filePath: string,
  loadedPaths: Set<string>,
): boolean {
  const { resolvedPath } = safeResolvePath(fs, filePath)
  if (loadedPaths.has(resolvedPath)) {
    return true
  }
  loadedPaths.add(resolvedPath)
  return false
}

/** 通过 realpathSync 解析路径的最深层已存在的祖先，向上遍历直到成功。通过 lstat 检测悬挂符号链接（链接条目存在，目标不存在）并通过 readlink 解析。

当输入路径可能不存在（新文件写入）并且你需要知道写入在操作系统跟随符号链接后实际到达的位置时使用。

返回解析后的绝对路径，并重新连接不存在的尾部段，如果在任何已存在的祖先中未找到符号链接，则返回 undefined（路径的已存在祖先都解析为自身）。

处理：活动的父符号链接、悬挂的文件符号链接、悬挂的父符号链接。与 teamMemPaths.ts:realpathDeepestExisting 相同的核心算法。 */
export function resolveDeepestExistingAncestorSync(
  fs: FsOperations,
  absolutePath: string,
): string | undefined {
  let dir = absolutePath
  const segments: string[] = []
  // 使用 lstat（廉价，O(1)）向上遍历以找到第一个已存在的组件。
  // lstat 不跟踪符号链接，因此此处可检测到悬挂符号链接。仅在最后调
  // 用一次 realpathSync（昂贵，O(depth)）。
  while (dir !== nodePath.dirname(dir)) {
    let st: fs.Stats
    try {
      st = fs.lstatSync(dir)
    } catch {
      // lstat 失败：真正不存在。向上遍历。
      segments.unshift(nodePath.basename(dir))
      dir = nodePath.dirname(dir)
      continue
    }
    if (st.isSymbolicLink()) {
      // 找到符号链接（活动的或悬挂的）。首先尝试 realpath（解
      // 析链式符号链接）；对于悬挂符号链接，回退到 readlink。
      try {
        const resolved = fs.realpathSync(dir)
        return segments.length === 0
          ? resolved
          : nodePath.join(resolved, ...segments)
      } catch {
        // 悬挂：realpath 失败但 lstat 看到了链接条目。
        const target = fs.readlinkSync(dir)
        const absTarget = nodePath.isAbsolute(target)
          ? target
          : nodePath.resolve(nodePath.dirname(dir), target)
        return segments.length === 0
          ? absTarget
          : nodePath.join(absTarget, ...segments)
      }
    }
    // 已存在的非符号链接组件。一次 realpath 调用可解析其祖先
    // 中的任何符号链接。如果没有，返回 undefined（无符号链接）。
    try {
      const resolved = fs.realpathSync(dir)
      if (resolved !== dir) {
        return segments.length === 0
          ? resolved
          : nodePath.join(resolved, ...segments)
      }
    } catch {
      // realpath 仍可能失败（例如祖先中的 EACCES）。
      // 返回 undefined — 我们无法解析，且逻辑路径已在 pa
      // thSet 中供调用者使用。
    }
    return undefined
  }
  return undefined
}

/** 获取所有应检查权限的路径。
这包括原始路径、链中的所有中间符号链接目标以及最终解析的路径。

例如，如果 test.txt -> /etc/passwd -> /private/etc/passwd：
- test.txt（原始路径）
- /etc/passwd（中间符号链接目标）
- /private/etc/passwd（最终解析的路径）

这对安全性很重要：针对 /etc/passwd 的拒绝规则应阻止访问，即使文件实际位于 /private/etc/passwd（如在 macOS 上）。

@param path - 要检查的路径（将转换为绝对路径）
@returns 要检查权限的绝对路径数组 */
export function getPathsForPermissionCheck(inputPath: string): string[] {
  // 防御性地展开波浪号表示法 - 工具应在 getPath()
  // 中执行此操作，但此处我们作为权限检查的纵深防御进行规范化
  let path = inputPath
  if (path === '~') {
    path = homedir().normalize('NFC')
  } else if (path.startsWith('~/')) {
    path = nodePath.join(homedir().normalize('NFC'), path.slice(2))
  }

  const pathSet = new Set<string>()
  const fsImpl = getFsImplementation()

  // 始终检查原始路径
  pathSet.add(path)

  // 在任何文件系统访问之前阻止 UNC 路径，以防止在 Windo
  // ws 上验证期间发起网络请求（DNS/SMB）
  if (path.startsWith('//') || path.startsWith('\\\\')) {
    return Array.from(pathSet)
  }

  // 跟踪符号链接链，收集所有中间目标。这处理诸如：test.txt -> /
  // etc/passwd -> /private/etc/passwd 的情况。我们希望
  // 检查所有三个路径，而不仅仅是 test.txt 和 /private/etc/passwd
  try {
    let currentPath = path
    const visited = new Set<string>()
    const maxDepth = 40 // 防止失控循环，匹配典型的 SYMLOOP_MAX

    for (let depth = 0; depth < maxDepth; depth++) {
      // 防止循环符号链接导致的无限循环
      if (visited.has(currentPath)) {
        break
      }
      visited.add(currentPath)

      if (!fsImpl.existsSync(currentPath)) {
        // 路径不存在（新文件情况）。existsSync 跟踪符号链
        // 接，因此这也适用于悬挂符号链接（链接条目存在，目标不存在）。
        // 解析路径及其祖先中的符号链接，以便权限检查看到真实目标。如
        // 果没有这个，`./data -> /etc/cron.d
        // /`（活动的父符号链接）或 `./evil.t
        // xt -> ~/.ssh/authorized_keys2
        // `（悬挂的文件符号链接）将允许写入逃逸工作目录。
        if (currentPath === path) {
          const resolved = resolveDeepestExistingAncestorSync(fsImpl, path)
          if (resolved !== undefined) {
            pathSet.add(resolved)
          }
        }
        break
      }

      const stats = fsImpl.lstatSync(currentPath)

      // 跳过可能导致问题的特殊文件类型
      if (
        stats.isFIFO() ||
        stats.isSocket() ||
        stats.isCharacterDevice() ||
        stats.isBlockDevice()
      ) {
        break
      }

      if (!stats.isSymbolicLink()) {
        break
      }

      // 获取直接的符号链接目标
      const target = fsImpl.readlinkSync(currentPath)

      // 如果目标是相对路径，则相对于符号链接所在目录进行解析
      const absoluteTarget = nodePath.isAbsolute(target)
        ? target
        : nodePath.resolve(nodePath.dirname(currentPath), target)

      // 将此中间目标添加到集合中
      pathSet.add(absoluteTarget)
      currentPath = absoluteTarget
    }
  } catch {
    // 如果在链遍历过程中出现任何失败，则继续使用已获取的内容
  }

  // 另外，使用 realpathSync 添加最终解析的路径
  // 以确保完整性。这处理目录组件中任何剩余的符号链接
  const { resolvedPath, isSymlink } = safeResolvePath(fsImpl, path)
  if (isSymlink && resolvedPath !== path) {
    pathSet.add(resolvedPath)
  }

  return Array.from(pathSet)
}

export const NodeFsOperations: FsOperations = {
  cwd() {
    return process.cwd()
  },

  existsSync(fsPath) {
    using _ = slowLogging`fs.existsSync(${fsPath})`
    return fs.existsSync(fsPath)
  },

  async stat(fsPath) {
    return statPromise(fsPath)
  },

  async readdir(fsPath) {
    return readdirPromise(fsPath, { withFileTypes: true })
  },

  async unlink(fsPath) {
    return unlinkPromise(fsPath)
  },

  async rmdir(fsPath) {
    return rmdirPromise(fsPath)
  },

  async rm(fsPath, options) {
    return rmPromise(fsPath, options)
  },

  async mkdir(dirPath, options) {
    try {
      await mkdirPromise(dirPath, { recursive: true, ...options })
    } catch (e) {
      // Bun/Windows：recursive:true 在设置了 FILE_ATTRIBUTE_R
      // EADONLY 位的目录上抛出 EEXIST（组策略、OneDrive、desktop.ini）。Bun
      // 的 directoryExistsAt 将 DIRECTORY+READONLY 错误分类为非目录（
      // bun-internal src/sys.zig existsAtType）。目录存在；忽略。
      // https://github.com/anthropics/claude-code/issues/30924
      if (getErrnoCode(e) !== 'EEXIST') throw e
    }
  },

  async readFile(fsPath, options) {
    return readFilePromise(fsPath, { encoding: options.encoding })
  },

  async rename(oldPath, newPath) {
    return renamePromise(oldPath, newPath)
  },

  statSync(fsPath) {
    using _ = slowLogging`fs.statSync(${fsPath})`
    return fs.statSync(fsPath)
  },

  lstatSync(fsPath) {
    using _ = slowLogging`fs.lstatSync(${fsPath})`
    return fs.lstatSync(fsPath)
  },

  readFileSync(fsPath, options) {
    using _ = slowLogging`fs.readFileSync(${fsPath})`
    return fs.readFileSync(fsPath, { encoding: options.encoding })
  },

  readFileBytesSync(fsPath) {
    using _ = slowLogging`fs.readFileBytesSync(${fsPath})`
    return fs.readFileSync(fsPath)
  },

  readSync(fsPath, options) {
    using _ = slowLogging`fs.readSync(${fsPath}, ${options.length} 字节)`
    let fd: number | undefined
    try {
      fd = fs.openSync(fsPath, 'r')
      const buffer = Buffer.alloc(options.length)
      const bytesRead = fs.readSync(fd, buffer, 0, options.length, 0)
      return { buffer, bytesRead }
    } finally {
      if (fd) fs.closeSync(fd)
    }
  },

  appendFileSync(path, data, options) {
    using _ = slowLogging`fs.appendFileSync(${path}, ${data.length} 个字符)`
    // 对于具有显式模式的新文件，使用 'ax'（原子创建并设置模式）以避免存
    // 在性检查和打开之间的 TOCTOU 竞争。如果文件已存在，则回退到普通追加。
    if (options?.mode !== undefined) {
      try {
        const fd = fs.openSync(path, 'ax', options.mode)
        try {
          fs.appendFileSync(fd, data)
        } finally {
          fs.closeSync(fd)
        }
        return
      } catch (e) {
        if (getErrnoCode(e) !== 'EEXIST') throw e
        // 文件已存在 — 回退到普通追加
      }
    }
    fs.appendFileSync(path, data)
  },

  copyFileSync(src, dest) {
    using _ = slowLogging`fs.copyFileSync(${src} → ${dest})`
    fs.copyFileSync(src, dest)
  },

  unlinkSync(path: string) {
    using _ = slowLogging`fs.unlinkSync(${path})`
    fs.unlinkSync(path)
  },

  renameSync(oldPath: string, newPath: string) {
    using _ = slowLogging`fs.renameSync(${oldPath} → ${newPath})`
    fs.renameSync(oldPath, newPath)
  },

  linkSync(target: string, path: string) {
    using _ = slowLogging`fs.linkSync(${target} → ${path})`
    fs.linkSync(target, path)
  },

  symlinkSync(
    target: string,
    path: string,
    type?: 'dir' | 'file' | 'junction',
  ) {
    using _ = slowLogging`fs.symlinkSync(${target} → ${path})`
    fs.symlinkSync(target, path, type)
  },

  readlinkSync(path: string) {
    using _ = slowLogging`fs.readlinkSync(${path})`
    return fs.readlinkSync(path)
  },

  realpathSync(path: string) {
    using _ = slowLogging`fs.realpathSync(${path})`
    return fs.realpathSync(path).normalize('NFC')
  },

  mkdirSync(dirPath, options) {
    using _ = slowLogging`fs.mkdirSync(${dirPath})`
    const mkdirOptions: { recursive: boolean; mode?: number } = {
      recursive: true,
    }
    if (options?.mode !== undefined) {
      mkdirOptions.mode = options.mode
    }
    try {
      fs.mkdirSync(dirPath, mkdirOptions)
    } catch (e) {
      // Bun/Windows：当目录设置了 FILE_ATTRIBUTE_READONLY 位（组策略、One
      // Drive、desktop.ini）时，recursive:true 会抛出 EEXIST 错误。Bun 的 d
      // irectoryExistsAt 将 DIRECTORY+READONLY 错误归类为非目录（bun-inte
      // rnal 的 src/sys.zig 中的 existsAtType）。该目录实际存在，忽略此问题。
      // https://github.com/anthropics/claude-code/issues/30924
      if (getErrnoCode(e) !== 'EEXIST') throw e
    }
  },

  readdirSync(dirPath) {
    using _ = slowLogging`fs.readdirSync(${dirPath})`
    return fs.readdirSync(dirPath, { withFileTypes: true })
  },

  readdirStringSync(dirPath) {
    using _ = slowLogging`fs.readdirStringSync(${dirPath})`
    return fs.readdirSync(dirPath)
  },

  isDirEmptySync(dirPath) {
    using _ = slowLogging`fs.isDirEmptySync(${dirPath})`
    const files = this.readdirSync(dirPath)
    return files.length === 0
  },

  rmdirSync(dirPath) {
    using _ = slowLogging`fs.rmdirSync(${dirPath})`
    fs.rmdirSync(dirPath)
  },

  rmSync(path, options) {
    using _ = slowLogging`fs.rmSync(${path})`
    fs.rmSync(path, options)
  },

  createWriteStream(path: string) {
    return fs.createWriteStream(path)
  },

  async readFileBytes(fsPath: string, maxBytes?: number) {
    if (maxBytes === undefined) {
      return readFilePromise(fsPath)
    }
    const handle = await open(fsPath, 'r')
    try {
      const { size } = await handle.stat()
      const readSize = Math.min(size, maxBytes)
      const buffer = Buffer.allocUnsafe(readSize)
      let offset = 0
      while (offset < readSize) {
        const { bytesRead } = await handle.read(
          buffer,
          offset,
          readSize - offset,
          offset,
        )
        if (bytesRead === 0) break
        offset += bytesRead
      }
      return offset < readSize ? buffer.subarray(0, offset) : buffer
    } finally {
      await handle.close()
    }
  },
}

// 当前活跃的文件系统实现
let activeFs: FsOperations = NodeFsOperations

/** 覆盖文件系统实现。注意：此函数不会自动更新当前工作目录。
@param implementation 要使用的文件系统实现 */
export function setFsImplementation(implementation: FsOperations): void {
  activeFs = implementation
}

/** 获取当前活跃的文件系统实现
@returns 当前活跃的文件系统实现 */
export function getFsImplementation(): FsOperations {
  return activeFs
}

/** 将文件系统实现重置为默认的 Node.js 实现。
注意：此函数不会自动更新当前工作目录。 */
export function setOriginalFsImplementation(): void {
  activeFs = NodeFsOperations
}

export type ReadFileRangeResult = {
  content: string
  bytesRead: number
  bytesTotal: number
}

/** 从文件中 `offset` 位置开始读取最多 `maxBytes` 字节。
返回从 Buffer 转换的纯字符串——不会产生指向更大父缓冲区的切片字符串引用。如果文件小于偏移量，则返回 null。 */
export async function readFileRange(
  path: string,
  offset: number,
  maxBytes: number,
): Promise<ReadFileRangeResult | null> {
  await using fh = await open(path, 'r')
  const size = (await fh.stat()).size
  if (size <= offset) {
    return null
  }
  const bytesToRead = Math.min(size - offset, maxBytes)
  const buffer = Buffer.allocUnsafe(bytesToRead)

  let totalRead = 0
  while (totalRead < bytesToRead) {
    const { bytesRead } = await fh.read(
      buffer,
      totalRead,
      bytesToRead - totalRead,
      offset + totalRead,
    )
    if (bytesRead === 0) {
      break
    }
    totalRead += bytesRead
  }

  return {
    content: buffer.toString('utf8', 0, totalRead),
    bytesRead: totalRead,
    bytesTotal: size,
  }
}

/** 读取文件末尾的 `maxBytes` 字节。
如果文件小于 maxBytes，则返回整个文件。 */
export async function tailFile(
  path: string,
  maxBytes: number,
): Promise<ReadFileRangeResult> {
  await using fh = await open(path, 'r')
  const size = (await fh.stat()).size
  if (size === 0) {
    return { content: '', bytesRead: 0, bytesTotal: 0 }
  }
  const offset = Math.max(0, size - maxBytes)
  const bytesToRead = size - offset
  const buffer = Buffer.allocUnsafe(bytesToRead)

  let totalRead = 0
  while (totalRead < bytesToRead) {
    const { bytesRead } = await fh.read(
      buffer,
      totalRead,
      bytesToRead - totalRead,
      offset + totalRead,
    )
    if (bytesRead === 0) {
      break
    }
    totalRead += bytesRead
  }

  return {
    content: buffer.toString('utf8', 0, totalRead),
    bytesRead: totalRead,
    bytesTotal: size,
  }
}

/** 异步生成器，按逆序从文件中逐行产出内容。
以块为单位从文件末尾向前读取，避免将整个文件加载到内存中。
@param path - 要读取的文件路径
@returns 按逆序产出行的异步生成器 */
export async function* readLinesReverse(
  path: string,
): AsyncGenerator<string, void, undefined> {
  const CHUNK_SIZE = 1024 * 4
  const fileHandle = await open(path, 'r')
  try {
    const stats = await fileHandle.stat()
    let position = stats.size
    // 跨块边界携带原始字节（而非解码后的字符串），以避免被 4KB
    // 边界分割的多字节 UTF-8 序列损坏。按块解码会将分割的序列
    // 两侧都变成 U+FFFD，对于 history.jsonl 来说
    // ，这意味着 JSON.parse 会抛出异常，导致该条目被丢弃。
    let remainder = Buffer.alloc(0)
    const buffer = Buffer.alloc(CHUNK_SIZE)

    while (position > 0) {
      const currentChunkSize = Math.min(CHUNK_SIZE, position)
      position -= currentChunkSize

      await fileHandle.read(buffer, 0, currentChunkSize, position)
      const combined = Buffer.concat([
        buffer.subarray(0, currentChunkSize),
        remainder,
      ])

      const firstNewline = combined.indexOf(0x0a)
      if (firstNewline === -1) {
        remainder = combined
        continue
      }

      remainder = Buffer.from(combined.subarray(0, firstNewline))
      const lines = combined.toString('utf8', firstNewline + 1).split('\n')

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]!
        if (line) {
          yield line
        }
      }
    }

    if (remainder.length > 0) {
      yield remainder.toString('utf8')
    }
  } finally {
    await fileHandle.close()
  }
}

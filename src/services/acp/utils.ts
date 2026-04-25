/**
 * Shared utilities for the ACP service.
 * Ported from claude-agent-acp-main/src/utils.ts and acp-agent.ts helpers.
 */
import { Readable, Writable } from 'node:stream'
import type { PermissionMode } from '../../entrypoints/sdk/coreTypes.generated.js'

// ── Pushable ──────────────────────────────────────────────────────

/**
 * A pushable async iterable: allows you to push items and consume them
 * with for-await. Useful for bridging push-based and async-iterator-based code.
 */
export class Pushable<T> implements AsyncIterable<T> {
  private queue: T[] = []
  private resolvers: ((value: IteratorResult<T>) => void)[] = []
  private done = false

  push(item: T) {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!
      resolve({ value: item, done: false })
    } else {
      this.queue.push(item)
    }
  }

  end() {
    this.done = true
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!
      resolve({ value: undefined as unknown as T, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.queue.length > 0) {
          const value = this.queue.shift()!
          return Promise.resolve({ value, done: false })
        }
        if (this.done) {
          return Promise.resolve({
            value: undefined as unknown as T,
            done: true,
          })
        }
        return new Promise<IteratorResult<T>>(resolve => {
          this.resolvers.push(resolve)
        })
      },
    }
  }
}

// ── Stream helpers ────────────────────────────────────────────────

export function nodeToWebWritable(
  nodeStream: Writable,
): WritableStream<Uint8Array> {
  return new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        nodeStream.write(Buffer.from(chunk), err => {
          if (err) reject(err)
          else resolve()
        })
      })
    },
  })
}

export function nodeToWebReadable(
  nodeStream: Readable,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk))
      })
      nodeStream.on('end', () => controller.close())
      nodeStream.on('error', err => controller.error(err))
    },
  })
}

// ── unreachable ───────────────────────────────────────────────────

export function unreachable(
  value: never,
  logger: { error: (...args: unknown[]) => void } = console,
): void {
  let valueAsString: unknown
  try {
    valueAsString = JSON.stringify(value)
  } catch {
    valueAsString = value
  }
  logger.error(`Unexpected case: ${valueAsString}`)
}

// ── Permission mode resolution ────────────────────────────────────

// Bypass Permissions doesn't work if we are a root/sudo user
const IS_ROOT =
  typeof process.geteuid === 'function'
    ? process.geteuid() === 0
    : typeof process.getuid === 'function'
      ? process.getuid() === 0
      : false
const ALLOW_BYPASS = !IS_ROOT || !!process.env.IS_SANDBOX

const PERMISSION_MODE_ALIASES: Record<string, PermissionMode> = {
  auto: 'auto',
  default: 'default',
  acceptedits: 'acceptEdits',
  dontask: 'dontAsk',
  plan: 'plan',
  bypasspermissions: 'bypassPermissions',
  bypass: 'bypassPermissions',
}

export function resolvePermissionMode(
  defaultMode?: unknown,
  source = 'permissions.defaultMode',
): PermissionMode {
  if (defaultMode === undefined) {
    return 'default'
  }

  if (typeof defaultMode !== 'string') {
    throw new Error(`Invalid ${source}: expected a string.`)
  }

  const normalized = defaultMode.trim().toLowerCase()
  if (normalized === '') {
    throw new Error(`Invalid ${source}: expected a non-empty string.`)
  }

  const mapped = PERMISSION_MODE_ALIASES[normalized]
  if (!mapped) {
    throw new Error(`Invalid ${source}: ${defaultMode}.`)
  }

  if (mapped === 'bypassPermissions' && !ALLOW_BYPASS) {
    throw new Error(
      `Invalid ${source}: bypassPermissions is not available when running as root.`,
    )
  }

  return mapped
}

// ── Session fingerprint ───────────────────────────────────────────

/**
 * Compute a stable fingerprint of the session-defining params so we can
 * detect when a loadSession/resumeSession call requires tearing down and
 * recreating the underlying QueryEngine.
 */
export function computeSessionFingerprint(params: {
  cwd: string
  mcpServers?: Array<{ name: string; [key: string]: unknown }>
}): string {
  const servers = [...(params.mcpServers ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  return JSON.stringify({ cwd: params.cwd, mcpServers: servers })
}

// ── Title sanitization ────────────────────────────────────────────

const MAX_TITLE_LENGTH = 256

export function sanitizeTitle(text: string): string {
  const sanitized = text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (sanitized.length <= MAX_TITLE_LENGTH) {
    return sanitized
  }
  return sanitized.slice(0, MAX_TITLE_LENGTH - 1) + '…'
}

// ── Path display helpers ──────────────────────────────────────────

import * as path from 'node:path'

/**
 * Convert an absolute file path to a project-relative path for display.
 * Returns the original path if it's outside the project directory or if no cwd is provided.
 */
export function toDisplayPath(filePath: string, cwd?: string): string {
  if (!cwd) return filePath
  const resolvedCwd = path.resolve(cwd)
  const resolvedFile = path.resolve(filePath)
  if (
    resolvedFile.startsWith(resolvedCwd + path.sep) ||
    resolvedFile === resolvedCwd
  ) {
    return path.relative(resolvedCwd, resolvedFile).replaceAll('\\', '/')
  }
  return filePath
}

// ── Markdown helpers ──────────────────────────────────────────────

export function markdownEscape(text: string): string {
  let escape = '```'
  for (const m of text.matchAll(/^```+/gm) ?? []) {
    while (m[0].length >= escape.length) {
      escape += '`'
    }
  }
  return escape + '\n' + text + (text.endsWith('\n') ? '' : '\n') + escape
}

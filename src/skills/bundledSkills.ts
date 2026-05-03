import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { constants as fsConstants } from 'fs'
import { mkdir, open } from 'fs/promises'
import { dirname, isAbsolute, join, normalize, sep as pathSep } from 'path'
import type { ToolUseContext } from '../Tool.js'
import type { Command } from '../types/command.js'
import { logForDebugging } from '../utils/debug.js'
import { getBundledSkillsRoot } from '../utils/permissions/filesystem.js'
import type { HooksSettings } from '../utils/settings/types.js'

/**
 * CLI 内置技能的定义。
 * 这些技能会在启动时通过程序化方式进行注册。
 */
export type BundledSkillDefinition = {
  name: string
  description: string
  aliases?: string[]
  whenToUse?: string
  argumentHint?: string
  allowedTools?: string[]
  model?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
  isEnabled?: () => boolean
  hooks?: HooksSettings
  context?: 'inline' | 'fork'
  agent?: string
  /**
 * 在首次调用时需要额外写入磁盘的参考文件。
 * 键为相对路径（使用正斜杠，不包含 `..`），值为文件内容。
 * 当设置该项时，会在技能提示前添加一行
 * “Base directory for this skill: <dir>”，
 * 以便模型可以按需对这些文件执行 Read/Grep 操作——
 * 与基于磁盘的技能遵循相同约定。
 */
  files?: Record<string, string>
  getPromptForCommand: (
    args: string,
    context: ToolUseContext,
  ) => Promise<ContentBlockParam[]>
}

// 内置技能的内部注册表
const bundledSkills: Command[] = []

/**
 * 注册一个内置技能，使其对模型可用。
 * 应在模块初始化阶段或 init 函数中调用。
 *
 * 内置技能会被编译进 CLI 二进制文件中，并对所有用户可用。
 * 它们遵循与 registerPostSamplingHook() 相同的模式，用于内部功能。
 */
export function registerBundledSkill(definition: BundledSkillDefinition): void {
  const { files } = definition

  let skillRoot: string | undefined
  let getPromptForCommand = definition.getPromptForCommand

  if (files && Object.keys(files).length > 0) {
    skillRoot = getBundledSkillExtractDir(definition.name)
    /**
     * 作用域内的闭包级缓存：在每个进程中仅提取一次。
     * 缓存的是 Promise（而不是最终结果），以便并发调用者可以复用同一个提取过程，
     * 而不是各自触发独立写入导致竞争。
     */
    let extractionPromise: Promise<string | null> | undefined
    const inner = definition.getPromptForCommand
    getPromptForCommand = async (args, ctx) => {
      extractionPromise ??= extractBundledSkillFiles(definition.name, files)
      const extractedDir = await extractionPromise
      const blocks = await inner(args, ctx)
      if (extractedDir === null) return blocks
      return prependBaseDir(blocks, extractedDir)
    }
  }

  const command: Command = {
    type: 'prompt',
    name: definition.name,
    description: definition.description,
    aliases: definition.aliases,
    hasUserSpecifiedDescription: true,
    allowedTools: definition.allowedTools ?? [],
    argumentHint: definition.argumentHint,
    whenToUse: definition.whenToUse,
    model: definition.model,
    disableModelInvocation: definition.disableModelInvocation ?? false,
    userInvocable: definition.userInvocable ?? true,
    contentLength: 0, // Not applicable for bundled skills
    source: 'bundled',
    loadedFrom: 'bundled',
    hooks: definition.hooks,
    skillRoot,
    context: definition.context,
    agent: definition.agent,
    isEnabled: definition.isEnabled,
    isHidden: !(definition.userInvocable ?? true),
    progressMessage: 'running',
    getPromptForCommand,
  }
  bundledSkills.push(command)
}

/**
 * 获取所有已注册的内置技能。
 * 返回副本以防止外部对内部状态进行修改。
 */
export function getBundledSkills(): Command[] {
  return [...bundledSkills]
}

/**
 * 清空内置技能注册表（用于测试）。
 */
export function clearBundledSkills(): void {
  bundledSkills.length = 0
}

/**
 * 为内置技能的参考文件生成确定性的提取目录。
 */
export function getBundledSkillExtractDir(skillName: string): string {
  return join(getBundledSkillsRoot(), skillName)
}

/**
 * 将内置技能的参考文件提取到磁盘，以便模型可以按需进行 Read/Grep。
 * 该操作在首次调用技能时惰性执行。
 *
 * 返回写入的目录路径；如果写入失败则返回 null（此时技能仍可正常工作，
 * 只是不会附带 base-directory 前缀）。
 */
async function extractBundledSkillFiles(
  skillName: string,
  files: Record<string, string>,
): Promise<string | null> {
  const dir = getBundledSkillExtractDir(skillName)
  try {
    await writeSkillFiles(dir, files)
    return dir
  } catch (e) {
    logForDebugging(
      `Failed to extract bundled skill '${skillName}' to ${dir}: ${e instanceof Error ? e.message : String(e)}`,
    )
    return null
  }
}

async function writeSkillFiles(
  dir: string,
  files: Record<string, string>,
): Promise<void> {
  // Group by parent dir so we mkdir each subtree once, then write.
  const byParent = new Map<string, [string, string][]>()
  for (const [relPath, content] of Object.entries(files)) {
    const target = resolveSkillFilePath(dir, relPath)
    const parent = dirname(target)
    const entry: [string, string] = [target, content]
    const group = byParent.get(parent)
    if (group) group.push(entry)
    else byParent.set(parent, [entry])
  }
  await Promise.all(
    [...byParent].map(async ([parent, entries]) => {
      await mkdir(parent, { recursive: true, mode: 0o700 })
      await Promise.all(entries.map(([p, c]) => safeWriteFile(p, c)))
    }),
  )
}

// getBundledSkillsRoot() 中的每进程 nonce 是防止预先创建符号链接/目录的主要防护手段。
// 显式使用 0o700/0o600 权限，即使在 umask=0 的情况下也能保证 nonce 子目录仅对所有者可访问，
// 因此即使攻击者通过 inotify 监控到可预测的父目录并获知 nonce，也无法向其中写入内容。
// 使用 O_NOFOLLOW|O_EXCL 属于“双重保险”（O_NOFOLLOW 只保护最终路径组件）；
// 我们明确不在 EEXIST 情况下执行 unlink + 重试 —— 因为 unlink() 也会跟随中间的符号链接。
const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0
// On Windows, use string flags — numeric O_EXCL can produce EINVAL through libuv.
const SAFE_WRITE_FLAGS =
  process.platform === 'win32'
    ? 'wx'
    : fsConstants.O_WRONLY |
      fsConstants.O_CREAT |
      fsConstants.O_EXCL |
      O_NOFOLLOW

async function safeWriteFile(p: string, content: string): Promise<void> {
  const fh = await open(p, SAFE_WRITE_FLAGS, 0o600)
  try {
    await fh.writeFile(content, 'utf8')
  } finally {
    await fh.close()
  }
}

/** Normalize and validate a skill-relative path; throws on traversal. */
function resolveSkillFilePath(baseDir: string, relPath: string): string {
  const normalized = normalize(relPath)
  if (
    isAbsolute(normalized) ||
    normalized.split(pathSep).includes('..') ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`bundled skill file path escapes skill dir: ${relPath}`)
  }
  return join(baseDir, normalized)
}

function prependBaseDir(
  blocks: ContentBlockParam[],
  baseDir: string,
): ContentBlockParam[] {
  const prefix = `Base directory for this skill: ${baseDir}\n\n`
  if (blocks.length > 0 && blocks[0]!.type === 'text') {
    return [
      { type: 'text', text: prefix + blocks[0]!.text },
      ...blocks.slice(1),
    ]
  }
  return [{ type: 'text', text: prefix }, ...blocks]
}

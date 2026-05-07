#!/usr/bin/env bun
/**
 * Downloads builtin review skills & agents from costrict-review repo and generates
 * src/costrict/review/skill/builtin.ts and src/costrict/review/agent/builtin.ts
 *
 * Uses git SSH transport (git ls-remote + git clone).
 * Reads index.json manifest to discover resources and their per-locale paths.
 * Compares remote commit SHA with cached version and skips download if unchanged.
 *
 * Usage: bun run scripts/generate-review-builtin.ts
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import matter from 'gray-matter'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const bundledReviewDir = path.resolve(__dirname, '../packages/builtin-tools/bundled-review')
const builtinSkillsFile = path.resolve(__dirname, '../src/costrict/review/skill/builtin.ts')
const builtinAgentsFile = path.resolve(__dirname, '../src/costrict/review/agent/builtin.ts')

type IndexJson = {
  agents: Array<{
    name: string
    path: Record<string, string>
    opencode?: Record<string, unknown>
    claudecode?: Record<string, unknown>
  }>
  skills: Array<{ name: string; path: Record<string, string> }>
}

const REPO = 'zgsm-ai/costrict-review'
const BRANCH = 'main'
const CLONE_URL = `git@github.com:${REPO}.git`

function git(...args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync('git', args, { encoding: 'utf-8' })
  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
  }
}

function lsRemoteSha(): string | null {
  const ref = `refs/heads/${BRANCH}`
  const result = git('ls-remote', '--heads', CLONE_URL, ref)
  if (!result.ok || !result.stdout) return null
  const sha = result.stdout.split('\t')[0] ?? ''
  return sha.length >= 40 ? sha : null
}

async function readCachedSha(targetFile: string): Promise<string | null> {
  try {
    const content = await fs.readFile(targetFile, 'utf-8')
    const match = content.match(/\b([a-f0-9]{40})\b/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

async function walk(dir: string, base = ''): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = base ? path.join(base, entry.name) : entry.name
      if (entry.isDirectory()) {
        files.push(...await walk(fullPath, relativePath))
      } else {
        files.push(relativePath)
      }
    }
    return files
  } catch {
    return []
  }
}

async function readIndexJson(cloneDir: string): Promise<IndexJson> {
  const raw = await fs.readFile(path.join(cloneDir, 'index.json'), 'utf-8')
  return JSON.parse(raw) as IndexJson
}

function collectLocales(index: IndexJson): string[] {
  const localeSet = new Set<string>()
  for (const skill of index.skills) {
    for (const locale of Object.keys(skill.path)) localeSet.add(locale)
  }
  for (const agent of index.agents) {
    for (const locale of Object.keys(agent.path)) localeSet.add(locale)
  }
  return [...localeSet].sort()
}

function mergeClaudecodeFrontmatter(
  mdContent: string,
  claudecodeFields: Record<string, unknown>,
): string {
  const md = matter(mdContent)
  const merged = { ...md.data, ...claudecodeFields }
  return matter.stringify(md.content, merged)
}

async function cloneAndCopy(
  cloneDir: string,
  index: IndexJson,
): Promise<void> {
  const locales = collectLocales(index)

  // Clean stale locale directories before copying
  for (const entry of await fs.readdir(bundledReviewDir).catch(() => [] as string[])) {
    if (entry === '.clone') continue
    const entryPath = path.join(bundledReviewDir, entry)
    if ((await fs.stat(entryPath).catch(() => null))?.isDirectory()) {
      await fs.rm(entryPath, { recursive: true, force: true })
    }
  }

  for (const locale of locales) {
    const outputLocaleDir = path.join(bundledReviewDir, locale)

    // Copy skill dirs for this locale
    const skillPaths = index.skills
      .map(s => s.path[locale])
      .filter(Boolean)

    for (const skillMdPath of skillPaths) {
      const srcDir = path.join(cloneDir, path.dirname(skillMdPath))
      const relativeDir = skillMdPath.startsWith(`${locale}/`)
        ? skillMdPath.slice(locale.length + 1).replace(/\/[^/]*$/, '')
        : path.dirname(skillMdPath)
      const outputDir = path.join(outputLocaleDir, relativeDir)

      await fs.rm(outputDir, { recursive: true, force: true })
      await fs.cp(srcDir, outputDir, { recursive: true })

      const skillMd = path.join(outputDir, 'SKILL.md')
      try {
        await fs.access(skillMd)
      } catch {
        throw new Error(`Skill (${locale}) missing SKILL.md at ${skillMdPath}`)
      }

      const skillName = path.basename(srcDir)
      const fileCount = (await walk(outputDir)).length
      console.log(`   ✓ ${locale}/skills/${skillName}: ${fileCount} files`)
    }

    // Copy agent files for this locale, merging claudecode frontmatter
    const agentEntries = index.agents
      .map(a => ({ name: a.name, filePath: a.path[locale], claudecode: a.claudecode }))
      .filter(e => e.filePath)

    for (const { name, filePath, claudecode } of agentEntries) {
      const srcFile = path.join(cloneDir, filePath)
      const outputDir = path.join(outputLocaleDir, 'agents')
      await fs.mkdir(outputDir, { recursive: true })

      const filename = path.basename(filePath)
      const destFile = path.join(outputDir, filename)

      if (claudecode) {
        const rawContent = await fs.readFile(srcFile, 'utf-8')
        const merged = mergeClaudecodeFrontmatter(rawContent, claudecode)
        await fs.writeFile(destFile, merged, 'utf-8')
      } else {
        await fs.cp(srcFile, destFile)
      }

      try {
        await fs.access(destFile)
      } catch {
        throw new Error(`Agent "${name}" (${locale}) missing at ${filePath}`)
      }

      console.log(`   ✓ ${locale}/agents/${filename}`)
    }
  }

  await fs.rm(cloneDir, { recursive: true, force: true })
}

async function generateBuiltinSkills(
  commitSha: string,
): Promise<void> {
  const localeEntries = await fs.readdir(bundledReviewDir).catch(() => [] as string[])
  const locales: string[] = []
  for (const l of localeEntries) {
    if ((await fs.stat(path.join(bundledReviewDir, l)).catch(() => null))?.isDirectory()) {
      locales.push(l)
    }
  }

  const allSkillNames: string[] = []

  // Discover skill names from first locale
  for (const locale of locales) {
    const skillsDir = path.join(bundledReviewDir, locale, 'skills')
    const entries = await fs.readdir(skillsDir).catch(() => [] as string[])
    for (const name of entries) {
      if (!allSkillNames.includes(name)) allSkillNames.push(name)
    }
    break
  }

  const imports: string[] = []
  const localeSkillEntries: string[] = []
  let fileIdx = 0

  for (const locale of [...locales].sort()) {
    const skillEntries: string[] = []
    for (const skillName of allSkillNames) {
      const skillDir = path.join(bundledReviewDir, locale, 'skills', skillName)
      const files = await walk(skillDir)
      const fileEntries: string[] = []
      for (const file of files) {
        const varName = `SKILL_FILE_${fileIdx++}`
        const filePath = path.join(skillDir, file)
        const content = await fs.readFile(filePath, 'utf-8')
        const normalizedPath = file.replaceAll('\\', '/')
        imports.push(`const ${varName} = ${JSON.stringify(content)}`)
        fileEntries.push(`  "${normalizedPath}": ${varName}`)
      }
      skillEntries.push(`  "${skillName}": {\n${fileEntries.join(',\n')}\n  }`)
    }
    localeSkillEntries.push(`  "${locale}": {\n${skillEntries.join(',\n')}\n  }`)
  }

  const content = `// This file is auto-generated by scripts/generate-review-builtin.ts
// Do not edit manually

import { writeFile, mkdir } from "fs/promises"
import { join, dirname } from "path"

${imports.join('\n')}

const SKILL_FILES: Record<string, Record<string, Record<string, string>>> = {
${localeSkillEntries.join(',\n')}
}

const SKILL_VERSIONS: Record<string, string> = {
${allSkillNames.map(n => `  "${n}": "${commitSha}"`).join(',\n')}
}

export function listBuiltinSkills(): string[] {
  return ${JSON.stringify(allSkillNames)}
}

export function getBuiltinSkillVersion(skillName: string): string | undefined {
  return SKILL_VERSIONS[skillName]
}

export function listSkillFiles(skillName: string, locale: string): string[] {
  return Object.keys(SKILL_FILES[locale]?.[skillName] || {})
}

export async function extractBundledSkill(skillName: string, targetDir: string, locale: string): Promise<void> {
  const localeData = SKILL_FILES[locale]
  if (!localeData) {
    throw new Error(\`Locale not found: \${locale}\`)
  }

  const skillFiles = localeData[skillName]
  if (!skillFiles) {
    throw new Error(\`Skill not found: \${skillName}\`)
  }

  await mkdir(targetDir, { recursive: true })
  for (const [relativePath, content] of Object.entries(skillFiles)) {
    await mkdir(join(targetDir, dirname(relativePath)), { recursive: true })
    await writeFile(join(targetDir, relativePath), content, "utf-8")
  }
}
`

  await fs.writeFile(builtinSkillsFile, content, 'utf-8')
  console.log(`\n✓ Generated ${builtinSkillsFile}`)
}

async function generateBuiltinAgents(
  commitSha: string,
): Promise<void> {
  const localeEntries = await fs.readdir(bundledReviewDir).catch(() => [] as string[])
  const locales: string[] = []
  for (const l of localeEntries) {
    if ((await fs.stat(path.join(bundledReviewDir, l)).catch(() => null))?.isDirectory()) {
      locales.push(l)
    }
  }

  // Discover agent names from first locale's agents dir
  const allAgentNames: string[] = []
  for (const locale of locales) {
    const agentsDir = path.join(bundledReviewDir, locale, 'agents')
    const entries = await fs.readdir(agentsDir).catch(() => [] as string[])
    for (const name of entries) {
      if (!allAgentNames.includes(name)) allAgentNames.push(name)
    }
    break
  }

  const imports: string[] = []
  const agentCodeEntries: string[] = []
  let fileIdx = 0
  let primaryAgent = ''
  let subAgent = ''

  for (const agentName of allAgentNames) {
    const agentKey = agentName.replace(/\.md$/, '')
    const localeEntriesList: string[] = []
    const promptVarNames: string[] = []

    for (const locale of [...locales].sort()) {
      const agentFile = path.join(bundledReviewDir, locale, 'agents', agentName)
      try {
        const content = await fs.readFile(agentFile, 'utf-8')
        const varName = `REVIEW_AGENT_${fileIdx++}`
        imports.push(`const ${varName} = ${JSON.stringify(content)}`)
        localeEntriesList.push(`"${locale}": ${varName}`)
        promptVarNames.push(varName)

        if (content.includes('mode: primary')) primaryAgent = agentKey
        if (content.includes('mode: subagent')) subAgent = agentKey
      } catch {
        // Agent file not found for this locale, skip
      }
    }

    if (localeEntriesList.length > 0) {
      const promptRecordName = `${agentKey.toUpperCase().replace(/-/g, '_')}_PROMPTS`
      agentCodeEntries.push(`const ${promptRecordName}: Record<string, string> = {\n${localeEntriesList.join(',\n')}\n}`)
    }
  }

  // Now generate the BuiltInAgentDefinition array
  // Parse merged frontmatter from the zh-CN agent files to extract fields
  const agentDefs: string[] = []

  for (const agentName of allAgentNames) {
    const agentKey = agentName.replace(/\.md$/, '')
    const promptRecordName = `${agentKey.toUpperCase().replace(/-/g, '_')}_PROMPTS`

    // Read zh-CN version to parse frontmatter for fields
    const zhAgentFile = path.join(bundledReviewDir, 'zh-CN', 'agents', agentName)
    let frontmatterData: Record<string, unknown> = {}
    try {
      const content = await fs.readFile(zhAgentFile, 'utf-8')
      const parsed = matter(content)
      frontmatterData = parsed.data as Record<string, unknown>
    } catch {
      // fallback
    }

    // Extract fields from frontmatter
    const whenToUse = String(frontmatterData['whenToUse'] ?? frontmatterData['description'] ?? '')
    const toolsStr = String(frontmatterData['tools'] ?? '')
    const tools = toolsStr ? toolsStr.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined
    const permissionMode = String(frontmatterData['permissionMode'] ?? 'default')
    const model = String(frontmatterData['model'] ?? 'inherit')
    const mode = String(frontmatterData['mode'] ?? '')

    // Determine disallowedTools based on tools availability
    const toolNameSet = new Set(tools ?? [])
    const disallowedTools: string[] = []
    if (!toolNameSet.has('Agent')) disallowedTools.push('Agent')
    if (!toolNameSet.has('FileEdit')) disallowedTools.push('FileEdit')
    if (!toolNameSet.has('FileWrite')) disallowedTools.push('FileWrite')
    if (!toolNameSet.has('NotebookEdit')) disallowedTools.push('NotebookEdit')

    // Determine visibleTo based on mode
    const visibleTo = mode === 'primary' ? undefined : ['CoStrictReviewer']

    const toolsLiteral = tools ? JSON.stringify(tools) : 'undefined'
    const disallowedLiteral = disallowedTools.length > 0
      ? `[${disallowedTools.map((t: string) => `'${t}'`).join(', ')}]`
      : 'undefined'
    const visibleToLiteral = visibleTo ? JSON.stringify(visibleTo) : 'undefined'

    agentDefs.push(`  {
    agentType: '${agentKey}',
    whenToUse: ${JSON.stringify(whenToUse)},
    tools: ${toolsLiteral} as string[] | undefined,
    disallowedTools: ${disallowedLiteral} as string[] | undefined,
    permissionMode: '${permissionMode}',
    model: '${model}',
    source: 'built-in',
    baseDir: 'built-in',
    visibleTo: ${visibleToLiteral} as string[] | undefined,
    getSystemPrompt: (_params) => {
      const lang = getResolvedLanguage()
      const locale = LOCALE_MAP[lang] ?? 'zh-CN'
      return ${promptRecordName}[locale] ?? ${promptRecordName}['zh-CN']
    },
  }`)
  }

  const content = `// This file is auto-generated by scripts/generate-review-builtin.ts
// Do not edit manually
// Agents are downloaded from zgsm-ai/costrict-review repository

import type { BuiltInAgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { getResolvedLanguage } from 'src/utils/language.js'

const LOCALE_MAP: Record<string, string> = { zh: 'zh-CN', en: 'en' }

${imports.join('\n')}

${agentCodeEntries.join('\n\n')}

export const REVIEW_AGENTS: BuiltInAgentDefinition[] = [
${agentDefs.join(',\n')}
]

export const AGENT_VERSIONS: Record<string, string> = {
${allAgentNames.map(n => `  "${n.replace(/\.md$/, '')}": "${commitSha}"`).join(',\n')}
}

export const PRIMARY_REVIEW_AGENT = ${JSON.stringify(primaryAgent)}
export const SUB_REVIEW_AGENT = ${JSON.stringify(subAgent)}
`

  await fs.writeFile(builtinAgentsFile, content, 'utf-8')
  console.log(`✓ Generated ${builtinAgentsFile}`)
}

async function generateBuiltinReview() {
  console.log('\n🚀 CSC — Downloading Builtin Review Resources\n')

  await fs.mkdir(bundledReviewDir, { recursive: true })

  const remoteSha = lsRemoteSha()
  if (!remoteSha) {
    throw new Error(`git ls-remote failed for ${CLONE_URL} (branch: ${BRANCH})`)
  }
  console.log(`Remote commit: ${remoteSha.slice(0, 7)}`)

  const cachedSha = await readCachedSha(builtinSkillsFile)
  const hasCachedFiles = (await walk(bundledReviewDir)).length > 0

  let commitSha = remoteSha

  if (cachedSha === remoteSha && hasCachedFiles) {
    console.log('✓ All resources up to date, skipping download')
  } else {
    if (cachedSha) {
      console.log(`Cached ${cachedSha.slice(0, 7)} → remote ${remoteSha.slice(0, 7)}, updating`)
    }
    const cloneDir = path.join(bundledReviewDir, '.clone')
    try {
      console.log(`   git clone --depth 1 ${CLONE_URL}`)
      await fs.rm(cloneDir, { recursive: true, force: true })
      const cloneResult = git('clone', '--depth', '1', '--branch', BRANCH, CLONE_URL, cloneDir)
      if (!cloneResult.ok) {
        throw new Error(`git clone failed: ${cloneResult.stderr}`)
      }
      const index = await readIndexJson(cloneDir)
      await cloneAndCopy(cloneDir, index)
      console.log(`\n✓ All resources updated (commit ${remoteSha.slice(0, 7)})`)
    } catch (err) {
      console.error(`  ✗ Download failed: ${err}`)
      if (!hasCachedFiles) {
        throw new Error(`Download failed and no cache available`)
      }
      console.warn(`  ⚠ Using cached resources`)
      commitSha = cachedSha ?? remoteSha
    } finally {
      await fs.rm(cloneDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  console.log(`✓ Bundled review directory: ${bundledReviewDir}`)

  await generateBuiltinSkills(commitSha)

  await generateBuiltinAgents(commitSha)

  console.log('\n💡 Run `bun run build` to compile the extension\n')
}

generateBuiltinReview().catch(console.error)

#!/usr/bin/env bun
/**
 * Downloads builtin review skills from costrict-review repo and generates
 * src/costrict/review/skill/builtin.ts
 *
 * Uses git SSH transport (git ls-remote + git clone).
 * Reads index.json manifest to discover skills and their per-locale paths.
 * Compares remote commit SHA with cached version and skips download if unchanged.
 *
 * Usage: bun run scripts/generate-review-builtin.ts
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import matter from 'gray-matter'
import { mkdir } from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const bundledReviewDir = path.resolve(__dirname, '../packages/builtin-tools/bundled-review')
const builtinSkillsFile = path.resolve(__dirname, '../src/costrict/review/skill/builtin.ts')

type IndexJson = {
  skills: Array<{ name: string; path: Record<string, string> }>
}

const REPO = 'zgsm-ai/costrict-review'
const BRANCH = 'optimize/agent-prompts'
const CLONE_URL = `git@github.com:${REPO}.git`

function git(...args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync('git', args, { encoding: 'utf-8', env: process.env })
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
  return [...localeSet].sort()
}

/**
 * Extract locale and skill directory from index.json path.
 * New format: "skills/<locale>/<skillName>/SKILL.md"
 * Old format: "<locale>/skills/<skillName>/SKILL.md" (for backwards compat)
 */
function parseSkillPath(skillMdPath: string): { locale: string; skillDir: string } | null {
  // New format: skills/<locale>/<skillName>/SKILL.md
  const newMatch = skillMdPath.match(/^skills\/([^/]+)\/(.+)$/)
  if (newMatch) {
    return { locale: newMatch[1], skillDir: newMatch[2].replace(/\/SKILL\.md$/, '') }
  }
  // Old format: <locale>/skills/<skillName>/SKILL.md
  const oldMatch = skillMdPath.match(/^([^/]+)\/skills\/(.+)$/)
  if (oldMatch) {
    return { locale: oldMatch[1], skillDir: oldMatch[2].replace(/\/SKILL\.md$/, '') }
  }
  return null
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

    const skillPaths = index.skills
      .map(s => s.path[locale])
      .filter(Boolean)

    for (const skillMdPath of skillPaths) {
      const parsed = parseSkillPath(skillMdPath)
      if (!parsed) {
        console.warn(`  ⚠ Skipping unparseable path: ${skillMdPath}`)
        continue
      }

      const { skillDir } = parsed
      const srcDir = path.join(cloneDir, path.dirname(skillMdPath))
      const outputDir = path.join(outputLocaleDir, skillDir)

      await fs.rm(outputDir, { recursive: true, force: true })
      await fs.cp(srcDir, outputDir, { recursive: true })

      const fileCount = (await walk(outputDir)).length
      console.log(`   ✓ ${locale}/${skillDir}: ${fileCount} files`)
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

  // Discover skill names from first locale
  const allSkillNames: string[] = []
  for (const locale of locales) {
    const entries = await fs.readdir(path.join(bundledReviewDir, locale)).catch(() => [] as string[])
    for (const name of entries) {
      const p = path.join(bundledReviewDir, locale, name)
      if ((await fs.stat(p).catch(() => null))?.isDirectory()) {
        if (!allSkillNames.includes(name)) allSkillNames.push(name)
      }
    }
    break
  }

  const skillFileEntries: string[] = []
  const metadataEntries: string[] = []
  let fileIdx = 0

  for (const locale of [...locales].sort()) {
    const fileEntries: string[] = []
    const metaEntries: string[] = []

    for (const skillName of allSkillNames) {
      const skillDir = path.join(bundledReviewDir, locale, skillName)
      const files = await walk(skillDir)

      // Parse SKILL.md for metadata
      let skillMeta = { name: skillName, description: '' }
      const skillMdPath = path.join(skillDir, 'SKILL.md')
      try {
        const content = await fs.readFile(skillMdPath, 'utf-8')
        const parsed = matter(content)
        skillMeta = {
          name: String(parsed.data.name ?? skillName),
          description: String(parsed.data.description ?? ''),
        }
      } catch {
        // SKILL.md not found, use defaults
      }

      const fileRecords: string[] = []
      for (const file of files) {
        const varName = `SKILL_FILE_${fileIdx++}`
        const filePath = path.join(skillDir, file)
        const content = await fs.readFile(filePath, 'utf-8')
        const normalizedPath = file.replaceAll('\\', '/')
        fileRecords.push(`    "${normalizedPath}": ${JSON.stringify(content)}`)
      }

      fileEntries.push(`  "${skillName}": {\n${fileRecords.join(',\n')}\n  }`)
      metaEntries.push(`  "${skillName}": ${JSON.stringify(skillMeta)}`)
    }

    skillFileEntries.push(`  "${locale}": {\n${fileEntries.join(',\n')}\n  }`)
    metadataEntries.push(`  "${locale}": {\n${metaEntries.join(',\n')}\n  }`)
  }

  const content = `// This file is auto-generated by scripts/generate-review-builtin.ts
// Do not edit manually
// Skills are downloaded from zgsm-ai/costrict-review repository

// locale → skillName → filePath → content
export const SKILL_FILES: Record<string, Record<string, Record<string, string>>> = {
${skillFileEntries.join(',\n')}
}

// locale → skillName → { name, description }
export const SKILL_METADATA: Record<string, Record<string, { name: string; description: string }>> = {
${metadataEntries.join(',\n')}
}

// skillName → commit SHA
export const SKILL_VERSIONS: Record<string, string> = {
${allSkillNames.map(n => `  "${n}": "${commitSha}"`).join(',\n')}
}

// List all skill names
export function listBuiltinSkillNames(): string[] {
  return ${JSON.stringify(allSkillNames)}
}

// Get version for a skill
export function getBuiltinSkillVersion(skillName: string): string | undefined {
  return SKILL_VERSIONS[skillName]
}

// Get files for a skill in a specific locale
export function getSkillFiles(skillName: string, locale: string): Record<string, string> {
  return SKILL_FILES[locale]?.[skillName] ?? {}
}

// Get metadata for a skill in a specific locale
export function getSkillMetadata(skillName: string, locale: string): { name: string; description: string } | undefined {
  return SKILL_METADATA[locale]?.[skillName]
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

  const { rm, mkdir: mkdirSync, writeFile: writeFileSync } = await import('fs/promises')
  const { join: pathJoin, dirname: pathDirname } = await import('path')
  // Remove stale files from previous version/locale before extracting
  await rm(targetDir, { recursive: true, force: true })
  await mkdirSync(targetDir, { recursive: true })
  for (const [relativePath, fileContent] of Object.entries(skillFiles)) {
    await mkdirSync(pathJoin(targetDir, pathDirname(relativePath)), { recursive: true })
    await writeFileSync(pathJoin(targetDir, relativePath), fileContent, 'utf-8')
  }
}
`

  await mkdir(path.dirname(builtinSkillsFile), { recursive: true })
  await fs.writeFile(builtinSkillsFile, content, 'utf-8')
  console.log(`\n✓ Generated ${builtinSkillsFile}`)
}

async function generateBuiltinReview() {
  console.log('\n🚀 CSC — Downloading Builtin Review Skills\n')

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

  console.log('\n💡 Run `bun run build` to compile\n')
}

generateBuiltinReview().catch(console.error)

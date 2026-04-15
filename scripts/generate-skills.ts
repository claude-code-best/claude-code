#!/usr/bin/env bun
/**
 * Downloads builtin skills from their source repositories and generates
 * src/costrict/skill/builtin.ts with all skill files embedded as string constants.
 *
 * Uses git SSH transport (git ls-remote + git clone).
 * Compares remote commit SHA with cached version and skips download if unchanged.
 *
 * Usage: bun run scripts/generate-skills.ts
 */

import fs from 'fs/promises'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const bundledSkillsDir = path.resolve(__dirname, '../.tmp/skills')
const builtinTsFile = path.resolve(__dirname, '../src/costrict/skill/builtin.ts')

type SkillConfig = {
  repo: string
  branch: string
  subdir: string
}

const BUILTIN_SKILLS: Record<string, SkillConfig> = {
  'security-review': {
    repo: 'zgsm-ai/security-review-skill',
    branch: 'main',
    subdir: 'security-review',
  },
}

function git(...args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync('git', args, { encoding: 'utf-8' })
  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
  }
}

function getCloneUrl(repo: string): string {
  return `git@github.com:${repo}.git`
}

/**
 * Get the latest commit SHA for a branch via `git ls-remote`.
 * No clone needed — lightweight remote query over SSH.
 */
function lsRemoteSha(repo: string, branch: string): string | null {
  const cloneUrl = getCloneUrl(repo)
  const ref = `refs/heads/${branch}`
  const result = git('ls-remote', '--heads', cloneUrl, ref)
  if (!result.ok || !result.stdout) {
    return null
  }
  // Output format: "<sha>\t<ref>"
  const sha = result.stdout.split('\t')[0] ?? ''
  return sha.length >= 40 ? sha : null
}

/**
 * Read the cached commit SHA from the generated builtin.ts file.
 */
async function readCachedSha(skillName: string): Promise<string | null> {
  try {
    const content = await fs.readFile(builtinTsFile, 'utf-8')
    const regex = new RegExp(
      `^\\s*${JSON.stringify(skillName)}:\\s*"([a-f0-9]{40})"`,
      'm',
    )
    const match = content.match(regex)
    return match ? match[1] : null
  } catch {
    return null
  }
}

async function downloadSkill(
  name: string,
  config: SkillConfig,
): Promise<{ name: string; commitSha: string | null } | null> {
  const { repo, branch, subdir } = config
  const cloneUrl = getCloneUrl(repo)

  console.log(`\n📦 Skill: ${name}`)
  console.log(`   From: ${cloneUrl}`)
  console.log(`   Branch: ${branch}`)

  // Step 1: Get remote commit SHA via git ls-remote (no clone)
  const remoteSha = lsRemoteSha(repo, branch)
  if (!remoteSha) {
    throw new Error(`git ls-remote failed for ${cloneUrl} (branch: ${branch})`)
  }
  console.log(`   Remote commit: ${remoteSha.slice(0, 7)}`)

  // Step 2: Compare with cached SHA — skip only if SHA matches AND cached files exist
  const cachedSha = await readCachedSha(name)
  const skillOutputDir = path.join(bundledSkillsDir, name)
  const hasCachedFiles = (await walk(skillOutputDir)).length > 0
  if (cachedSha && cachedSha === remoteSha && hasCachedFiles) {
    console.log(`   ✓ Cached version matches remote, skipping download`)
    return { name, commitSha: remoteSha }
  }
  if (cachedSha) {
    console.log(`   Cached: ${cachedSha.slice(0, 7)} → Remote: ${remoteSha.slice(0, 7)}, updating...`)
  }

  // Step 3: Clone and extract files
  const cloneDir = path.join(bundledSkillsDir, `.clone-${name}`)

  console.log(`   git clone --depth 1 ${cloneUrl}`)

  await fs.rm(cloneDir, { recursive: true, force: true })

  const cloneResult = git('clone', '--depth', '1', '--branch', branch, cloneUrl, cloneDir)
  if (!cloneResult.ok) {
    throw new Error(`git clone failed: ${cloneResult.stderr}`)
  }

  const srcDir = subdir ? path.join(cloneDir, subdir) : cloneDir
  await fs.rm(skillOutputDir, { recursive: true, force: true })
  await fs.cp(srcDir, skillOutputDir, { recursive: true })

  await fs.rm(cloneDir, { recursive: true, force: true })

  const skillMdPath = path.join(skillOutputDir, 'SKILL.md')
  try {
    await fs.access(skillMdPath)
  } catch {
    throw new Error(`Skill "${name}" missing SKILL.md`)
  }

  const fileCount = (await walk(skillOutputDir)).length
  console.log(`   ✓ ${fileCount} files copied`)
  return { name, commitSha: remoteSha }
}

async function walk(dir: string, base = ''): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = base ? path.join(base, entry.name) : entry.name
      if (entry.isDirectory()) {
        files.push(...(await walk(fullPath, relativePath)))
      } else {
        files.push(relativePath)
      }
    }
    return files
  } catch {
    return []
  }
}

async function generateBuiltinTs(
  skills: Array<{ name: string; commitSha: string | null }>,
): Promise<void> {
  const outLines: string[] = [
    '// This file is auto-generated by scripts/generate-skills.ts',
    '// Do not edit manually',
    '',
  ]

  const skillEntries: string[] = []
  let fileIdx = 0

  for (const { name, commitSha } of skills) {
    const skillDir = path.join(bundledSkillsDir, name)
    const files = await walk(skillDir)
    const fileEntries: string[] = []

    for (const file of files) {
      const varName = `SKILL_FILE_${fileIdx++}`
      const content = await fs.readFile(path.join(skillDir, file), 'utf-8')
      const normalizedPath = file.replaceAll('\\', '/')
      outLines.push(`const ${varName} = ${JSON.stringify(content)}`)
      fileEntries.push(`    ${JSON.stringify(normalizedPath)}: ${varName}`)
    }

    skillEntries.push(`  ${JSON.stringify(name)}: {\n${fileEntries.join(',\n')}\n  }`)
  }

  outLines.push('')
  outLines.push('export const BUNDLED_SKILLS: Record<string, Record<string, string>> = {')
  outLines.push(skillEntries.join(',\n'))
  outLines.push('}')
  outLines.push('')

  const versions = skills
    .filter(s => s.commitSha)
    .map(s => `  ${JSON.stringify(s.name)}: ${JSON.stringify(s.commitSha)}`)

  outLines.push('export const SKILL_VERSIONS: Record<string, string> = {')
  outLines.push(versions.join(',\n'))
  outLines.push('}')
  outLines.push('')

  await fs.writeFile(builtinTsFile, outLines.join('\n') + '\n')
  console.log(`\n✓ Generated ${builtinTsFile}`)
}

async function main() {
  console.log('\nCSC — Downloading Builtin Skills\n')

  await fs.mkdir(bundledSkillsDir, { recursive: true })

  const results: Array<{ name: string; commitSha: string | null }> = []

  for (const [name, config] of Object.entries(BUILTIN_SKILLS)) {
    try {
      const result = await downloadSkill(name, config)
      if (result) results.push(result)
    } catch (err) {
      const skillDir = path.join(bundledSkillsDir, name)
      const cached = await walk(skillDir)
      if (cached.length > 0) {
        console.warn(`  ⚠ Download failed, using cached files for "${name}": ${err}`)
        results.push({ name, commitSha: null })
      } else {
        console.error(`  ✗ Download failed and no cache for "${name}": ${err}`)
      }
    }
  }

  if (results.length > 0) {
    await generateBuiltinTs(results)
  } else {
    console.warn('\n⚠ No skills downloaded. builtin.ts not updated.')
  }

  console.log('\n💡 Run `bun run build` to rebuild the CLI.\n')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

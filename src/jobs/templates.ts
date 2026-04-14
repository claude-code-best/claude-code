import { readdirSync, readFileSync, statSync } from 'fs'
import { join, basename } from 'path'
import { parseFrontmatter } from '../utils/frontmatterParser.js'
import type { FrontmatterData } from '../utils/frontmatterParser.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

export interface TemplateInfo {
  name: string
  description: string
  filePath: string
  frontmatter: FrontmatterData
  content: string
}

/**
 * Discover .claude/templates directories from CWD up to root,
 * plus the user-level ~/.claude/templates.
 */
function getTemplatesDirs(): string[] {
  const dirs: string[] = []

  // Project-level: walk up from CWD
  let dir = process.cwd()
  const seen = new Set<string>()
  while (true) {
    const candidate = join(dir, '.claude', 'templates')
    if (!seen.has(candidate)) {
      seen.add(candidate)
      try {
        if (statSync(candidate).isDirectory()) {
          dirs.push(candidate)
        }
      } catch {
        // Not found — keep walking
      }
    }

    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }

  // User-level
  const userDir = join(getClaudeConfigHomeDir(), 'templates')
  try {
    if (statSync(userDir).isDirectory()) {
      dirs.push(userDir)
    }
  } catch {
    // Not found
  }

  return dirs
}

/**
 * List all available templates.
 */
export function listTemplates(): TemplateInfo[] {
  const templates: TemplateInfo[] = []
  const seenNames = new Set<string>()

  for (const dir of getTemplatesDirs()) {
    let files: string[]
    try {
      files = readdirSync(dir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue
      const name = basename(file, '.md')
      if (seenNames.has(name)) continue
      seenNames.add(name)

      const filePath = join(dir, file)
      try {
        const raw = readFileSync(filePath, 'utf-8')
        const { frontmatter, content } = parseFrontmatter(raw, filePath)
        const description =
          (typeof frontmatter.description === 'string'
            ? frontmatter.description
            : '') ||
          content
            .split('\n')
            .find(l => l.trim().length > 0)
            ?.trim() ||
          'No description'

        templates.push({ name, description, filePath, frontmatter, content })
      } catch {
        // Skip unreadable files
      }
    }
  }

  return templates
}

/**
 * Load a specific template by name.
 */
export function loadTemplate(name: string): TemplateInfo | null {
  const all = listTemplates()
  return all.find(t => t.name === name) ?? null
}

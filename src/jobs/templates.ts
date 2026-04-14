import { readdirSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { parseFrontmatter } from '../utils/frontmatterParser.js'
import type { FrontmatterData } from '../utils/frontmatterParser.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import {
  getProjectDirsUpToHome,
  extractDescriptionFromMarkdown,
  type ClaudeConfigDirectory,
} from '../utils/markdownConfigLoader.js'

export interface TemplateInfo {
  name: string
  description: string
  filePath: string
  frontmatter: FrontmatterData
  content: string
}

/**
 * Discover .claude/templates directories from CWD up to git root,
 * plus the user-level ~/.claude/templates.
 */
function getTemplatesDirs(): string[] {
  const projectDirs = getProjectDirsUpToHome(
    'templates' as ClaudeConfigDirectory,
    process.cwd(),
  )

  // User-level dir (getProjectDirsUpToHome stops before home)
  const userDir = join(getClaudeConfigHomeDir(), 'templates')
  try {
    readdirSync(userDir)
    return [...projectDirs, userDir]
  } catch {
    return projectDirs
  }
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
            : '') || extractDescriptionFromMarkdown(content, 'No description')

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

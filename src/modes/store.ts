import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { useSyncExternalStore } from 'react'
import { parse as parseYaml } from 'yaml'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { DEFAULT_MODES } from './defaults.js'
import type { CCBMode } from './types.js'

let currentModeSlug: string | null = null
let customModes: CCBMode[] | null = null
const modeListeners = new Set<() => void>()

/**
 * Converts a human-readable name to a URL-safe slug.
 * @example kebabCase('Claude Persona') → 'claude-persona'
 */
function kebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Extracts YAML frontmatter and Markdown body from a string.
 * Expects the format used by Claude Code SKILL.md, OpenCode agents,
 * and Cursor rules: `---` delimited YAML followed by Markdown content.
 *
 * @throws {Error} If the string does not contain valid `---` delimiters.
 * @returns The parsed frontmatter object and the body text.
 */
function parseMarkdownFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const parts = raw.split(/^---$/m)
  if (parts.length < 3) {
    throw new Error('Invalid markdown frontmatter: missing --- delimiters')
  }
  return {
    frontmatter: parseYaml(parts[1]) as Record<string, unknown>,
    body: parts.slice(2).join('---').trim(),
  }
}

function loadCustomModes(): CCBMode[] {
  if (customModes !== null) return customModes
  customModes = []
  try {
    const modesDir = join(getClaudeConfigHomeDir(), 'modes')
    if (!existsSync(modesDir)) {
      mkdirSync(modesDir, { recursive: true })
    }
    const files = readdirSync(modesDir).filter(
      f => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.md'),
    )
    for (const file of files) {
      try {
        const raw = readFileSync(join(modesDir, file), 'utf-8')
        let data: Record<string, unknown>
        if (file.endsWith('.md')) {
          const { frontmatter, body } = parseMarkdownFrontmatter(raw)
          data = { ...frontmatter, system_prompt: body }
          if (!data.slug) {
            data.slug = data.name ? kebabCase(String(data.name)) : ''
          }
          data.icon = data.icon || '🤖'
        } else {
          data = parseYaml(raw) as Record<string, unknown>
        }
        if (!data.slug || !data.name) continue
        customModes.push({
          name: String(data.name),
          slug: String(data.slug),
          description: String(data.description || ''),
          icon: String(data.icon || '🔧'),
          systemPrompt: String(data.system_prompt || ''),
          model: data.model ? String(data.model) : undefined,
          ui: {
            accentColor: String(
              (data.ui as Record<string, unknown>)?.accent_color || '#00D4AA',
            ),
            promptPrefix: String(
              (data.ui as Record<string, unknown>)?.prompt_prefix || '',
            ),
          },
          permissions: {
            defaultMode:
              ((data.permissions as Record<string, unknown>)
                ?.default_mode as CCBMode['permissions']['defaultMode']) ||
              'default',
            memoryExtract: Boolean(
              (data.permissions as Record<string, unknown>)?.memory_extract ??
                true,
            ),
          },
          responseStyle: {
            verbosity:
              ((data.response_style as Record<string, unknown>)
                ?.verbosity as CCBMode['responseStyle']['verbosity']) ||
              'normal',
          },
        })
      } catch {
        // skip invalid yaml or markdown files
      }
    }
  } catch {
    // modes directory may not exist
  }
  return customModes
}

function getAllModes(): CCBMode[] {
  const custom = loadCustomModes()
  if (custom.length === 0) return DEFAULT_MODES
  // Custom modes override defaults with same slug
  const slugs = new Set(custom.map(m => m.slug))
  return [...custom, ...DEFAULT_MODES.filter(m => !slugs.has(m.slug))]
}

export function getCurrentModeSlug(): string {
  if (currentModeSlug === null) {
    const settings = getInitialSettings() as Record<string, unknown>
    currentModeSlug = (settings.ccbMode as string) || 'default'
  }
  return currentModeSlug
}

export function getCurrentMode(): CCBMode {
  const slug = getCurrentModeSlug()
  const modes = getAllModes()
  return modes.find(m => m.slug === slug) ?? DEFAULT_MODES[0]
}

export function setCurrentMode(slug: string): void {
  const modes = getAllModes()
  const mode = modes.find(m => m.slug === slug)
  if (!mode) {
    throw new Error(
      `Unknown mode: ${slug}. Available: ${modes.map(m => m.slug).join(', ')}`,
    )
  }
  currentModeSlug = slug
  updateSettingsForSource('userSettings', { ccbMode: slug } as Record<
    string,
    unknown
  >)
  for (const listener of modeListeners) listener()
}

function subscribeMode(listener: () => void): () => void {
  modeListeners.add(listener)
  return () => modeListeners.delete(listener)
}

/** Reactive hook — re-renders the component when the mode changes. */
export function useCurrentMode(): CCBMode {
  return useSyncExternalStore(subscribeMode, getCurrentMode)
}

export function listModes(): CCBMode[] {
  return getAllModes()
}

export function cycleMode(): CCBMode {
  const modes = listModes()
  const current = getCurrentModeSlug()
  const idx = modes.findIndex(m => m.slug === current)
  const next = modes[(idx + 1) % modes.length]
  setCurrentMode(next.slug)
  return next
}

import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'
import {
  listFavoriteItems,
  downloadFavoriteItem,
  loadFavoriteItem,
  unloadFavoriteItem,
  uninstallFavoriteItem,
  viewFavoriteItem,
  type FavoriteItemType,
} from '../../costrict/favorite/favorite.js'

function pad(value: string, width: number) {
  return value.length >= width ? value : value + ' '.repeat(width - value.length)
}

function parseFavoriteArgs(args: string) {
  const tokens = args.trim().split(/\s+/)
  const [command = '', idOrFlag, ...rest] = tokens
  let id = ''
  let format: 'table' | 'json' = 'table'
  let type: FavoriteItemType | undefined

  const remaining = [idOrFlag, ...rest].filter((item): item is string => Boolean(item))
  for (let i = 0; i < remaining.length; i++) {
    const token = remaining[i]
    if (token === '--format' && remaining[i + 1]) {
      const value = remaining[++i]
      if (value === 'table' || value === 'json') format = value
      continue
    }
    if (token.startsWith('--format=')) {
      const value = token.slice('--format='.length)
      if (value === 'table' || value === 'json') format = value
      continue
    }
    if (token === '--type' && remaining[i + 1]) {
      const value = remaining[++i]
      if (value === 'skill' || value === 'agent' || value === 'command' || value === 'mcp') type = value as FavoriteItemType
      continue
    }
    if (token.startsWith('--type=')) {
      const value = token.slice('--type='.length)
      if (value === 'skill' || value === 'agent' || value === 'command' || value === 'mcp') type = value as FavoriteItemType
      continue
    }
    if (!id && !token.startsWith('-')) {
      id = token
    }
  }

  return { command, id, format, type }
}

async function printFavoriteList(format: 'table' | 'json', type?: FavoriteItemType): Promise<string> {
  const items = await listFavoriteItems(type)
  if (format === 'json') {
    return JSON.stringify(items, null, 2)
  }

  if (!items.length) {
    return 'No cloud favorites found'
  }

  const statusWidth = Math.max('Status'.length, ...items.map((item) => item.status.length))
  const typeWidth = Math.max('Type'.length, ...items.map((item) => item.itemType.length))
  const slugWidth = Math.max('Slug'.length, ...items.map((item) => item.slug.length))
  const nameWidth = Math.max('Name'.length, ...items.map((item) => item.name.length))

  const lines: string[] = [
    `${pad('Status', statusWidth)}  ${pad('Type', typeWidth)}  ${pad('Slug', slugWidth)}  ${pad('Name', nameWidth)}  Description`,
  ]
  for (const item of items) {
    lines.push(
      `${pad(item.status, statusWidth)}  ${pad(item.itemType, typeWidth)}  ${pad(item.slug, slugWidth)}  ${pad(item.name, nameWidth)}  ${item.description}`,
    )
  }
  return lines.join('\n')
}

async function printFavoriteView(id: string, format: 'table' | 'json'): Promise<string> {
  const item = await viewFavoriteItem(id)
  if (format === 'json') {
    return JSON.stringify(item, null, 2)
  }

  const lines: string[] = [
    `Name: ${item.name}`,
    `Slug: ${item.slug}`,
    `ID: ${item.id}`,
    `Type: ${item.itemType}`,
    `Status: ${item.status}`,
    `Favorites: ${item.favoriteCount ?? 0}`,
  ]
  if (item.version) lines.push(`Version: ${item.version}`)
  if (item.localPath) lines.push(`Local path: ${item.localPath}`)
  lines.push('', item.description || '(no description)')
  return lines.join('\n')
}

async function runFavoriteAction(action: 'download' | 'load' | 'unload' | 'uninstall', id: string): Promise<string> {
  switch (action) {
    case 'download': {
      const item = await downloadFavoriteItem(id)
      return `downloaded ${item.slug}`
    }
    case 'load': {
      const item = await loadFavoriteItem(id)
      return `loaded ${item.slug} as active`
    }
    case 'unload': {
      const item = await unloadFavoriteItem(id)
      return `unloaded ${item.slug}`
    }
    case 'uninstall': {
      const item = await uninstallFavoriteItem(id)
      return `uninstalled ${item.slug}`
    }
  }
}

const HELP_TEXT = `Usage: /favorite <command> [args...]

Manage CoStrict cloud favorite items (skills, agents, commands, MCPs).

Commands:
  list       List cloud favorite items
  view       Show favorite item details
  download   Download favorite item to local storage
  load       Enable a downloaded favorite item
  unload     Disable a favorite item
  uninstall  Remove a local favorite item

Options:
  --type skill|agent|command|mcp   Filter by item type
  --format table|json              Output format (default: table)

Examples:
  /favorite list
  /favorite list --type skill
  /favorite view my-skill
  /favorite download my-skill
  /favorite load my-skill
  /favorite unload my-skill
`

export const call: LocalCommandCall = async (args): Promise<LocalCommandResult> => {
  const parsed = parseFavoriteArgs(args)

  if (!parsed.command || parsed.command === 'help' || parsed.command === '--help' || parsed.command === '-h') {
    return { type: 'text', value: HELP_TEXT }
  }

  if (parsed.command === 'list') {
    const output = await printFavoriteList(parsed.format, parsed.type)
    return { type: 'text', value: output }
  }

  if (!parsed.id) {
    return { type: 'text', value: `Error: favorite id/slug is required\n\n${HELP_TEXT}` }
  }

  if (parsed.command === 'view') {
    const output = await printFavoriteView(parsed.id, parsed.format)
    return { type: 'text', value: output }
  }

  if (['download', 'load', 'unload', 'uninstall'].includes(parsed.command)) {
    try {
      const output = await runFavoriteAction(parsed.command as 'download' | 'load' | 'unload' | 'uninstall', parsed.id)
      return { type: 'text', value: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { type: 'text', value: `Error: ${message}` }
    }
  }

  return { type: 'text', value: `Unknown command: ${parsed.command}\n\n${HELP_TEXT}` }
}

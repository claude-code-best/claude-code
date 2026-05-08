import path from 'node:path'
import { mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises'
import { createCoStrictFetch } from '../provider/fetch.js'
import { getCoStrictBaseURL } from '../provider/auth.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { saveGlobalConfig, getGlobalConfig } from '../../utils/config.js'
import { clearSkillCaches } from '../../skills/loadSkillsDir.js'
import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import type { McpServerConfig } from '../../services/mcp/types.js'

const FAVORITE_PAGE_SIZE = 100
const FAVORITE_MAX_PAGES = 20

export type FavoriteItemType = 'skill' | 'agent' | 'command' | 'mcp'

type FavoriteLifecycle = 'downloaded' | 'active' | 'unloaded'

type FavoriteStateRecord = {
  id: string
  slug: string
  name: string
  itemType: FavoriteItemType
  localPath: string
  lifecycle: FavoriteLifecycle
  installedAt: string
  updatedAt: string
}

type FavoriteState = {
  items: Record<string, FavoriteStateRecord>
}

export type FavoriteItem = {
  id: string
  slug: string
  name: string
  description: string
  itemType: FavoriteItemType
  content: string
  category?: string
  version?: string
  favoriteCount?: number
  favorited?: boolean
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

export type FavoriteStatus = 'Cloud' | 'Downloaded' | 'Active' | 'Unloaded'

export type FavoriteItemWithStatus = FavoriteItem & {
  status: FavoriteStatus
  localPath?: string
}

type RemoteListResponse = {
  items?: Array<{ id: string } & Record<string, unknown>>
  hasMore?: boolean
}

const STORE_TYPE_MAP: Record<string, FavoriteItemType> = {
  skill: 'skill',
  subagent: 'agent',
  command: 'command',
  mcp: 'mcp',
}

const LOCAL_TO_STORE_TYPE: Record<FavoriteItemType, string> = {
  skill: 'skill',
  agent: 'subagent',
  command: 'command',
  mcp: 'mcp',
}

function favoriteRoot() {
  return path.join(getClaudeConfigHomeDir(), 'favorites')
}

function favoriteTypeRoot(itemType: FavoriteItemType) {
  switch (itemType) {
    case 'skill':
      return path.join(favoriteRoot(), 'skills')
    case 'agent':
      return path.join(favoriteRoot(), 'agents')
    case 'command':
      return path.join(favoriteRoot(), 'commands')
    case 'mcp':
      return path.join(favoriteRoot(), 'mcps')
  }
}

function favoriteStatePath() {
  return path.join(favoriteRoot(), 'state.json')
}

function skillsDir() {
  return path.join(getClaudeConfigHomeDir(), 'skills')
}

async function readState(): Promise<FavoriteState> {
  try {
    const text = await readFile(favoriteStatePath(), 'utf-8')
    return JSON.parse(text) as FavoriteState
  } catch {
    return { items: {} }
  }
}

async function writeState(state: FavoriteState) {
  await mkdir(favoriteRoot(), { recursive: true })
  await writeFile(favoriteStatePath(), JSON.stringify(state, null, 2) + '\n')
}

async function mutateState(fn: (state: FavoriteState) => void | Promise<void>) {
  const state = await readState()
  await fn(state)
  await writeState(state)
}

async function listRemoteCandidates(storeType?: string, extraParams?: Record<string, string>) {
  const baseUrl = getCoStrictBaseURL()
  const costrictFetch = createCoStrictFetch()
  const result: Array<{ id: string } & Record<string, unknown>> = []

  for (let page = 1; page <= FAVORITE_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(FAVORITE_PAGE_SIZE),
    })
    if (storeType) params.set('type', storeType)
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        params.set(key, value)
      }
    }
    const url = `${baseUrl}/api/items?${params.toString()}`
    const response = await costrictFetch(url)
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Request failed: ${response.status} ${text}`)
    }
    const data = (await response.json()) as RemoteListResponse
    const items = data.items ?? []
    result.push(...items)
    if (!data.hasMore || items.length === 0) break
  }

  return result
}

function parseFavoriteListItem(data: Record<string, unknown>): FavoriteItem | undefined {
  const storeType = String(data.itemType ?? '')
  const localType = STORE_TYPE_MAP[storeType]
  if (!localType) return undefined

  return {
    id: String(data.id),
    slug: String(data.slug ?? data.id),
    name: String(data.name ?? data.slug ?? data.id),
    description: String(data.description ?? ''),
    itemType: localType,
    content: '',
    category: typeof data.category === 'string' ? data.category : undefined,
    version: typeof data.version === 'string' ? data.version : undefined,
    favoriteCount: typeof data.favoriteCount === 'number' ? data.favoriteCount : undefined,
    favorited: typeof data.favorited === 'boolean' ? data.favorited : undefined,
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  }
}

async function getRemoteItem(id: string): Promise<FavoriteItem> {
  const baseUrl = getCoStrictBaseURL()
  const costrictFetch = createCoStrictFetch()
  const response = await costrictFetch(`${baseUrl}/api/items/${id}`)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Request failed: ${response.status} ${text}`)
  }
  const data = (await response.json()) as Record<string, unknown>
  const storeType = String(data.itemType ?? '')
  const localType = STORE_TYPE_MAP[storeType]
  if (!localType) {
    throw new Error(`Unsupported item type: ${storeType} (${String(data.slug ?? id)})`)
  }
  return {
    id: String(data.id),
    slug: String(data.slug),
    name: String(data.name),
    description: String(data.description ?? ''),
    itemType: localType,
    content: String(data.content ?? ''),
    category: typeof data.category === 'string' ? data.category : undefined,
    version: typeof data.version === 'string' ? data.version : undefined,
    favoriteCount: typeof data.favoriteCount === 'number' ? data.favoriteCount : undefined,
    favorited: typeof data.favorited === 'boolean' ? data.favorited : undefined,
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  }
}

async function getActiveSkillSlugs(): Promise<Set<string>> {
  const sDir = skillsDir()
  const result = new Set<string>()
  try {
    const entries = await readdir(sDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        result.add(entry.name)
      }
    }
  } catch {
    // skills dir doesn't exist
  }
  return result
}

async function getActiveAgentNames(): Promise<Set<string>> {
  const cfg = getGlobalConfig()
  return new Set(Object.keys(cfg.agents ?? {}))
}

async function getActiveCommandNames(): Promise<Set<string>> {
  const cfg = getGlobalConfig()
  return new Set(Object.keys(cfg.commands ?? {}))
}

async function getActiveMcpNames(): Promise<Set<string>> {
  const cfg = getGlobalConfig()
  return new Set(Object.keys(cfg.mcpServers ?? {}))
}

function deriveStatus(
  state: FavoriteStateRecord | undefined,
  activeSkillSlugs: Set<string>,
  activeAgentNames: Set<string>,
  activeCommandNames: Set<string>,
  activeMcpNames: Set<string>,
): FavoriteStatus {
  if (!state) return 'Cloud'
  switch (state.itemType) {
    case 'skill':
      if (activeSkillSlugs.has(state.slug)) return 'Active'
      break
    case 'agent':
      if (activeAgentNames.has(state.slug)) return 'Active'
      break
    case 'command':
      if (activeCommandNames.has(state.slug)) return 'Active'
      break
    case 'mcp':
      if (activeMcpNames.has(state.slug)) return 'Active'
      break
  }
  switch (state.lifecycle) {
    case 'unloaded':
      return 'Unloaded'
    default:
      return 'Downloaded'
  }
}

async function persistInstalledItem(item: FavoriteItem) {
  const typeRoot = favoriteTypeRoot(item.itemType)
  const dir = path.join(typeRoot, item.slug)
  await mkdir(dir, { recursive: true })

  switch (item.itemType) {
    case 'skill':
      await writeFile(path.join(dir, 'SKILL.md'), item.content)
      break
    case 'agent':
      await writeFile(path.join(dir, `${item.slug}.md`), item.content)
      break
    case 'command':
      await writeFile(path.join(dir, `${item.slug}.md`), item.content)
      break
    case 'mcp': {
      const mcpDestPath = path.join(dir, 'mcp.json')
      try {
        const mcpConfig = JSON.parse(item.content)
        await writeFile(mcpDestPath, JSON.stringify(mcpConfig, null, 2) + '\n')
      } catch {
        await writeFile(mcpDestPath, item.content)
      }
      break
    }
  }

  await writeFile(
    path.join(dir, 'item.json'),
    JSON.stringify(
      {
        id: item.id,
        slug: item.slug,
        name: item.name,
        description: item.description,
        itemType: item.itemType,
        category: item.category,
        version: item.version,
        favoriteCount: item.favoriteCount,
        updatedAt: item.updatedAt,
      },
      null,
      2,
    ) + '\n',
  )

  await mutateState((state) => {
    state.items[item.slug] = {
      id: item.id,
      slug: item.slug,
      name: item.name,
      itemType: item.itemType,
      localPath: dir,
      lifecycle: state.items[item.slug]?.lifecycle ?? 'downloaded',
      installedAt: state.items[item.slug]?.installedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  })

  return dir
}

async function hasUsableLocalContent(hit: FavoriteStateRecord): Promise<boolean> {
  const contentPath = (() => {
    switch (hit.itemType) {
      case 'skill':
        return path.join(hit.localPath, 'SKILL.md')
      case 'agent':
        return path.join(hit.localPath, `${hit.slug}.md`)
      case 'command':
        return path.join(hit.localPath, `${hit.slug}.md`)
      case 'mcp':
        return path.join(hit.localPath, 'mcp.json')
    }
  })()
  try {
    const { size } = await import('node:fs/promises').then((m) => m.stat(contentPath))
    return size > 0
  } catch {
    return false
  }
}

async function ensureInstalled(slugOrId: string): Promise<FavoriteStateRecord> {
  const state = await readState()
  const hit = state.items[slugOrId] ?? Object.values(state.items).find((item) => item.id === slugOrId)
  if (hit && (await hasUsableLocalContent(hit))) return hit

  let remote = hit ? await getRemoteItem(hit.id).catch(() => undefined) : undefined
  if (!remote) {
    const favorites = await listFavoriteItems()
    const listed = favorites.find((f) => f.slug === slugOrId || f.id === slugOrId)
    if (!listed) throw new Error(`Favorite item not found: ${slugOrId}`)
    remote = await getRemoteItem(listed.id)
  }

  const localPath = await persistInstalledItem(remote)
  return {
    id: remote.id,
    slug: remote.slug,
    name: remote.name,
    itemType: remote.itemType,
    localPath,
    lifecycle: 'downloaded',
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function convertMcpConfig(config: Record<string, unknown>): Record<string, unknown> | undefined {
  if (typeof config.type === 'string' && (config.type === 'local' || config.type === 'remote')) {
    return config
  }
  if (config.mcpServers && typeof config.mcpServers === 'object' && !Array.isArray(config.mcpServers)) {
    const servers = Object.entries(config.mcpServers as Record<string, unknown>)
    if (servers.length === 0) return undefined
    const [, server] = servers[0]
    if (server && typeof server === 'object') {
      return convertSingleMcpServer(server as Record<string, unknown>)
    }
    return undefined
  }
  return convertSingleMcpServer(config)
}

function convertSingleMcpServer(server: Record<string, unknown>): Record<string, unknown> | undefined {
  const command = server.command
  const args = server.args
  if (!command && !args) return undefined
  const cmdArray: string[] = []
  if (typeof command === 'string') {
    cmdArray.push(command)
  } else if (Array.isArray(command)) {
    for (const c of command) {
      if (typeof c === 'string') cmdArray.push(c)
    }
  }
  if (Array.isArray(args)) {
    for (const arg of args) {
      if (typeof arg === 'string') cmdArray.push(arg)
    }
  }
  if (cmdArray.length === 0) return undefined
  const result: Record<string, unknown> = {
    type: 'local',
    command: cmdArray,
  }
  if (typeof server.environment === 'object' && server.environment !== null) {
    result.environment = server.environment
  }
  return result
}

async function copyDir(src: string, dest: string) {
  await mkdir(dest, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await copyFile(srcPath, destPath)
    }
  }
}

async function addItemToConfig(item: FavoriteItem, localPath: string) {
  switch (item.itemType) {
    case 'skill': {
      const destDir = path.join(skillsDir(), item.slug)
      await mkdir(skillsDir(), { recursive: true })
      await copyDir(localPath, destDir)
      clearSkillCaches()
      break
    }
    case 'agent': {
      const mdPath = path.join(localPath, `${item.slug}.md`)
      const content = await readFile(mdPath, 'utf-8')
      const { frontmatter, content: markdownContent } = parseFrontmatter(content, mdPath)
      saveGlobalConfig((cfg) => ({
        ...cfg,
        agents: {
          ...(cfg.agents ?? {}),
          [item.slug]: {
            ...(frontmatter as Record<string, unknown>),
            prompt: markdownContent.trim(),
          },
        },
      }))
      break
    }
    case 'command': {
      const mdPath = path.join(localPath, `${item.slug}.md`)
      const content = await readFile(mdPath, 'utf-8')
      const { frontmatter, content: markdownContent } = parseFrontmatter(content, mdPath)
      saveGlobalConfig((cfg) => ({
        ...cfg,
        commands: {
          ...(cfg.commands ?? {}),
          [item.slug]: {
            ...(frontmatter as Record<string, unknown>),
            template: markdownContent.trim(),
          },
        },
      }))
      break
    }
    case 'mcp': {
      const mcpJsonPath = path.join(localPath, 'mcp.json')
      const configJson = JSON.parse(await readFile(mcpJsonPath, 'utf-8')) as Record<string, unknown>
      const converted = convertMcpConfig(configJson)
      if (!converted) {
        throw new Error(
          `Unable to recognize MCP configuration format: ${item.slug}\n\n` +
            `Configuration file: ${mcpJsonPath}\n` +
            `Supported formats: opencode native, VS Code / Claude Desktop style, or simplified { command, args }`,
        )
      }
      saveGlobalConfig((cfg) => ({
        ...cfg,
        mcpServers: {
          ...(cfg.mcpServers ?? {}),
          [item.slug]: converted as unknown as McpServerConfig,
        },
      }))
      break
    }
  }
}

async function removeItemFromConfig(itemType: FavoriteItemType, slug: string, _localPath: string) {
  switch (itemType) {
    case 'skill': {
      const destDir = path.join(skillsDir(), slug)
      await rm(destDir, { recursive: true, force: true })
      clearSkillCaches()
      break
    }
    case 'agent': {
      saveGlobalConfig((cfg) => {
        const agents = { ...(cfg.agents ?? {}) }
        delete agents[slug]
        return { ...cfg, agents }
      })
      break
    }
    case 'command': {
      saveGlobalConfig((cfg) => {
        const commands = { ...(cfg.commands ?? {}) }
        delete commands[slug]
        return { ...cfg, commands }
      })
      break
    }
    case 'mcp': {
      saveGlobalConfig((cfg) => {
        const mcpServers = { ...(cfg.mcpServers ?? {}) }
        delete mcpServers[slug]
        return { ...cfg, mcpServers }
      })
      break
    }
  }
}

async function readItemForConfig(installed: FavoriteStateRecord): Promise<FavoriteItem> {
  const itemMetaPath = path.join(installed.localPath, 'item.json')
  let itemMeta: Record<string, unknown> = {}
  try {
    const text = await readFile(itemMetaPath, 'utf-8')
    itemMeta = JSON.parse(text) as Record<string, unknown>
  } catch {
    // ignore
  }
  return {
    id: installed.id,
    slug: installed.slug,
    name: installed.name,
    description: String(itemMeta.description ?? ''),
    itemType: installed.itemType,
    content: '',
  }
}

export async function listFavoriteItems(type?: FavoriteItemType): Promise<FavoriteItemWithStatus[]> {
  const storeTypes = type ? [LOCAL_TO_STORE_TYPE[type]] : Object.values(LOCAL_TO_STORE_TYPE)
  const candidatePages = await Promise.all(
    [...new Set(storeTypes)].map(async (st) =>
      listRemoteCandidates(st, { favorited: 'true' }).catch((error) => {
        console.warn('failed to fetch remote favorite candidates', { type: st, error })
        return []
      }),
    ),
  )
  const candidates = candidatePages.flat()

  const [activeSkillSlugs, activeAgentNames, activeCommandNames, activeMcpNames, state] = await Promise.all([
    getActiveSkillSlugs(),
    getActiveAgentNames(),
    getActiveCommandNames(),
    getActiveMcpNames(),
    readState(),
  ])

  const seen = new Set<string>()
  const result: FavoriteItemWithStatus[] = []

  for (const candidate of candidates) {
    const item = parseFavoriteListItem(candidate)
    if (!item) continue
    if (!item?.favorited) continue
    if (seen.has(item.slug)) continue
    seen.add(item.slug)
    const local = state.items[item.slug]
    result.push({
      ...item,
      status: deriveStatus(local, activeSkillSlugs, activeAgentNames, activeCommandNames, activeMcpNames),
      localPath: local?.localPath,
    })
  }

  if (result.length === 0) {
    for (const [slug, record] of Object.entries(state.items)) {
      if (type && record.itemType !== type) continue
      if (seen.has(slug)) continue
      seen.add(slug)
      result.push({
        id: record.id,
        slug: record.slug,
        name: record.name,
        description: '',
        itemType: record.itemType,
        content: '',
        status: deriveStatus(record, activeSkillSlugs, activeAgentNames, activeCommandNames, activeMcpNames),
        localPath: record.localPath,
      })
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name))
}

export async function viewFavoriteItem(slugOrId: string): Promise<FavoriteItemWithStatus> {
  const favorites = await listFavoriteItems()
  const item = favorites.find((f) => f.slug === slugOrId || f.id === slugOrId)
  if (!item) throw new Error(`Favorite item not found: ${slugOrId}`)

  const detail = await getRemoteItem(item.id)
  return {
    ...detail,
    status: item.status,
    localPath: item.localPath,
  }
}

export async function downloadFavoriteItem(slugOrId: string) {
  const item = await viewFavoriteItem(slugOrId)
  const localPath = await persistInstalledItem(item)
  await mutateState((state) => {
    const record = state.items[item.slug]
    record.lifecycle = 'downloaded'
    record.updatedAt = new Date().toISOString()
    record.localPath = localPath
  })
  return { ...item, status: 'Downloaded' as const, localPath }
}

export async function loadFavoriteItem(slugOrId: string) {
  const installed = await ensureInstalled(slugOrId)
  const itemForConfig = await readItemForConfig(installed)
  await addItemToConfig(itemForConfig, installed.localPath)
  await mutateState((state) => {
    const record = state.items[installed.slug]
    record.lifecycle = 'active'
    record.updatedAt = new Date().toISOString()
  })
  return installed
}

export async function unloadFavoriteItem(slugOrId: string) {
  const installed = await ensureInstalled(slugOrId)
  await removeItemFromConfig(installed.itemType, installed.slug, installed.localPath)
  await mutateState((state) => {
    const record = state.items[installed.slug]
    record.lifecycle = 'unloaded'
    record.updatedAt = new Date().toISOString()
  })
  return installed
}

export async function uninstallFavoriteItem(slugOrId: string) {
  const installed = await ensureInstalled(slugOrId)
  await removeItemFromConfig(installed.itemType, installed.slug, installed.localPath)
  await rm(installed.localPath, { recursive: true, force: true })
  await mutateState((state) => {
    delete state.items[installed.slug]
  })
  return installed
}

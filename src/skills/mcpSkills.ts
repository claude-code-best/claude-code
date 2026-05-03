import {
  type ListResourcesResult,
  ListResourcesResultSchema,
  type ReadResourceResult,
  ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { Command } from '../commands.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import { normalizeNameForMCP } from '../services/mcp/normalization.js'
import { memoizeWithLRU } from '../utils/memoize.js'
import { errorMessage } from '../utils/errors.js'
import { logMCPDebug, logMCPError } from '../utils/log.js'
import { recursivelySanitizeUnicode } from '../utils/sanitization.js'
import { parseFrontmatter } from '../utils/frontmatterParser.js'
import { getMCPSkillBuilders } from './mcpSkillBuilders.js'

const SKILL_URI_PREFIX = 'skill://'
const MCP_FETCH_CACHE_SIZE = 20

/**
 * 发现由 MCP 服务通过 `skill://` 资源暴露的技能。
 *
 * 对每个匹配的资源进行读取，解析其 Markdown 内容中的 frontmatter，
 * 并将结果转换为一个 Command，使技能系统能够像处理本地 `.md` 技能文件一样
 * 对其进行索引和调用。
 *
 * 按服务器名称进行缓存（memoization），因此在同一连接生命周期内的重复调用
 * 会返回缓存结果。调用方可以通过 `.cache.delete(name)` 使缓存失效。
 */
export const fetchMcpSkillsForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<Command[]> => {
    if (client.type !== 'connected') return []

    try {
      if (!client.capabilities?.resources) {
        return []
      }

      // List all resources and filter to skill:// URIs
      const result = (await client.client.request(
        { method: 'resources/list' },
        ListResourcesResultSchema,
      )) as ListResourcesResult

      if (!result.resources) return []

      const skillResources = result.resources.filter(r =>
        r.uri.startsWith(SKILL_URI_PREFIX),
      )

      if (skillResources.length === 0) return []

      logMCPDebug(
        client.name,
        `Found ${skillResources.length} skill resource(s)`,
      )

      const { createSkillCommand, parseSkillFrontmatterFields } =
        getMCPSkillBuilders()

      const commands: Command[] = []

      for (const resource of skillResources) {
        try {
          // Read the skill resource content
          const readResult = (await client.client.request(
            {
              method: 'resources/read',
              params: { uri: resource.uri },
            },
            ReadResourceResultSchema,
          )) as ReadResourceResult

          // Extract text content from the resource
          const textContent = readResult.contents
            ?.map(c => ('text' in c ? c.text : undefined))
            .filter(Boolean)
            .join('\n')

          if (!textContent) {
            logMCPDebug(
              client.name,
              `Skill resource ${resource.uri} returned no text content, skipping`,
            )
            continue
          }

          const sanitizedContent = recursivelySanitizeUnicode(textContent)

          // Parse the markdown frontmatter
          const { frontmatter, content: markdownContent } =
            parseFrontmatter(sanitizedContent)

          // Derive a skill name from the resource URI. Strip the skill://
          // prefix and use the remainder, prefixed with the MCP server name
          // so it is unique across servers.
          const rawName = resource.uri.slice(SKILL_URI_PREFIX.length)
          const skillName =
            'mcp__' + normalizeNameForMCP(client.name) + '__' + rawName

          const parsed = parseSkillFrontmatterFields(
            frontmatter,
            markdownContent,
            skillName,
          )

          commands.push(
            createSkillCommand({
              ...parsed,
              skillName,
              markdownContent,
              source: 'mcp',
              loadedFrom: 'mcp',
              baseDir: undefined,
              paths: undefined,
            }),
          )
        } catch (error) {
          logMCPError(
            client.name,
            `Failed to load skill resource ${resource.uri}: ${errorMessage(error)}`,
          )
        }
      }

      logMCPDebug(
        client.name,
        `Loaded ${commands.length} skill(s) from resources`,
      )

      return commands
    } catch (error) {
      logMCPError(
        client.name,
        `Failed to fetch skill resources: ${errorMessage(error)}`,
      )
      return []
    }
  },
  (client: MCPServerConnection) => client.name,
  MCP_FETCH_CACHE_SIZE,
)

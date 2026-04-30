// Conditionally require()'d in LogoV2.tsx behind feature('KAIROS') ||
// feature('KAIROS_CHANNELS'). No feature() guard here — the whole file
// tree-shakes via the require pattern when both flags are false (see
// docs/feature-gating.md). Do NOT import this module statically from
// unguarded code.

import * as React from 'react'
import { useState } from 'react'
import {
  type ChannelEntry,
  getAllowedChannels,
  getHasDevChannels,
} from '../../bootstrap/state.js'
import { getBuiltinPlugins } from '../../plugins/builtinPlugins.js'
import { Box, Text } from '@anthropic/ink'
import { getMcpConfigsByScope } from '../../services/mcp/config.js'
import { loadInstalledPluginsV2 } from '../../utils/plugins/installedPluginsManager.js'

export function ChannelsNotice(): React.ReactNode {
  // Snapshot all reads at mount. This notice enters scrollback immediately
  // after the logo; any re-render past that point forces a full terminal
  // reset.
  const [{ channels, list, unmatched }] =
    useState(() => {
      const ch = getAllowedChannels()
      if (ch.length === 0)
        return {
          channels: ch,
          list: '',
          unmatched: [] as Unmatched[],
        }
      const l = ch.map(formatEntry).join(', ')
      return {
        channels: ch,
        list: l,
        unmatched: findUnmatched(ch),
      }
    })
  if (channels.length === 0) return null

  // When both flags are passed, the list mixes entries and a single flag
  // name would be wrong for half of it. entry.dev distinguishes origin.
  const hasNonDev = channels.some(c => !c.dev)
  const flag =
    getHasDevChannels() && hasNonDev
      ? 'Channels'
      : getHasDevChannels()
        ? '--dangerously-load-development-channels'
        : '--channels'

  // "Listening for" not "active" — at this point we only know the allowlist
  // was set. Server connection, capability declaration, and whether the name
  // even matches a configured MCP server are all still unknown.
  return (
    <Box paddingLeft={2} flexDirection="column">
      <Text color="error">Listening for channel messages from: {list}</Text>
      <Text dimColor>
        Experimental · inbound messages will be pushed into this session, this
        carries prompt injection risks. Restart Claude Code without {flag} to
        disable.
      </Text>
      {unmatched.map(u => (
        <Text key={`${formatEntry(u.entry)}:${u.why}`} color="warning">
          {formatEntry(u.entry)} · {u.why}
        </Text>
      ))}
    </Box>
  )
}

function formatEntry(c: ChannelEntry): string {
  return c.kind === 'plugin'
    ? `plugin:${c.name}@${c.marketplace}`
    : `server:${c.name}`
}

type Unmatched = { entry: ChannelEntry; why: string }

type FindUnmatchedDeps = {
  configuredServerNames?: ReadonlySet<string>
  installedPluginIds?: ReadonlySet<string>
}

export function findUnmatched(
  entries: readonly ChannelEntry[],
  deps?: FindUnmatchedDeps,
): Unmatched[] {
  // Server-kind: build one Set from all scopes up front. getMcpConfigsByScope
  // is not cached (project scope walks the dir tree); getMcpConfigByName would
  // redo that walk per entry.
  const configured = deps?.configuredServerNames ?? (() => {
    const scopes = ['enterprise', 'user', 'project', 'local'] as const
    const names = new Set<string>()
    for (const scope of scopes) {
      for (const name of Object.keys(getMcpConfigsByScope(scope).servers)) {
        names.add(name)
      }
    }
    return names
  })()

  // Plugin-kind installed check: installed_plugins.json keys are
  // `name@marketplace`. loadInstalledPluginsV2 is cached.
  const installedPluginIds = deps?.installedPluginIds ?? (() => {
    const ids = new Set(Object.keys(loadInstalledPluginsV2().plugins))
    const builtinPlugins = getBuiltinPlugins()
    for (const plugin of [...builtinPlugins.enabled, ...builtinPlugins.disabled]) {
      ids.add(plugin.source)
    }
    return ids
  })()

  const out: Unmatched[] = []
  for (const entry of entries) {
    if (entry.kind === 'server') {
      if (!configured.has(entry.name)) {
        out.push({ entry, why: 'no MCP server configured with that name' })
      }
      continue
    }
    if (!installedPluginIds.has(`${entry.name}@${entry.marketplace}`)) {
      out.push({ entry, why: 'plugin not installed' })
    }
  }
  return out
}

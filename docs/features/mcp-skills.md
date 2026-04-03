# MCP_SKILLS — MCP Skill Discovery

> Feature Flag: `FEATURE_MCP_SKILLS=1`
> Implementation Status: Functional implementation (config-gated filter complete, core fetcher is stub)
> Reference Count: 9

## 1. Feature Overview

MCP_SKILLS discovers resources exposed by MCP servers (using the `skill://` URI scheme) and converts them into callable skill commands. MCP servers can provide tools, prompts, and resources simultaneously; when this feature is enabled, resources with `skill://` URIs are identified as skills.

### Core Features

- **Auto-Discovery**: Automatically fetches `skill://` resources when MCP server connects
- **Command Conversion**: Converts MCP resources into `prompt`-type Command objects
- **Real-time Refresh**: Re-fetches skills when prompts/resources lists change
- **Cache Consistency**: Clears skill cache when connection closes

## 2. Implementation Architecture

### 2.1 Data Flow

```
MCP Server connects
      |
      v
client.ts: connectToServer / setupMcpClientConnections
  +-- fetchToolsForClient     (MCP tools)
  +-- fetchCommandsForClient   (MCP prompts -> Command objects)
  +-- fetchMcpSkillsForClient  (MCP skill:// resources -> Command objects) [MCP_SKILLS]
  +-- fetchResourcesForClient  (MCP resources)
      |
      v
commands = [...mcpPrompts, ...mcpSkills]
      |
      v
AppState.mcp.commands updated
      |
      v
getMcpSkillCommands() filter -> SkillTool invocation
```

### 2.2 Skill Filtering

File: `src/commands.ts:547-558`

`getMcpSkillCommands(mcpCommands)` filter conditions:

```ts
cmd.type === 'prompt'                  // must be prompt type
cmd.loadedFrom === 'mcp'               // must come from MCP server
!cmd.disableModelInvocation            // must be invocable by model
feature('MCP_SKILLS')                  // feature flag must be enabled
```

### 2.3 Conditional Loading

File: `src/services/mcp/client.ts:117-121`

`fetchMcpSkillsForClient` is conditionally loaded via `require()`, no module loaded when feature flag is off:

```ts
const fetchMcpSkillsForClient = feature('MCP_SKILLS')
  ? require('../../skills/mcpSkills.js').fetchMcpSkillsForClient
  : null
```

### 2.4 Cache Management

The skill fetch function maintains a `.cache` (Map), cleared on the following events:

| Event | Behavior |
|-------|----------|
| Connection closed | Clear skill cache for that client |
| `disconnectMcpServer()` | Clear skill cache |
| `prompts/list_changed` notification | Refresh prompts + fetch skills in parallel |
| `resources/list_changed` notification | Refresh resources + prompts + skills |

### 2.5 Integration Points

| File | Line | Description |
|------|------|-------------|
| `src/commands.ts` | 547-558, 561-608 | Command filtering and SkillTool command collection |
| `src/services/mcp/client.ts` | 117-121, 1394, 1672, 2173-2181, 2346-2358 | Skill fetching, cache clearing, fetch on connect |
| `src/services/mcp/useManageMCPConnections.ts` | 22-26, 682-740 | Real-time refresh (prompts/resources changes) |

## 3. Key Design Decisions

1. **Feature Gate Isolation**: `feature('MCP_SKILLS')` guards conditional `require()` and all call sites. When off, no module loading, no fetch operations
2. **Resource-to-Skill Mapping**: Skills are discovered from MCP server's `skill://` URI resources. `fetchMcpSkillsForClient` handles conversion (currently stub)
3. **Circular Dependency Avoidance**: `mcpSkillBuilders.ts` serves as a dependency graph leaf node, avoiding `client.ts <-> mcpSkills.ts <-> loadSkillsDir.ts` cycle
4. **Server Capability Check**: Skill fetching also requires MCP server to support resources (`!!client.capabilities?.resources`)

## 4. Usage

```bash
# Enable feature
FEATURE_MCP_SKILLS=1 bun run dev

# Prerequisites:
# 1. Configured an MCP server that supports skill:// resources
# 2. MCP server declares resources capability
```

## 5. Content Needing Implementation

| File | Status | Needs Implementation |
|------|--------|----------------------|
| `src/skills/mcpSkills.ts` | Stub | `fetchMcpSkillsForClient()` — Filter `skill://` URIs from MCP resource list and convert to Command objects |
| `src/skills/mcpSkillBuilders.ts` | Stub | Skill builder registration (avoids circular dependencies) |

## 6. File Index

| File | Responsibility |
|------|----------------|
| `src/commands.ts:547-608` | Skill command filtering |
| `src/services/mcp/client.ts:117-2358` | Skill fetching + cache management |
| `src/services/mcp/useManageMCPConnections.ts` | Real-time refresh |
| `src/skills/mcpSkills.ts` | Core conversion logic (stub) |

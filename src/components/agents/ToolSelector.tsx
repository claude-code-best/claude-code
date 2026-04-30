import figures from 'figures'
import React, { useCallback, useMemo, useState } from 'react'
import { mcpInfoFromString } from 'src/services/mcp/mcpStringUtils.js'
import { isMcpTool } from 'src/services/mcp/utils.js'
import type { Tool, Tools } from 'src/Tool.js'
import { filterToolsForAgent } from '@claude-code-best/builtin-tools/tools/AgentTool/agentToolUtils.js'
import { AGENT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/AgentTool/constants.js'
import { BashTool } from '@claude-code-best/builtin-tools/tools/BashTool/BashTool.js'
import { ExitPlanModeV2Tool } from '@claude-code-best/builtin-tools/tools/ExitPlanModeTool/ExitPlanModeV2Tool.js'
import { FileEditTool } from '@claude-code-best/builtin-tools/tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from '@claude-code-best/builtin-tools/tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '@claude-code-best/builtin-tools/tools/FileWriteTool/FileWriteTool.js'
import { GlobTool } from '@claude-code-best/builtin-tools/tools/GlobTool/GlobTool.js'
import { GrepTool } from '@claude-code-best/builtin-tools/tools/GrepTool/GrepTool.js'
import { ListMcpResourcesTool } from '@claude-code-best/builtin-tools/tools/ListMcpResourcesTool/ListMcpResourcesTool.js'
import { NotebookEditTool } from '@claude-code-best/builtin-tools/tools/NotebookEditTool/NotebookEditTool.js'
import { ReadMcpResourceTool } from '@claude-code-best/builtin-tools/tools/ReadMcpResourceTool/ReadMcpResourceTool.js'
import { TaskOutputTool } from '@claude-code-best/builtin-tools/tools/TaskOutputTool/TaskOutputTool.js'
import { TaskStopTool } from '@claude-code-best/builtin-tools/tools/TaskStopTool/TaskStopTool.js'
import { TodoWriteTool } from '@claude-code-best/builtin-tools/tools/TodoWriteTool/TodoWriteTool.js'
import { TungstenTool } from '@claude-code-best/builtin-tools/tools/TungstenTool/TungstenTool.js'
import { WebFetchTool } from '@claude-code-best/builtin-tools/tools/WebFetchTool/WebFetchTool.js'
import { WebSearchTool } from '@claude-code-best/builtin-tools/tools/WebSearchTool/WebSearchTool.js'
import { type KeyboardEvent, Box, Text } from '@anthropic/ink'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { count } from '../../utils/array.js'
import { plural } from '../../utils/stringUtils.js'
import { Divider } from '@anthropic/ink'

type Props = {
  tools: Tools
  initialTools: string[] | undefined
  onComplete: (selectedTools: string[] | undefined) => void
  onCancel?: () => void
}

type ToolBucket = {
  name: string
  toolNames: Set<string>
  isMcp?: boolean
}

type ToolBuckets = {
  READ_ONLY: ToolBucket
  EDIT: ToolBucket
  EXECUTION: ToolBucket
  MCP: ToolBucket
  OTHER: ToolBucket
}

function getToolBuckets(): ToolBuckets {
  return {
    READ_ONLY: {
      name: 'Read-only tools',
      toolNames: new Set([
        GlobTool.name,
        GrepTool.name,
        ExitPlanModeV2Tool.name,
        FileReadTool.name,
        WebFetchTool.name,
        TodoWriteTool.name,
        WebSearchTool.name,
        TaskStopTool.name,
        TaskOutputTool.name,
        ListMcpResourcesTool.name,
        ReadMcpResourceTool.name,
      ]),
    },
    EDIT: {
      name: 'Edit tools',
      toolNames: new Set([
        FileEditTool.name,
        FileWriteTool.name,
        NotebookEditTool.name,
      ]),
    },
    EXECUTION: {
      name: 'Execution tools',
      toolNames: new Set(
        [
          BashTool.name,
          process.env.USER_TYPE === 'ant' ? TungstenTool.name : undefined,
        ].filter(n => n !== undefined),
      ),
    },
    MCP: {
      name: 'MCP tools',
      toolNames: new Set(), // Dynamic - no static list
      isMcp: true,
    },
    OTHER: {
      name: 'Other tools',
      toolNames: new Set(), // Dynamic - catch-all for uncategorized tools
    },
  }
}

// Helper to get MCP server buckets dynamically
function getMcpServerBuckets(tools: Tools): Array<{
  serverName: string
  tools: Tools
}> {
  const serverMap = new Map<string, Tool[]>()

  tools.forEach(tool => {
    if (isMcpTool(tool)) {
      const mcpInfo = mcpInfoFromString(tool.name)
      if (mcpInfo?.serverName) {
        const existing = serverMap.get(mcpInfo.serverName) || []
        existing.push(tool)
        serverMap.set(mcpInfo.serverName, existing)
      }
    }
  })

  return Array.from(serverMap.entries())
    .map(([serverName, tools]) => ({ serverName, tools }))
    .sort((a, b) => a.serverName.localeCompare(b.serverName))
}

export function ToolSelector({
  tools,
  initialTools,
  onComplete,
  onCancel,
}: Props): React.ReactNode {
  // Filter tools for custom agents
  const customAgentTools = useMemo(
    () => filterToolsForAgent({ tools, isBuiltIn: false, isAsync: false }),
    [tools],
  )

  // Expand wildcard or undefined to explicit tool list for internal state
  const expandedInitialTools =
    !initialTools || initialTools.includes('*')
      ? customAgentTools.map(t => t.name)
      : initialTools

  const [selectedTools, setSelectedTools] =
    useState<string[]>(expandedInitialTools)
  const [focusIndex, setFocusIndex] = useState(0)
  const [showIndividualTools, setShowIndividualTools] = useState(false)

  // Filter selectedTools to only include tools that currently exist
  // This handles MCP tools that disconnect while selected
  const validSelectedTools = useMemo(() => {
    const toolNames = new Set(customAgentTools.map(t => t.name))
    return selectedTools.filter(name => toolNames.has(name))
  }, [selectedTools, customAgentTools])

  const selectedSet = new Set(validSelectedTools)
  const isAllSelected =
    validSelectedTools.length === customAgentTools.length &&
    customAgentTools.length > 0

  const handleToggleTool = (toolName: string) => {
    if (!toolName) return

    setSelectedTools(current =>
      current.includes(toolName)
        ? current.filter(t => t !== toolName)
        : [...current, toolName],
    )
  }

  const handleToggleTools = (toolNames: string[], select: boolean) => {
    setSelectedTools(current => {
      if (select) {
        const toolsToAdd = toolNames.filter(t => !current.includes(t))
        return [...current, ...toolsToAdd]
      } else {
        return current.filter(t => !toolNames.includes(t))
      }
    })
  }

  const handleConfirm = () => {
    // Convert to undefined if all tools are selected (for cleaner file format)
    const allToolNames = customAgentTools.map(t => t.name)
    const areAllToolsSelected =
      validSelectedTools.length === allToolNames.length &&
      allToolNames.every(name => validSelectedTools.includes(name))
    const finalTools = areAllToolsSelected ? undefined : validSelectedTools

    onComplete(finalTools)
  }

  // Group tools by bucket
  const toolsByBucket = useMemo(() => {
    const toolBuckets = getToolBuckets()
    const buckets = {
      readOnly: [] as Tool[],
      edit: [] as Tool[],
      execution: [] as Tool[],
      mcp: [] as Tool[],
      other: [] as Tool[],
    }

    customAgentTools.forEach(tool => {
      // Check if it's an MCP tool first
      if (isMcpTool(tool)) {
        buckets.mcp.push(tool)
      } else if (toolBuckets.READ_ONLY.toolNames.has(tool.name)) {
        buckets.readOnly.push(tool)
      } else if (toolBuckets.EDIT.toolNames.has(tool.name)) {
        buckets.edit.push(tool)
      } else if (toolBuckets.EXECUTION.toolNames.has(tool.name)) {
        buckets.execution.push(tool)
      } else if (tool.name !== AGENT_TOOL_NAME) {
        // Catch-all for uncategorized tools (except Task)
        buckets.other.push(tool)
      }
    })

    return buckets
  }, [customAgentTools])

  const createBucketToggleAction = (bucketTools: Tool[]) => {
    const selected = count(bucketTools, t => selectedSet.has(t.name))
    const needsSelection = selected < bucketTools.length

    return () => {
      const toolNames = bucketTools.map(t => t.name)
      handleToggleTools(toolNames, needsSelection)
    }
  }

  // Build navigable items (no separators)
  const navigableItems: Array<{
    id: string
    label: string
    action: () => void
    isContinue?: boolean
    isToggle?: boolean
    isHeader?: boolean
  }> = []

  // Continue button
  navigableItems.push({
    id: 'continue',
    label: 'Continue',
    action: handleConfirm,
    isContinue: true,
  })

  // All tools
  navigableItems.push({
    id: 'bucket-all',
    label: `${isAllSelected ? figures.checkboxOn : figures.checkboxOff} All tools`,
    action: () => {
      const allToolNames = customAgentTools.map(t => t.name)
      handleToggleTools(allToolNames, !isAllSelected)
    },
  })

  // Create bucket menu items
  const toolBuckets = getToolBuckets()
  const bucketConfigs = [
    {
      id: 'bucket-readonly',
      name: toolBuckets.READ_ONLY.name,
      tools: toolsByBucket.readOnly,
    },
    {
      id: 'bucket-edit',
      name: toolBuckets.EDIT.name,
      tools: toolsByBucket.edit,
    },
    {
      id: 'bucket-execution',
      name: toolBuckets.EXECUTION.name,
      tools: toolsByBucket.execution,
    },
    {
      id: 'bucket-mcp',
      name: toolBuckets.MCP.name,
      tools: toolsByBucket.mcp,
    },
    {
      id: 'bucket-other',
      name: toolBuckets.OTHER.name,
      tools: toolsByBucket.other,
    },
  ]

  bucketConfigs.forEach(({ id, name, tools: bucketTools }) => {
    if (bucketTools.length === 0) return

    const selected = count(bucketTools, t => selectedSet.has(t.name))
    const isFullySelected = selected === bucketTools.length

    navigableItems.push({
      id,
      label: `${isFullySelected ? figures.checkboxOn : figures.checkboxOff} ${name}`,
      action: createBucketToggleAction(bucketTools),
    })
  })

  // Toggle button for individual tools
  const toggleButtonIndex = navigableItems.length
  navigableItems.push({
    id: 'toggle-individual',
    label: showIndividualTools
      ? 'Hide advanced options'
      : 'Show advanced options',
    action: () => {
      setShowIndividualTools(!showIndividualTools)
      // If hiding tools and focus is on an individual tool, move focus to toggle button
      if (showIndividualTools && focusIndex > toggleButtonIndex) {
        setFocusIndex(toggleButtonIndex)
      }
    },
    isToggle: true,
  })

  // Memoize MCP server buckets (must be outside conditional for hooks rules)
  const mcpServerBuckets = useMemo(
    () => getMcpServerBuckets(customAgentTools),
    [customAgentTools],
  )

  // Individual tools (only if expanded)
  if (showIndividualTools) {
    // Add MCP server buckets if any exist
    if (mcpServerBuckets.length > 0) {
      navigableItems.push({
        id: 'mcp-servers-header',
        label: 'MCP Servers:',
        action: () => {}, // No action - just a header
        isHeader: true,
      })

      mcpServerBuckets.forEach(({ serverName, tools: serverTools }) => {
        const selected = count(serverTools, t => selectedSet.has(t.name))
        const isFullySelected = selected === serverTools.length

        navigableItems.push({
          id: `mcp-server-${serverName}`,
          label: `${isFullySelected ? figures.checkboxOn : figures.checkboxOff} ${serverName} (${serverTools.length} ${plural(serverTools.length, 'tool')})`,
          action: () => {
            const toolNames = serverTools.map(t => t.name)
            handleToggleTools(toolNames, !isFullySelected)
          },
        })
      })

      // Add separator header before individual tools
      navigableItems.push({
        id: 'tools-header',
        label: 'Individual Tools:',
        action: () => {},
        isHeader: true,
      })
    }

    // Add individual tools
    customAgentTools.forEach(tool => {
      let displayName = tool.name
      if (tool.name.startsWith('mcp__')) {
        const mcpInfo = mcpInfoFromString(tool.name)
        displayName = mcpInfo
          ? `${mcpInfo.toolName} (${mcpInfo.serverName})`
          : tool.name
      }

      navigableItems.push({
        id: `tool-${tool.name}`,
        label: `${selectedSet.has(tool.name) ? figures.checkboxOn : figures.checkboxOff} ${displayName}`,
        action: () => handleToggleTool(tool.name),
      })
    })
  }

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel()
    } else {
      onComplete(initialTools)
    }
  }, [onCancel, onComplete, initialTools])

  useKeybinding('confirm:no', handleCancel, { context: 'Confirmation' })

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'return') {
      e.preventDefault()
      const item = navigableItems[focusIndex]
      if (item && !item.isHeader) {
        item.action()
      }
    } else if (e.key === 'up') {
      e.preventDefault()
      let newIndex = focusIndex - 1
      // Skip headers when navigating up
      while (newIndex > 0 && navigableItems[newIndex]?.isHeader) {
        newIndex--
      }
      setFocusIndex(Math.max(0, newIndex))
    } else if (e.key === 'down') {
      e.preventDefault()
      let newIndex = focusIndex + 1
      // Skip headers when navigating down
      while (
        newIndex < navigableItems.length - 1 &&
        navigableItems[newIndex]?.isHeader
      ) {
        newIndex++
      }
      setFocusIndex(Math.min(navigableItems.length - 1, newIndex))
    }
  }

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      {/* Render Continue button */}
      <Text
        color={focusIndex === 0 ? 'suggestion' : undefined}
        bold={focusIndex === 0}
      >
        {focusIndex === 0 ? `${figures.pointer} ` : '  '}[ Continue ]
      </Text>

      {/* Separator */}
      <Divider width={40} />

      {/* Render all navigable items except Continue (which is at index 0) */}
      {navigableItems.slice(1).map((item, index) => {
        const isCurrentlyFocused = index + 1 === focusIndex
        const isToggleButton = item.isToggle
        const isHeader = item.isHeader

        return (
          <React.Fragment key={item.id}>
            {/* Add separator before toggle button */}
            {isToggleButton && <Divider width={40} />}

            {/* Add margin before headers */}
            {isHeader && index > 0 && <Box marginTop={1} />}

            <Text
              color={
                isHeader
                  ? undefined
                  : isCurrentlyFocused
                    ? 'suggestion'
                    : undefined
              }
              dimColor={isHeader}
              bold={isToggleButton && isCurrentlyFocused}
            >
              {isHeader
                ? ''
                : isCurrentlyFocused
                  ? `${figures.pointer} `
                  : '  '}
              {isToggleButton ? `[ ${item.label} ]` : item.label}
            </Text>
          </React.Fragment>
        )
      })}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          {isAllSelected
            ? 'All tools selected'
            : `${selectedSet.size} of ${customAgentTools.length} tools selected`}
        </Text>
      </Box>
    </Box>
  )
}

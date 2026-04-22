import React from 'react'

/**
 * Shared spawn module for teammate creation.
 * Extracted from TeammateTool to allow reuse by AgentTool.
 */

import {
  getSessionId,
} from 'src/bootstrap/state.js'
import type { ToolUseContext } from 'src/Tool.js'
import { formatAgentId } from 'src/utils/agentId.js'
import { getGlobalConfig } from 'src/utils/config.js'
import { getCwd } from 'src/utils/cwd.js'
import { logForDebugging } from 'src/utils/debug.js'
import { parseUserSpecifiedModel } from 'src/utils/model/model.js'
import {
  getTeammateExecutor,
} from 'src/utils/swarm/backends/registry.js'
import type { BackendType, TeammateSpawnResult } from 'src/utils/swarm/backends/types.js'
import {
  SWARM_SESSION_NAME,
  TEAM_LEAD_NAME,
} from 'src/utils/swarm/constants.js'
import { It2SetupPrompt } from 'src/utils/swarm/It2SetupPrompt.js'
import {
  getTeamFilePath,
  readTeamFileAsync,
  sanitizeAgentName,
  writeTeamFileAsync,
  type TeamFile,
} from 'src/utils/swarm/teamHelpers.js'
import {
  assignTeammateColor,
} from 'src/utils/swarm/teammateLayoutManager.js'
import { getHardcodedTeammateModelFallback } from 'src/utils/swarm/teammateModel.js'
import type { CustomAgentDefinition } from '../AgentTool/loadAgentsDir.js'
import { isCustomAgent } from '../AgentTool/loadAgentsDir.js'

function getDefaultTeammateModel(leaderModel: string | null): string {
  const configured = getGlobalConfig().teammateDefaultModel
  if (configured === null) {
    // User picked "Default" in the /config picker — follow the leader.
    return leaderModel ?? getHardcodedTeammateModelFallback()
  }
  if (configured !== undefined) {
    return parseUserSpecifiedModel(configured)
  }
  return getHardcodedTeammateModelFallback()
}

/**
 * Resolve a teammate model value. Handles the 'inherit' alias (from agent
 * frontmatter) by substituting the leader's model. gh-31069: 'inherit' was
 * passed literally to --model, producing "It may not exist or you may not
 * have access". If leader model is null (not yet set), falls through to the
 * default.
 *
 * Exported for testing.
 */
export function resolveTeammateModel(
  inputModel: string | undefined,
  leaderModel: string | null,
): string {
  if (inputModel === 'inherit') {
    return leaderModel ?? getDefaultTeammateModel(leaderModel)
  }
  return inputModel ?? getDefaultTeammateModel(leaderModel)
}

// ============================================================================
// Types
// ============================================================================

export type SpawnOutput = {
  teammate_id: string
  agent_id: string
  agent_type?: string
  model?: string
  name: string
  color?: string
  tmux_session_name: string
  tmux_window_name: string
  tmux_pane_id: string
  team_name?: string
  is_splitpane?: boolean
  plan_mode_required?: boolean
}

export type SpawnTeammateConfig = {
  name: string
  prompt: string
  team_name?: string
  cwd?: string
  use_splitpane?: boolean
  plan_mode_required?: boolean
  model?: string
  agent_type?: string
  description?: string
  /** request_id of the API call whose response contained the tool_use that
   *  spawned this teammate. Threaded through to TeammateAgentContext for
   *  lineage tracing on tengu_api_* events. */
  invokingRequestId?: string
}

// Internal input type matching TeammateTool's spawn parameters
type SpawnInput = {
  name: string
  prompt: string
  team_name?: string
  cwd?: string
  use_splitpane?: boolean
  plan_mode_required?: boolean
  model?: string
  agent_type?: string
  description?: string
  invokingRequestId?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generates a unique teammate name by checking existing team members.
 * If the name already exists, appends a numeric suffix (e.g., tester-2, tester-3).
 * @internal Exported for testing
 */
export async function generateUniqueTeammateName(
  baseName: string,
  teamName: string | undefined,
): Promise<string> {
  if (!teamName) {
    return baseName
  }

  const teamFile = await readTeamFileAsync(teamName)
  if (!teamFile) {
    return baseName
  }

  const existingNames = new Set(teamFile.members.map(m => m.name.toLowerCase()))

  // If the base name doesn't exist, use it as-is
  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName
  }

  // Find the next available suffix
  let suffix = 2
  while (existingNames.has(`${baseName}-${suffix}`.toLowerCase())) {
    suffix++
  }

  return `${baseName}-${suffix}`
}

// ============================================================================
// Spawn Handler
// ============================================================================

type ResolvedSpawn = {
  teamName: string
  teamFile: TeamFile
  sanitizedName: string
  teammateId: string
  model: string
  teammateColor: ReturnType<typeof assignTeammateColor>
  workingDir: string
  agentDefinition?: CustomAgentDefinition
}

async function resolveSpawn(
  input: SpawnInput,
  context: ToolUseContext,
): Promise<ResolvedSpawn> {
  if (!input.name || !input.prompt) {
    throw new Error('name and prompt are required for spawn operation')
  }

  const appState = context.getAppState()
  const teamName = input.team_name || appState.teamContext?.teamName
  if (!teamName) {
    throw new Error(
      'team_name is required for spawn operation. Either provide team_name in input or call TeamCreate first to establish team context.',
    )
  }

  const teamFile = await readTeamFileAsync(teamName)
  if (!teamFile) {
    throw new Error(
      `Team "${teamName}" does not exist. Call TeamCreate first to create the team before spawning teammates.`,
    )
  }

  const uniqueName = await generateUniqueTeammateName(input.name, teamName)
  const sanitizedName = sanitizeAgentName(uniqueName)
  const teammateId = formatAgentId(sanitizedName, teamName)
  const model = resolveTeammateModel(input.model, appState.mainLoopModel)
  const teammateColor = assignTeammateColor(teammateId)
  const workingDir = input.cwd || getCwd()

  let agentDefinition: CustomAgentDefinition | undefined
  if (input.agent_type) {
    const foundAgent = context.options.agentDefinitions.activeAgents.find(
      a => a.agentType === input.agent_type,
    )
    if (foundAgent && isCustomAgent(foundAgent)) {
      agentDefinition = foundAgent
    }
    logForDebugging(
      `[spawnTeammate] agent_type=${input.agent_type}, found=${!!agentDefinition}`,
    )
  }

  return {
    teamName,
    teamFile,
    sanitizedName,
    teammateId,
    model,
    teammateColor,
    workingDir,
    agentDefinition,
  }
}

function getBackendDisplay(result: TeammateSpawnResult): {
  sessionName: string
  windowName: string
  paneId: string
  isSplitPane: boolean
} {
  if (result.backendType === 'in-process') {
    return {
      sessionName: 'in-process',
      windowName: 'in-process',
      paneId: 'in-process',
      isSplitPane: false,
    }
  }

  return {
    sessionName: result.insideTmux ? 'current' : SWARM_SESSION_NAME,
    windowName: result.windowName ?? (result.insideTmux ? 'current' : 'swarm-view'),
    paneId: result.paneId ?? '',
    isSplitPane: result.isSplitPane ?? true,
  }
}

function updateTeamContext(
  context: ToolUseContext,
  spawn: ResolvedSpawn,
  result: TeammateSpawnResult,
): void {
  const display = getBackendDisplay(result)

  context.setAppState(prev => {
    const leadAgentId = prev.teamContext?.leadAgentId || spawn.teamFile.leadAgentId
    const existingTeammates = prev.teamContext?.teammates || {}
    const needsLeaderEntry = !(leadAgentId in existingTeammates)
    const leadMember = spawn.teamFile.members.find(m => m.name === TEAM_LEAD_NAME)

    return {
      ...prev,
      teamContext: {
        ...prev.teamContext,
        teamName: spawn.teamName,
        teamFilePath: prev.teamContext?.teamFilePath || getTeamFilePath(spawn.teamName),
        leadAgentId,
        teammates: {
          ...existingTeammates,
          ...(needsLeaderEntry
            ? {
                [leadAgentId]: {
                  name: TEAM_LEAD_NAME,
                  agentType: leadMember?.agentType ?? TEAM_LEAD_NAME,
                  color: assignTeammateColor(leadAgentId),
                  tmuxSessionName: leadMember?.backendType === 'in-process' ? 'in-process' : '',
                  tmuxPaneId: leadMember?.tmuxPaneId ?? '',
                  cwd: leadMember?.cwd ?? getCwd(),
                  spawnedAt: leadMember?.joinedAt ?? Date.now(),
                },
              }
            : {}),
          [spawn.teammateId]: {
            name: spawn.sanitizedName,
            agentType: spawn.agentDefinition?.agentType,
            color: spawn.teammateColor,
            tmuxSessionName: display.sessionName,
            tmuxPaneId: display.paneId,
            cwd: spawn.workingDir,
            spawnedAt: Date.now(),
          },
        },
      },
    }
  })
}

async function appendTeamMember(
  input: SpawnInput,
  spawn: ResolvedSpawn,
  result: TeammateSpawnResult,
): Promise<void> {
  const teamFile = await readTeamFileAsync(spawn.teamName)
  if (!teamFile) {
    throw new Error(`Team "${spawn.teamName}" disappeared during teammate spawn.`)
  }

  const display = getBackendDisplay(result)
  teamFile.members.push({
    agentId: spawn.teammateId,
    name: spawn.sanitizedName,
    agentType: input.agent_type,
    model: spawn.model,
    prompt: input.prompt,
    color: spawn.teammateColor,
    planModeRequired: input.plan_mode_required,
    joinedAt: Date.now(),
    tmuxPaneId: display.paneId,
    cwd: spawn.workingDir,
    subscriptions: [],
    backendType: result.backendType,
  })
  await writeTeamFileAsync(spawn.teamName, teamFile)
}

async function handleSpawn(
  input: SpawnInput,
  context: ToolUseContext,
): Promise<{ data: SpawnOutput }> {
  const spawn = await resolveSpawn(input, context)
  const executor = await getTeammateExecutor(true, {
    onNeedsIt2Setup: context.setToolJSX
      ? tmuxAvailable =>
          new Promise(resolve => {
            context.setToolJSX!({
              jsx: React.createElement(It2SetupPrompt, {
                onDone: result => {
                  context.setToolJSX!(null)
                  resolve(result)
                },
                tmuxAvailable,
              }),
              shouldHidePromptInput: true,
            })
          })
      : undefined,
  })
  executor.setContext?.(context)

  const result = await executor.spawn({
    name: spawn.sanitizedName,
    teamName: spawn.teamName,
    color: spawn.teammateColor,
    prompt: input.prompt,
    cwd: spawn.workingDir,
    model: spawn.model,
    agentType: input.agent_type,
    agentDefinition: spawn.agentDefinition,
    description: input.description,
    planModeRequired: input.plan_mode_required ?? false,
    parentSessionId: getSessionId(),
    invokingRequestId: input.invokingRequestId,
    useSplitPane: input.use_splitpane !== false,
  })

  if (!result.success) {
    throw new Error(result.error ?? 'Failed to spawn teammate')
  }

  updateTeamContext(context, spawn, result)
  await appendTeamMember(input, spawn, result)

  const display = getBackendDisplay(result)
  return {
    data: {
      teammate_id: spawn.teammateId,
      agent_id: spawn.teammateId,
      agent_type: input.agent_type,
      model: spawn.model,
      name: spawn.sanitizedName,
      color: spawn.teammateColor,
      tmux_session_name: display.sessionName,
      tmux_window_name: display.windowName,
      tmux_pane_id: display.paneId,
      team_name: spawn.teamName,
      is_splitpane: display.isSplitPane,
      plan_mode_required: input.plan_mode_required,
    },
  }
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Spawns a new teammate with the given configuration.
 * This is the main entry point for teammate spawning, used by both TeammateTool and AgentTool.
 */
export async function spawnTeammate(
  config: SpawnTeammateConfig,
  context: ToolUseContext,
): Promise<{ data: SpawnOutput }> {
  return handleSpawn(config, context)
}

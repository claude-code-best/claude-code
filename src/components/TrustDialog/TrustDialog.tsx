import { homedir } from 'os'
import React from 'react'
import { logEvent } from 'src/services/analytics/index.js'
import { setSessionTrustAccepted } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { Box, Link, Text } from '@anthropic/ink'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { getMcpConfigsByScope } from '../../services/mcp/config.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import {
  checkHasTrustDialogAccepted,
  saveCurrentProjectConfig,
} from '../../utils/config.js'
import { getCwd } from '../../utils/cwd.js'
import { getFsImplementation } from '../../utils/fsOperations.js'
import { gracefulShutdownSync } from '../../utils/gracefulShutdown.js'
import { Select } from '../CustomSelect/index.js'
import { PermissionDialog } from '../permissions/PermissionDialog.js'
import {
  getApiKeyHelperSources,
  getAwsCommandsSources,
  getBashPermissionSources,
  getDangerousEnvVarsSources,
  getGcpCommandsSources,
  getHooksSources,
  getOtelHeadersHelperSources,
} from './utils.js'

type Props = {
  onDone(): void
  commands?: Command[]
}

export function TrustDialog({ onDone, commands }: Props): React.ReactNode {
  const { servers: projectServers } = getMcpConfigsByScope('project')

  // In all cases, we generally check only the project-level and
  // project-local-level settings, which we assume that users do not configure
  // directly compared to user-level settings.

  // Check for MCPs
  const hasMcpServers = Object.keys(projectServers).length > 0
  // Check for hooks
  const hooksSettingSources = getHooksSources()
  const hasHooks = hooksSettingSources.length > 0
  // Check whether code execution is allowed in permissions and slash commands
  const bashSettingSources = getBashPermissionSources()
  // Check for apiKeyHelper which executes arbitrary commands
  const apiKeyHelperSources = getApiKeyHelperSources()
  const hasApiKeyHelper = apiKeyHelperSources.length > 0
  // Check for AWS commands which execute arbitrary commands
  const awsCommandsSources = getAwsCommandsSources()
  const hasAwsCommands = awsCommandsSources.length > 0
  // Check for GCP commands which execute arbitrary commands
  const gcpCommandsSources = getGcpCommandsSources()
  const hasGcpCommands = gcpCommandsSources.length > 0
  // Check for otelHeadersHelper which executes arbitrary commands
  const otelHeadersHelperSources = getOtelHeadersHelperSources()
  const hasOtelHeadersHelper = otelHeadersHelperSources.length > 0
  // Check for dangerous environment variables (not in SAFE_ENV_VARS)
  const dangerousEnvVarsSources = getDangerousEnvVarsSources()
  const hasDangerousEnvVars = dangerousEnvVarsSources.length > 0

  const hasSlashCommandBash =
    commands?.some(
      command =>
        command.type === 'prompt' &&
        command.loadedFrom === 'commands_DEPRECATED' &&
        (command.source === 'projectSettings' ||
          command.source === 'localSettings') &&
        command.allowedTools?.some(
          (tool: string) =>
            tool === BASH_TOOL_NAME || tool.startsWith(BASH_TOOL_NAME + '('),
        ),
    ) ?? false

  const hasSkillsBash =
    commands?.some(
      command =>
        command.type === 'prompt' &&
        (command.loadedFrom === 'skills' || command.loadedFrom === 'plugin') &&
        (command.source === 'projectSettings' ||
          command.source === 'localSettings' ||
          command.source === 'plugin') &&
        command.allowedTools?.some(
          (tool: string) =>
            tool === BASH_TOOL_NAME || tool.startsWith(BASH_TOOL_NAME + '('),
        ),
    ) ?? false

  const hasAnyBashExecution =
    bashSettingSources.length > 0 || hasSlashCommandBash || hasSkillsBash

  const hasTrustDialogAccepted = checkHasTrustDialogAccepted()

  React.useEffect(() => {
    const isHomeDir = homedir() === getCwd()
    logEvent('tengu_trust_dialog_shown', {
      isHomeDir,
      hasMcpServers,
      hasHooks,
      hasBashExecution: hasAnyBashExecution,
      hasApiKeyHelper,
      hasAwsCommands,
      hasGcpCommands,
      hasOtelHeadersHelper,
      hasDangerousEnvVars,
    })
  }, [
    hasMcpServers,
    hasHooks,
    hasAnyBashExecution,
    hasApiKeyHelper,
    hasAwsCommands,
    hasGcpCommands,
    hasOtelHeadersHelper,
    hasDangerousEnvVars,
  ])

  function onChange(value: 'enable_all' | 'exit') {
    if (value === 'exit') {
      gracefulShutdownSync(1)
      return
    }

    const isHomeDir = homedir() === getCwd()

    logEvent('tengu_trust_dialog_accept', {
      isHomeDir,
      hasMcpServers,
      hasHooks,
      hasBashExecution: hasAnyBashExecution,
      hasApiKeyHelper,
      hasAwsCommands,
      hasGcpCommands,
      hasOtelHeadersHelper,
      hasDangerousEnvVars,
    })

    if (isHomeDir) {
      // For home directory, store trust in session memory only (not persisted to disk)
      // This allows hooks and other trust-requiring features to work during this session
      // while preserving the security intent of not permanently trusting home dir
      setSessionTrustAccepted(true)
    } else {
      saveCurrentProjectConfig(current => ({
        ...current,
        hasTrustDialogAccepted: true,
      }))
    }

    // Do NOT write MCP server settings here. handleMcpjsonServerApprovals in
    // interactiveHelpers.tsx runs right after this dialog and shows the per-server approval
    // UI. Writing enabledMcpjsonServers/enableAllProjectMcpServers here would
    // mark every server 'approved' and silently skip that dialog. See #15558.

    onDone()
  }

  // Default onExit is useApp().exit() → Ink.unmount(), which tears down the
  // React tree but never calls onDone(). showSetupScreens() in
  // interactiveHelpers.tsx awaits a Promise that only resolves via onDone,
  // so the default would hang the await forever. With keybinding
  // customization enabled, the chokidar watcher (persistent: true) keeps the
  // event loop alive and the process freezes. Explicitly exit 1 like "No".
  const exitState = useExitOnCtrlCDWithKeybindings(() =>
    gracefulShutdownSync(1),
  )

  // Use configurable keybinding for ESC to cancel/exit
  useKeybinding(
    'confirm:no',
    () => {
      gracefulShutdownSync(0)
    },
    { context: 'Confirmation' },
  )

  // Automatically resolve the trust dialog if there is nothing to be shown.
  if (hasTrustDialogAccepted) {
    setTimeout(onDone)
    return null
  }

  return (
    <PermissionDialog
      color="warning"
      titleColor="warning"
      title="Accessing workspace:"
    >
      <Box flexDirection="column" gap={1} paddingTop={1}>
        <Text bold>{getFsImplementation().cwd()}</Text>

        <Text>
          Quick safety check: Is this a project you created or one you trust?
          (Like your own code, a well-known open source project, or work from
          your team). If not, take a moment to review what{"'"}s in this folder
          first.
        </Text>
        <Text>
          Claude Code{"'"}ll be able to read, edit, and execute files here.
        </Text>

        <Text dimColor>
          <Link url="https://code.claude.com/docs/en/security">
            Security guide
          </Link>
        </Text>

        <Select
          options={[
            { label: 'Yes, I trust this folder', value: 'enable_all' },
            { label: 'No, exit', value: 'exit' },
          ]}
          onChange={value => onChange(value as 'enable_all' | 'exit')}
          onCancel={() => onChange('exit')}
        />

        <Text dimColor>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : (
            <>Enter to confirm · Esc to cancel</>
          )}
        </Text>
      </Box>
    </PermissionDialog>
  )
}

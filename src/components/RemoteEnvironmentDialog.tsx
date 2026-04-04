import chalk from 'chalk'
import figures from 'figures'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { Text } from '../ink.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { toError } from '../utils/errors.js'
import { logError } from '../utils/log.js'
import {
  getSettingSourceName,
  type SettingSource,
} from '../utils/settings/constants.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import { getEnvironmentSelectionInfo } from '../utils/teleport/environmentSelection.js'
import type { EnvironmentResource } from '../utils/teleport/environments.js'
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js'
import { Select } from './CustomSelect/select.js'
import { Byline } from './design-system/Byline.js'
import { Dialog } from './design-system/Dialog.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import { LoadingState } from './design-system/LoadingState.js'

const DIALOG_TITLE = 'Select Remote Environment'
const SETUP_HINT = `Configure environments at: https://claude.ai/code`

type Props = {
  onDone: (message?: string) => void
}

type LoadingState = 'loading' | 'updating' | null

export function RemoteEnvironmentDialog({ onDone }: Props): React.ReactNode {
  const [loadingState, setLoadingState] = useState<LoadingState>('loading')
  const [environments, setEnvironments] = useState<EnvironmentResource[]>([])
  const [selectedEnvironment, setSelectedEnvironment] =
    useState<EnvironmentResource | null>(null)
  const [selectedEnvironmentSource, setSelectedEnvironmentSource] =
    useState<SettingSource | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchInfo(): Promise<void> {
      try {
        const result = await getEnvironmentSelectionInfo()
        if (cancelled) return
        setEnvironments(result.availableEnvironments)
        setSelectedEnvironment(result.selectedEnvironment)
        setSelectedEnvironmentSource(result.selectedEnvironmentSource)
        setLoadingState(null)
      } catch (err) {
        if (cancelled) return
        const fetchError = toError(err)
        logError(fetchError)
        setError(fetchError.message)
        setLoadingState(null)
      }
    }
    void fetchInfo()
    return () => {
      cancelled = true
    }
  }, [])

  function handleSelect(value: string): void {
    if (value === 'cancel') {
      onDone()
      return
    }

    setLoadingState('updating')

    const selectedEnv = environments.find(env => env.environment_id === value)

    if (!selectedEnv) {
      onDone('Error: Selected environment not found')
      return
    }

    updateSettingsForSource('localSettings', {
      remote: {
        defaultEnvironmentId: selectedEnv.environment_id,
      },
    })

    onDone(
      `Set default remote environment to ${chalk.bold(selectedEnv.name)} (${selectedEnv.environment_id})`,
    )
  }

  // Loading state
  if (loadingState === 'loading') {
    return (
      <Dialog title={DIALOG_TITLE} onCancel={onDone} hideInputGuide>
        <LoadingState message="Loading environments…" />
      </Dialog>
    )
  }

  // Error state
  if (error) {
    return (
      <Dialog title={DIALOG_TITLE} onCancel={onDone}>
        <Text color="error">Error: {error}</Text>
      </Dialog>
    )
  }

  // No environments available
  if (!selectedEnvironment) {
    return (
      <Dialog title={DIALOG_TITLE} subtitle={SETUP_HINT} onCancel={onDone}>
        <Text>No remote environments available.</Text>
      </Dialog>
    )
  }

  // Single environment - just show info
  if (environments.length === 1) {
    return (
      <SingleEnvironmentContent
        environment={selectedEnvironment}
        onDone={onDone}
      />
    )
  }

  // Multiple environments - show selection UI
  return (
    <MultipleEnvironmentsContent
      environments={environments}
      selectedEnvironment={selectedEnvironment}
      selectedEnvironmentSource={selectedEnvironmentSource}
      loadingState={loadingState}
      onSelect={handleSelect}
      onCancel={onDone}
    />
  )
}

function EnvironmentLabel({
  environment,
}: {
  environment: EnvironmentResource
}): React.ReactNode {
  return (
    <Text>
      {figures.tick} Using <Text bold>{environment.name}</Text>{' '}
      <Text dimColor>({environment.environment_id})</Text>
    </Text>
  )
}

function SingleEnvironmentContent({
  environment,
  onDone,
}: {
  environment: EnvironmentResource
  onDone: () => void
}): React.ReactNode {
  // Handle Enter to continue
  useKeybinding('confirm:yes', onDone, { context: 'Confirmation' })

  return (
    <Dialog title={DIALOG_TITLE} subtitle={SETUP_HINT} onCancel={onDone}>
      <EnvironmentLabel environment={environment} />
    </Dialog>
  )
}

function MultipleEnvironmentsContent({
  environments,
  selectedEnvironment,
  selectedEnvironmentSource,
  loadingState,
  onSelect,
  onCancel,
}: {
  environments: EnvironmentResource[]
  selectedEnvironment: EnvironmentResource
  selectedEnvironmentSource: SettingSource | null
  loadingState: LoadingState
  onSelect: (value: string) => void
  onCancel: () => void
}): React.ReactNode {
  const sourceSuffix =
    selectedEnvironmentSource && selectedEnvironmentSource !== 'localSettings'
      ? ` (from ${getSettingSourceName(selectedEnvironmentSource)} settings)`
      : ''

  const subtitle = (
    <Text>
      Currently using: <Text bold>{selectedEnvironment.name}</Text>
      {sourceSuffix}
    </Text>
  )

  return (
    <Dialog
      title={DIALOG_TITLE}
      subtitle={subtitle}
      onCancel={onCancel}
      hideInputGuide
    >
      <Text dimColor>{SETUP_HINT}</Text>
      {loadingState === 'updating' ? (
        <LoadingState message="Updating…" />
      ) : (
        <Select
          options={environments.map(env => ({
            label: (
              <Text>
                {env.name} <Text dimColor>({env.environment_id})</Text>
              </Text>
            ),
            value: env.environment_id,
          }))}
          defaultValue={selectedEnvironment.environment_id}
          onChange={onSelect}
          onCancel={() => onSelect('cancel')}
          layout="compact-vertical"
        />
      )}
      <Text dimColor>
        <Byline>
          <KeyboardShortcutHint shortcut="Enter" action="select" />
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="cancel"
          />
        </Byline>
      </Text>
    </Dialog>
  )
}
